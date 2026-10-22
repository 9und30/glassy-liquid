import { expect, test, type Page } from "@playwright/test";

test.use({ screenshot: "off", trace: "off" });

const comparison = (page: Page) => page.locator("#hero-comparison");
const material = (page: Page, name: "Glass" | "Frost") =>
  comparison(page).getByRole("button", { name, exact: true });

async function ready(page: Page): Promise<void> {
  await expect(comparison(page)).toBeVisible();
  await expect(page.locator("#hero-player")).toHaveAttribute("data-ready", "");
  await page.evaluate(() => document.fonts.ready);
}

async function lensState(page: Page) {
  return page.evaluate(async () => {
    // Use the same public API module that Vite loaded for the docs, without
    // adding a production-only test hook to the hero.
    const entry = performance
      .getEntriesByType("resource")
      .find((resource) => new URL(resource.name).pathname.endsWith("/src/index.ts"));
    if (!entry) throw new Error("The docs library module did not load");
    const { getSurface } = (await import(entry.name)) as typeof import("../../src/index");
    const lens = document.querySelector<HTMLElement>("#hero-lens")!;
    const surface = getSurface(lens)!;
    const { refraction, zoom, dispersion, blur } = surface.sceneParams();
    return {
      options: { ...surface.options },
      optics: { refraction, zoom, dispersion, blur },
      engine: surface.engine,
      position: [lens.style.getPropertyValue("--lens-x"), lens.style.getPropertyValue("--lens-y")],
      photo: document.querySelector<HTMLImageElement>(".hero__photo")!.currentSrc,
    };
  });
}

test.describe("hero material comparison", () => {
  test("keyboard switching changes the optics and restores the same dragged lens", async ({
    page,
  }) => {
    await page.goto("/index.html");
    await ready(page);
    const lens = page.locator("#hero-lens");
    const box = (await lens.boundingBox())!;
    const beforeDrag = await lensState(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 36, box.y + box.height / 2 + 16);
    await page.mouse.up();
    const original = await lensState(page);
    expect(original.position).not.toEqual(beforeDrag.position);

    await material(page, "Frost").focus();
    await page.keyboard.press("Enter");
    await expect(material(page, "Frost")).toHaveAttribute("aria-pressed", "true");
    await expect(material(page, "Glass")).toHaveAttribute("aria-pressed", "false");
    const frost = await lensState(page);
    expect(frost.optics).toMatchObject({ refraction: 0, zoom: 1, dispersion: 0 });
    expect(frost.optics.blur).toBeGreaterThan(0);
    expect(frost.options.engine).toBe(original.options.engine);
    expect(frost.engine).toBe(original.engine);
    expect(frost.position).toEqual(original.position);
    expect(frost.photo).toBe(original.photo);
    await expect(page.locator("#engine-note")).toContainText("Live,");
    await expect(page.locator("#hero-comparison-note")).toHaveText(
      "Frost: blur without distortion.",
    );
    expect(await material(page, "Frost").evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    const outline = await material(page, "Frost").evaluate(
      (el) => getComputedStyle(el).outlineWidth,
    );
    expect(parseFloat(outline)).toBeGreaterThanOrEqual(2);

    await material(page, "Glass").focus();
    await page.keyboard.press("Space");
    await expect(material(page, "Glass")).toHaveAttribute("aria-pressed", "true");
    expect(await lensState(page)).toEqual(original);
    await expect(page.locator("#hero-player")).toHaveAttribute("data-state", "paused");
  });

  test("navigation disposes the old controls and remounts one working comparison", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/index.html");
    await ready(page);
    await material(page, "Frost").click();
    const oldGlass = (await material(page, "Glass").elementHandle())!;
    await page.locator(".nav__links a", { hasText: "Components" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-page", "components");
    await oldGlass.evaluate((button) => (button as HTMLButtonElement).click());
    expect(await oldGlass.getAttribute("aria-pressed")).toBe("false");
    await page.locator(".nav .brand").click();
    await ready(page);
    await expect(comparison(page)).toHaveCount(1);
    await expect(material(page, "Glass")).toHaveAttribute("aria-pressed", "true");
    await material(page, "Frost").click();
    expect((await lensState(page)).optics.refraction).toBe(0);
    await oldGlass.dispose();
  });

  test("fits around the lens and player at narrow widths", async ({ page }) => {
    await page.goto("/index.html");
    await ready(page);
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(
          async () => {
            return page.evaluate(() => {
              const box = (selector: string) =>
                document.querySelector(selector)!.getBoundingClientRect();
              const panel = box("#hero-comparison");
              const lens = box("#hero-lens");
              const player = box("#hero-player");
              const overlap = (a: DOMRect, b: DOMRect) =>
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
              return (
                panel.left >= 0 &&
                panel.right <= innerWidth &&
                !overlap(panel, lens) &&
                !overlap(panel, player) &&
                document.documentElement.scrollWidth <= innerWidth + 1
              );
            });
          },
          { message: `The material comparison fits at ${width}px` },
        )
        .toBe(true);
      for (const name of ["Glass", "Frost"] as const) {
        const button = (await material(page, name).boundingBox())!;
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
      await material(page, "Frost").click();
      await expect(material(page, "Frost")).toHaveAttribute("aria-pressed", "true");
      await material(page, "Glass").click();
    }
  });

  test("explains reduced transparency and resumes the selected material", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Chromium can emulate reduced transparency");
    await page.goto("/index.html");
    await ready(page);
    await material(page, "Frost").click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    await expect(material(page, "Glass")).toBeDisabled();
    await expect(material(page, "Frost")).toBeDisabled();
    await expect(material(page, "Glass")).toHaveAttribute("aria-pressed", "false");
    await expect(material(page, "Frost")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#hero-comparison-note")).toHaveText(
      "Reduced transparency: rim only.",
    );
    expect((await lensState(page)).options.fill).toBe("transparent");
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await expect(material(page, "Frost")).toBeEnabled();
    await expect(material(page, "Frost")).toHaveAttribute("aria-pressed", "true");
    expect((await lensState(page)).optics.refraction).toBe(0);
  });

  test("does not expose unwired comparison buttons without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: test.info().project.use.baseURL,
    });
    const page = await context.newPage();
    await page.goto("/index.html");
    await expect(comparison(page)).toBeHidden();
    await context.close();
  });
});
