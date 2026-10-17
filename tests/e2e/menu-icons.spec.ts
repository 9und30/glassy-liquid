import { expect, test, type Page } from "@playwright/test";

// Icons inside menu items must stay small trailing glyphs. An SVG with only a
// viewBox fills its container, so an unsized icon once grew to the row width
// and stretched the menu past the viewport.

const desktop = { width: 1440, height: 900 };

interface MenuGeometry {
  open: boolean;
  content: number;
  rows: Array<{
    text: string;
    height: number;
    right: number;
    icon: null | { w: number; h: number; right: number };
  }>;
}

function measure(page: Page, scope: string): Promise<MenuGeometry> {
  return page.evaluate((scope) => {
    const menu = document.querySelector(`${scope} glass-menu`)!;
    const content = menu.shadowRoot!.querySelector(".content")!;
    return {
      open: menu.hasAttribute("open"),
      content: content.scrollHeight,
      rows: Array.from(menu.querySelectorAll("glass-menu-item")).map((item) => {
        const box = item.getBoundingClientRect();
        const svg = item.querySelector("svg")?.getBoundingClientRect();
        return {
          text: item.textContent!.trim(),
          height: box.height,
          right: box.right,
          icon: svg ? { w: svg.width, h: svg.height, right: svg.right } : null,
        };
      }),
    };
  }, scope);
}

async function openDocsMenu(page: Page): Promise<MenuGeometry> {
  await page.waitForFunction(() => customElements.get("glass-menu") !== undefined);
  await page.locator("#cx-tab-menu").click();
  const trigger = page.locator('#cx-demo glass-menu glass-button[slot="trigger"]');
  await trigger.scrollIntoViewIfNeeded();
  const menu = page.locator("#cx-demo glass-menu");
  // Right after a client-side swap the first click can land while the demo is
  // still being wired up, so retry until the menu reports open.
  await expect(async () => {
    if ((await menu.getAttribute("open")) === null) await trigger.click();
    await expect(menu).toHaveAttribute("open", "", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.waitForTimeout(500);
  return measure(page, "#cx-demo");
}

function expectCompact(menu: MenuGeometry): void {
  expect(menu.open).toBe(true);
  const withIcon = menu.rows.filter((row) => row.icon);
  expect(withIcon.map((row) => row.text)).toEqual(["Share", "Delete"]);
  for (const row of menu.rows) {
    expect(row.height, row.text).toBeLessThanOrEqual(48);
    if (!row.icon) continue;
    expect(row.icon.w, row.text).toBeLessThanOrEqual(24);
    expect(row.icon.h, row.text).toBeLessThanOrEqual(24);
    expect(row.icon.w, row.text).toBeGreaterThan(8);
    // Trailing, like iOS: the icon ends at the row's padding, not after the text.
    expect(row.right - row.icon.right, row.text).toBeLessThanOrEqual(20);
  }
  // Label + four rows + separator. The broken layout measured about 590px.
  expect(menu.content).toBeLessThanOrEqual(300);
}

test.describe("menu icons", () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-safari" && browserName === "webkit",
      "desktop layout",
    );
  });

  test("stay small and trailing on a direct load of the components page", async ({ page }) => {
    await page.setViewportSize(desktop);
    await page.goto("/components.html");
    expectCompact(await openDocsMenu(page));
  });

  test("stay small and trailing after client-side navigation", async ({ page }) => {
    await page.setViewportSize(desktop);
    await page.goto("/index.html");
    await page.waitForFunction(() => customElements.get("glass-button") !== undefined);
    await page.evaluate(() => {
      (window as Window & { __same?: boolean }).__same = true;
    });
    await page.locator(".nav__links a", { hasText: "Components" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-page", "components");
    expectCompact(await openDocsMenu(page));
    expect(await page.evaluate(() => (window as Window & { __same?: boolean }).__same)).toBe(true);
  });

  test("an icon outside the icon slot is capped too", async ({ page }) => {
    await page.goto("/fixtures/components2.html");
    await page.waitForFunction(() => customElements.get("glass-menu") !== undefined);
    await page.evaluate(() => {
      const item = document.createElement("glass-menu-item");
      item.setAttribute("value", "loose");
      item.innerHTML = `Loose <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>`;
      document.querySelector("glass-menu")!.append(item);
    });
    await page.locator('glass-menu glass-button[slot="trigger"]').click();
    await expect(page.locator("glass-menu")).toHaveAttribute("open", "");
    const loose = page.locator('glass-menu-item[value="loose"]');
    await expect(loose).toBeVisible();
    // Let the open morph settle: the panel scales while it grows out of the trigger.
    await page.waitForTimeout(600);
    const icon = await loose.locator(":scope > svg").boundingBox();
    const row = await loose.boundingBox();
    expect(icon!.width).toBeLessThanOrEqual(24);
    expect(icon!.height).toBeLessThanOrEqual(24);
    // Same height as a row that uses the icon slot.
    const slotted = await page.locator('glass-menu-item[value="share"]').boundingBox();
    expect(Math.abs(row!.height - slotted!.height)).toBeLessThanOrEqual(2);
  });

  test("tab, segment, and search icons are capped without page styles", async ({ page }) => {
    // This fixture styles button icons only, so the components' own caps apply.
    await page.goto("/fixtures/components2.html");
    await page.waitForFunction(() => customElements.get("glass-search") !== undefined);
    const sizes = await page.evaluate(() => {
      const svg = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>`;
      const host = document.createElement("div");
      host.style.width = "600px";
      host.innerHTML = `<glass-tab-bar><glass-tab value="a">${svg}A</glass-tab><glass-tab value="b">B</glass-tab></glass-tab-bar>
        <glass-segmented><glass-segment value="a">${svg}A</glass-segment><glass-segment value="b">B</glass-segment></glass-segmented>
        <glass-search>${svg}</glass-search>`;
      document.body.prepend(host);
      return Array.from(host.querySelectorAll("svg")).map((el) => {
        const box = el.getBoundingClientRect();
        return Math.max(box.width, box.height);
      });
    });
    expect(sizes).toHaveLength(3);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(24);
  });
});
