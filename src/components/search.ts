/**
 * <glass-search> - iOS 26 search field on a glass capsule.
 *
 * ```html
 * <glass-search placeholder="Search" name="q"></glass-search>
 * ```
 * Events: `input`, `change`, `search` (Enter; detail { value }).
 * Form-associated; property `value`.
 */
import { GlassElement, define } from "./base.js";
import type { GlassOptions } from "../engine/surface.js";
import { attachInternals } from "./form.js";

const css = /* css */ `
:host{display:flex;align-items:center;height:var(--glass-search-height,44px);padding:0 6px 0 14px;gap:8px;cursor:text;font-size:17px;}
.icon{width:19px;height:19px;flex:none;opacity:.6;}
input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:inherit;font:inherit;letter-spacing:-.02em;padding:0;}
input::placeholder{color:currentColor;opacity:.5;}
input::-webkit-search-cancel-button,input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;}
.clear{width:30px;height:30px;flex:none;border:0;padding:0;border-radius:50%;background:transparent;color:inherit;opacity:.5;cursor:pointer;display:none;align-items:center;justify-content:center;}
.clear svg{width:18px;height:18px;}
:host([data-filled]) .clear{display:inline-flex;}
::slotted(*){flex:none;}
::slotted(svg),::slotted(img){width:19px;height:19px;}
`;

export class GlassSearchElement extends GlassElement {
  static override glassDefaults: GlassOptions = { radius: "capsule" };
  static override styles = css;
  static override delegatesFocus = true;
  static formAssociated = true;
  static override extraAttributes = ["placeholder", "value", "disabled"];

  private internals: ElementInternals | null;
  private input!: HTMLInputElement;

  constructor() {
    super();
    this.internals = attachInternals(this);
  }

  protected override render(): string {
    return `<svg class="icon" part="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/></svg>
<input part="input" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false">
<button class="clear" part="clear" type="button" tabindex="-1" aria-label="Clear"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.7 12.3a1 1 0 0 1-1.4 1.4L12 13.4l-2.3 2.3a1 1 0 0 1-1.4-1.4l2.3-2.3-2.3-2.3a1 1 0 0 1 1.4-1.4l2.3 2.3 2.3-2.3a1 1 0 0 1 1.4 1.4L13.4 12z"/></svg></button>
<slot></slot>`;
  }

  protected override setup(): void {
    this.input = this.shadow.querySelector("input")!;
    this.input.placeholder = this.getAttribute("placeholder") ?? "Search";
    this.input.value = this.getAttribute("value") ?? "";
    this.input.disabled = this.hasAttribute("disabled");
    const label = this.getAttribute("aria-label") ?? this.input.placeholder;
    this.input.setAttribute("aria-label", label);
    this.sync();
    this.input.addEventListener("input", (e) => {
      // The native event is composed and would also reach the host: re-emit exactly once.
      e.stopPropagation();
      this.sync();
      this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    });
    this.input.addEventListener("change", () =>
      this.dispatchEvent(new Event("change", { bubbles: true })),
    );
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.emit("search", { value: this.input.value });
      if (e.key === "Escape" && this.input.value) {
        e.stopPropagation();
        this.value = "";
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      }
    });
    this.shadow.querySelector(".clear")!.addEventListener("click", () => {
      this.value = "";
      this.input.focus();
      this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      this.dispatchEvent(new Event("change", { bubbles: true }));
    });
    this.addEventListener("pointerdown", (e) => {
      if (e.composedPath()[0] === this) {
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  protected override attributeChanged(
    name: string,
    _old: string | null,
    value: string | null,
  ): void {
    if (!this.input) return;
    if (name === "placeholder") this.input.placeholder = value ?? "Search";
    if (name === "value" && value !== this.input.value) this.value = value ?? "";
    if (name === "disabled") this.input.disabled = value !== null;
  }

  private sync(): void {
    this.toggleAttribute("data-filled", !!this.input.value);
    this.internals?.setFormValue(this.input.value);
  }

  get value(): string {
    return this.input?.value ?? this.getAttribute("value") ?? "";
  }
  set value(v: string) {
    if (this.input) {
      this.input.value = v;
      this.sync();
    } else this.setAttribute("value", v);
  }

  override focus(options?: FocusOptions): void {
    this.input?.focus(options);
  }

  formResetCallback(): void {
    this.value = this.getAttribute("value") ?? "";
  }
}

define("glass-search", GlassSearchElement);
