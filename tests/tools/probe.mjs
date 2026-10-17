// node probe.mjs <browser> <path> "<js expression>"
import { chromium, webkit, firefox } from "playwright";
const [, , b = "chromium", path = "lab.html", expr = "1", dpr = "1"] = process.argv;
const browser = await { chromium, webkit, firefox }[b].launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 640 },
  deviceScaleFactor: +dpr,
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://localhost:5199/${path.replace(/^\/+/, "")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
console.log(JSON.stringify(await page.evaluate(expr), null, 1));
await browser.close();
