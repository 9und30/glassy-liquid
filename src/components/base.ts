/**
 * Base class for glass custom elements. Extend it to build your own glass
 * components: you get a shadow root with the glass layer stack, attribute ↔
 * option reflection, the tactile press response and lifecycle handling.
 *
 * ```js
 * class PriceTag extends GlassElement {
 *   static glassDefaults = { radius: "capsule", material: "clear" };
 *   static interactive = true;
 *   render() { return `<span part="label"><slot></slot></span>`; }
 * }
 * customElements.define("price-tag", PriceTag);
 * ```
 */
import type { GlassRadius } from "../core/shape.js";
import { attachPress, type PressController, type PressOptions } from "../interaction/press.js";
import { GlassSurface, type GlassOptions } from "../engine/surface.js";
import { adoptStyles } from "../engine/styles.js";

/** Shared host styles for every glass element. */
export const hostCss = /* css */ `
:host{position:relative;z-index:0;box-sizing:border-box;border-radius:var(--glass-r,0);color:var(--glass-foreground,var(--gl-fg));
  text-shadow:var(--glass-text-shadow,var(--gl-text-shadow,none));
  font-family:var(--glass-font,-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Inter","Segoe UI",system-ui,sans-serif);
  -webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased;}
:host([hidden]){display:none!important;}
:host(:focus-visible){outline:none;}
:host(:focus-visible)::after{content:"";position:absolute;inset:-4px;border-radius:inherit;pointer-events:none;
  box-shadow:0 0 0 3px var(--glass-focus,color-mix(in srgb,var(--glass-accent,#0a84ff) 70%,transparent));}
:host([disabled]){opacity:.45;pointer-events:none;}
*,*::before,*::after{box-sizing:border-box;}
`;

/**
 * Accent colors for elements that set `data-appearance`. `--gl-accent` is the
 * fill color (iOS system blue per appearance unless `--glass-accent` is set);
 * `--gl-accent-text` is the same hue moved to a lightness that stays readable
 * as text on that appearance's glass - darker on light glass, lighter on dark.
 */
export const accentCss = /* css */ `
:host{--gl-accent:var(--glass-accent,#007aff);--gl-accent-text:var(--gl-accent);}
:host([data-appearance=dark]){--gl-accent:var(--glass-accent,#0a84ff);}
@supports (color:oklch(from red l c h)){
  :host{--gl-accent-text:oklch(from var(--gl-accent) min(l,.5) c h);}
  :host([data-appearance=dark]){--gl-accent-text:oklch(from var(--gl-accent) max(l,.8) min(c,.15) h);}
}
`;

/** Attribute name → option key and parser. */
const glassAttributes: Record<string, [keyof GlassOptions, (v: string) => unknown]> = {
  material: ["material", (v) => v],
  appearance: ["appearance", (v) => v],
  radius: ["radius", (v) => parseRadius(v)],
  refraction: ["refraction", (v) => parseFloat(v)],
  bezel: ["bezel", (v) => parseFloat(v)],
  blur: ["blur", (v) => parseFloat(v)],
  dispersion: ["dispersion", (v) => parseFloat(v)],
  tint: ["tint", (v) => v],
  specular: ["specular", (v) => parseFloat(v)],
  "light-angle": ["lightAngle", (v) => parseFloat(v)],
  shadow: [
    "shadow",
    (v) => (v === "false" || v === "none" ? false : v === "" || v === "true" ? true : v),
  ],
  profile: ["profile", (v) => v],
  engine: ["engine", (v) => v],
};

export function parseRadius(v: string | null | undefined): GlassRadius | undefined {
  if (v == null || v === "") return undefined;
  if (v === "capsule" || v === "circle") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `HTMLElement` in the browser, a plain class on the server. Every element in
 * the package extends this, so importing any entry in Node (SSR, tests) does
 * not throw `HTMLElement is not defined`. Elements are only registered where
 * `customElements` exists (see `define`).
 */
export const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

export abstract class GlassElement extends HTMLElementBase {
  /** Default glass options for this component. */
  static glassDefaults: GlassOptions = {};
  /** Attach the tactile press response. */
  static interactive = false;
  /** Extra CSS for the shadow root. */
  static styles = "";
  /** Additional observed attributes, handled in `attributeChanged`. */
  static extraAttributes: string[] = [];
  /** Whether the element itself is a glass surface (false for containers that only host glass children). */
  static hasGlass = true;

  static get observedAttributes(): string[] {
    return [...Object.keys(glassAttributes), "interactive", ...this.extraAttributes];
  }

  /** The glass surface behind this element (available after connection). */
  surface: GlassSurface | null = null;
  protected press: PressController | null = null;
  protected rendered = false;
  private active = false;
  readonly shadow: ShadowRoot;

  constructor() {
    super();
    this.shadow = this.attachShadow({
      mode: "open",
      delegatesFocus: (this.constructor as typeof GlassElement).delegatesFocus,
    });
  }

  /** Forward focus into the shadow root (for elements wrapping native inputs). */
  static delegatesFocus = false;

  /** Return the shadow DOM markup (the glass layer is inserted automatically). */
  protected render(): string {
    return `<slot></slot>`;
  }

  /** Called once after the shadow DOM is rendered and the surface exists. */
  protected setup(): void {}

  /** Called on disconnect, after the surface is destroyed. */
  protected teardown(): void {}

  /** Options from defaults + attributes. Override to add component logic. */
  glassOptions(): GlassOptions {
    const ctor = this.constructor as typeof GlassElement;
    const opts: GlassOptions = { ...ctor.glassDefaults };
    for (const [attr, [key, parse]] of Object.entries(glassAttributes)) {
      const v = this.getAttribute(attr);
      if (v !== null) (opts as Record<string, unknown>)[key] = parse(v);
    }
    return opts;
  }

  protected get interactive(): boolean {
    const attr = this.getAttribute("interactive");
    if (attr !== null) return attr !== "false";
    return (this.constructor as typeof GlassElement).interactive;
  }

  /** Options for the press response. */
  protected pressOptions(): PressOptions {
    return {};
  }

  connectedCallback(): void {
    if (!this.rendered) {
      const ctor = this.constructor as typeof GlassElement;
      adoptStyles(this.shadow, hostCss, ctor.styles);
      this.shadow.innerHTML = this.render();
      this.rendered = true;
    }
    if (!this.active) {
      if ((this.constructor as typeof GlassElement).hasGlass) {
        this.surface = new GlassSurface(this, this.glassOptions(), {
          root: this.shadow,
          before: this.shadow.firstChild,
        });
      }
      this.active = true;
      this.setup();
    }
    this.syncPress();
  }

  disconnectedCallback(): void {
    // Elements that are only moved in the DOM reconnect synchronously.
    queueMicrotask(() => {
      if (this.isConnected) {
        this.surface?.reattach();
        return;
      }
      this.press?.dispose();
      this.press = null;
      this.surface?.destroy();
      this.surface = null;
      this.active = false;
      this.teardown();
    });
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (name in glassAttributes) {
      this.surface?.set(this.glassOptions());
      return;
    }
    if (name === "interactive") {
      this.syncPress();
      return;
    }
    this.attributeChanged(name, old, value);
  }

  /** Hook for subclass attributes listed in `static extraAttributes`. */
  protected attributeChanged(_name: string, _old: string | null, _value: string | null): void {}

  protected syncPress(): void {
    if (!this.isConnected) return;
    if (this.interactive && !this.press)
      this.press = attachPress(this, this.surface, this.pressOptions());
    else if (!this.interactive && this.press) {
      this.press.dispose();
      this.press = null;
    }
  }

  /** Dispatch a bubbling, composed event. */
  protected emit<T>(type: string, detail?: T, cancelable = false): boolean {
    return this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }),
    );
  }
}

/** Define a custom element once (safe for HMR and multiple bundles). */
/**
 * `defer-hydration` (the community protocol also used by Lit): while the
 * attribute is present the element does nothing on connect - no shadow DOM
 * work, no attributes, no inline styles - so server markup can be hydrated by a
 * framework even if the element upgraded first. Removing the attribute runs
 * the normal connect. The framework bindings render it on the server and
 * remove it right after hydration.
 */
export const DEFER_HYDRATION = "defer-hydration";

type Callbacks = {
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(name: string, old: string | null, value: string | null): void;
};

function deferrable(ctor: CustomElementConstructor): void {
  const proto = ctor.prototype as HTMLElement & Callbacks;
  if (Object.prototype.hasOwnProperty.call(proto, "__glassDeferrable")) return;
  const {
    connectedCallback: connected,
    disconnectedCallback: disconnected,
    attributeChangedCallback: changed,
  } = proto;
  const observed = (
    (ctor as unknown as { observedAttributes?: string[] }).observedAttributes ?? []
  ).slice();
  Object.defineProperty(ctor, "observedAttributes", {
    configurable: true,
    get: () => [...observed, DEFER_HYDRATION],
  });
  Object.defineProperty(proto, "__glassDeferrable", { value: true });
  proto.connectedCallback = function (this: HTMLElement & Callbacks) {
    if (!this.hasAttribute(DEFER_HYDRATION)) connected?.call(this);
  };
  proto.disconnectedCallback = function (this: HTMLElement & Callbacks) {
    if (!this.hasAttribute(DEFER_HYDRATION)) disconnected?.call(this);
  };
  proto.attributeChangedCallback = function (
    this: HTMLElement & Callbacks,
    name: string,
    old: string | null,
    value: string | null,
  ) {
    if (name === DEFER_HYDRATION) {
      if (value === null && old !== null) {
        // Replay what an upgrade does: attribute callbacks for the current attributes, then connect.
        for (const attr of observed) {
          const current = this.getAttribute(attr);
          if (current !== null) changed?.call(this, attr, null, current);
        }
        if (this.isConnected) connected?.call(this);
      }
      return;
    }
    if (!this.hasAttribute(DEFER_HYDRATION)) changed?.call(this, name, old, value);
  };
}

export function define(name: string, ctor: CustomElementConstructor): void {
  if (typeof customElements === "undefined" || customElements.get(name)) return;
  deferrable(ctor);
  customElements.define(name, ctor);
}
