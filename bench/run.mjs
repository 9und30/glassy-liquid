// Benchmark runner: glassy-liquid vs @glass-sdk/liquid-glass in headless Chromium
// (full Chromium build, GPU + WebGPU enabled, nothing shown on screen).
//   node bench/run.mjs            → bench/results.json + docs/public/bench.json
import { createServer } from "vite";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const competitorReady =
  existsSync(join(here, "competitor/dom.bundle.js")) &&
  existsSync(join(here, "competitor/react.bundle.js")) &&
  existsSync(join(here, "competitor/node_modules/@glass-sdk/liquid-glass/package.json"));
if (!competitorReady) {
  const built = spawnSync(process.execPath, [join(root, "scripts/build-competitor.mjs")], {
    stdio: "inherit",
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const reps = Number(process.env.REPS ?? 3);
const cases = (process.env.CASES ?? "move,resize,scroll").split(",");
const libs = (process.env.LIBS ?? "glassy,glasshq").split(",");
const n = Number(process.env.N ?? 16);

const server = await createServer({ configFile: join(here, "vite.config.ts"), logLevel: "error" });
await server.listen();
const base = `http://localhost:${server.config.server.port}/`;

const browser = await chromium.launch({
  channel: process.env.CHANNEL ?? "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
});

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))] : NaN;
};

const runs = [];
for (const lib of libs) {
  for (const kind of cases) {
    for (let r = 0; r < reps; r++) {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 760 },
        deviceScaleFactor: 2,
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}compare.html?lib=${lib}&case=${kind}&n=${n}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.result, null, { timeout: 30000 });
      const res = await page.evaluate(() => window.result);
      if (r === 0 && kind === "move")
        await page.screenshot({ path: join(here, `shot-${lib}.png`) });
      const frames = res.frames;
      const total = frames.reduce((a, b) => a + b, 0);
      runs.push({
        lib,
        case: kind,
        init: res.init,
        fps: frames.length / (total / 1000),
        p95: pct(frames, 95),
        slow: frames.filter((f) => f > 20).length / Math.max(1, frames.length),
        longTasks: res.longTasks,
        error: res.error ?? errors[0],
      });
      process.stdout.write(
        `${lib} ${kind} #${r + 1}: init ${res.init.toFixed(0)}ms, ${runs.at(-1).fps.toFixed(1)} fps, p95 ${runs.at(-1).p95.toFixed(1)}ms${runs.at(-1).error ? `  ERROR ${runs.at(-1).error}` : ""}\n`,
      );
      await page.close();
    }
  }
}
const browserVersion = browser.version();
await browser.close();
await server.close();

const summary = {};
for (const lib of libs) {
  summary[lib] = {};
  for (const kind of cases) {
    const rs = runs.filter((x) => x.lib === lib && x.case === kind);
    summary[lib][kind] = {
      init: median(rs.map((x) => x.init)),
      fps: median(rs.map((x) => x.fps)),
      p95: median(rs.map((x) => x.p95)),
      slow: median(rs.map((x) => x.slow)),
      longTasks: median(rs.map((x) => x.longTasks)),
    };
  }
}

// Bundle sizes, all measured like size-limit: gzip level 9, SI kilobytes (1 kB = 1000 bytes).
// The docs site replaces the gzip tile from dist at build time (`{{cdn-gzip}}`).
const gzSi = (f) => (existsSync(f) ? gzipSync(readFileSync(f), { level: 9 }).length / 1000 : NaN);
const sizes = {
  glassy: gzSi(join(root, "dist/glassy-liquid.min.js")),
  glasshqDom: gzSi(join(here, "competitor/dom.bundle.js")),
  glasshqReact: gzSi(join(here, "competitor/react.bundle.js")),
};

const out = {
  date: new Date().toISOString().slice(0, 10),
  surfaces: n,
  reps,
  summary,
  sizes,
  runs,
};
writeFileSync(join(here, "results.json"), JSON.stringify(out, null, 2));

const g = summary.glassy ?? {};
const h = summary.glasshq ?? {};
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(0) : "-");
const fps = (v) => (Number.isFinite(v) ? v.toFixed(0) : "-");
const metrics = [
  {
    value: "{{cdn-gzip}}",
    label: "gzip for every component, all renderers and the WebGL path",
    detail: `@glass-sdk/liquid-glass: ${sizes.glasshqDom.toFixed(1)} kB DOM entry · ${sizes.glasshqReact.toFixed(1)} kB React entry, React itself excluded`,
  },
  {
    value: `${f1(g.move?.init)} ms`,
    label: `to set up ${n} glass surfaces`,
    detail: `@glass-sdk/liquid-glass: ${f1(h.move?.init)} ms, generating maps with WebGPU on a real GPU`,
  },
  {
    value: `${fps(g.scroll?.fps)} fps`,
    label: `while content scrolls under ${n} surfaces`,
    detail: `@glass-sdk/liquid-glass: ${fps(h.scroll?.fps)} fps · p95 frame ${(g.scroll?.p95 ?? NaN).toFixed(1)} vs ${(h.scroll?.p95 ?? NaN).toFixed(1)} ms`,
  },
  {
    value: `${fps(g.resize?.fps)} fps`,
    label: `while ${n} surfaces resize every frame`,
    detail: `@glass-sdk/liquid-glass: ${fps(h.resize?.fps)} fps · nine-slice maps never re-encode on resize`,
  },
];
const note = `Headless Chrome ${browserVersion} with GPU and WebGPU enabled, ${n} glass surfaces over a photo with live text, device pixel ratio 2, median of ${reps} runs, ${out.date}. Frame rate is capped at the display refresh (60 Hz) on the measuring machine. Reproduce with <code>npm run bench</code>.`;
writeFileSync(
  join(root, "docs/public/bench.json"),
  JSON.stringify({ metrics, note, summary, sizes }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
