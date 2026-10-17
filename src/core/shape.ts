/**
 * Geometry of glass shapes. Every glass surface is a rounded rectangle
 * (capsules and circles are rounded rectangles too), which lets all maps be
 * split into a 9-slice: four corner tiles, four edge strips and a neutral
 * center. Resizing a surface only moves the slices - it never rebuilds a map.
 */
import { clamp } from "./spring.js";

export type GlassRadius = number | "capsule" | "circle";

export interface ShapeMetrics {
  width: number;
  height: number;
  /** Effective corner radius in CSS px. */
  radius: number;
  /** Effective bezel width in CSS px. */
  bezel: number;
  /** Corner tile size (CSS px) horizontally / vertically. */
  kx: number;
  ky: number;
}

export function resolveRadius(
  radius: GlassRadius | undefined,
  width: number,
  height: number,
): number {
  const max = Math.min(width, height) / 2;
  if (radius === "capsule" || radius === "circle") return max;
  return clamp(radius ?? 16, 0, max);
}

export function shapeMetrics(
  width: number,
  height: number,
  radius: GlassRadius | undefined,
  bezel: number,
): ShapeMetrics {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const r = resolveRadius(radius, w, h);
  const b = clamp(bezel, 0, Math.min(w, h) / 2);
  const k = Math.max(r, b);
  return {
    width: w,
    height: h,
    radius: r,
    bezel: b,
    kx: Math.min(k, w / 2),
    ky: Math.min(k, h / 2),
  };
}

export interface FieldSample {
  /** Signed distance to the outline in CSS px, positive inside. */
  depth: number;
  /** Outward unit normal of the nearest outline point. */
  nx: number;
  ny: number;
}

/**
 * Signed distance field of the top-left corner tile of a rounded rectangle
 * whose half-size is (kx, ky) and corner radius r. Coordinates are tile-local
 * CSS px with the origin at the shape's top-left corner. Within the tile this
 * equals the distance field of every larger rectangle sharing that corner.
 */
export function cornerField(
  x: number,
  y: number,
  kx: number,
  ky: number,
  r: number,
  out: FieldSample,
): FieldSample {
  // Vector from the rectangle center, mirrored into the positive quadrant.
  const px = kx - x;
  const py = ky - y;
  const qx = px - (kx - r);
  const qy = py - (ky - r);
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy);
    out.depth = r - len;
    out.nx = -qx / len;
    out.ny = -qy / len;
  } else if (qx > qy) {
    out.depth = r - qx;
    out.nx = -1;
    out.ny = 0;
  } else {
    out.depth = r - qy;
    out.nx = 0;
    out.ny = -1;
  }
  if (!Number.isFinite(out.nx)) {
    out.nx = -Math.SQRT1_2;
    out.ny = -Math.SQRT1_2;
  }
  return out;
}

/** Full signed distance field of a rounded rectangle (used by tests and the WebGL path's JS twin). */
export function roundedRectField(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  out: FieldSample,
): FieldSample {
  const sx = x < w / 2 ? 1 : -1;
  const sy = y < h / 2 ? 1 : -1;
  const lx = sx > 0 ? x : w - x;
  const ly = sy > 0 ? y : h - y;
  cornerField(lx, ly, w / 2, h / 2, r, out);
  out.nx *= sx;
  out.ny *= sy;
  return out;
}

export interface Slice {
  key: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Placement of the 9-slice pieces for a surface. Zero-sized edges are omitted. */
export function sliceLayout(m: ShapeMetrics): Slice[] {
  const { width: w, height: h, kx, ky } = m;
  const slices: Slice[] = [
    { key: "tl", x: 0, y: 0, width: kx, height: ky },
    { key: "tr", x: w - kx, y: 0, width: kx, height: ky },
    { key: "bl", x: 0, y: h - ky, width: kx, height: ky },
    { key: "br", x: w - kx, y: h - ky, width: kx, height: ky },
  ];
  const ew = w - 2 * kx;
  const eh = h - 2 * ky;
  if (ew > 0.01) {
    slices.push({ key: "t", x: kx, y: 0, width: ew, height: ky });
    slices.push({ key: "b", x: kx, y: h - ky, width: ew, height: ky });
  }
  if (eh > 0.01) {
    slices.push({ key: "l", x: 0, y: ky, width: kx, height: eh });
    slices.push({ key: "r", x: w - kx, y: ky, width: kx, height: eh });
  }
  return slices;
}

/** CSS `border-radius` value for a resolved radius. */
export function cssRadius(radius: GlassRadius | undefined): string {
  if (radius === "capsule" || radius === "circle") return "9999px";
  return `${radius ?? 16}px`;
}
