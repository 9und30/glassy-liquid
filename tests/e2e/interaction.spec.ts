import { expect, test, type Page } from "@playwright/test";

// The fixture is a 390 × 844 phone; keep all of it on screen.
test.use({ viewport: { width: 420, height: 900 } });

async function ready(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/fixtures/components.html");
  await page.waitForFunction(() => customElements.get("glass-sheet") !== undefined);
  await page.waitForTimeout(300);
  return errors;
}

/**
 * Wait until an element's animation has come to rest: its shadow DOM (inline
 * styles of thumb, lens, …) and light-DOM children stay unchanged for 6 frames.
 * Fixed delays were flaky under parallel load on Mobile Safari.
 */
async function settled(page: Page, selector: string): Promise<void> {
  await page.evaluate(
    (sel) =>
      new Promise<void>((resolve) => {
        const host = document.querySelector(sel)!;
        const snap = () =>
          (host.shadowRoot?.innerHTML ?? "") + host.innerHTML + host.getAttribute("style");
        let last = snap();
        let same = 0;
        const tick = () => {
          const now = snap();
          same = now === last ? same + 1 : 0;
          last = now;
          if (same >= 6) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    selector,
  );
}

const checked = (page: Page) =>
  page.evaluate(
    () => (document.querySelector("#labelled") as HTMLElement & { checked: boolean }).checked,
  );

test("a switch inside a label toggles once per click, tap or label click", async ({ page }) => {
  const errors = await ready(page);
  await page.evaluate(() => {
    const label = document.createElement("label");
    label.style.cssText =
      "position:fixed;left:20px;top:20px;display:flex;gap:40px;align-items:center;font:17px system-ui;z-index:10";
    label.innerHTML = `<span id="text">Wi-Fi</span><glass-switch id="labelled"></glass-switch>`;
    document.body.append(label);
  });
  await page.waitForTimeout(200);
  const box = (await page.locator("#labelled").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Direct clicks (Firefox used to toggle twice: once for the click, once for the label's re-dispatch).
  for (const expected of [true, false, true]) {
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(80);
    expect(await checked(page)).toBe(expected);
  }
  // A tap with a few pixels of jitter is still a tap.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 4, cy + 1, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  expect(await checked(page)).toBe(false);
  // Clicking the label text.
  await page.locator("#text").click();
  await page.waitForTimeout(80);
  expect(await checked(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("dragging the switch thumb decides by where it lands", async ({ page }) => {
  await ready(page);
  const sw = page.locator("glass-switch").first();
  await page.evaluate(() => {
    (window as unknown as { changes: number }).changes = 0;
    document
      .querySelector("glass-switch")!
      .addEventListener("change", () => (window as unknown as { changes: number }).changes++);
  });
  const box = (await sw.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 18, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, y, { steps: 8 });
  await page.mouse.up();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await settled(page, "glass-switch"); // let the thumb land
  // A short drag that does not cross the middle keeps the state.
  await page.mouse.move(box.x + 46, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 36, y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => (window as unknown as { changes: number }).changes)).toBe(1);
});

test("a selector inserted with innerHTML honors its value", async ({ page }) => {
  await ready(page);
  // innerHTML upgrades the parent before its items.
  await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = `<glass-segmented id="late" value="b"><glass-segment value="a">A</glass-segment><glass-segment value="b">B</glass-segment><glass-segment value="c">C</glass-segment></glass-segmented>`;
    document.body.append(div);
  });
  await page.waitForTimeout(100);
  await expect(page.locator('#late glass-segment[value="b"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('#late glass-segment[value="a"]')).toHaveAttribute(
    "aria-selected",
    "false",
  );
  expect(
    await page.evaluate(
      () => (document.querySelector("#late") as HTMLElement & { value: string }).value,
    ),
  ).toBe("b");
});

test("tab labels stay above the lens while dragging, and the highlight follows it", async ({
  page,
}) => {
  await ready(page);
  const bar = page.locator("glass-tab-bar");
  const home = (await page.locator('glass-tab[value="home"]').boundingBox())!;
  const library = (await page.locator('glass-tab[value="library"]').boundingBox())!;
  const y = home.y + home.height / 2;

  const layers = await page.evaluate(() => {
    const host = document.querySelector("glass-tab-bar")!;
    const lens = host.shadowRoot!.querySelector(".lens")!;
    return {
      lens: Number(getComputedStyle(lens).zIndex),
      item: Number(getComputedStyle(document.querySelector("glass-tab")!).zIndex),
    };
  });
  expect(layers.item).toBeGreaterThan(layers.lens);

  await page.mouse.move(home.x + home.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(library.x + library.width / 2, y, { steps: 10 });
  // Wait for the lens to arrive under the finger instead of a fixed delay.
  await page.waitForFunction(
    () => document.querySelector("glass-tab[data-current]")?.getAttribute("value") === "library",
    null,
    { timeout: 5000 },
  );
  await settled(page, "glass-tab-bar");
  const during = await page.evaluate(() => {
    const lib = document.querySelector('glass-tab[value="library"]') as HTMLElement & {
      content: HTMLElement;
    };
    return {
      current: document.querySelector("glass-tab[data-current]")?.getAttribute("value"),
      selected: document.querySelector('glass-tab[aria-selected="true"]')?.getAttribute("value"),
      scale: Number(lib.content.style.scale || 1),
    };
  });
  // The selection color travels with the lens; the selection itself commits on release.
  expect(during.current).toBe("library");
  expect(during.selected).toBe("home");
  expect(during.scale).toBeGreaterThan(1.05);
  await page.mouse.up();
  await expect(bar).toHaveAttribute("value", "library");
  // Once the lens has settled, nothing stays magnified.
  await page.waitForFunction(
    () =>
      (
        document.querySelector('glass-tab[value="library"]') as HTMLElement & {
          content: HTMLElement;
        }
      ).content.style.scale === "",
  );
});
