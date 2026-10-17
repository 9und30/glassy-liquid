// node run.mjs <browser> <script.mjs> [dpr] [w] [h]
// script default-exports async ({ page, shot, log }) => {}
import { chromium, webkit, firefox } from "playwright";
import { pathToFileURL } from "node:url";
const [, , b = "chromium", script, dpr = "1", w = "390", h = "844"] = process.argv;
const browser = await { chromium, webkit, firefox }[b].launch();
const page = await browser.newPage({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: +dpr,
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console]", m.text());
});
const base = "http://localhost:5199/";
const mod = await import(pathToFileURL(script).href);
await mod.default({ page, base, log: (...a) => console.log(...a) });
await browser.close();
