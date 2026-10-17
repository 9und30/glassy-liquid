/**
 * <glass-switch> - iOS 26 toggle. The white thumb turns into a liquid glass
 * lens while touched, follows the finger, and lands on the other side with a
 * soft bounce.
 *
 * ```html
 * <label>Wi-Fi <glass-switch checked name="wifi"></glass-switch></label>
 * ```
 * Events: `input`, `change`. Property: `checked`. Form-associated.
 */
import { prefersReducedMotion } from "../core/env.js";
import { Spring, springs } from "../core/spring.js";
import { addTask, wake, type FrameTask } from "../core/ticker.js";
import { onAppearanceChange, resolveAppearance } from "../engine/appearance.js";
import { adoptStyles } from "../engine/styles.js";
import { tapSlop } from "../interaction/press.js";
import { ThumbLens, thumbCss } from "../interaction/thumb.js";
import { HTMLElementBase, hostCss, define } from "./base.js";
import { attachInternals } from "./form.js";

const W = 64;
const H = 28;
const TW = 38;
const TH = 24;

const css = /* css */ `
:host{display:inline-block;vertical-align:middle;position:relative;width:${W}px;height:${H}px;border-radius:${H / 2}px;cursor:pointer;
  touch-action:pan-y;user-select:none;-webkit-user-select:none;outline:none;flex:none;}
:host(:focus-visible){box-shadow:0 0 0 3px color-mix(in srgb,var(--glass-accent,#0a84ff) 60%,transparent);}
:host(:focus-visible)::after{display:none;}
.track{position:absolute;inset:0;border-radius:inherit;background:var(--glass-switch-off,rgba(120,120,128,.2));overflow:hidden;}
.fill{position:absolute;inset:0;border-radius:inherit;background:var(--glass-switch-on,#34c759);opacity:0;}
:host([data-appearance=dark]) .track{background:var(--glass-switch-off,rgba(120,120,128,.36));}
:host([data-appearance=dark]) .fill{background:var(--glass-switch-on,#30d158);}
`;

export class GlassSwitchElement extends HTMLElementBase {
  static formAssociated = true;
  static get observedAttributes(): string[] {
    return ["checked", "disabled"];
  }

  private shadow: ShadowRoot;
  private internals: ElementInternals | null;
  private fill!: HTMLElement;
  private thumb: ThumbLens | null = null;
  private pos = new Spring(0, springs.toggle);
  private on = new Spring(0, springs.glow);
  private drag: {
    id: number;
    startX: number;
    startPos: number;
    moved: boolean;
    slop: number;
  } | null = null;
  private removeTask: (() => void) | null = null;
  private unwatch: (() => void) | null = null;
  private value_ = false;
  private initialized = false;
  private suppressClick = false;
  /** Set while a click is handled, so a wrapping <label> re-dispatching it (Firefox) does not toggle twice. */
  private clicking = false;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.internals = attachInternals(this);
  }

  private task: FrameTask = {
    write: (_now, dt) => {
      if (!this.thumb) return false;
      this.pos.step(dt);
      this.on.step(dt);
      const travel = W - 4 - TW;
      const v = this.pos.velocity * travel;
      this.thumb.update(dt, 2 + TW / 2 + this.pos.value * travel, H / 2, v);
      this.fill.style.opacity = this.on.value.toFixed(3);
      return !!this.drag || !this.pos.settled || !this.on.settled || !this.thumb.settled;
    },
  };

  connectedCallback(): void {
    if (!this.initialized) {
      adoptStyles(this.shadow, hostCss, thumbCss, css);
      this.shadow.innerHTML = `<span class="track" part="track"><span class="fill" part="fill"></span></span>`;
      this.fill = this.shadow.querySelector(".fill")!;
      this.value_ = this.hasAttribute("checked");
      this.pos.set(this.value_ ? 1 : 0);
      this.on.set(this.value_ ? 1 : 0);
      this.initialized = true;
    }
    if (!this.hasAttribute("role")) this.setAttribute("role", "switch");
    if (!this.hasAttribute("tabindex")) this.tabIndex = this.hasAttribute("disabled") ? -1 : 0;
    this.syncAria();
    this.applyAppearance();
    this.thumb ??= new ThumbLens(this.shadow, { rest: { width: TW, height: TH } });
    this.removeTask ??= addTask(this.task);
    this.unwatch ??= onAppearanceChange(() => this.applyAppearance());
    wake(this.task);
    this.addEventListener("pointerdown", this.onDown);
    this.addEventListener("keydown", this.onKey);
    this.addEventListener("click", this.onClick);
  }

  disconnectedCallback(): void {
    this.removeEventListener("pointerdown", this.onDown);
    this.removeEventListener("keydown", this.onKey);
    this.removeEventListener("click", this.onClick);
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.thumb?.destroy();
      this.thumb = null;
      this.removeTask?.();
      this.removeTask = null;
      this.unwatch?.();
      this.unwatch = null;
    });
  }

  attributeChangedCallback(name: string): void {
    if (name === "checked" && this.initialized) {
      const v = this.hasAttribute("checked");
      if (v !== this.value_) this.setChecked(v, false);
    }
    if (name === "disabled") {
      this.tabIndex = this.hasAttribute("disabled") ? -1 : 0;
      this.setAttribute("aria-disabled", String(this.hasAttribute("disabled")));
    }
  }

  get checked(): boolean {
    return this.value_;
  }
  set checked(v: boolean) {
    this.setChecked(!!v, false);
  }

  get value(): string {
    return this.getAttribute("value") ?? "on";
  }

  get form(): HTMLFormElement | null {
    return this.internals?.form ?? null;
  }

  formResetCallback(): void {
    this.setChecked(this.hasAttribute("checked"), false);
  }

  /** Toggle (animated, fires events). */
  toggle(force?: boolean): void {
    this.setChecked(force ?? !this.value_, true);
  }

  private applyAppearance(): void {
    const appearance = resolveAppearance(this);
    if (this.getAttribute("data-appearance") !== appearance)
      this.setAttribute("data-appearance", appearance);
  }

  private syncAria(): void {
    this.setAttribute("aria-checked", String(this.value_));
    this.internals?.setFormValue(this.value_ ? this.value : null);
  }

  private setChecked(v: boolean, user: boolean): void {
    const changed = v !== this.value_;
    this.value_ = v;
    if (this.hasAttribute("checked") !== v) this.toggleAttribute("checked", v);
    this.syncAria();
    if (!this.drag && user && changed && this.thumb && !prefersReducedMotion()) {
      // The thumb lifts into glass, travels, and lands.
      this.thumb.press();
      setTimeout(() => {
        if (!this.drag) this.thumb?.release();
        wake(this.task);
      }, 180);
    }
    this.pos.to(v ? 1 : 0, springs.toggle);
    this.on.to(v ? 1 : 0, springs.glow);
    wake(this.task);
    if (changed && user) {
      this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.hasAttribute("disabled")) return;
    // A drag whose click never arrived (released outside) must not swallow this tap.
    this.suppressClick = false;
    this.drag = {
      id: e.pointerId,
      startX: e.clientX,
      startPos: this.pos.value,
      moved: false,
      slop: tapSlop(e),
    };
    this.thumb?.press();
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    wake(this.task);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.startX;
    // Small jitter is still a tap: the thumb only follows once the finger really moves.
    if (!this.drag.moved && Math.abs(dx) <= this.drag.slop) return;
    this.drag.moved = true;
    const raw = this.drag.startPos + dx / (W - 4 - TW);
    const p = raw < 0 ? raw * 0.25 : raw > 1 ? 1 + (raw - 1) * 0.25 : raw;
    this.pos.to(p, springs.track);
    wake(this.task);
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const moved = this.drag.moved;
    this.drag = null;
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    if (moved && e.type !== "pointercancel") {
      this.thumb?.release();
      // Swallow the click this drag may produce (on touch it can arrive a moment
      // later); a click that never comes must not eat a later one.
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 400);
      // Decide by where the finger let go, not by the lagging spring.
      this.setChecked(this.pos.target > 0.5, true);
    } else {
      // A tap keeps the glass lifted; the click that follows carries it across.
      this.pos.to(this.value_ ? 1 : 0, springs.toggle);
      setTimeout(
        () => {
          if (!this.drag) this.thumb?.release();
          wake(this.task);
        },
        e.type === "pointercancel" ? 0 : 260,
      );
    }
    wake(this.task);
  };

  private onClick = (): void => {
    if (this.hasAttribute("disabled") || this.clicking) return;
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    // Firefox lets a wrapping <label> dispatch a second click at the switch
    // within the same task; ignore it until the task is over.
    this.clicking = true;
    setTimeout(() => (this.clicking = false));
    this.setChecked(!this.value_, true);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      this.setChecked(!this.value_, true);
    }
  };
}

define("glass-switch", GlassSwitchElement);
