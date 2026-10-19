/**
 * GlassSurface - turns any element into a Liquid Glass slab.
 *
 * It owns a small layer stack (<gl-fx>) behind the element's content and picks
 * the best rendering engine for the browser:
 *
 *   backdrop   Chromium: SVG refraction applied to the live page backdrop.
 *   scene-gl   Inside <glass-scene> with image/video/canvas backdrop: WebGL.
 *   scene-dom  Inside <glass-scene> with DOM content (WebKit/Gecko): the scene
 *              filters its content layer.
 *   css        Everywhere else: frosted approximation with the same rim light,
 *              tint, shadow and motion.
 */
import {
  devicePixelRatio,
  nextId,
  prefersReducedTransparency,
  supportsBackdropFilter,
  supportsBackdropSvg,
  watchMedia,
  type EngineKind,
} from "../core/env.js";
import { rimImage, shadowImage } from "../core/maps.js";
import { defaultOptics, type BezelProfile, type OpticsConfig } from "../core/optics.js";
import { shapeMetrics, type GlassRadius, type ShapeMetrics } from "../core/shape.js";
import { onAppearanceChange, resolveAppearance } from "./appearance.js";
import {
  materials,
  parseColor,
  toneTable,
  type GlassAppearance,
  type GlassMaterial,
  type MaterialSpec,
} from "./materials.js";
import { observeSize, observeVisibility } from "./observe.js";
import { ensureDocumentStyles } from "./styles.js";
import { GlassFilter } from "./svg-filter.js";

export interface GlassOptions {
  /** `regular` (frosted, adaptive) or `clear` (transparent, for media). Default `regular`. */
  material?: GlassMaterial;
  /**
   * `auto` follows `--glass-appearance` on an ancestor, then the page `color-scheme`.
   * The OS preference applies only when the page supports both schemes. Default `auto`.
   */
  appearance?: GlassAppearance | "auto";
  /** Corner radius in CSS px, `capsule` or `circle`. Default 24. */
  radius?: GlassRadius;
  /** Maximum displacement of the rim in CSS px. Default scales with the surface. */
  refraction?: number;
  /** Width of the refracting rim in CSS px. Default 18. */
  bezel?: number;
  /** Frost (Gaussian std deviation, CSS px). Defaults to the material's. */
  blur?: number;
  /**
   * Chromatic dispersion at the rim, 0 to 1. Default: 0.25 where it is free
   * (WebGL scenes), 0 on the backdrop and content filters, where splitting the
   * color channels costs several extra GPU passes per surface.
   */
  dispersion?: number;
  /** Color of tinted glass (any CSS color), e.g. for prominent buttons. */
  tint?: string | null;
  /** Rim light multiplier, 0 to 2. Default 1. */
  specular?: number;
  /** Direction the light comes from in degrees (0 = right, -90 = top). Default -135 (top-left). */
  lightAngle?: number;
  /** Drop shadow. `true` uses the material's shadow, a string is used as CSS box-shadow. */
  shadow?: boolean | string;
  /** Cross-section of the rim. Default `squircle`. */
  profile?: BezelProfile;
  /** Magnification of the center (selection lenses use ~1.15). Default 1. */
  zoom?: number;
  /** Process the backdrop (refraction/blur). `false` keeps only light, tint and shadow - for plain controls inside other glass. Default true. */
  backdrop?: boolean;
  /** Override the material's fill color (any CSS color). */
  fill?: string | null;
  /** Force a rendering engine (mainly for testing). */
  engine?: "auto" | EngineKind;
}

export interface ResolvedGlassOptions {
  material: GlassMaterial;
  appearance: GlassAppearance | "auto";
  radius: GlassRadius;
  refraction: number | undefined;
  bezel: number;
  blur: number | undefined;
  dispersion: number | undefined;
  tint: string | null;
  specular: number;
  lightAngle: number;
  shadow: boolean | string;
  profile: BezelProfile;
  zoom: number;
  backdrop: boolean;
  fill: string | null;
  engine: "auto" | EngineKind;
}

export const defaultGlassOptions: ResolvedGlassOptions = {
  material: "regular",
  appearance: "auto",
  radius: 24,
  refraction: undefined,
  bezel: 18,
  blur: undefined,
  dispersion: undefined,
  tint: null,
  specular: 1,
  lightAngle: -135,
  shadow: true,
  profile: "squircle",
  zoom: 1,
  backdrop: true,
  fill: null,
  engine: "auto",
};

/** Parameters handed to scene renderers. */
export interface SceneParams {
  metrics: ShapeMetrics;
  refraction: number;
  blur: number;
  zoom: number;
  dispersion: number;
  optics: OpticsConfig;
  lift: number;
  roll: number;
  saturation: number;
  fill: [number, number, number, number];
  tone: string;
  dpr: number;
}

/** Scene integration (implemented by <glass-scene>). */
export interface SceneHost {
  readonly sceneMode: "gl" | "dom" | null;
  /** Use the scene engines even where backdrop refraction is available. */
  readonly sceneForced: boolean;
  attachSurface(surface: GlassSurface): SceneBinding | null;
}
export interface SceneBinding {
  update(): void;
  destroy(): void;
}

const surfaces = new WeakMap<Element, GlassSurface>();
const live = new Set<GlassSurface>();
let rescanQueued = false;

/**
 * Ask every live surface to re-evaluate its engine. Scenes call this when they
 * appear, change or disappear, so glass created before its scene upgrades
 * still finds it.
 */
export function rescanSurfaces(): void {
  if (rescanQueued) return;
  rescanQueued = true;
  queueMicrotask(() => {
    rescanQueued = false;
    for (const s of live) s.reattach();
  });
}

/** The surface controller attached to an element, if any. */
export function getSurface(el: Element): GlassSurface | undefined {
  return surfaces.get(el);
}

export { resolveAppearance };

function findScene(el: Element): (Element & SceneHost) | null {
  let node: Node | null = el;
  while (node) {
    if (
      node instanceof Element &&
      (node as Partial<SceneHost>).attachSurface &&
      node.localName === "glass-scene"
    )
      return node as Element & SceneHost;
    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  }
  return null;
}

export interface SurfaceInit {
  /** Where to put the layer stack. Defaults to the host itself (light DOM). */
  root?: ShadowRoot | HTMLElement;
  /** Element the layer stack is inserted before (defaults to the root's first child). */
  before?: Node | null;
}

export class GlassSurface {
  readonly host: HTMLElement;
  readonly fx: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly tintLayer: HTMLElement;
  private readonly rim: HTMLElement;
  private readonly shadowLayer: HTMLElement;
  private readonly glowLayer: HTMLElement;
  private filter: GlassFilter | null = null;
  private scene: SceneBinding | null = null;
  private sceneHost: (Element & SceneHost) | null = null;
  private opts: ResolvedGlassOptions;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private engineKind: EngineKind = "css";
  private disposers: Array<() => void> = [];
  private frame = 0;
  private sizeOverride: { width: number; height: number } | null = null;
  private radiusOverride: GlassRadius | null = null;
  private appearanceValue: GlassAppearance = "light";
  /** Re-resolve the appearance on the next render (style reads are skipped while morphing). */
  private appearanceStale = true;
  /** Whether the surface is far off screen. Its updates pause until it comes back. */
  readonly offscreen: boolean = false;
  /** An update was skipped while off screen. */
  private stale?: boolean;

  constructor(host: HTMLElement, options: GlassOptions = {}, init: SurfaceInit = {}) {
    this.host = host;
    this.opts = { ...defaultGlassOptions, ...stripUndefined(options) };
    const root = init.root ?? host;
    if (root === host) ensureDocumentStyles();

    const fx = document.createElement("gl-fx");
    fx.setAttribute("aria-hidden", "true");
    fx.setAttribute("part", "glass");
    const layer = (cls: string) => {
      const e = document.createElement("gl-l");
      e.className = cls;
      fx.append(e);
      return e;
    };
    this.shadowLayer = layer("s");
    this.backdrop = layer("b");
    this.tintLayer = layer("t");
    this.rim = layer("r");
    this.glowLayer = layer("g");
    this.glowLayer.append(document.createElement("i"));
    this.fx = fx;
    root.insertBefore(fx, init.before === undefined ? root.firstChild : init.before);

    if (root === host) {
      const cs = getComputedStyle(host);
      if (cs.position === "static") host.style.position = "relative";
      if (cs.zIndex === "auto") host.style.zIndex = "0";
    }

    surfaces.set(host, this);
    live.add(this);
    this.disposers.push(
      observeSize(host, (w, h) => {
        if (this.sizeOverride) return;
        this.resize(w, h);
      }),
      onAppearanceChange(() => {
        if (
          this.opts.appearance === "auto" &&
          resolveAppearance(this.host, "auto") !== this.appearanceValue
        )
          this.invalidate();
      }),
      watchMedia(
        "(resolution: " + (typeof window !== "undefined" ? window.devicePixelRatio : 1) + "dppx)",
        () => this.invalidate(),
      ),
      watchMedia("(prefers-reduced-transparency: reduce)", () => this.invalidate()),
      observeVisibility(host, (visible) => {
        (this as { offscreen: boolean }).offscreen = !visible;
        if (!visible) return;
        if (this.stale) this.render();
        // A scene skips hidden glass, so it draws this one again.
        else this.scene?.update();
      }),
    );
    this.width = host.offsetWidth;
    this.height = host.offsetHeight;
    this.render();
  }

  /** Current options. */
  get options(): Readonly<ResolvedGlassOptions> {
    return this.opts;
  }

  /** Rendering engine in use. */
  get engine(): EngineKind {
    return this.engineKind;
  }

  /** Current shape metrics in CSS px (untransformed). */
  get metrics(): ShapeMetrics {
    const { width, height } = this.sizeOverride ?? { width: this.width, height: this.height };
    return shapeMetrics(width, height, this.radiusOverride ?? this.opts.radius, this.opts.bezel);
  }

  /** Update options. Unspecified keys keep their values; `undefined` resets to default. */
  set(options: GlassOptions): void {
    for (const key of Object.keys(options) as Array<keyof GlassOptions>) {
      const v = options[key];
      (this.opts as unknown as Record<string, unknown>)[key] =
        v === undefined ? defaultGlassOptions[key] : v;
    }
    this.invalidate();
  }

  /**
   * Temporarily drive the glass geometry (morph animations) without waiting
   * for layout. Pass null to return to the measured size.
   */
  setGeometry(size: { width: number; height: number } | null, radius?: GlassRadius | null): void {
    this.sizeOverride = size;
    this.radiusOverride = radius ?? null;
    if (!size) {
      this.width = this.host.offsetWidth;
      this.height = this.host.offsetHeight;
    }
    this.render();
  }

  /** Light the glass from a point (local CSS px) with an intensity 0..1. */
  setGlow(x: number, y: number, intensity: number, size?: number): void {
    const s = this.fx.style;
    s.setProperty("--gl-glow", intensity.toFixed(3));
    s.setProperty("--gl-glow-x", `${x.toFixed(1)}px`);
    s.setProperty("--gl-glow-y", `${y.toFixed(1)}px`);
    if (size) s.setProperty("--gl-glow-size", `${size.toFixed(0)}px`);
  }

  /**
   * Fade the whole glass (0..1) without breaking the backdrop: the opacity is
   * applied per layer, never on a common parent.
   */
  setOpacity(value: number): void {
    const v = value >= 0.999 ? "" : Math.max(0, value).toFixed(3);
    if (v) this.fx.style.setProperty("--gl-o", v);
    else this.fx.style.removeProperty("--gl-o");
  }

  /** Schedule a re-render on the next frame (coalesced); re-reads the appearance. */
  invalidate(): void {
    this.appearanceStale = true;
    if (this.frame) return;
    if (this.offscreen || typeof requestAnimationFrame !== "function") {
      this.update();
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private resize(w: number, h: number): void {
    if (Math.abs(w - this.width) < 0.01 && Math.abs(h - this.height) < 0.01) return;
    // Glass shown again after display: none renders before it is painted, even
    // if it was off screen when it lost its box (the observer reports no change).
    const shown = !this.width || !this.height;
    this.width = w;
    this.height = h;
    this.update(shown);
  }

  /** Render, or while far off screen (unless forced), once the surface comes back. */
  private update(force?: boolean): void {
    if (this.offscreen && !force) this.stale = true;
    else this.render();
  }

  /** Effective appearance, as of the last render. */
  appearance(): GlassAppearance {
    return this.appearanceValue;
  }

  private spec(): MaterialSpec {
    return materials[this.opts.material][this.appearanceValue];
  }

  private chooseEngine(): EngineKind {
    const forced = this.opts.engine;
    if (forced === "css" || !this.opts.backdrop) return "css";
    if (forced === "backdrop") return supportsBackdropSvg() ? "backdrop" : "css";
    const scene = findScene(this.host);
    if (forced === "auto" && supportsBackdropSvg() && !scene?.sceneForced) return "backdrop";
    if (scene?.sceneMode === "gl" && (forced === "auto" || forced === "scene-gl"))
      return "scene-gl";
    if (scene?.sceneMode === "dom" && (forced === "auto" || forced === "scene-dom"))
      return "scene-dom";
    if (forced === "scene-gl" || forced === "scene-dom")
      return supportsBackdropSvg() ? "backdrop" : "css";
    return "css";
  }

  /** Refraction strength actually used, in CSS px. */
  refraction(m: ShapeMetrics = this.metrics): number {
    if (this.opts.refraction !== undefined) return Math.max(0, this.opts.refraction);
    // Small controls behave like strong lenses; larger slabs keep a narrower, calmer rim.
    const short = Math.min(m.width, m.height);
    return Math.max(8, short <= 64 ? short * 0.36 : Math.max(16, 23 - (short - 64) * 0.12));
  }

  /** Effective blur (frost) in CSS px. */
  blur(): number {
    return this.opts.blur ?? this.spec().blur;
  }

  /** Optics configuration for map generation. */
  optics(): OpticsConfig {
    return { ...defaultOptics, profile: this.opts.profile };
  }

  /** Re-render now. Cheap: map tiles are cached and only changed attributes are written. */
  render(): void {
    this.stale = false;
    const m = this.metrics;
    if (this.appearanceStale || this.opts.appearance !== "auto") {
      this.appearanceStale = false;
      this.appearanceValue =
        this.opts.appearance !== "auto"
          ? this.opts.appearance
          : resolveAppearance(this.host, "auto");
    }
    const spec = this.spec();
    const dpr = devicePixelRatio();
    this.dpr = dpr;
    const engine = this.chooseEngine();
    if (engine !== this.engineKind) this.switchEngine(engine);
    this.engineKind = engine;
    this.host.dataset.glassEngine = engine;

    const fs = this.fx.style;
    fs.borderRadius = `${m.radius}px`;
    fs.setProperty("--gl-fill", spec.fill);
    this.renderShadow(m.radius, spec, dpr);
    // Reduced transparency makes the glass opaque (styles.ts), except where it
    // is meant to show what lies behind: no backdrop, or a transparent fill.
    // Content follows the opaque material either way, since a see-through
    // control usually sits on other glass.
    const reduced = prefersReducedTransparency();
    const solid =
      reduced &&
      this.opts.backdrop &&
      (this.opts.fill === null || parseColor(this.opts.fill)?.[3] !== 0);
    if (solid) fs.setProperty("--gl-solid", spec.solid);
    else fs.removeProperty("--gl-solid");
    this.host.style.setProperty("--gl-fg", reduced ? spec.solidForeground : spec.foreground);
    this.host.style.setProperty("--gl-text-shadow", reduced ? "none" : spec.textShadow);
    // CSS hook for content that styles itself per glass appearance.
    if (this.host.dataset.glassAppearance !== this.appearanceValue)
      this.host.dataset.glassAppearance = this.appearanceValue;
    // Lets the host (focus rings, clipping, children) follow the glass outline.
    this.host.style.setProperty("--glass-r", `${m.radius}px`);

    // Tint: colored glass keeps some of the backdrop's luminance visible.
    const tint = this.opts.tint ? parseColor(this.opts.tint) : null;
    if (tint) {
      fs.setProperty(
        "--gl-tint",
        `rgb(${(tint[0] * 255) | 0} ${(tint[1] * 255) | 0} ${(tint[2] * 255) | 0})`,
      );
      fs.setProperty("--gl-tint-opacity", String(Math.min(1, (solid ? 1 : 0.88) * tint[3])));
    } else {
      fs.setProperty("--gl-tint-opacity", "0");
    }

    // Rim light.
    const rim = rimImage(m, dpr, {
      ...spec.rim,
      angle: this.opts.lightAngle,
      intensity: Math.min(1, spec.rim.intensity * this.opts.specular),
      glowIntensity: spec.rim.glowIntensity * Math.min(2, this.opts.specular),
    });
    const rs = this.rim.style;
    rs.borderWidth = `${rim.borderY}px ${rim.borderX}px`;
    rs.borderImageSource = `url("${rim.url}")`;
    rs.borderImageSlice = `${rim.sliceY} ${rim.sliceX}`;
    rs.borderImageWidth = `${rim.borderY}px ${rim.borderX}px`;
    rs.borderImageRepeat = "stretch";
    fs.setProperty("--gl-rim-o", this.opts.specular <= 0 ? "0" : "1");

    const bs = this.backdrop.style;
    if (engine === "backdrop") {
      if (!this.filter) {
        this.filter = new GlassFilter(nextId("glf"));
        this.fx.append(this.filter.svg);
      }
      const blur = this.blur();
      this.filter.update({
        metrics: m,
        dpr,
        optics: this.optics(),
        refraction: this.refraction(m),
        dispersion: this.opts.dispersion ?? 0,
        tone: toneTable(spec),
        blur: 0,
        zoom: this.opts.zoom,
      });
      // CSS blur first (fast, mirrored edges), then refraction, then saturation.
      const value = `${blur > 0 ? `blur(${blur}px) ` : ""}url(#${this.filter.id}) saturate(${spec.saturation})`;
      if (bs.backdropFilter !== value) {
        bs.backdropFilter = value;
        bs.setProperty("-webkit-backdrop-filter", value);
      }
    } else if (engine === "css") {
      const blur = this.opts.blur ?? spec.fallbackBlur;
      const value =
        this.opts.backdrop && supportsBackdropFilter()
          ? `blur(${blur}px) saturate(${spec.saturation + 0.35})`
          : "";
      bs.backdropFilter = value;
      bs.setProperty("-webkit-backdrop-filter", value);
      fs.setProperty("--gl-fill", spec.fallbackFill);
    } else {
      bs.backdropFilter = "";
      bs.setProperty("-webkit-backdrop-filter", "");
      this.scene?.update();
    }
    if (this.opts.fill !== null) fs.setProperty("--gl-fill", this.opts.fill);
    else if (!this.opts.backdrop) fs.setProperty("--gl-fill", "transparent");
    // The WebGL renderer bakes the fill into its output.
    if (engine === "scene-gl") fs.setProperty("--gl-fill", "transparent");
  }

  /**
   * Material shadows are drawn from a cached 9-slice image (one image draw per
   * repaint); custom CSS shadows fall back to box-shadow.
   */
  private renderShadow(radius: number, spec: MaterialSpec, dpr: number): void {
    const layer = this.shadowLayer;
    const ls = layer.style;
    const custom = typeof this.opts.shadow === "string" ? this.opts.shadow : null;
    const image = this.opts.shadow === true ? shadowImage(radius, spec.shadow, dpr) : null;
    if (image) {
      this.fx.style.setProperty("--gl-shadow", "none");
      ls.borderStyle = "solid";
      ls.borderColor = "transparent";
      ls.borderWidth = `${image.inset}px`;
      ls.borderImageSource = `url("${image.url}")`;
      ls.borderImageSlice = String(image.slice);
      ls.borderImageWidth = `${image.inset + image.outset}px`;
      ls.borderImageOutset = `${image.outset}px`;
      ls.borderImageRepeat = "stretch";
    } else {
      ls.borderImageSource = "";
      ls.borderWidth = "0";
      this.fx.style.setProperty("--gl-shadow", custom ?? "none");
    }
  }

  private switchEngine(next: EngineKind): void {
    if (next !== "backdrop" && this.filter) {
      this.filter.destroy();
      this.filter = null;
    }
    if (next !== "scene-gl" && next !== "scene-dom" && this.scene) {
      this.scene.destroy();
      this.scene = null;
    }
    if ((next === "scene-gl" || next === "scene-dom") && !this.scene) {
      this.sceneHost = findScene(this.host);
      this.scene = this.sceneHost?.attachSurface(this) ?? null;
    }
    if (next !== "scene-gl" && next !== "scene-dom") this.sceneHost = findScene(this.host);
  }

  /** Everything a scene renderer needs to draw this surface. */
  sceneParams(): SceneParams {
    const m = this.metrics;
    const spec = this.spec();
    return {
      metrics: m,
      refraction: this.refraction(m),
      // The scene lens magnifies the sample. A backdrop blur of the same
      // radius leaves a high-contrast glyph sharp under the label, so the
      // scene path frosts harder. The backdrop engine is unchanged.
      blur: this.blur() > 0.1 ? this.blur() * 2 : this.blur(),
      zoom: this.opts.zoom,
      dispersion: this.opts.dispersion ?? (this.engineKind === "scene-gl" ? 0.25 : 0),
      optics: this.optics(),
      lift: spec.lift,
      roll: spec.roll,
      saturation: spec.saturation,
      fill: parseColor(this.opts.fill ?? spec.fill) ?? [1, 1, 1, 0],
      tone: toneTable(spec),
      dpr: devicePixelRatio(),
    };
  }

  /** Layer that scene renderers draw into. */
  get backdropLayer(): HTMLElement {
    return this.backdrop;
  }

  /** Device pixel ratio used for the last render. */
  get pixelRatio(): number {
    return this.dpr;
  }

  /** Re-evaluate the engine (e.g. after moving the element into or out of a scene). */
  reattach(): void {
    this.appearanceStale = true;
    const scene = findScene(this.host);
    const next = this.chooseEngine();
    // Nothing to do when neither the engine nor the scene changed.
    if (
      next === this.engineKind &&
      scene === this.sceneHost &&
      (this.scene || (next !== "scene-gl" && next !== "scene-dom"))
    ) {
      this.invalidate();
      return;
    }
    this.switchEngine("css");
    this.engineKind = "css";
    this.render();
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    for (const d of this.disposers) d();
    this.disposers = [];
    this.filter?.destroy();
    this.scene?.destroy();
    this.fx.remove();
    surfaces.delete(this.host);
    live.delete(this);
    delete this.host.dataset.glassEngine;
    delete this.host.dataset.glassAppearance;
    this.host.style.removeProperty("--gl-fg");
    this.host.style.removeProperty("--gl-text-shadow");
    this.host.style.removeProperty("--glass-r");
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as Array<keyof T>) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/**
 * Turn any element into Liquid Glass. Returns the surface controller.
 *
 * ```js
 * const surface = glass(document.querySelector(".card"), { material: "clear", radius: 28 });
 * surface.set({ tint: "#0a84ff" });
 * surface.destroy();
 * ```
 */
export function glass(element: HTMLElement, options: GlassOptions = {}): GlassSurface {
  const existing = surfaces.get(element);
  if (existing) {
    existing.set(options);
    return existing;
  }
  return new GlassSurface(element, options);
}
