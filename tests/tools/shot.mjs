// Headless screenshot helper: node shot.mjs <browser> <url-path> <out.png> [dpr] [w] [h] [selector]
import { chromium, webkit, firefox } from "playwright";
const [
  ,
  ,
  browserName = "chromium",
  path = "lab.html",
  out = "shot.png",
  dpr = "1",
  w = "920",
  h = "640",
  selector = "",
] = process.argv;
const types = { chromium, webkit, firefox };
const browser = await types[browserName].launch(
  browserName === "chromium"
    ? { args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist"] }
    : {},
);
const page = await browser.newPage({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: +dpr,
});
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5199/${path.replace(/^\/+/, "")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const s = window.surfaces || {};
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.engine]));
});
if (selector) await page.locator(selector).screenshot({ path: out });
else await page.screenshot({ path: out });
console.log(JSON.stringify({ info, logs }, null, 1));
await browser.close();
