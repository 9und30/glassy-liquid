/**
 * Geometry helpers for glass that grows out of another element (menus,
 * popovers, sheets).
 */
import { clamp } from "../core/spring.js";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Placement = "bottom-start" | "bottom-end" | "bottom" | "top-start" | "top-end" | "top";

/** Rect of an element in viewport coordinates, without its transforms' scale. */
export function viewportRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/**
 * Place a box of `size` next to `anchor` inside the viewport, flipping and
 * shifting to stay visible (8px margin).
 */
export function place(
  anchor: Rect,
  size: { width: number; height: number },
  placement: Placement = "bottom-start",
  gap = 8,
): Rect & { side: "top" | "bottom" } {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const m = 8;
  const width = Math.min(size.width, vw - 2 * m);
  let side: "top" | "bottom" = placement.startsWith("top") ? "top" : "bottom";
  const below = vh - (anchor.y + anchor.height) - gap - m;
  const above = anchor.y - gap - m;
  if (side === "bottom" && size.height > below && above > below) side = "top";
  else if (side === "top" && size.height > above && below > above) side = "bottom";
  const height = Math.min(size.height, side === "bottom" ? below : above);
  const align = placement.endsWith("end")
    ? "end"
    : placement.endsWith("start")
      ? "start"
      : "center";
  let x =
    align === "start"
      ? anchor.x
      : align === "end"
        ? anchor.x + anchor.width - width
        : anchor.x + anchor.width / 2 - width / 2;
  if (getComputedStyle(document.documentElement).direction === "rtl" && align !== "center") {
    x = align === "start" ? anchor.x + anchor.width - width : anchor.x;
  }
  x = clamp(x, m, vw - m - width);
  const y = side === "bottom" ? anchor.y + anchor.height + gap : anchor.y - gap - height;
  return { x, y, width, height: Math.max(0, height), side };
}

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}
