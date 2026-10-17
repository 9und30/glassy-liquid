/**
 * WebGL scene renderer (engine `scene-gl`).
 *
 * For scenes whose backdrop is an <img>, <video> or <canvas>, every glass
 * surface is rendered on the GPU from the backdrop texture: the rounded-rect
 * distance field, rim normals, refraction profile, magnification, chromatic
 * dispersion, frost and tone are evaluated per pixel - no displacement maps at
 * all. One context per scene renders all its surfaces; each result is copied
 * into a small canvas inside the surface's own layer stack, so stacking and
 * clipping stay exactly like regular DOM.
 */
import { profileTable, type OpticsConfig } from "../core/optics.js";

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform float uRadius;
uniform float uBezel;
uniform float uRefraction;
uniform float uZoom;
uniform float uSpread;
uniform float uBlurMix;
uniform float uDpr;
uniform vec2 uOrigin;
uniform vec2 uScale;
uniform vec4 uMap;
uniform vec3 uTone;
uniform vec4 uFill;
uniform sampler2D uSharp;
uniform sampler2D uBlurred;
uniform sampler2D uProfile;

vec3 sampleAt(vec2 local){
  vec2 uv = (uOrigin + local * uScale) * uMap.xy + uMap.zw;
  vec3 a = texture2D(uSharp, uv).rgb;
  vec3 b = texture2D(uBlurred, uv).rgb;
  return mix(a, b, uBlurMix);
}

void main(){
  vec2 local = vUv * uSize;
  vec2 c = uSize * 0.5;
  vec2 p = local - c;
  float r = min(uRadius, min(c.x, c.y));
  vec2 q = abs(p) - c + r;
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  vec2 n;
  if (q.x > 0.0 && q.y > 0.0) n = normalize(q) * sign(p);
  else if (q.x > q.y) n = vec2(sign(p.x), 0.0);
  else n = vec2(0.0, sign(p.y));
  float t = clamp(-d / max(uBezel, 0.001), 0.0, 1.0);
  float mag = t >= 1.0 ? 0.0 : texture2D(uProfile, vec2(t, 0.5)).r * 2.0 - 1.0;
  vec2 disp = -n * mag * uRefraction;
  vec2 base = c + p / uZoom;
  vec3 col;
  if (uSpread > 0.0) {
    col = vec3(sampleAt(base + disp * (1.0 + uSpread)).r, sampleAt(base + disp).g, sampleAt(base + disp * (1.0 - uSpread)).b);
  } else {
    col = sampleAt(base + disp);
  }
  col = clamp(col + uTone.x * (1.0 - col) * (1.0 - col) - uTone.y * col * col, 0.0, 1.0);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uTone.z);
  col = mix(col, uFill.rgb, uFill.a);
  float cover = clamp(0.5 - d * uDpr, 0.0, 1.0);
  gl_FragColor = vec4(col * cover, cover);
}`;

const BLUR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uSigma;
void main(){
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -24; i <= 24; i++) {
    float x = float(i);
    float w = exp(-0.5 * x * x / (uSigma * uSigma));
    // Keep the weight in range without a branch: a continue here left texels
    // unwritten on some WebKit GPUs and the button speckled.
    float use = step(abs(x), uSigma * 3.0);
    acc += texture2D(uTex, vUv + uDir * x) * w * use;
    wsum += w * use;
  }
  gl_FragColor = acc / wsum;
}`;

const COPY_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = vec2(aPos.x * 0.5 + 0.5, aPos.y * 0.5 + 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;

export interface GlDrawParams {
  /** Surface size in CSS px (untransformed). */
  width: number;
  height: number;
  radius: number;
  bezel: number;
  refraction: number;
  zoom: number;
  dispersion: number;
  blur: number;
  dpr: number;
  /** Surface top-left relative to the backdrop element, CSS px (visual). */
  originX: number;
  originY: number;
  /** Visual scale of the surface (transforms). */
  scaleX: number;
  scaleY: number;
  lift: number;
  roll: number;
  saturation: number;
  fill: [number, number, number, number];
  optics: OpticsConfig;
}

type Source = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/**
 * Pixel size of a source whose pixels are available, else null. Images report
 * their size while they still stream in and videos once their metadata is in;
 * a texture uploaded then is empty (Firefox even uploads a 0×0 level).
 */
function pixelSize(source: Source): [number, number] | null {
  const [w, h, ready] =
    source instanceof HTMLImageElement
      ? [source.naturalWidth, source.naturalHeight, source.complete]
      : source instanceof HTMLVideoElement
        ? [source.videoWidth, source.videoHeight, source.readyState >= 2 /* HAVE_CURRENT_DATA */]
        : [source.width, source.height, true];
  return ready && w && h ? [w, h] : null;
}

/** Mapping of backdrop-element CSS px to texture UV, honoring object-fit/position. */
export function objectFitMap(
  el: Source,
  boxW: number,
  boxH: number,
): [number, number, number, number] | null {
  const iw =
    el instanceof HTMLImageElement
      ? el.naturalWidth
      : el instanceof HTMLVideoElement
        ? el.videoWidth
        : el.width;
  const ih =
    el instanceof HTMLImageElement
      ? el.naturalHeight
      : el instanceof HTMLVideoElement
        ? el.videoHeight
        : el.height;
  if (!iw || !ih || !boxW || !boxH) return null;
  const cs = getComputedStyle(el);
  const fit =
    el instanceof HTMLCanvasElement && cs.objectFit === "fill" ? "fill" : cs.objectFit || "fill";
  let dw = boxW;
  let dh = boxH;
  if (fit === "cover" || fit === "contain" || fit === "scale-down") {
    const s = fit === "cover" ? Math.max(boxW / iw, boxH / ih) : Math.min(boxW / iw, boxH / ih);
    const sd = fit === "scale-down" ? Math.min(1, s) : s;
    dw = iw * sd;
    dh = ih * sd;
  } else if (fit === "none") {
    dw = iw;
    dh = ih;
  }
  const [px = "50%", py = "50%"] = (cs.objectPosition || "50% 50%").split(/\s+/);
  const pos = (v: string, free: number) =>
    v.endsWith("%") ? (free * parseFloat(v)) / 100 : parseFloat(v) || 0;
  const ox = pos(px, boxW - dw);
  const oy = pos(py, boxH - dh);
  return [1 / dw, 1 / dh, -ox / dw, -oy / dh];
}

/**
 * A backdrop texture (sharp + frosted copy). Images with the same URL share
 * one texture across all scenes of the page.
 */
export class GlTexture {
  width = 0;
  height = 0;
  blurKey = "";
  ready = false;
  refs = 0;
  /** Bumped on every upload so scenes can tell when shared content changed. */
  version = 0;
  constructor(
    readonly key: string,
    readonly sharp: WebGLTexture,
    readonly blurred: WebGLTexture,
    readonly tmp: WebGLTexture,
  ) {}
}

/**
 * One WebGL context for the whole page (browsers cap live contexts, iOS in
 * particular). Every scene and surface renders through it.
 */
export class GlRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private blurProg: WebGLProgram;
  private buf: WebGLBuffer;
  private fbo: WebGLFramebuffer;
  private profile: WebGLTexture;
  private profileKey = "";
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private blurUniforms = new Map<string, WebGLUniformLocation | null>();
  private textures = new Map<string, GlTexture>();
  private lost = false;

  private static instance: GlRenderer | null | undefined;

  /** The shared renderer, or null when WebGL is unavailable. */
  static shared(): GlRenderer | null {
    const current = GlRenderer.instance;
    if (current === null) return null;
    if (current && current.alive) return current;
    if (typeof document === "undefined") return null;
    try {
      GlRenderer.instance = new GlRenderer();
    } catch {
      GlRenderer.instance = null;
    }
    return GlRenderer.instance;
  }

  private constructor() {
    this.canvas = document.createElement("canvas");
    const opts: WebGLContextAttributes = {
      premultipliedAlpha: true,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      // Safari can hand drawImage a cleared buffer and the first frames speckle.
      preserveDrawingBuffer: true,
    };
    const gl = (this.canvas.getContext("webgl", opts) ??
      this.canvas.getContext("experimental-webgl", opts)) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.prog = this.program(VERT, FRAG);
    this.blurProg = this.program(COPY_VERT, BLUR);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.profile = this.makeTexture();
    this.fbo = gl.createFramebuffer()!;
  }

  get alive(): boolean {
    return !this.lost && !this.gl.isContextLost();
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) ?? "link");
    return p;
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    return t;
  }

  /** Acquire a texture slot. Use the image URL as key to share it between scenes. */
  acquire(key: string): GlTexture {
    let t = this.textures.get(key);
    if (!t) {
      t = new GlTexture(key, this.makeTexture(), this.makeTexture(), this.makeTexture());
      this.textures.set(key, t);
    }
    t.refs++;
    return t;
  }

  release(t: GlTexture): void {
    t.refs--;
    if (t.refs > 0) return;
    this.textures.delete(t.key);
    for (const x of [t.sharp, t.blurred, t.tmp]) this.gl.deleteTexture(x);
  }

  private uniform(name: string, blur = false): WebGLUniformLocation | null {
    const map = blur ? this.blurUniforms : this.uniforms;
    if (!map.has(name))
      map.set(name, this.gl.getUniformLocation(blur ? this.blurProg : this.prog, name));
    return map.get(name)!;
  }

  /**
   * Upload a backdrop into a texture. Returns false when the source cannot be
   * used (not fully loaded, or cross-origin without CORS); the texture then
   * stays as it was, so a later upload is not skipped.
   */
  upload(t: GlTexture, source: Source): boolean {
    const gl = this.gl;
    const size = pixelSize(source);
    if (!size) return false;
    const [w, h] = size;
    try {
      gl.bindTexture(gl.TEXTURE_2D, t.sharp);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return false;
    }
    t.width = w;
    t.height = h;
    t.blurKey = "";
    t.ready = true;
    t.version++;
    return true;
  }

  /** Build the frosted copy for a blur radius given in texture pixels. */
  prepareBlur(t: GlTexture, sigmaTex: number): void {
    if (!t.ready) return;
    const sigma = Math.max(0.5, sigmaTex);
    const down = Math.max(1, Math.min(16, Math.floor(sigma / 3)));
    const w = Math.max(1, Math.round(t.width / down));
    const h = Math.max(1, Math.round(t.height / down));
    const key = `${w}x${h}|${(sigma / down).toFixed(2)}`;
    if (key === t.blurKey) return;
    t.blurKey = key;
    const gl = this.gl;
    for (const x of [t.tmp, t.blurred]) {
      gl.bindTexture(gl.TEXTURE_2D, x);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    // texImage2D with null data is uninitialized. Clear both targets before the
    // blur pass so a missed texel cannot speckle the glass.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.clearColor(0, 0, 0, 0);
    for (const x of [t.tmp, t.blurred]) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, x, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.blurProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniform("uTex", true), 0);
    gl.uniform1f(this.uniform("uSigma", true), Math.min(8, sigma / down));
    // Horizontal pass: sharp → tmp (downsampled), vertical pass: tmp → blurred.
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tmp, 0);
    gl.bindTexture(gl.TEXTURE_2D, t.sharp);
    gl.uniform2f(this.uniform("uDir", true), down / t.width, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.blurred, 0);
    gl.bindTexture(gl.TEXTURE_2D, t.tmp);
    gl.uniform2f(this.uniform("uDir", true), 0, 1 / h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private ensureProfile(optics: OpticsConfig): void {
    const key = `${optics.profile}|${optics.ior}|${optics.thickness}|${optics.float}`;
    if (key === this.profileKey) return;
    this.profileKey = key;
    const table = profileTable(optics);
    const n = table.values.length;
    const px = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const v = Math.round(((table.values[i]! + 1) / 2) * 255);
      px[i * 4] = v;
      px[i * 4 + 3] = 255;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.profile);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }

  /** Render one surface from texture `t` and copy it into `target` (a 2D canvas). */
  draw(
    t: GlTexture,
    p: GlDrawParams,
    map: [number, number, number, number],
    target: HTMLCanvasElement,
  ): void {
    if (!t.ready || !this.alive) return;
    const gl = this.gl;
    const w = Math.max(1, Math.round(p.width * p.dpr));
    const h = Math.max(1, Math.round(p.height * p.dpr));
    if (this.canvas.width < w || this.canvas.height < h) {
      this.canvas.width = Math.max(this.canvas.width, w);
      this.canvas.height = Math.max(this.canvas.height, h);
    }
    this.ensureProfile(p.optics);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, this.canvas.height - h, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => this.uniform(n);
    gl.uniform2f(u("uSize"), p.width, p.height);
    gl.uniform1f(u("uRadius"), p.radius);
    gl.uniform1f(u("uBezel"), p.bezel);
    gl.uniform1f(u("uRefraction"), p.refraction);
    gl.uniform1f(u("uZoom"), Math.max(1, p.zoom));
    gl.uniform1f(u("uSpread"), p.dispersion > 0.001 ? Math.min(0.5, p.dispersion * 0.25) : 0);
    gl.uniform1f(u("uBlurMix"), p.blur > 0.1 ? 1 : 0);
    gl.uniform1f(u("uDpr"), p.dpr);
    gl.uniform2f(u("uOrigin"), p.originX, p.originY);
    gl.uniform2f(u("uScale"), p.scaleX, p.scaleY);
    gl.uniform4f(u("uMap"), map[0], map[1], map[2], map[3]);
    gl.uniform3f(u("uTone"), p.lift, p.roll, p.saturation);
    gl.uniform4f(u("uFill"), p.fill[0], p.fill[1], p.fill[2], p.fill[3]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.sharp);
    gl.uniform1i(u("uSharp"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t.blurKey ? t.blurred : t.sharp);
    gl.uniform1i(u("uBlurred"), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.profile);
    gl.uniform1i(u("uProfile"), 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);

    if (target.width !== w || target.height !== h) {
      target.width = w;
      target.height = h;
    }
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(this.canvas, 0, 0, w, h, 0, 0, w, h);
  }
}
