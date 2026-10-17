/**
 * ThumbLens - the iOS 26 control thumb: a solid white capsule at rest that
 * lifts into a clear, magnifying glass lens while touched. Used by switches
 * and sliders, and exported for custom controls.
 *
 * The lens element always has its lifted size; the resting state is a scale
 * transform, so the glass maps never need regenerating during the animation.
 */
import { prefersReducedMotion } from "../core/env.js";
import { Spring, clamp, springs } from "../core/spring.js";
import { GlassSurface, type GlassOptions } from "../engine/surface.js";

export interface ThumbLensOptions {
  rest?: { width: number; height: number };
  lifted?: { width: number; height: number };
  glass?: GlassOptions;
}

export const thumbCss = /* css */ `
.gl-thumb{position:absolute;left:0;top:0;will-change:transform;pointer-events:none;}
.gl-thumb>.solid{position:absolute;left:50%;top:50%;border-radius:999px;background:var(--glass-thumb,#fff);
  box-shadow:0 3px 8px rgba(0,0,0,.15),0 3px 1px rgba(0,0,0,.06),0 0 0 .5px rgba(0,0,0,.04);}
`;

export class ThumbLens {
  readonly el: HTMLElement;
  readonly solid: HTMLElement;
  readonly surface: GlassSurface;
  readonly rest: { width: number; height: number };
  readonly lifted: { width: number; height: number };
  /** 0 = resting solid thumb, 1 = lifted glass lens. */
  readonly lift = new Spring(0, springs.press);
  private stretch = 0;
  private lastX = 0;

  constructor(parent: Element | ShadowRoot, options: ThumbLensOptions = {}) {
    this.rest = options.rest ?? { width: 38, height: 24 };
    this.lifted = options.lifted ?? { width: 58, height: 38 };
    this.el = document.createElement("span");
    this.el.className = "gl-thumb";
    this.el.setAttribute("part", "thumb");
    Object.assign(this.el.style, {
      width: `${this.lifted.width}px`,
      height: `${this.lifted.height}px`,
      borderRadius: `${this.lifted.height / 2}px`,
    });
    this.solid = document.createElement("span");
    this.solid.className = "solid";
    // The solid thumb is drawn at lifted size and scaled with the lens, so its proportions match the resting thumb.
    Object.assign(this.solid.style, {
      width: `${this.lifted.width}px`,
      height: `${this.lifted.height}px`,
      margin: `${-this.lifted.height / 2}px 0 0 ${-this.lifted.width / 2}px`,
    });
    this.el.append(this.solid);
    parent.append(this.el);
    this.surface = new GlassSurface(this.el, {
      material: "clear",
      radius: "capsule",
      refraction: 10,
      bezel: 11,
      zoom: 1.14,
      dispersion: 0.5,
      shadow: "0 8px 22px rgba(0,0,0,.16)",
      appearance: "light",
      ...options.glass,
    });
  }

  press(): void {
    this.lift.to(1, springs.press);
  }

  release(): void {
    this.lift.to(0, springs.release);
  }

  get settled(): boolean {
    return this.lift.settled && this.stretch < 0.002;
  }

  /**
   * Advance and write the transform. `cx`, `cy` are the thumb center in the
   * parent's coordinates; `velocity` the horizontal speed in px/s.
   */
  update(
    dt: number,
    cx: number,
    cy: number,
    velocity = (cx - this.lastX) / Math.max(dt, 1e-3),
  ): void {
    this.lastX = cx;
    this.lift.step(dt);
    const reduced = prefersReducedMotion();
    const lift = reduced ? 0 : clamp(this.lift.value, 0, 1.25);
    const target = reduced ? 0 : Math.min(0.25, Math.abs(velocity) * 0.0005) * clamp(lift, 0, 1);
    this.stretch += (target - this.stretch) * Math.min(1, dt * 18);
    const { width: rw, height: rh } = this.rest;
    const { width: lw, height: lh } = this.lifted;
    const sx = (rw / lw + (1 - rw / lw) * lift) * (1 + this.stretch);
    const sy = (rh / lh + (1 - rh / lh) * lift) / Math.sqrt(1 + this.stretch);
    this.el.style.transform = `translate(${(cx - lw / 2).toFixed(2)}px,${(cy - lh / 2).toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
    this.solid.style.opacity = clamp(1 - lift * 1.7, 0, 1).toFixed(3);
    // At rest the solid thumb covers the lens: hide its glass so the browser skips the filter.
    this.surface.setOpacity(clamp(lift * 4, 0, 1));
  }

  destroy(): void {
    this.surface.destroy();
    this.el.remove();
  }
}
