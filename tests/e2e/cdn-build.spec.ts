import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ screenshot: "off", trace: "off" });

test("the minified CDN styles and shaders paint a frosted WebGL surface", async ({ page }) => {
  const code = readFileSync(new URL("../../dist/glassy-liquid.min.js", import.meta.url), "utf8");
  const html = readFileSync(
    new URL("../../docs/fixtures/scene.html", import.meta.url),
    "utf8",
  ).replace('import "glassy-liquid/elements"', 'import "/__cdn-build.js"');
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__cdn-build.js", (route) =>
    route.fulfill({
      body: code,
      contentType: "text/javascript",
    }),
  );
  await page.route("**/fixtures/scene.html*", (route) =>
    route.fulfill({
      body: html,
      contentType: "text/html",
    }),
  );
  await page.goto("/fixtures/scene.html?force=1");
  const surface = page.locator("glass-surface").first();
  await expect(surface).toHaveAttribute("data-glass-engine", "scene-gl");
  await expect
    .poll(() =>
      surface.evaluate((host) => {
        const canvas = host.shadowRoot?.querySelector<HTMLCanvasElement>("gl-fx canvas");
        if (!canvas?.width || !canvas.height) return false;
        const pixel = canvas
          .getContext("2d")!
          .getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
        return pixel[3]! > 0;
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
