import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 800, height: 640 } });

/**
 * A default button over black "ACTION" on colored stripes. Chromium uses the
 * backdrop engine. WebKit uses the scene. The label has to stay above 4.5:1
 * against the darker part of the frost, and the frost must not speckle.
 */
test("a button label stays readable over high-contrast text", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Chromium and WebKit cover the backdrop and scene paths");
  test.setTimeout(60_000);
  await page.goto("/fixtures/contrast.html");
  await page.waitForFunction(() => customElements.get("glass-button") !== undefined);
  await page.waitForTimeout(1600);
  const clip = await page.evaluate(() => {
    const button = document.getElementById("in");
    if (!button) throw new Error("missing button");
    button.textContent = "";
    const box = button.getBoundingClientRect();
    const insetX = box.width * 0.28;
    const insetY = box.height * 0.32;
    return {
      x: box.x + insetX,
      y: box.y + insetY,
      width: Math.max(4, box.width - insetX * 2),
      height: Math.max(4, box.height - insetY * 2),
    };
  });
  const png = await page.screenshot({ clip });
  const stats = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = (r: number, g: number, b: number) =>
      0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratios: number[] = [];
    const width = canvas.width;
    for (let i = 0; i < pixels.length; i += 4) {
      const L = lum(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
      ratios.push((L + 0.05) / 0.05);
    }
    ratios.sort((a, b) => a - b);
    // Speckle is a pixel that disagrees with its neighborhood. A frosted
    // stripe is a ramp, so its center stays near the local median.
    const at = (x: number, y: number, channel: number) =>
      pixels[(y * width + x) * 4 + channel] ?? 0;
    let spikes = 0;
    let counted = 0;
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        counted += 1;
        let spiked = false;
        for (let channel = 0; channel < 3; channel++) {
          const samples: number[] = [];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              samples.push(at(x + dx, y + dy, channel));
            }
          }
          samples.sort((a, b) => a - b);
          const median = ((samples[3] ?? 0) + (samples[4] ?? 0)) / 2;
          if (Math.abs(at(x, y, channel) - median) > 50) spiked = true;
        }
        if (spiked) spikes += 1;
      }
    }
    return {
      p25: ratios[Math.floor(ratios.length * 0.25)] ?? 0,
      noise: counted ? spikes / counted : 1,
    };
  }, png.toString("base64"));
  expect(stats.p25, `${browserName} contrast`).toBeGreaterThanOrEqual(4.5);
  expect(stats.noise, `${browserName} noise`).toBeLessThan(0.08);
});
