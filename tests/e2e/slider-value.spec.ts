import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ screenshot: "off" });

async function ready(page: Page): Promise<Locator> {
  await page.goto("/fixtures/slider-value.html");
  const slider = page.locator("#value");
  await expect(slider).toHaveAttribute("role", "slider");
  return slider;
}

async function keyboardFocus(page: Page): Promise<void> {
  await page.locator("#before").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#value")).toBeFocused();
}

async function expectWithinSlider(slider: Locator): Promise<void> {
  await expect
    .poll(() =>
      slider.evaluate((host) => {
        const bounds = host.getBoundingClientRect();
        const label = host.shadowRoot!.querySelector(".value-label")!.getBoundingClientRect();
        return label.left >= bounds.left - 0.5 && label.right <= bounds.right + 0.5;
      }),
    )
    .toBe(true);
}

test("floating value is opt-in, keyboard-visible and preserves numeric form values", async ({
  page,
}) => {
  const slider = await ready(page);
  const label = slider.locator("[part=value-label]");
  await expect(label).toBeHidden();
  await keyboardFocus(page);
  await expect(label).toBeVisible();
  await expect(label).toHaveAttribute("aria-hidden", "true");
  await expect(label).toHaveText("-0.5");

  await page.keyboard.press("ArrowRight");
  await expect(label).toHaveText("-0.25");
  await expect(slider).toHaveAttribute("aria-valuenow", "-0.25");
  expect(
    await page
      .locator("#form")
      .evaluate((form) => new FormData(form as HTMLFormElement).get("amount")),
  ).toBe("-0.25");

  await page.keyboard.press("Home");
  await expect(label).toHaveText("-2");
  await expectWithinSlider(slider);
  await page.keyboard.press("End");
  await expect(label).toHaveText("2");
  await expectWithinSlider(slider);

  await page.keyboard.press("Tab");
  await expect(label).toBeHidden();
  await expect(page.locator("#plain [part=value-label]")).toBeHidden();
  await page.locator("#plain").evaluate((host) => {
    (host as HTMLElement & { showValue: boolean }).showValue = true;
  });
  await expect(page.locator("#plain [part=value-label]")).toBeVisible();
});

test("drag label follows the thumb, stays in bounds and keeps input/change semantics", async ({
  page,
}) => {
  const slider = await ready(page);
  await slider.evaluate((host) => {
    host.dataset.inputs = "0";
    host.dataset.changes = "0";
    host.addEventListener("input", () => (host.dataset.inputs = String(+host.dataset.inputs! + 1)));
    host.addEventListener(
      "change",
      () => (host.dataset.changes = String(+host.dataset.changes! + 1)),
    );
  });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(slider.locator("[part=value-label]")).toBeVisible();
  await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 6 });
  await expect(slider).toHaveAttribute("aria-valuenow", "2");
  await expectWithinSlider(slider);
  await expect(slider).toHaveAttribute("data-changes", "0");
  await page.mouse.up();
  await expect(slider).toHaveAttribute("data-changes", "1");
  expect(+(await slider.getAttribute("data-inputs"))!).toBeGreaterThan(0);
  await page.locator("#after").focus();
  await expect(slider.locator("[part=value-label]")).toBeHidden();
});

test("formatted text is safe, bounded after resize and restored after reconnect", async ({
  page,
}) => {
  const slider = await ready(page);
  await keyboardFocus(page);
  const label = slider.locator("[part=value-label]");
  await slider.evaluate((host) => {
    host.setAttribute("aria-valuetext", '<img src="invalid"> -0.5 degrees');
    host.style.width = "120px";
  });
  await expect(label).toHaveText('<img src="invalid"> -0.5 degrees');
  await expect(label.locator("img")).toHaveCount(0);
  await expectWithinSlider(slider);
  await slider.evaluate((host) => host.removeAttribute("aria-valuetext"));
  await expect(label).toHaveText("-0.5");

  await slider.evaluate(async (host) => {
    const parent = host.parentNode!;
    const next = host.nextSibling;
    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    parent.insertBefore(host, next);
  });
  await keyboardFocus(page);
  await expect(label).toBeVisible();
  await expectWithinSlider(slider);
  await page.keyboard.press("ArrowRight");
  await expect(label).toHaveText("-0.25");
});

test("disabled controls stay inert and deferred sliders wait for hydration", async ({ page }) => {
  await ready(page);
  const disabled = page.locator("#disabled");
  await disabled.dispatchEvent("keydown", { key: "ArrowRight" });
  await expect(disabled).toHaveAttribute("aria-valuenow", "30");
  await expect(disabled.locator("[part=value-label]")).toBeHidden();

  const deferred = page.locator("#deferred");
  await expect(deferred).not.toHaveAttribute("role");
  await expect(deferred).not.toHaveAttribute("tabindex");
  expect(await deferred.evaluate((host) => host.shadowRoot!.childNodes.length)).toBe(0);
  await deferred.evaluate((host) => host.removeAttribute("defer-hydration"));
  await expect(deferred).toHaveAttribute("role", "slider");
  await deferred.focus();
  await deferred.press("ArrowRight");
  await expect(deferred.locator("[part=value-label]")).toHaveText("26");
});

test("value labels keep an opaque readable surface with reduced motion and forced colors", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  const slider = await ready(page);
  await keyboardFocus(page);
  const label = slider.locator("[part=value-label]");
  await expect(label).toBeVisible();
  const style = await label.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      foreground: style.color,
      border: style.borderTopStyle,
      duration: style.transitionDuration,
    };
  });
  expect(style.duration).toBe("0s");
  expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.background).not.toBe(style.foreground);
  if (await page.evaluate(() => matchMedia("(forced-colors:active)").matches))
    expect(style.border).toBe("solid");
});
