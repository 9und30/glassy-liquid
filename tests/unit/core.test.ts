import { describe, expect, it } from "vitest";
import { Spring, rubberBand, springs } from "../../src/core/spring";
import {
  profileTable,
  sampleProfile,
  rayDisplacement,
  defaultOptics,
  surfaceHeight,
} from "../../src/core/optics";
import {
  cornerField,
  resolveRadius,
  roundedRectField,
  shapeMetrics,
  sliceLayout,
} from "../../src/core/shape";
import { encodePng } from "../../src/core/png";
import { displacementSet, rimImage, zoomGradient } from "../../src/core/maps";
import { toneTable } from "../../src/engine/materials";

/** Decode the stored-deflate PNGs our encoder writes (RGBA8, filter 0). */
function decodeStoredPng(url: string): { width: number; height: number; px: Uint8Array } {
  const bin = Buffer.from(url.split(",")[1]!, "base64");
  const width = bin.readUInt32BE(16);
  const height = bin.readUInt32BE(20);
  let p = 8;
  const idat: Buffer[] = [];
  while (p < bin.length) {
    const len = bin.readUInt32BE(p);
    const type = bin.toString("ascii", p + 4, p + 8);
    if (type === "IDAT") idat.push(bin.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const z = Buffer.concat(idat);
  const raw: number[] = [];
  let o = 2;
  for (;;) {
    const final = z[o]! & 1;
    const len = z.readUInt16LE(o + 1);
    o += 5;
    for (let i = 0; i < len; i++) raw.push(z[o + i]!);
    o += len;
    if (final) break;
  }
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let i = 0; i < width * 4; i++) px[y * width * 4 + i] = raw[y * (width * 4 + 1) + 1 + i]!;
  return { width, height, px };
}

describe("Spring", () => {
  it("settles exactly on its target", () => {
    const s = new Spring(0, springs.release).to(100);
    for (let i = 0; i < 240; i++) s.step(1 / 60);
    expect(s.value).toBe(100);
    expect(s.settled).toBe(true);
  });

  it("overshoots with bounce and not without", () => {
    const bouncy = new Spring(0, { duration: 0.4, bounce: 0.4 }).to(1);
    const flat = new Spring(0, { duration: 0.4, bounce: 0 }).to(1);
    let maxB = 0;
    let maxF = 0;
    for (let i = 0; i < 120; i++) {
      maxB = Math.max(maxB, bouncy.step(1 / 120).value);
      maxF = Math.max(maxF, flat.step(1 / 120).value);
    }
    expect(maxB).toBeGreaterThan(1.05);
    expect(maxF).toBeLessThanOrEqual(1.0001);
  });

  it("keeps velocity when retargeted mid-flight", () => {
    const s = new Spring(0, springs.layout).to(100);
    for (let i = 0; i < 6; i++) s.step(1 / 60);
    const v = s.velocity;
    s.to(-100);
    expect(s.velocity).toBe(v);
  });

  it("is stable across very large frames", () => {
    const s = new Spring(0, springs.press).to(1);
    s.step(5);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(s.value).toBeCloseTo(1, 3);
  });
});

describe("rubberBand", () => {
  it("is odd, monotonic and bounded", () => {
    let last = -Infinity;
    for (let x = -500; x <= 500; x += 10) {
      const y = rubberBand(x, 20);
      expect(y).toBeGreaterThan(last);
      expect(Math.abs(y)).toBeLessThan(20);
      expect(rubberBand(-x, 20)).toBeCloseTo(-y, 10);
      last = y;
    }
  });
});

describe("optics", () => {
  it("normalizes the profile to [-1, 1] and ends neutral", () => {
    const t = profileTable(defaultOptics);
    const max = Math.max(...Array.from(t.values, Math.abs));
    expect(max).toBeCloseTo(1, 5);
    expect(t.values[t.values.length - 1]).toBe(0);
    expect(sampleProfile(t, 1)).toBe(0);
    expect(sampleProfile(t, 0)).toBeGreaterThan(0.9);
  });

  it("refracts most at the steep outer rim of a convex slab", () => {
    const edge = rayDisplacement(defaultOptics, 0.02);
    const inner = rayDisplacement(defaultOptics, 0.8);
    expect(edge).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThanOrEqual(0);
  });

  it("surface heights start at 0 and reach 1 at the flat top", () => {
    for (const p of ["convex", "squircle"] as const) {
      expect(surfaceHeight(p, 0)).toBeCloseTo(0, 6);
      expect(surfaceHeight(p, 1)).toBeCloseTo(1, 6);
    }
  });
});

describe("shape", () => {
  it("resolves capsule and circle radii", () => {
    expect(resolveRadius("capsule", 200, 44)).toBe(22);
    expect(resolveRadius("circle", 60, 60)).toBe(30);
    expect(resolveRadius(400, 100, 50)).toBe(25);
  });

  it("matches the analytic rounded-rect distance field", () => {
    const f = { depth: 0, nx: 0, ny: 0 };
    roundedRectField(100, 30, 200, 60, 20, f);
    expect(f.depth).toBeCloseTo(30, 6); // center: distance to top/bottom edge
    cornerField(0, 30, 40, 40, 20, f);
    expect(f.depth).toBeCloseTo(0, 6);
    expect(f.nx).toBe(-1);
    // Corner center lies `r` inside the arc.
    cornerField(20, 20, 40, 40, 20, f);
    expect(f.depth).toBeCloseTo(20, 6);
  });

  it("nine slices tile the whole surface without overlap", () => {
    for (const [w, h, r] of [
      [300, 160, 40],
      [180, 44, "capsule"],
      [60, 60, "circle"],
      [37.5, 120, 12],
    ] as const) {
      const m = shapeMetrics(w, h, r as never, 18);
      const area = sliceLayout(m).reduce((a, s) => a + s.width * s.height, 0);
      const center = Math.max(0, w - 2 * m.kx) * Math.max(0, h - 2 * m.ky);
      expect(area + center).toBeCloseTo(w * h, 4);
    }
  });
});

describe("maps", () => {
  it("encodes displacement pointing into the glass", () => {
    const m = shapeMetrics(300, 160, 40, 18);
    const set = displacementSet(m, 1);
    const top = decodeStoredPng(set.t!.url);
    // Outermost row of the top edge pulls down: green above neutral, red neutral.
    expect(top.px[1]).toBeGreaterThan(200);
    expect(Math.abs(top.px[0]! - 128)).toBeLessThanOrEqual(1);
    // Beyond the bezel the map is neutral.
    const last = (top.height - 1) * top.width * 4;
    expect(Math.abs(top.px[last + 1]! - 128)).toBeLessThanOrEqual(1);
    const left = decodeStoredPng(set.l!.url);
    expect(left.px[0]).toBeGreaterThan(200); // pulls right
    const right = decodeStoredPng(set.r!.url);
    expect(right.px[(right.width - 1) * 4]).toBeLessThan(56); // pulls left
  });

  it("caches tiles by geometry, independent of surface size", () => {
    const a = displacementSet(shapeMetrics(300, 64, "capsule", 18), 2);
    const b = displacementSet(shapeMetrics(900, 64, "capsule", 18), 2);
    expect(a).toBe(b);
  });

  it("builds a rim image whose slices match its border", () => {
    const img = rimImage(shapeMetrics(200, 100, 24, 18), 2);
    expect(img.width).toBe(img.sliceX * 2 + 2);
    expect(img.borderX * 2).toBeCloseTo(img.sliceX, 6);
  });

  it("zoom gradient is a valid data URL", () => {
    expect(zoomGradient()).toMatch(/^data:image\/png;base64,/);
  });
});

describe("png", () => {
  it("writes a well-formed PNG", () => {
    const bytes = encodePng(3, 2, new Uint8Array(3 * 2 * 4).fill(200));
    expect(Array.from(bytes.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(Buffer.from(bytes).toString("ascii", 12, 16)).toBe("IHDR");
    expect(Buffer.from(bytes).toString("ascii", bytes.length - 8, bytes.length - 4)).toBe("IEND");
  });
});

describe("materials", () => {
  it("tone curves are monotonic and stay in range", () => {
    for (const spec of [
      { lift: 0.4, roll: 0 },
      { lift: 0.03, roll: 0.3 },
    ]) {
      const v = toneTable(spec).split(" ").map(Number);
      expect(v).toHaveLength(33);
      for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]!);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...v)).toBeLessThanOrEqual(1);
    }
  });
});
