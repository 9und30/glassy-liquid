/**
 * <glass-button> - iOS 26 glass button.
 *
 * Attributes: variant="glass|prominent|plain", size="small|medium|large",
 * shape="capsule|circle|rounded", disabled, type="button|submit|reset",
 * href / target (renders as a link), plus every glass attribute.
 *
 * ```html
 * <glass-button>Edit</glass-button>
 * <glass-button variant="prominent">Done</glass-button>
 * <glass-button shape="circle" aria-label="Add"><svg …/></glass-button>
 * ```
 */
import { GlassElement, define } from "./base.js";
import { legibleTint } from "../engine/materials.js";
import type { GlassOptions } from "../engine/surface.js";

const css = /* css */ `
:host{display:inline-flex;vertical-align:middle;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;
  height:var(--glass-button-height,44px);min-width:var(--glass-button-height,44px);padding:0 var(--glass-button-padding,20px);
  font-size:var(--glass-button-font-size,17px);font-weight:590;letter-spacing:-.022em;line-height:1;}
:host([size=small]){--glass-button-height:32px;--glass-button-padding:14px;--glass-button-font-size:15px;}
:host([size=large]){--glass-button-height:52px;--glass-button-padding:26px;--glass-button-font-size:17px;}
:host([shape=circle]){padding:0;width:var(--glass-button-height,44px);}
:host([variant=prominent]){color:var(--glass-on-accent,var(--gl-on-tint,#fff));}
:host([variant=plain]){color:var(--glass-accent-text,var(--glass-foreground,var(--gl-fg)));}
[part=label]{display:inline-flex;align-items:center;justify-content:center;gap:.4em;width:100%;height:100%;white-space:nowrap;}
::slotted(svg){width:1.15em;height:1.15em;flex:none;}
`;

export class GlassButtonElement extends GlassElement {
  static override glassDefaults: GlassOptions = { radius: "capsule" };
  static override interactive = true;
  static override styles = css;
  static formAssociated = true;
  static override extraAttributes = ["variant", "shape", "disabled", "href"];

  private internals: ElementInternals | null = null;

  constructor() {
    super();
    try {
      this.internals = this.attachInternals();
    } catch {
      this.internals = null;
    }
  }

  protected override render(): string {
    return `<span part="label"><slot name="icon"></slot><slot></slot><slot name="trailing"></slot></span>`;
  }

  override glassOptions(): GlassOptions {
    const opts = super.glassOptions();
    const variant = this.getAttribute("variant");
    const shape = this.getAttribute("shape");
    if (shape === "circle") opts.radius = "circle";
    else if (shape === "rounded" && !this.hasAttribute("radius")) opts.radius = 12;
    if (variant === "prominent" && !this.hasAttribute("tint")) {
      // The accent is adjusted so the label on it stays readable (see legibleTint).
      const { fill, text } = legibleTint(
        getComputedStyle(this).getPropertyValue("--glass-accent").trim() || "#007aff",
      );
      opts.tint = fill;
      this.style.setProperty("--gl-on-tint", text);
    }
    if (variant === "plain") {
      opts.backdrop = false;
      opts.shadow = false;
      opts.specular = 0;
    }
    return opts;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasAttribute("tabindex")) this.tabIndex = this.hasAttribute("disabled") ? -1 : 0;
    this.syncRole();
    this.addEventListener("keydown", this.onKeyDown);
    this.addEventListener("keyup", this.onKeyUp);
    this.addEventListener("click", this.onClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.onKeyDown);
    this.removeEventListener("keyup", this.onKeyUp);
    this.removeEventListener("click", this.onClick);
  }

  protected override attributeChanged(name: string): void {
    if (name === "disabled") {
      this.tabIndex = this.hasAttribute("disabled") ? -1 : 0;
      this.setAttribute("aria-disabled", String(this.hasAttribute("disabled")));
    }
    if (name === "variant" || name === "shape") this.surface?.set(this.glassOptions());
    this.syncRole();
  }

  private syncRole(): void {
    const role = this.hasAttribute("href") ? "link" : "button";
    if (this.getAttribute("role") !== role) this.setAttribute("role", role);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.click();
    } else if (e.key === " ") e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === " ") this.click();
  };

  private onClick = (e: MouseEvent): void => {
    if (this.hasAttribute("disabled")) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    const href = this.getAttribute("href");
    if (href) {
      if (e.defaultPrevented) return;
      const target = this.getAttribute("target");
      if (target && target !== "_self") window.open(href, target, "noopener");
      else location.assign(href);
      return;
    }
    const form = this.internals?.form;
    if (!form || e.defaultPrevented) return;
    const type = this.getAttribute("type") ?? "button";
    if (type === "submit") form.requestSubmit();
    else if (type === "reset") form.reset();
  };

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(v: boolean) {
    this.toggleAttribute("disabled", v);
  }
}

define("glass-button", GlassButtonElement);
