// Cumulative layout shift while each docs page loads, desktop and 390px,
// median of a few cold loads (font and image timing varies run to run).
//   node tests/tools/cls.mjs http://localhost:4310 [--runs 3]
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://localhost:4310").replace(/\/$/, "");
const runs = Number(args[args.indexOf("--runs") + 1]) || 3;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pages = [
  "index",
  "components",
  "playground",
  "getting-started",
  "theming",
  "accessibility",
  "browser-support",
];
console.log("page               desktop    390px");
for (const name of pages) {
  // A fresh browser per page: dozens of contexts in one process start to stall.
  const browser = await chromium.launch();
  const row = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const samples = [];
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      const page = await context.newPage();
      await page.goto(`${base}/${name}.html`, { waitUntil: "load", timeout: 120_000 });
      await page.waitForTimeout(3000);
      samples.push(await page.evaluate(() => window.__cls));
      await context.close();
    }
    row.push(median(samples));
  }
  await browser.close();
  console.log(
    `${name.padEnd(18)} ${row[0].toFixed(4).padStart(8)} ${row[1].toFixed(4).padStart(8)}`,
  );
}
