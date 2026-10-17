import { expect, test } from "@playwright/test";

const pages = [
  "index",
  "components",
  "playground",
  "getting-started",
  "theming",
  "accessibility",
  "browser-support",
];

// Reveals move content with a transform; reduced motion keeps every box where it lands.
test.use({ contextOptions: { reducedMotion: "reduce" } });

test.describe("section rhythm", () => {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["390px", { width: 390, height: 844 }],
  ] as const) {
    test(`every eyebrow has room above it (${label})`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      for (const name of pages) {
        await page.goto(`/${name}.html`);
        await page.waitForFunction(() => customElements.get("glass-button") !== undefined);
        await page.evaluate(() => document.fonts.ready);
        const gaps = await page.evaluate(() => {
          const main = document.querySelector("main")!;
          const visible = (el: Element) => {
            const r = el.getBoundingClientRect();
            return r.height > 2 && r.width > 2 && getComputedStyle(el).visibility !== "hidden";
          };
          // The block just before an element: its previous visible sibling, or its parent's.
          const before = (el: Element): Element | null => {
            let node: Element | null = el;
            while (node && node !== main) {
              let prev = node.previousElementSibling;
              while (prev && !visible(prev)) prev = prev.previousElementSibling;
              if (prev) return prev;
              node = node.parentElement;
            }
            return null;
          };
          // Where the previous block's visible content ends: its padding counts as room.
          const inkBottom = (el: Element): number => {
            const cs = getComputedStyle(el);
            const bottom =
              el.getBoundingClientRect().bottom -
              (parseFloat(cs.paddingBottom) || 0) -
              (parseFloat(cs.borderBottomWidth) || 0);
            const kids = [...el.children].filter(visible);
            const last = kids[kids.length - 1];
            if (last && Math.abs(last.getBoundingClientRect().bottom - bottom) < 1)
              return inkBottom(last);
            return bottom;
          };
          return [...main.querySelectorAll(".kicker")]
            .filter(visible)
            .map((kicker) => {
              const prev = before(kicker);
              if (!prev) return null;
              // A block in the column beside this one is not above it.
              const a = kicker.getBoundingClientRect();
              const b = prev.getBoundingClientRect();
              if (b.right <= a.left || b.left >= a.right) return null;
              return {
                text: kicker.textContent?.trim(),
                gap: kicker.getBoundingClientRect().top - inkBottom(prev),
              };
            })
            .filter((x) => x !== null);
        });
        for (const g of gaps) expect(g.gap, `${name}: ${g.text}`).toBeGreaterThanOrEqual(32);
      }
    });
  }

  test("the plates heading lines up with the column", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    const kicker = await page.locator("#highlights .kicker").boundingBox();
    const facts = await page.locator(".index").boundingBox();
    const measure = await page.locator("#performance .kicker").boundingBox();
    expect(Math.abs(kicker!.x - facts!.x)).toBeLessThan(1);
    expect(Math.abs(kicker!.x - measure!.x)).toBeLessThan(1);
  });
});
