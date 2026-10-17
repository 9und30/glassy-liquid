/**
 * Capture the README still docs/media/controls.webp from the live docs site.
 * Usage: node tests/readme/capture.mjs [baseURL]
 * Default base URL is http://127.0.0.1:5199 (npm run dev). Needs ffmpeg on PATH
 * (with libwebp) to encode the WebP. The intermediate PNG is written under a
 * temp directory and deleted.
 *
 * docs/media/player-lens.gif, the README hero, is not produced here. It is a
 * frame-by-frame recording of the docs hero, encoded with gifski (see CREDITS.md).
 */
import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const base = process.argv[2] ?? "http://127.0.0.1:5199";
const media = resolve(root, "docs/media");
mkdirSync(media, { recursive: true });
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("ffmpeg is required to encode docs/media/controls.webp");
  process.exit(1);
}
const scratch = mkdtempSync(join(tmpdir(), "glassy-readme-"));

let code = 0;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.goto(base + "/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  const controlsScene = page.locator(
    'li.plate[data-title="Controls that turn to glass"] glass-scene.plate__media',
  );
  await controlsScene.evaluate((scene) => {
    scene.scrollIntoView({ block: "center", inline: "center" });
  });
  await page.waitForFunction(() => {
    const scene = document.querySelector(
      'li.plate[data-title="Controls that turn to glass"] glass-scene.plate__media',
    );
    const src = scene?.getAttribute("src");
    if (!src || !src.includes("glacier")) return false;
    const img = scene.shadowRoot?.querySelector('img[part="backdrop"]');
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  });
  await page.waitForTimeout(800);
  const controlsBox = await controlsScene.boundingBox();
  const viewport = page.viewportSize();
  if (!controlsBox || !viewport) throw new Error("glacier controls plate has no box");
  if (
    controlsBox.x < -1 ||
    controlsBox.y < -1 ||
    controlsBox.x + controlsBox.width > viewport.width + 1 ||
    controlsBox.y + controlsBox.height > viewport.height + 1
  ) {
    throw new Error(
      `glacier controls plate is not fully on screen (${JSON.stringify(controlsBox)})`,
    );
  }
  const controlsPng = join(scratch, "controls.png");
  await controlsScene.screenshot({ path: controlsPng });

  await browser.close();

  const conv = spawnSync(
    "ffmpeg",
    ["-y", "-i", controlsPng, "-c:v", "libwebp", "-quality", "78", resolve(media, "controls.webp")],
    { stdio: "inherit" },
  );
  if (conv.status !== 0) code = conv.status ?? 1;
  if (code === 0) console.log("captured", media);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
if (code) process.exit(code);
