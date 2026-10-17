import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const engineOf = (sel: string) =>
  (document.querySelector(sel) as HTMLElement | null)?.dataset.glassEngine;

test("picks the renderer for the browser", async ({ page, browserName }) => {
  await page.goto("/fixtures/lab.html");
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
  const engine = await page.evaluate(engineOf, "#a");
  // Only Chromium can run SVG filters as backdrop filters.
  expect(engine).toBe(browserName === "chromium" ? "backdrop" : "css");
});

test("scenes give WebKit and Gecko real refraction", async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/fixtures/scene.html");
  await page.waitForTimeout(800);
  const engines = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("glass-surface, glass-button")].map(
      (e) => e.dataset.glassEngine,
    ),
  );
  if (browserName === "chromium") {
    expect(engines.every((e) => e === "backdrop")).toBe(true);
  } else {
    // First scene: image backdrop → WebGL; second: DOM backdrop → content filter.
    expect(engines.slice(0, 4)).toEqual(["scene-gl", "scene-gl", "scene-gl", "scene-gl"]);
    expect(engines.slice(4)).toEqual(["scene-dom", "scene-dom"]);
    const filtered = await page.evaluate(
      () => getComputedStyle(document.querySelector<HTMLElement>(".content")!).filter,
    );
    expect(filtered).toContain("url(");
  }
  expect(errors).toEqual([]);
});

test("the WebGL path draws into the surface canvas", async ({ page, browserName }) => {
  test.skip(browserName === "chromium", "Chromium uses the backdrop path");
  await page.goto("/fixtures/scene.html");
  await page.waitForTimeout(1000);
  const painted = await page.evaluate(() => {
    const host = document.querySelector("glass-surface")!;
    const canvas = host.shadowRoot!.querySelector("gl-fx canvas") as HTMLCanvasElement | null;
    if (!canvas || !canvas.width) return false;
    const ctx = canvas.getContext("2d")!;
    const d = ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
    ).data;
    return d[3]! > 0;
  });
  expect(painted).toBe(true);
});

/** Serves the photo like a slow network: the header at once (so its size is known), the pixels after a pause. */
async function streamingPhoto(stallMs: number): Promise<{ url: string; close: () => void }> {
  const body = readFileSync(new URL("../../docs/public/img/lake.webp", import.meta.url));
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "image/webp",
      "content-length": body.length,
      "access-control-allow-origin": "*",
      "cache-control": "max-age=60",
    });
    res.write(body.subarray(0, 16_384));
    const timer = setTimeout(() => res.end(body.subarray(16_384)), stallMs);
    res.on("close", () => clearTimeout(timer));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/lake.webp`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

/** Brightness at the center of the glass and its spread over the inner area (a photo has texture, black glass has none). */
const sampleGlass = () => {
  const canvas = document
    .querySelector("glass-surface")
    ?.shadowRoot?.querySelector<HTMLCanvasElement>("gl-fx canvas");
  if (!canvas?.width) return null;
  const { width: w, height: h } = canvas;
  const d = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
  const lum = (x: number, y: number) => {
    const i = (Math.floor(y) * w + Math.floor(x)) * 4;
    return 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
  };
  const inner: number[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) inner.push(lum(w * (0.3 + i * 0.1), h * (0.3 + j * 0.1)));
  return { center: lum(w / 2, h / 2), spread: Math.max(...inner) - Math.min(...inner) };
};

// Firefox and WebKit report an image's size while it is still streaming in (or decoding); a texture uploaded
// then is empty, and the scene used to keep it: black glass. Preloaded or cached photos made this reproducible.
for (const backdrop of ["preloaded, still streaming", "already cached"] as const) {
  test(`a ${backdrop} backdrop photo shows in the glass, never black`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === "chromium", "Chromium uses the backdrop path");
    const warnings: string[] = [];
    page.on("console", (m) => {
      // Firefox: "Resource has no data (yet?)" on upload, "TEXTURE_2D at unit 0 is incomplete" on every draw.
      if (/incomplete|no data/i.test(m.text())) warnings.push(m.text());
    });
    const slow = backdrop === "preloaded, still streaming" ? await streamingPhoto(1500) : null;
    try {
      await page.goto(
        slow
          ? `/fixtures/scene-cached.html?src=${encodeURIComponent(slow.url)}`
          : "/fixtures/scene-cached.html?late=0",
      );
      await page.waitForFunction(
        () => {
          const img = document
            .querySelector("glass-scene")
            ?.shadowRoot?.querySelector<HTMLImageElement>("img[part=backdrop]");
          return !!img && img.complete && img.naturalWidth > 0;
        },
        undefined,
        { timeout: 10_000 },
      );
      // The lake photo gives a center of ~59 and a spread of ~120; black glass stays at ~22 and 0.
      await expect
        .poll(async () => (await page.evaluate(sampleGlass))?.spread ?? 0, { timeout: 5_000 })
        .toBeGreaterThan(20);
      expect((await page.evaluate(sampleGlass))!.center).toBeGreaterThan(35);
      expect(warnings).toEqual([]);
    } finally {
      slow?.close();
    }
  });
}
