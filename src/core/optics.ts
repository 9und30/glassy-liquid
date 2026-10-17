/**
 * Optical model of a liquid-glass slab.
 *
 * The glass is a flat slab whose rim curves down to the background over a
 * `bezel` band. Looking straight down, a ray crossing the curved rim refracts
 * (Snell-Descartes) and lands on the background plane further inside the
 * shape. Inside the bezel the content is therefore magnified, folded and - at
 * the steep outer rim - mirrored, which is the signature "liquid" edge of
 * Apple's material. The flat center transmits undistorted.
 *
 * Everything here is resolution independent and cached: a profile is reduced
 * once to a lookup table of normalized displacement over the bezel depth.
 */
import { clamp } from "./spring.js";

export type BezelProfile = "convex" | "squircle" | "lip" | "flat";

export interface OpticsConfig {
  /** Shape of the rim cross-section. */
  profile: BezelProfile;
  /** Index of refraction (glass ≈ 1.5). */
  ior: number;
  /** Rim height relative to bezel width. */
  thickness: number;
  /** Distance between glass and the content plane, relative to bezel width. */
  float: number;
}

export const defaultOptics: OpticsConfig = {
  profile: "squircle",
  ior: 1.5,
  thickness: 1,
  float: 0.55,
};

/** Rim height as a function of depth into the bezel: 0 at the edge, 1 where the flat top begins. */
export function surfaceHeight(profile: BezelProfile, t: number): number {
  const x = clamp(t, 0, 1);
  switch (profile) {
    case "convex":
      return Math.sqrt(1 - (1 - x) * (1 - x));
    case "squircle":
      return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
    case "lip": {
      // Raised rim with a shallow dip towards the center (Apple switch thumb).
      const convex = Math.pow(1 - Math.pow(1 - x, 4), 0.25);
      const concave = 1 - convex;
      const s = x * x * x * (x * (x * 6 - 15) + 10);
      return convex * (1 - s) + (0.6 + 0.4 * concave) * s;
    }
    case "flat":
      return 1;
  }
}

/**
 * Lateral displacement (in bezel units, positive = towards the inside) of a
 * vertical ray crossing the rim at depth `t`.
 */
export function rayDisplacement(config: OpticsConfig, t: number): number {
  if (config.profile === "flat") return 0;
  const h = 1e-4;
  const a = Math.max(0, t - h);
  const b = Math.min(1, t + h);
  const slope =
    (config.thickness * (surfaceHeight(config.profile, b) - surfaceHeight(config.profile, a))) /
    (b - a);
  const alpha = Math.atan(Math.abs(slope));
  const sinT = Math.sin(alpha) / config.ior;
  const theta = Math.asin(clamp(sinT, -1, 1));
  const deviation = alpha - theta;
  const height = config.float + config.thickness * surfaceHeight(config.profile, t);
  return Math.sign(slope) * height * Math.tan(deviation);
}

export interface ProfileTable {
  /** Normalized displacement magnitude, index 0 = outer edge, last = flat top. Range [-1, 1]. */
  values: Float32Array;
  /** Peak of the raw displacement before normalization (in bezel units). */
  peak: number;
}

const tableCache = new Map<string, ProfileTable>();

/** Sampled, normalized displacement profile. Cached per configuration. */
export function profileTable(config: OpticsConfig = defaultOptics, samples = 256): ProfileTable {
  const key = `${config.profile}|${config.ior}|${config.thickness}|${config.float}|${samples}`;
  const cached = tableCache.get(key);
  if (cached) return cached;
  const raw = new Float32Array(samples);
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    // Sample cell centers; the outermost cell sits just inside the rim.
    const t = (i + 0.5) / samples;
    const v = rayDisplacement(config, t);
    raw[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const values = new Float32Array(samples);
  if (peak > 0) for (let i = 0; i < samples; i++) values[i] = raw[i]! / peak;
  // The flat top must be perfectly neutral.
  values[samples - 1] = 0;
  const table = { values, peak };
  tableCache.set(key, table);
  return table;
}

/** Linear lookup into a profile table for a depth in [0, 1]. */
export function sampleProfile(table: ProfileTable, t: number): number {
  const n = table.values.length;
  if (t >= 1) return 0;
  const x = clamp(t, 0, 1) * n - 0.5;
  if (x <= 0) return table.values[0]!;
  const i = Math.floor(x);
  const f = x - i;
  const a = table.values[i]!;
  const b = i + 1 < n ? table.values[i + 1]! : 0;
  return a + (b - a) * f;
}
