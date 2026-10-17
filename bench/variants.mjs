// Quick variant profiler for glassy-liquid: node bench/variants.mjs
import { createServer } from "vite";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const server = await createServer({ configFile: join(here, "vite.config.ts"), logLevel: "error" });
await server.listen();
const base = `http://localhost:${server.config.server.port}/`;
const browser = await chromium.launch({
  channel: process.env.CHANNEL ?? "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
});
const variants = JSON.parse(process.env.VARIANTS ?? "[{}]");
const kind = process.env.CASE ?? "scroll";
for (const v of variants) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 760 },
    deviceScaleFactor: Number(process.env.DPR ?? 2),
  });
  await page.goto(
    `${base}compare.html?lib=glassy&case=${kind}&n=${process.env.N ?? 16}&opts=${encodeURIComponent(JSON.stringify(v))}`,
  );
  await page.waitForFunction(() => window.result, null, { timeout: 30000 });
  const r = await page.evaluate(() => window.result);
  const f = r.frames;
  const tot = f.reduce((a, b) => a + b, 0);
  const s = [...f].sort((a, b) => a - b);
  console.log(
    JSON.stringify(v).padEnd(60),
    "fps",
    (f.length / (tot / 1000)).toFixed(1).padStart(6),
    "p95",
    s[Math.floor(s.length * 0.95)].toFixed(1),
  );
  await page.close();
}
await browser.close();
await server.close();
