import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

/** Same bytes size-limit reports: gzip level 9, displayed as SI kilobytes. */
const file = resolve(process.cwd(), "dist/glassy-liquid.min.js");

export function cdnGzipBytes(): number {
  if (!existsSync(file)) throw new Error(`missing ${file}; run npm run build first`);
  return gzipSync(readFileSync(file), { level: 9 }).length;
}

/** One decimal, matching the homepage figure and the README. */
export function cdnGzipLabel(): string {
  return `${(cdnGzipBytes() / 1000).toFixed(1)} kB`;
}

/**
 * The homepage measure tile is filled from bench.json after load. That file
 * keeps a `{{cdn-gzip}}` token so the tile and the hero share this label.
 */
export function patchBenchJson(raw: string): string {
  const data = JSON.parse(raw) as {
    metrics?: Array<{ value: string; label: string; detail: string }>;
    sizes?: { glassy?: number };
  };
  const label = cdnGzipLabel();
  let patched = false;
  for (const metric of data.metrics ?? []) {
    if (metric.value === "{{cdn-gzip}}" || metric.label.startsWith("gzip")) {
      metric.value = label;
      patched = true;
    }
  }
  if (!patched) throw new Error("bench.json has no gzip metric to fill");
  if (data.sizes) data.sizes.glassy = cdnGzipBytes() / 1000;
  return `${JSON.stringify(data, null, 2)}\n`;
}
