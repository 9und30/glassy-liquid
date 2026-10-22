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

async function countPointerListeners(slider: Locator): Promise<void> {
  await slider.evaluate((host) => {
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const update = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      added: boolean,
    ) => {
      if (!listener || !["pointermove", "pointerup", "pointercancel"].includes(type)) return;
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      if (added) set.add(listener);
      else set.delete(listener);
      host.dataset.pointerListeners = String(
        [...listeners.values()].reduce((count, entries) => count + entries.size, 0),
      );
    };
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      update(type, listener, true);
      add(type, listener, options);
    };
    window.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      update(type, listener, false);
      remove(type, listener, options);
    };
    host.dataset.pointerListeners = "0";
  });
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

test("synchronous reparenting keeps an active drag and commits once", async ({ page }) => {
  const slider = await ready(page);
  await slider.evaluate((host) => {
    const wrapper = document.createElement("div");
    host.before(wrapper);
    wrapper.append(host);
    host.dataset.changes = "0";
    host.addEventListener(
      "change",
      () => (host.dataset.changes = String(+host.dataset.changes! + 1)),
    );
  });
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await slider.evaluate((host) => {
    host.addEventListener("input", () => host.parentElement!.append(host), { once: true });
  });
  await page.mouse.move(box.x + box.width * 0.75, y);
  await page.mouse.move(box.x + box.width + 40, y);
  await expect(slider).toHaveAttribute("aria-valuenow", "2");
  await expect(slider.locator(".value-label.dragging")).toBeVisible();
  await expect(slider).toHaveAttribute("data-changes", "0");
  await page.mouse.up();
  await expect(slider).toHaveAttribute("data-changes", "1");
});

for (const action of ["disable", "remove"] as const) {
  for (const phase of ["the first input", "an active drag"] as const) {
    test(`${action} during ${phase} leaves no global drag listeners`, async ({ page }) => {
      const slider = await ready(page);
      const handle = (await slider.elementHandle())!;
      await countPointerListeners(slider);
      const interrupt = () =>
        slider.evaluate((host, action) => {
          host.dataset.inputs = "0";
          host.dataset.changes = "0";
          host.addEventListener("input", () => {
            host.dataset.inputs = String(+host.dataset.inputs! + 1);
            if (action === "disable") host.setAttribute("disabled", "");
            else host.remove();
          });
          host.addEventListener(
            "change",
            () => (host.dataset.changes = String(+host.dataset.changes! + 1)),
          );
        }, action);
      const box = (await slider.boundingBox())!;
      const y = box.y + box.height / 2;
      if (phase === "the first input") await interrupt();
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      if (phase === "an active drag") await interrupt();
      await page.mouse.move(box.x + box.width + 40, y);
      await page.mouse.up();
      await handle.evaluate((host) => host.remove());
      await expect
        .poll(() =>
          handle.evaluate((host) => ({
            connected: host.isConnected,
            inputs: host.dataset.inputs,
            changes: host.dataset.changes,
            listeners: host.dataset.pointerListeners,
            dragging: !!host.shadowRoot!.querySelector(".value-label.dragging"),
          })),
        )
        .toEqual({ connected: false, inputs: "1", changes: "0", listeners: "0", dragging: false });
    });
  }
}

test("pointer cancellation commits once and releases global drag listeners", async ({ page }) => {
  const slider = await ready(page);
  await countPointerListeners(slider);
  await slider.evaluate((host) => {
    host.dataset.changes = "0";
    host.addEventListener("pointerdown", (event) => {
      host.dataset.pointerId = String((event as PointerEvent).pointerId);
    });
    host.addEventListener(
      "change",
      () => (host.dataset.changes = String(+host.dataset.changes! + 1)),
    );
  });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await slider.evaluate((host) => {
    window.dispatchEvent(
      new PointerEvent("pointercancel", { pointerId: Number(host.dataset.pointerId) }),
    );
  });
  await page.mouse.up();
  await expect(slider).toHaveAttribute("data-changes", "1");
  await expect(slider).toHaveAttribute("data-pointer-listeners", "0");
  await expect(slider.locator(".value-label.dragging")).toHaveCount(0);
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
