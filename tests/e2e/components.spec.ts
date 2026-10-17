import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, path: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(path);
  await page.waitForFunction(() => customElements.get("glass-sheet") !== undefined);
  await page.waitForTimeout(300);
  return errors;
}

test("switch toggles by click and keyboard, and fires change", async ({ page }) => {
  const errors = await ready(page, "/fixtures/components.html");
  const sw = page.locator("glass-switch").first();
  await page.evaluate(() => {
    (window as unknown as { changes: number }).changes = 0;
    document
      .querySelector("glass-switch")!
      .addEventListener("change", () => (window as unknown as { changes: number }).changes++);
  });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.focus();
  await page.keyboard.press("Space");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => (window as unknown as { changes: number }).changes)).toBe(2);
  expect(errors).toEqual([]);
});

test("slider responds to the keyboard and clamps to its range", async ({ page }) => {
  await ready(page, "/fixtures/components.html");
  const slider = page.locator("glass-slider").first();
  await slider.focus();
  const before = Number(await slider.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  expect(Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", "100");
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  const stepped = page.locator("glass-slider").nth(1);
  await stepped.focus();
  await page.keyboard.press("ArrowRight");
  await expect(stepped).toHaveAttribute("aria-valuenow", "75");
});

test("tab bar and segmented control select by click and arrows", async ({ page }) => {
  await ready(page, "/fixtures/components.html");
  const bar = page.locator("glass-tab-bar");
  await page.locator('glass-tab[value="library"]').click();
  await expect(bar).toHaveAttribute("value", "library");
  await expect(page.locator('glass-tab[value="library"]')).toHaveAttribute("aria-selected", "true");
  await page.locator('glass-tab[value="library"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(bar).toHaveAttribute("value", "recent");
  await page.locator('glass-segment[value="month"]').click();
  await expect(page.locator("glass-segmented")).toHaveAttribute("value", "month");
});

test("menu opens from its trigger and selects with the keyboard", async ({ page }) => {
  const errors = await ready(page, "/fixtures/components2.html");
  await page.evaluate(() => {
    document
      .querySelector("glass-menu")!
      .addEventListener(
        "select",
        (e) => ((window as unknown as { picked: string }).picked = (e as CustomEvent).detail.value),
      );
  });
  const trigger = page.locator('glass-menu glass-button[slot="trigger"]');
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("glass-menu")).toHaveAttribute("open", "");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as unknown as { picked?: string }).picked)).toBeTruthy();
  await expect(page.locator("glass-menu")).not.toHaveAttribute("open", "");
  // Escape closes and returns focus to the trigger.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("glass-menu")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator("glass-menu")).not.toHaveAttribute("open", "");
  expect(errors).toEqual([]);
});

test("sheet opens and closes with Escape", async ({ page }) => {
  await ready(page, "/fixtures/components2.html");
  await page.locator("#opensheet").click();
  const sheet = page.locator("#sheet");
  await expect(sheet).toHaveAttribute("open", "");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await expect(sheet).not.toHaveAttribute("open", "");
});

test("a modal sheet keeps keyboard focus inside and marks the dialog modal", async ({ page }) => {
  await ready(page, "/fixtures/components2.html");
  const sheet = page.locator("#sheet");
  const dialog = sheet.locator('[role="dialog"]');
  const inside = () =>
    page.evaluate(() => {
      const host = document.getElementById("sheet")!;
      const active = document.activeElement;
      return !!active && (active === host || host.contains(active));
    });
  // Without modal the dialog is not announced as modal.
  await page.locator("#opensheet").click();
  await expect(sheet).toHaveAttribute("open", "");
  await expect(dialog).not.toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).not.toHaveAttribute("open", "");

  await page.evaluate(() => document.getElementById("sheet")!.setAttribute("modal", ""));
  await page.locator("#opensheet").click();
  await expect(sheet).toHaveAttribute("open", "");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await inside(), `Tab ${i + 1}`).toBe(true);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true);
  }
  // Focus moved outside by a script comes back to the sheet.
  await page.evaluate(() => (document.querySelector("#opensheet") as HTMLElement).focus());
  expect(await inside()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).not.toHaveAttribute("open", "");
  await expect(dialog).not.toHaveAttribute("aria-modal", "true");
  // Closing returns focus to the page.
  expect(await inside()).toBe(false);
});

test("button activates with Enter and search reports its value", async ({ page }) => {
  await ready(page, "/fixtures/components2.html");
  await page.evaluate(() => {
    document
      .querySelector("#opensheet")!
      .addEventListener(
        "click",
        () => ((window as unknown as { clicked: boolean }).clicked = true),
      );
  });
  await page.locator("#opensheet").focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as unknown as { clicked?: boolean }).clicked)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await page.locator("glass-search").click();
  await page.keyboard.type("lake");
  expect(
    await page.evaluate(
      () => (document.querySelector("glass-search") as unknown as { value: string }).value,
    ),
  ).toBe("lake");
});

test("glass surfaces clean up when removed", async ({ page }) => {
  await ready(page, "/fixtures/components.html");
  const leftovers = await page.evaluate(async () => {
    const el = document.createElement("glass-surface");
    document.body.append(el);
    await new Promise((r) => requestAnimationFrame(r));
    el.remove();
    await new Promise((r) => setTimeout(r, 50));
    return el.shadowRoot!.querySelectorAll("gl-fx").length;
  });
  expect(leftovers).toBe(0);
});

test("search fires input exactly once per keystroke (regression)", async ({ page }) => {
  const errors = await ready(page, "/fixtures/components2.html");
  await page.evaluate(() => {
    const w = window as unknown as { inputs: string[] };
    w.inputs = [];
    const s = document.querySelector("glass-search")!;
    s.addEventListener("input", () => w.inputs.push((s as unknown as { value: string }).value));
  });
  await page.locator("glass-search input").first().click();
  await page.keyboard.type("abc");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as unknown as { inputs: string[] }).inputs)).toEqual([
    "a",
    "ab",
    "abc",
    "",
  ]);
  expect(errors).toEqual([]);
});

test("defer-hydration keeps an element inert until it is removed", async ({ page }) => {
  const errors = await ready(page, "/fixtures/components.html");
  const before = await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = `<glass-switch id="dh" defer-hydration style="color:red"></glass-switch><glass-button id="db" defer-hydration>B</glass-button>`;
    document.body.append(div);
    const sw = document.getElementById("dh")!;
    const bt = document.getElementById("db")!;
    // Attribute changes while deferred are applied on release, from the attributes.
    sw.setAttribute("checked", "");
    return {
      sw: [...sw.attributes].map((a) => a.name).sort(),
      bt: [...bt.attributes].map((a) => a.name).sort(),
      style: sw.getAttribute("style"),
    };
  });
  expect(before.sw).toEqual(["checked", "defer-hydration", "id", "style"]);
  expect(before.bt).toEqual(["defer-hydration", "id"]);
  expect(before.style).toBe("color:red");
  await page.evaluate(() => {
    document.getElementById("dh")!.removeAttribute("defer-hydration");
    document.getElementById("db")!.removeAttribute("defer-hydration");
  });
  await expect(page.locator("#dh")).toHaveAttribute("role", "switch");
  await expect(page.locator("#dh")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#db")).toHaveAttribute("role", "button");
  expect(errors).toEqual([]);
});

test("a continuous slider keeps fractional values", async ({ page }) => {
  await ready(page, "/fixtures/components.html");
  const slider = page.locator("glass-slider").first();
  await slider.evaluate((el) => {
    (el as HTMLElement & { value: number }).value = 62.4;
  });
  await expect(slider).toHaveJSProperty("value", 62.4);
  await expect(slider).toHaveAttribute("aria-valuenow", "62.4");
  await slider.evaluate((el) => {
    el.setAttribute("min", "0");
    el.setAttribute("max", "1");
    (el as HTMLElement & { value: number }).value = 0.4;
  });
  await expect(slider).toHaveJSProperty("value", 0.4);
  await expect(slider).toHaveAttribute("aria-valuenow", "0.4");
  await slider.evaluate((el) => {
    el.setAttribute("min", "0");
    el.setAttribute("max", "10");
    el.removeAttribute("step");
    (el as HTMLElement & { value: number }).value = 0;
  });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveJSProperty("value", 0.1);
  await expect(slider).toHaveAttribute("aria-valuenow", "0.1");
});

test("sheet tint, blur, and material update the open slab", async ({ page }) => {
  await ready(page, "/fixtures/components.html");
  const result = await page.evaluate(async () => {
    const sheet = document.createElement("glass-sheet") as HTMLElement & { show: () => void };
    sheet.setAttribute("aria-label", "Tint");
    sheet.setAttribute("tint", "#c4622d");
    sheet.setAttribute("blur", "12");
    sheet.setAttribute("material", "clear");
    document.body.append(sheet);
    sheet.show();
    const host = sheet.shadowRoot?.querySelector(".sheet") as HTMLElement | null;
    const fx = host?.querySelector("gl-fx") as HTMLElement | null;
    const wait = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await wait();
    const first = {
      tint: fx?.style.getPropertyValue("--gl-tint") ?? "",
      fill: fx?.style.getPropertyValue("--gl-fill") ?? "",
    };
    sheet.setAttribute("tint", "#0a84ff");
    sheet.setAttribute("material", "regular");
    sheet.setAttribute("blur", "3");
    await wait();
    sheet.removeAttribute("tint");
    await wait();
    return {
      firstTint: first.tint,
      firstFill: first.fill,
      secondTint: fx?.style.getPropertyValue("--gl-tint") ?? "",
      secondFill: fx?.style.getPropertyValue("--gl-fill") ?? "",
      cleared: fx?.style.getPropertyValue("--gl-tint-opacity") ?? "",
    };
  });
  expect(result.firstTint).toContain("196");
  expect(result.secondTint).toContain("10");
  expect(result.firstFill).not.toBe(result.secondFill);
  expect(result.cleared).toBe("0");
});

test("a failed scene image hides the broken icon", async ({ page }) => {
  await page.route("**/missing-scene.jpg", (route) => route.abort());
  await ready(page, "/fixtures/components.html");
  const result = await page.evaluate(async () => {
    const scene = document.createElement("glass-scene");
    scene.style.height = "140px";
    scene.setAttribute("src", "/missing-scene.jpg");
    document.body.append(scene);
    const start = Date.now();
    let img = scene.shadowRoot?.querySelector("img") ?? null;
    while (Date.now() - start < 2500 && img?.getAttribute("src")) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      img = scene.shadowRoot?.querySelector("img") ?? null;
    }
    return {
      src: img?.getAttribute("src") ?? null,
      display: img ? getComputedStyle(img).display : "missing",
      background: getComputedStyle(scene).backgroundImage,
    };
  });
  expect(result.src).toBeNull();
  expect(result.display).toBe("none");
  expect(result.background).toContain("gradient");
});
