import { expect, test, type Page } from "@playwright/test";

// The fixture is a 390 × 844 phone; keep all of it on screen.
test.use({ viewport: { width: 420, height: 900 } });

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/fixtures/components.html${query}`);
  await page.waitForFunction(() => customElements.get("glass-sheet") !== undefined);
  await page.waitForTimeout(400);
}

const appearanceOf = (page: Page) =>
  page.evaluate(() => document.querySelector("glass-tab-bar")!.getAttribute("data-appearance"));
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe("appearance", () => {
  test.use({ colorScheme: "dark" });

  test("a page without dark mode keeps light glass in OS dark mode", async ({ page }) => {
    await open(page);
    expect(await appearanceOf(page)).toBe("light");
    expect(
      await page.evaluate(
        () => (document.querySelector("glass-surface") as HTMLElement).dataset.glassAppearance,
      ),
    ).toBe("light");
  });

  test("glass follows the page's color scheme and theme switches", async ({ page }) => {
    await open(page);
    // Opting into both schemes follows the OS (dark here) - picked up without any call.
    await page.evaluate(() => (document.documentElement.style.colorScheme = "light dark"));
    await nextFrames(page);
    expect(await appearanceOf(page)).toBe("dark");
    expect(
      await page.evaluate(
        () => (document.querySelector("glass-surface") as HTMLElement).dataset.glassAppearance,
      ),
    ).toBe("dark");
    await page.evaluate(() => (document.documentElement.style.colorScheme = "light"));
    await nextFrames(page);
    expect(await appearanceOf(page)).toBe("light");
    // The color-scheme meta tag counts too.
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "";
      const meta = document.createElement("meta");
      meta.name = "color-scheme";
      meta.content = "dark";
      document.head.append(meta);
    });
    await nextFrames(page);
    expect(await appearanceOf(page)).toBe("dark");
  });

  test("--glass-appearance below <body> applies after updateAppearance()", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      document.getElementById("phone")!.style.setProperty("--glass-appearance", "dark");
      (window as unknown as { glassy: { updateAppearance(): void } }).glassy.updateAppearance();
    });
    await nextFrames(page);
    expect(await appearanceOf(page)).toBe("dark");
    expect(
      await page.evaluate(() =>
        document.querySelector("glass-switch")!.getAttribute("data-appearance"),
      ),
    ).toBe("dark");
  });
});

/**
 * Measures text against the glass actually rendered behind it: every label is
 * made transparent, its box is captured, and the WCAG contrast of its color
 * against the 10th-percentile background pixel must stay above the floor.
 */
test("labels on glass stay readable over every photo, light and dark", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "pixel measurements are calibrated on the backdrop renderer",
  );
  test.setTimeout(90_000);
  const failures: string[] = [];
  for (const bg of ["lake", "city", "fruit", "silk"]) {
    for (const appearance of ["light", "dark"]) {
      await open(page, `?bg=${bg}&appearance=${appearance}`);
      await page.waitForTimeout(300);
      const runs = await page.evaluate(() => {
        const out: Array<{ name: string; color: string; floor: number; box: number[] }> = [];
        const add = (el: Element, name: string, floor: number) => {
          const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent!.trim());
          if (!node) return;
          const r = document.createRange();
          r.selectNodeContents(node);
          const b = r.getBoundingClientRect();
          out.push({
            name,
            color: getComputedStyle(el).color,
            floor,
            box: [b.x, b.y, b.width, b.height],
          });
        };
        document
          .querySelectorAll("glass-tab, glass-segment")
          .forEach((t) =>
            add(
              t,
              `${t.localName}:${t.getAttribute("value")}`,
              t.hasAttribute("data-current") ? 3.2 : 3.8,
            ),
          );
        document
          .querySelectorAll("#phone glass-button")
          .forEach((b) => add(b, `button:${b.textContent!.trim() || "icon"}`, 3.8));
        document
          .querySelectorAll("#phone glass-surface > div")
          .forEach((d) => add(d, `row:${d.textContent!.trim()}`, 4.5));
        return out;
      });
      await page.addStyleTag({
        content: "#phone *{color:transparent!important;text-shadow:none!important}",
      });
      await page.waitForTimeout(350);
      for (const run of runs) {
        const [x, y, width, height] = run.box as [number, number, number, number];
        const png = await page.screenshot({ clip: { x, y, width, height } });
        const p10 = await page.evaluate(
          async ({ data, color }) => {
            const img = new Image();
            img.src = `data:image/png;base64,${data}`;
            await img.decode();
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const fg = ctx.getImageData(0, 0, 1, 1).data;
            const a = fg[3]! / 255;
            const lin = (v: number) =>
              (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            const lum = (r: number, g: number, b: number) =>
              0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
            const ratios: number[] = [];
            for (let i = 0; i < d.length; i += 4) {
              const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
              const l1 = lum(
                fg[0]! * a + r * (1 - a),
                fg[1]! * a + g * (1 - a),
                fg[2]! * a + b * (1 - a),
              );
              const l2 = lum(r, g, b);
              ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
            }
            ratios.sort((p, q) => p - q);
            return ratios[Math.floor(ratios.length * 0.1)]!;
          },
          { data: png.toString("base64"), color: run.color },
        );
        if (p10 < run.floor)
          failures.push(`${bg}/${appearance} ${run.name}: ${p10.toFixed(2)} < ${run.floor}`);
      }
    }
  }
  expect(failures).toEqual([]);
});
