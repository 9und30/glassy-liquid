/**
 * <glass-scene> - gives Safari, iOS and Firefox real refraction.
 *
 * Chromium refracts the live page behind any glass. Other engines cannot
 * read the backdrop, so a scene declares what lies behind its glass:
 *
 *   • an <img>, <video> or <canvas> marked `glass-backdrop` → rendered with
 *     WebGL (engine `scene-gl`, GPU, every effect including dispersion);
 *   • any other element marked `glass-backdrop` → its content is filtered
 *     (engine `scene-dom`; keep such scenes reasonably small);
 *   • `src="photo.jpg"` → the scene creates a cover image backdrop for you.
 *
 * Glass anywhere inside the scene picks this up automatically. In Chromium
 * the scene is transparent: glass keeps using the faster backdrop engine.
 *
 * ```html
 * <glass-scene src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Iceberg_reflection_in_J%C3%B6kuls%C3%A1rl%C3%B3n_%28Unsplash%29.jpg/960px-Iceberg_reflection_in_J%C3%B6kuls%C3%A1rl%C3%B3n_%28Unsplash%29.jpg" style="height:100vh">
 *   <glass-button>Continue</glass-button>
 * </glass-scene>
 * ```
 */
import { nextId, supportsBackdropSvg, supportsWebGL } from "../core/env.js";
import { addTask, wake, type FrameTask } from "../core/ticker.js";
import {
  rescanSurfaces,
  type GlassSurface,
  type SceneBinding,
  type SceneHost,
} from "../engine/surface.js";
import { HTMLElementBase, define } from "../components/base.js";
import { DomFilterRenderer } from "./dom.js";
import { GlRenderer, objectFitMap, type GlTexture } from "./gl.js";

type MediaSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

const isMedia = (el: Element | null): el is MediaSource =>
  el instanceof HTMLImageElement ||
  el instanceof HTMLVideoElement ||
  el instanceof HTMLCanvasElement;

let styled = false;
function injectStyles(): void {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const s = document.createElement("style");
  s.id = "glassy-liquid-scene";
  s.textContent = `glass-scene{display:block;position:relative;z-index:0;background:linear-gradient(160deg,#9bb7c9,#e7eef2);}`;
  document.head.append(s);
}

interface Binding extends SceneBinding {
  surface: GlassSurface;
  canvas?: HTMLCanvasElement;
  last: string;
  dirty: boolean;
}

export class GlassSceneElement extends HTMLElementBase implements SceneHost {
  static get observedAttributes(): string[] {
    return ["src", "backdrop", "mode", "force"];
  }

  private bindings = new Set<Binding>();
  private tex: GlTexture | null = null;
  private texVersion = -1;
  private visible = true;
  private io: IntersectionObserver | null = null;
  private uid = nextId("scene");
  private dom: DomFilterRenderer | null = null;
  private backdropEl: Element | null = null;
  private mode: "gl" | "dom" | null = null;
  private watchUntil = 0;
  private removeTask: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  private mediaDirty = true;
  /** Decoding of the backdrop image, which must finish before its first upload. */
  private decoding: { src: string; done: boolean } | null = null;
  private videoHandle = 0;
  private listening = false;
  /**
   * The `src` image lives in the scene's shadow root (part "backdrop"), not in
   * its light DOM: frameworks hydrating server markup must find exactly the
   * children they rendered, even if the elements upgraded first.
   */
  private autoImg: HTMLImageElement | null = null;
  /** A src that already failed to load. Do not assign it again (that loops the broken icon). */
  private failedSrc: string | null = null;

  private ensureShadow(): ShadowRoot {
    if (this.shadowRoot) return this.shadowRoot;
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host{display:block;position:relative;z-index:0;}
[part=backdrop]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;user-select:none;}
[part=backdrop]:not([src]){display:none;}`;
    root.append(style, document.createElement("slot"));
    return root;
  }

  get sceneMode(): "gl" | "dom" | null {
    return this.mode;
  }

  /** `force` attribute: use the scene engines in Chromium too. */
  get sceneForced(): boolean {
    return this.hasAttribute("force");
  }

  /** The element whose content the glass refracts. */
  get backdrop(): Element | null {
    return this.backdropEl;
  }

  private task: FrameTask = {
    write: (now) => this.frame(now),
  };

  connectedCallback(): void {
    injectStyles();
    this.resolve();
    this.removeTask ??= addTask(this.task);
    if (!this.listening) {
      this.listening = true;
      window.addEventListener("scroll", this.poke, { capture: true, passive: true });
      window.addEventListener("resize", this.poke, { passive: true });
      for (const t of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "transitionrun",
        "animationstart",
        "toggle",
      ])
        this.addEventListener(t, this.poke, { capture: true, passive: true });
    }
    if (!this.io && typeof IntersectionObserver !== "undefined") {
      // Scenes off screen do no work at all; they catch up when they return.
      this.io = new IntersectionObserver(
        (entries) => {
          const v = entries.some((e) => e.isIntersecting);
          if (v && !this.visible) this.invalidate();
          this.visible = v;
        },
        { rootMargin: "300px" },
      );
      this.io.observe(this);
    }
    this.poke();
    rescanSurfaces();
  }

  disconnectedCallback(): void {
    queueMicrotask(() => {
      if (this.isConnected) return;
      window.removeEventListener("scroll", this.poke, { capture: true });
      window.removeEventListener("resize", this.poke);
      for (const t of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "transitionrun",
        "animationstart",
        "toggle",
      ])
        this.removeEventListener(t, this.poke, { capture: true });
      this.listening = false;
      this.io?.disconnect();
      this.io = null;
      this.removeTask?.();
      this.removeTask = null;
      this.teardownRenderers();
      rescanSurfaces();
    });
  }

  attributeChangedCallback(_name: string, old: string | null, value: string | null): void {
    // Re-setting the same value (e.g. on every input event) must not rescan every glass on the page.
    if (old === value) return;
    if (this.isConnected) {
      this.resolve();
      this.reattachSurfaces();
      rescanSurfaces();
    }
  }

  /** Re-render after the backdrop changed (e.g. you drew into a backdrop canvas). */
  invalidate(): void {
    this.mediaDirty = true;
    for (const b of this.bindings) b.dirty = true;
    this.poke();
  }

  /** Keep tracking surface positions for a while (scrolling, animations). */
  private poke = (): void => {
    if (!this.visible) return;
    this.watchUntil = performance.now() + 600;
    wake(this.task);
  };

  private findBackdrop(): Element | null {
    const sel = this.getAttribute("backdrop");
    if (sel) return this.querySelector(sel) ?? document.querySelector(sel);
    return this.querySelector(":scope > [glass-backdrop], :scope > [data-glass-backdrop]");
  }

  private hideFailedImage(img: HTMLImageElement): void {
    img.removeAttribute("src");
    img.style.display = "none";
    if (this.backdropEl === img) {
      this.backdropEl = null;
      this.mode = null;
      this.teardownRenderers();
    }
  }

  private watchAutoImage(img: HTMLImageElement, src: string): void {
    if (img.dataset.watchSrc === src) return;
    img.dataset.watchSrc = src;
    img.addEventListener("error", () => {
      if (this.getAttribute("src") !== src) return;
      this.failedSrc = src;
      this.hideFailedImage(img);
    });
  }

  private resolve(): void {
    let el = this.findBackdrop();
    const src = this.getAttribute("src");
    if (this.failedSrc && src !== this.failedSrc) this.failedSrc = null;
    const auto =
      this.autoImg?.isConnected && this.autoImg.hasAttribute("src") ? this.autoImg : null;
    // The image the scene created itself counts as "no backdrop given", so a new `src` updates it.
    if (src && this.failedSrc === src) {
      if (this.autoImg) this.hideFailedImage(this.autoImg);
      if (el === this.autoImg) el = null;
    } else if (src && (!el || el === auto)) {
      const root = this.ensureShadow();
      const img = (this.autoImg ??= document.createElement("img"));
      img.setAttribute("part", "backdrop");
      img.setAttribute("data-glass-auto-backdrop", "");
      img.alt = "";
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.style.display = "";
      this.watchAutoImage(img, src);
      if (img.getAttribute("src") !== src) {
        img.src = src;
        img.addEventListener("load", () => this.invalidate(), { once: true });
        this.mediaDirty = true;
      }
      if (img.parentNode !== root) root.prepend(img);
      el = img;
    } else if (auto && el !== auto) auto.removeAttribute("src");
    if (el !== this.backdropEl) {
      this.teardownRenderers();
      this.backdropEl = el;
      if (el instanceof HTMLImageElement && !el.complete)
        el.addEventListener("load", () => this.invalidate(), { once: true });
      if (el instanceof HTMLVideoElement) this.watchVideo(el);
    }
    const forced = this.getAttribute("mode");
    const wantGl = forced !== "dom" && isMedia(el) && supportsWebGL();
    this.mode = !el ? null : wantGl ? "gl" : "dom";
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.invalidate());
    this.ro.observe(this);
    if (el) this.ro.observe(el);
  }

  private watchVideo(v: HTMLVideoElement): void {
    const tick = () => {
      this.mediaDirty = true;
      for (const b of this.bindings) b.dirty = true;
      wake(this.task);
      if (v.isConnected)
        this.videoHandle =
          "requestVideoFrameCallback" in v
            ? (
                v as HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number }
              ).requestVideoFrameCallback(tick)
            : requestAnimationFrame(tick);
    };
    tick();
  }

  private teardownRenderers(): void {
    if (this.tex) GlRenderer.shared()?.release(this.tex);
    this.tex = null;
    this.texVersion = -1;
    this.decoding = null;
    this.dom?.destroy();
    this.dom = null;
    if (this.videoHandle) cancelAnimationFrame(this.videoHandle);
  }

  private reattachSurfaces(): void {
    for (const b of Array.from(this.bindings)) b.surface.reattach();
  }

  attachSurface(surface: GlassSurface): SceneBinding | null {
    if (!this.mode) return null;
    if (supportsBackdropSvg() && !this.sceneForced && surface.options.engine === "auto")
      return null;
    const binding: Binding = {
      surface,
      last: "",
      dirty: true,
      update: () => {
        binding.dirty = true;
        wake(this.task);
      },
      destroy: () => {
        this.bindings.delete(binding);
        binding.canvas?.remove();
        this.dom?.set(binding, null);
        this.dom?.commit();
      },
    };
    if (this.mode === "gl") {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      surface.backdropLayer.append(canvas);
      binding.canvas = canvas;
    }
    this.bindings.add(binding);
    this.poke();
    return binding;
  }

  private frame(now: number): boolean {
    const el = this.backdropEl;
    if (!el || !this.mode || !this.bindings.size) return false;
    const br = el.getBoundingClientRect();
    if (this.mode === "gl") this.frameGl(el as MediaSource, br);
    else this.frameDom(el as HTMLElement, br);
    return now < this.watchUntil || (el instanceof HTMLVideoElement && !el.paused);
  }

  private measure(
    b: Binding,
    br: DOMRect,
  ): { x: number; y: number; sx: number; sy: number; key: string } | null {
    const host = b.surface.host;
    const r = host.getBoundingClientRect();
    const w = host.offsetWidth;
    const h = host.offsetHeight;
    if (!w || !h) return null;
    const x = r.left - br.left;
    const y = r.top - br.top;
    const sx = r.width / w;
    const sy = r.height / h;
    return {
      x,
      y,
      sx,
      sy,
      key: `${x.toFixed(2)},${y.toFixed(2)},${sx.toFixed(4)},${sy.toFixed(4)},${br.width.toFixed(1)},${br.height.toFixed(1)}`,
    };
  }

  private frameGl(el: MediaSource, br: DOMRect): void {
    const gl = GlRenderer.shared();
    if (!gl) {
      this.fallbackToDom();
      return;
    }
    // Images are shared by URL across every scene of the page.
    const shared = el instanceof HTMLImageElement && (el.currentSrc || el.src);
    const key = shared ? `img:${el.currentSrc || el.src}` : `el:${this.uid}`;
    if (this.tex && this.tex.key !== key) {
      gl.release(this.tex);
      this.tex = null;
    }
    if (!this.tex) {
      this.tex = gl.acquire(key);
      this.mediaDirty = true;
    }
    const tex = this.tex;
    if (this.mediaDirty) {
      // A shared texture is only ready once filled from a fully loaded image, so reusing it is safe.
      const reuse = shared && tex.ready;
      if (!reuse) {
        if (el instanceof HTMLImageElement && !this.decoded(el)) return;
        if (!gl.upload(tex, el)) {
          // No pixels yet (retried on the next video frame or load) or cross-origin without CORS.
          if (el instanceof HTMLImageElement && el.complete && el.naturalWidth)
            this.fallbackToDom();
          return;
        }
      }
      this.mediaDirty = false;
    }
    if (tex.version !== this.texVersion) {
      this.texVersion = tex.version;
      for (const b of this.bindings) b.dirty = true;
    }
    const map = objectFitMap(el, el.clientWidth || br.width, el.clientHeight || br.height);
    if (!map) return;
    for (const b of this.bindings) {
      const m = this.measure(b, br);
      if (!m || !b.canvas) continue;
      if (!b.dirty && m.key === b.last) continue;
      b.last = m.key;
      b.dirty = false;
      const p = b.surface.sceneParams();
      if (p.blur > 0.1) gl.prepareBlur(tex, p.blur * tex.width * map[0]);
      gl.draw(
        tex,
        {
          width: p.metrics.width,
          height: p.metrics.height,
          radius: p.metrics.radius,
          bezel: p.metrics.bezel,
          refraction: p.refraction,
          zoom: p.zoom,
          dispersion: p.dispersion,
          blur: p.blur,
          dpr: p.dpr,
          originX: m.x,
          originY: m.y,
          scaleX: m.sx,
          scaleY: m.sy,
          lift: p.lift,
          roll: p.roll,
          saturation: p.saturation,
          fill: p.fill,
          optics: p.optics,
        },
        map,
        b.canvas,
      );
    }
  }

  /**
   * Whether a backdrop image can be uploaded. Firefox reports an image's size
   * while it is still streaming in or not decoded yet (preloaded or cached
   * photos with async decoding), and a texture uploaded then stays empty:
   * black glass. So an image uploads only once it is loaded and decoded.
   */
  private decoded(img: HTMLImageElement): boolean {
    const src = img.currentSrc || img.src;
    if (this.decoding?.src !== src) {
      // decode() waits for the image to load, then wakes the scene to upload it.
      const state = { src, done: typeof img.decode !== "function" };
      this.decoding = state;
      const settle = () => {
        if (this.decoding !== state) return;
        // A failed decode still gets its upload attempt; upload() rejects what has no pixels.
        state.done = true;
        this.invalidate();
      };
      if (!state.done) img.decode().then(settle, settle);
    }
    return this.decoding.done && img.complete && img.naturalWidth > 0;
  }

  private frameDom(el: HTMLElement, br: DOMRect): void {
    this.dom ??= new DomFilterRenderer(el);
    let changed = false;
    for (const b of this.bindings) {
      const m = this.measure(b, br);
      if (!m) {
        this.dom.set(b, null);
        continue;
      }
      if (!b.dirty && m.key === b.last) continue;
      b.last = m.key;
      b.dirty = false;
      changed = true;
      this.dom.set(b, {
        params: b.surface.sceneParams(),
        x: m.x,
        y: m.y,
        scaleX: m.sx,
        scaleY: m.sy,
      });
    }
    if (changed) this.dom.commit();
  }

  private fallbackToDom(): void {
    if (this.tex) GlRenderer.shared()?.release(this.tex);
    this.tex = null;
    for (const b of this.bindings) b.canvas?.remove();
    this.setAttribute("mode", "dom");
  }
}

define("glass-scene", GlassSceneElement);
