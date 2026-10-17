// node crop.mjs <browser> <path> <out.png> <dpr> <x> <y> <w> <h>
import { chromium, webkit, firefox } from "playwright";
const [
  ,
  ,
  b = "chromium",
  path = "lab.html",
  out = "crop.png",
  dpr = "2",
  x = "0",
  y = "0",
  w = "300",
  h = "300",
  vw = "920",
  vh = "640",
] = process.argv;
const browser = await { chromium, webkit, firefox }[b].launch();
const page = await browser.newPage({
  viewport: { width: +vw, height: +vh },
  deviceScaleFactor: +dpr,
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://localhost:5199/${path.replace(/^\/+/, "")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h } });
await browser.close();
