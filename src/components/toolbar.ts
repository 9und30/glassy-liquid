/**
 * Toolbar building blocks.
 *
 *  <glass-group>   one capsule of glass shared by several controls (iOS 26 toolbars)
 *  <glass-toolbar> a row of buttons/groups with arrow-key navigation
 *  <glass-spacer>  flexible (default) or fixed space inside a toolbar
 *
 * ```html
 * <glass-toolbar>
 *   <glass-button shape="circle" aria-label="Back">…</glass-button>
 *   <glass-spacer></glass-spacer>
 *   <glass-group>
 *     <glass-button variant="plain" shape="circle" aria-label="Share">…</glass-button>
 *     <glass-button variant="plain" shape="circle" aria-label="More">…</glass-button>
 *   </glass-group>
 * </glass-toolbar>
 * ```
 */
import { GlassElement, HTMLElementBase, define } from "./base.js";
import type { GlassOptions } from "../engine/surface.js";

export class GlassGroupElement extends GlassElement {
  static override glassDefaults: GlassOptions = { radius: "capsule" };
  static override styles = /* css */ `
:host{display:inline-flex;align-items:center;vertical-align:middle;padding:0 var(--glass-group-padding,2px);height:var(--glass-button-height,44px);}
::slotted(glass-button[variant=plain]){--glass-button-padding:12px;}
`;
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
  }
}

export class GlassToolbarElement extends GlassElement {
  static override hasGlass = false;
  static override styles = /* css */ `:host{display:flex;align-items:center;gap:var(--glass-toolbar-gap,10px);}`;

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasAttribute("role")) this.setAttribute("role", "toolbar");
    this.addEventListener("keydown", this.onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.onKey);
  }

  private controls(): HTMLElement[] {
    return Array.from(
      this.querySelectorAll<HTMLElement>("glass-button,button,a[href],glass-switch,[tabindex]"),
    ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
  }

  private onKey = (e: KeyboardEvent): void => {
    const vertical = this.getAttribute("aria-orientation") === "vertical";
    const next = vertical ? "ArrowDown" : "ArrowRight";
    const prev = vertical ? "ArrowUp" : "ArrowLeft";
    if (e.key !== next && e.key !== prev && e.key !== "Home" && e.key !== "End") return;
    const list = this.controls();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const target =
      e.key === "Home"
        ? list[0]
        : e.key === "End"
          ? list[list.length - 1]
          : list[(i + (e.key === next ? 1 : -1) + list.length) % list.length];
    target?.focus();
  };
}

export class GlassSpacerElement extends HTMLElementBase {
  connectedCallback(): void {
    const size = this.getAttribute("size");
    Object.assign(this.style, size ? { flex: `0 0 ${parseFloat(size)}px` } : { flex: "1 1 auto" });
    this.style.display = "block";
    this.setAttribute("aria-hidden", "true");
  }
}

define("glass-group", GlassGroupElement);
define("glass-toolbar", GlassToolbarElement);
define("glass-spacer", GlassSpacerElement);
