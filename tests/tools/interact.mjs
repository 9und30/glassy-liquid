// node interact.mjs <path> <out-prefix> <script-json>
// script: [{"down":[x,y]},{"move":[x,y],"steps":5},{"wait":120},{"shot":"name"},{"up":true}]
import { chromium, webkit, firefox } from "playwright";
const [
  ,
  ,
  path = "components.html",
  prefix = "it",
  json = "[]",
  browserName = "chromium",
  dpr = "2",
  vw = "390",
  vh = "844",
] = process.argv;
const browser = await { chromium, webkit, firefox }[browserName].launch();
const page = await browser.newPage({
  viewport: { width: +vw, height: +vh },
  deviceScaleFactor: +dpr,
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}]`, m.text());
});
await page.goto(`http://localhost:5199/${path.replace(/^\/+/, "")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
for (const step of JSON.parse(json)) {
  if (step.down) {
    await page.mouse.move(...step.down);
    await page.mouse.down();
  }
  if (step.move) await page.mouse.move(step.move[0], step.move[1], { steps: step.steps ?? 1 });
  if (step.up) await page.mouse.up();
  if (step.click) await page.mouse.click(...step.click);
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.eval) console.log(JSON.stringify(await page.evaluate(step.eval)));
  if (step.shot)
    await page.screenshot({
      path: `${prefix}-${step.shot}.png`,
      clip: step.clip
        ? { x: step.clip[0], y: step.clip[1], width: step.clip[2], height: step.clip[3] }
        : undefined,
    });
}
await browser.close();
