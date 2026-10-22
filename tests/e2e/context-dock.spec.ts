import { expect, test, type Page } from "@playwright/test";

async function openDock(page: Page): Promise<void> {
  await page.goto("/index.html");
  await expect(page.locator("[data-context-primary]")).not.toHaveAttribute("disabled", "");
}

test.describe("context dock", () => {
  test("sorts the collection and adds or removes favorites from the selection", async ({
    page,
  }) => {
    await openDock(page);
    const dock = page.locator("[data-context-dock]");
    const titles = dock.locator("[data-context-photo]");
    const primary = dock.locator("[data-context-primary]");
    const secondary = dock.locator("[data-context-secondary]");
    const status = dock.getByRole("status");

    await primary.click();
    await expect
      .poll(() =>
        titles.evaluateAll((items) => items.map((item) => item.getAttribute("data-title"))),
      )
      .toEqual(["City after dark", "Glacier folds", "Silk in motion", "Still water"]);
    await expect(status).toHaveText("Photos sorted A to Z.");
    await primary.click();
    await expect
      .poll(() =>
        titles.evaluateAll((items) => items.map((item) => item.getAttribute("data-title"))),
      )
      .toEqual(["Still water", "Silk in motion", "Glacier folds", "City after dark"]);
    await expect(status).toHaveText("Photos sorted Z to A.");

    await dock.getByRole("button", { name: "Select Still water", exact: true }).click();
    await dock.getByRole("button", { name: "Select Glacier folds", exact: true }).click();
    await expect(dock.locator("[data-context-summary]")).toHaveText("2 selected 4 photos");
    await expect(primary).toHaveText("Add favorites");
    await primary.click();
    await expect(dock.locator("[data-context-favorite]:visible")).toHaveCount(2);
    await expect(status).toHaveText("2 photos added to favorites.");
    await expect(dock.locator("#context-water-favorite")).toHaveText("Favorite");
    await expect(primary).toHaveText("Remove favorites");
    await primary.click();
    await expect(dock.locator("[data-context-favorite]:visible")).toHaveCount(0);
    await expect(status).toHaveText("2 photos removed from favorites.");
    await primary.click();
    await secondary.click();
    await expect(dock.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect(dock.locator("[data-context-favorite]:visible")).toHaveCount(2);
    await expect(status).toHaveText("Selection cleared.");
  });

  test("supports keyboard selection and keeps focus as the toolbar changes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDock(page);
    const dock = page.locator("[data-context-dock]");
    const photo = dock.getByRole("button", { name: "Select Still water", exact: true });
    const primary = dock.locator("[data-context-primary]");
    const secondary = dock.locator("[data-context-secondary]");

    await photo.focus();
    await page.keyboard.press("Space");
    await expect(photo).toHaveAttribute("aria-pressed", "true");
    await expect(photo).toBeFocused();
    await expect(dock.getByRole("status")).toBeEmpty();
    await primary.focus();
    await page.keyboard.press("Enter");
    await expect(primary).toBeFocused();
    await expect(primary).toHaveText("Remove favorites");
    await page.keyboard.press("ArrowRight");
    await expect(secondary).toBeFocused();
    await page.keyboard.press("Space");
    await expect(secondary).toBeFocused();
    await expect(secondary).toHaveText("Select all");
    await page.keyboard.press("Space");
    await expect(dock.locator('button[aria-pressed="true"]')).toHaveCount(4);
    await expect(secondary).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(primary).toBeFocused();
    await expect(primary).toHaveText("Add favorites");
    await page.keyboard.press("Enter");
    await expect(dock.locator("[data-context-favorite]:visible")).toHaveCount(4);
    expect(
      await photo.locator("img").evaluate((img) => getComputedStyle(img).transitionDuration),
    ).toBe("0s");
  });

  test("fits narrow layouts with long photo labels and the longest action label", async ({
    page,
  }) => {
    await openDock(page);
    const dock = page.locator("[data-context-dock]");
    await dock
      .locator(".context-dock__title")
      .first()
      .evaluate((label) => {
        label.textContent = "A very long photo title with an unbrokenwordthatstillneedstowrap";
      });
    await dock.locator("[data-context-secondary]").click();
    await dock.locator("[data-context-primary]").click();
    await expect(dock.locator("[data-context-primary]")).toHaveText("Remove favorites");
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await dock.evaluate((el) => {
        const controls = Array.from(el.querySelectorAll("button, glass-button, glass-group"));
        return {
          overflow: el.scrollWidth - el.clientWidth,
          outside: controls.filter((control) => {
            const box = control.getBoundingClientRect();
            return box.left < 0 || box.right > document.documentElement.clientWidth + 1;
          }).length,
        };
      });
      expect(layout, `context dock at ${width}px`).toEqual({ overflow: 0, outside: 0 });
    }
  });

  test("starts fresh after client-side navigation and removes the previous page handlers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDock(page);
    const dock = page.locator("[data-context-dock]");
    await dock.locator("[data-context-secondary]").click();
    const previousPrimary = await dock.locator("[data-context-primary]").elementHandle();
    if (!previousPrimary) throw new Error("Missing photo action");
    await page.locator(".nav__links a", { hasText: "Guide" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-page", "getting-started");
    const oldStatus = await previousPrimary.evaluate((button) => {
      button.removeAttribute("disabled");
      button.dispatchEvent(new MouseEvent("click"));
      return button.closest("[data-context-dock]")?.querySelector("[data-context-status]")
        ?.textContent;
    });
    expect(oldStatus).toBe("All 4 photos selected.");
    await page.locator(".nav .brand").click();
    await expect(dock.locator("[data-context-primary]")).toHaveText("Sort A-Z");
    await expect(dock.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await dock.locator("[data-context-secondary]").click();
    await dock.locator("[data-context-primary]").click();
    await expect(dock.locator("[data-context-favorite]:visible")).toHaveCount(4);
    await expect(dock.getByRole("status")).toHaveText("4 photos added to favorites.");
  });
});
