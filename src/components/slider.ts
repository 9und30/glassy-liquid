/**
 * <glass-slider> - iOS 26 slider with a thumb that turns into a magnifying
 * glass lens while dragged.
 *
 * ```html
 * <glass-slider min="0" max="100" value="40" aria-label="Volume"></glass-slider>
 * <glass-slider step="25" ticks></glass-slider>
 * ```
 * Attributes: min, max, step, value, ticks, show-value, disabled, name. Events: `input`
 * (while dragging), `change` (on commit). Form-associated.
 */
import { Spring, clamp, springs } from "../core/spring.js";
import { addTask, wake, type FrameTask } from "../core/ticker.js";
import { onAppearanceChange, resolveAppearance } from "../engine/appearance.js";
import { adoptStyles } from "../engine/styles.js";
import { ThumbLens, thumbCss } from "../interaction/thumb.js";
import { HTMLElementBase, hostCss, define } from "./base.js";
import { attachInternals } from "./form.js";

const TW = 38;
const TH = 24;
const HEIGHT = 28;

const css = /* css */ `
:host{display:block;position:relative;height:${HEIGHT}px;min-width:120px;cursor:pointer;touch-action:pan-y;user-select:none;-webkit-user-select:none;outline:none;border-radius:${HEIGHT / 2}px;}
:host(:focus-visible){box-shadow:0 0 0 3px color-mix(in srgb,var(--glass-accent,#0a84ff) 60%,transparent);}
:host(:focus-visible)::after{display:none;}
.track{position:absolute;left:0;right:0;top:50%;height:var(--glass-slider-track,6px);margin-top:calc(var(--glass-slider-track,6px) / -2);border-radius:999px;
  background:var(--glass-slider-off,rgba(120,120,128,.2));overflow:hidden;}
:host([data-appearance=dark]) .track{background:var(--glass-slider-off,rgba(120,120,128,.36));}
.fill{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:999px;background:var(--glass-accent,#0a84ff);transform-origin:0 50%;transform:scaleX(0);}
.ticks{position:absolute;left:${TW / 2}px;right:${TW / 2}px;top:50%;height:0;}
.ticks i{position:absolute;top:-2px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:rgba(120,120,128,.55);}
.value-label{position:absolute;left:0;bottom:calc(100% + 8px);max-width:100%;padding:4px 9px;border-radius:999px;
  background:var(--glass-thumb,#fff);color:#1d1d1f;box-shadow:0 2px 8px rgba(0,0,0,.16);font-size:12px;font-weight:600;line-height:18px;
  font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;visibility:hidden;text-shadow:none;}
:host([data-appearance=dark]) .value-label{background:#2c2c2e;color:#f5f5f7;}
:host([show-value]:not([disabled]):focus-visible) .value-label,:host([show-value]:not([disabled])) .value-label.dragging{visibility:visible;}
@media (forced-colors:active){.value-label{background:Canvas!important;color:CanvasText!important;border:1px solid CanvasText;box-shadow:none;}}
`;

export class GlassSliderElement extends HTMLElementBase {
  static formAssociated = true;
  static get observedAttributes(): string[] {
    return ["min", "max", "step", "value", "ticks", "show-value", "aria-valuetext", "disabled"];
  }

  private shadow: ShadowRoot;
  private internals: ElementInternals | null;
  private fill!: HTMLElement;
  private ticksEl!: HTMLElement;
  private valueLabel!: HTMLElement;
  private thumb: ThumbLens | null = null;
  private pos = new Spring(0, springs.snap);
  private drag: { id: number; offset: number } | null = null;
  private value_ = 0;
  private width = 0;
  private initialized = false;
  private removeTask: (() => void) | null = null;
  private unwatch: (() => void) | null = null;
  private ro: ResizeObserver | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.internals = attachInternals(this);
  }

  get min(): number {
    const v = parseFloat(this.getAttribute("min") ?? "");
    return Number.isFinite(v) ? v : 0;
  }
  set min(v: number) {
    this.setAttribute("min", String(v));
  }
  get max(): number {
    const v = parseFloat(this.getAttribute("max") ?? "");
    return Number.isFinite(v) ? v : 100;
  }
  set max(v: number) {
    this.setAttribute("max", String(v));
  }
  get step(): number {
    const v = parseFloat(this.getAttribute("step") ?? "");
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  set step(v: number) {
    this.setAttribute("step", String(v));
  }
  get value(): number {
    return this.value_;
  }
  set value(v: number) {
    this.setValue(v, false, true);
  }
  get showValue(): boolean {
    return this.hasAttribute("show-value");
  }
  set showValue(v: boolean) {
    this.toggleAttribute("show-value", !!v);
  }
  get valueAsNumber(): number {
    return this.value_;
  }
  get form(): HTMLFormElement | null {
    return this.internals?.form ?? null;
  }

  private task: FrameTask = {
    write: (_now, dt) => {
      if (!this.thumb) return false;
      this.pos.step(dt);
      const travel = Math.max(0, this.width - TW);
      const cx = TW / 2 + clamp(this.pos.value, -0.04, 1.04) * travel;
      this.thumb.update(dt, cx, HEIGHT / 2, this.pos.velocity * travel);
      this.fill.style.transform = `scaleX(${(Math.max(0, cx) / Math.max(1, this.width)).toFixed(5)})`;
      if (this.showValue)
        this.valueLabel.style.transform = `translateX(clamp(0px,calc(${cx.toFixed(2)}px - 50%),calc(${this.width}px - 100%)))`;
      return !!this.drag || !this.pos.settled || !this.thumb.settled;
    },
  };

  connectedCallback(): void {
    if (!this.initialized) {
      adoptStyles(this.shadow, hostCss, thumbCss, css);
      this.shadow.innerHTML = `<span class="track" part="track"><span class="fill" part="fill"></span></span><span class="ticks" part="ticks"></span><span class="value-label" part="value-label" aria-hidden="true"></span>`;
      this.fill = this.shadow.querySelector(".fill")!;
      this.ticksEl = this.shadow.querySelector(".ticks")!;
      this.valueLabel = this.shadow.querySelector(".value-label")!;
      this.value_ = this.clampValue(parseFloat(this.getAttribute("value") ?? "") || this.min);
      this.pos.set(this.fraction(this.value_));
      this.initialized = true;
    }
    if (!this.hasAttribute("role")) this.setAttribute("role", "slider");
    if (!this.hasAttribute("tabindex")) this.tabIndex = this.hasAttribute("disabled") ? -1 : 0;
    this.thumb ??= new ThumbLens(this.shadow, { rest: { width: TW, height: TH } });
    this.removeTask ??= addTask(this.task);
    this.unwatch ??= onAppearanceChange(() => this.applyAppearance());
    this.applyAppearance();
    this.ro ??= new ResizeObserver(() => {
      this.width = this.offsetWidth;
      this.renderTicks();
      wake(this.task);
    });
    this.ro.observe(this);
    this.width = this.offsetWidth;
    this.syncAria();
    this.renderTicks();
    wake(this.task);
    this.addEventListener("pointerdown", this.onDown);
    this.addEventListener("keydown", this.onKey);
  }

  disconnectedCallback(): void {
    this.removeEventListener("pointerdown", this.onDown);
    this.removeEventListener("keydown", this.onKey);
    this.endDrag();
    this.ro?.disconnect();
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
    if (!this.initialized) return;
    if (name === "value") {
      const v = parseFloat(this.getAttribute("value") ?? "");
      if (Number.isFinite(v) && v !== this.value_ && !this.drag) this.setValue(v, false, true);
    } else if (name === "min" || name === "max" || name === "step") {
      this.setValue(this.value_, false, true);
      this.renderTicks();
    } else if (name === "ticks") this.renderTicks();
    else if (name === "show-value" || name === "aria-valuetext") {
      this.syncValueLabel();
      wake(this.task);
    } else if (name === "disabled") {
      this.tabIndex = this.hasAttribute("disabled") ? -1 : 0;
      this.setAttribute("aria-disabled", String(this.hasAttribute("disabled")));
      if (this.hasAttribute("disabled")) this.endDrag();
    }
  }

  private applyAppearance(): void {
    const appearance = resolveAppearance(this);
    if (this.getAttribute("data-appearance") !== appearance)
      this.setAttribute("data-appearance", appearance);
  }

  formResetCallback(): void {
    this.setValue(parseFloat(this.getAttribute("value") ?? "") || this.min, false, true);
  }

  private fraction(v: number): number {
    const span = this.max - this.min;
    return span > 0 ? (v - this.min) / span : 0;
  }

  private clampValue(v: number): number {
    const { min, max, step } = this;
    let x = clamp(v, Math.min(min, max), Math.max(min, max));
    if (step > 0) x = clamp(min + Math.round((x - min) / step) * step, min, max);
    // Keep a continuous drag fractional. Six decimals only strip binary tails.
    return Math.round(x * 1e6) / 1e6;
  }

  private renderTicks(): void {
    if (!this.ticksEl) return;
    const step = this.step;
    const count = step > 0 ? Math.round((this.max - this.min) / step) : 0;
    if (!this.hasAttribute("ticks") || count < 1 || count > 100) {
      this.ticksEl.replaceChildren();
      return;
    }
    const html: string[] = [];
    for (let i = 0; i <= count; i++)
      html.push(`<i style="left:${((i / count) * 100).toFixed(4)}%"></i>`);
    this.ticksEl.innerHTML = html.join("");
  }

  private syncAria(): void {
    this.setAttribute("aria-valuemin", String(this.min));
    this.setAttribute("aria-valuemax", String(this.max));
    this.setAttribute("aria-valuenow", String(this.value_));
    this.internals?.setFormValue(String(this.value_));
    this.syncValueLabel();
  }

  private syncValueLabel(): void {
    if (this.valueLabel)
      this.valueLabel.textContent = this.getAttribute("aria-valuetext") ?? String(this.value_);
  }

  private setValue(v: number, user: boolean, animate: boolean, commit = true): void {
    const next = this.clampValue(v);
    const changed = next !== this.value_;
    this.value_ = next;
    this.syncAria();
    if (animate) this.pos.to(this.fraction(next), springs.snap);
    wake(this.task);
    if (user && changed) this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    if (user && commit && changed) this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private fractionAt(clientX: number): number {
    const r = this.getBoundingClientRect();
    const scale = r.width / (this.offsetWidth || 1);
    const x = (clientX - r.left) / scale;
    return (x - TW / 2) / Math.max(1, this.offsetWidth - TW);
  }

  private startValue = 0;

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.hasAttribute("disabled")) return;
    e.preventDefault();
    this.focus({ preventScroll: true });
    const f = this.fractionAt(e.clientX);
    const travel = Math.max(1, this.offsetWidth - TW);
    // Grabbing the thumb keeps its offset; tapping the track jumps there.
    const onThumb = Math.abs(f - this.pos.value) * travel < TW / 2 + 4;
    this.drag = { id: e.pointerId, offset: onThumb ? this.pos.value - f : 0 };
    this.valueLabel.classList.add("dragging");
    this.startValue = this.value_;
    this.thumb?.press();
    this.track(e.clientX);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
  };

  private track(clientX: number): void {
    if (!this.drag) return;
    const raw = this.fractionAt(clientX) + this.drag.offset;
    // Rubber-band slightly past the ends.
    const p = raw < 0 ? raw * 0.15 : raw > 1 ? 1 + (raw - 1) * 0.15 : raw;
    this.pos.to(p, springs.track);
    const span = this.max - this.min;
    this.setValue(this.min + clamp(p, 0, 1) * span, true, false, false);
    if (this.step > 0) this.pos.to(clamp(p, -0.04, 1.04), springs.track);
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.track(e.clientX);
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.endDrag();
    if (this.value_ !== this.startValue) this.dispatchEvent(new Event("change", { bubbles: true }));
  };

  private endDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.valueLabel.classList.remove("dragging");
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    this.thumb?.release();
    this.pos.to(this.fraction(this.value_), springs.snap);
    wake(this.task);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.hasAttribute("disabled")) return;
    const span = this.max - this.min;
    const step = this.step || span / 100;
    let v = this.value_;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        v += step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        v -= step;
        break;
      case "PageUp":
        v += Math.max(step, span / 10);
        break;
      case "PageDown":
        v -= Math.max(step, span / 10);
        break;
      case "Home":
        v = this.min;
        break;
      case "End":
        v = this.max;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (
      getComputedStyle(this).direction === "rtl" &&
      (e.key === "ArrowRight" || e.key === "ArrowLeft")
    )
      v = 2 * this.value_ - v;
    this.setValue(v, true, true);
  };
}

define("glass-slider", GlassSliderElement);
