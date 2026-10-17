import { expect, test, type Page } from "@playwright/test";

// Navigation inside the docs swaps <main> instead of loading a new document.
// A marker on window survives only a client-side navigation.

async function boot(page: Page, path = "/index.html"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => customElements.get("glass-button") !== undefined);
  await page.evaluate(() => {
    (window as Window & { __same?: boolean }).__same = true;
  });
}

const sameDocument = (page: Page) =>
  page.evaluate(() => (window as Window & { __same?: boolean }).__same === true);

async function onPage(page: Page, name: string): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-page", name);
  await expect(page.locator("main")).toBeVisible();
}

const desktop = { width: 1440, height: 900 };

test.describe("client-side navigation", () => {
  test("header links swap the page without a reload", async ({ page }) => {
    // Several page swaps in a row: about 40 s in Mobile Safari on a loaded machine.
    test.setTimeout(90_000);
    await page.setViewportSize(desktop);
    await boot(page);
    const pages: Array<[string, string, RegExp, string]> = [
      ["Components", "components", /components\.html/, "Components. glassy-liquid"],
      ["Playground", "playground", /playground\.html$/, "Playground. glassy-liquid"],
      ["Guide", "getting-started", /getting-started\.html$/, "Getting started. glassy-liquid"],
      ["Support", "browser-support", /browser-support\.html$/, "Browser support. glassy-liquid"],
    ];
    for (const [label, name, url, title] of pages) {
      await page.locator(".nav__links a", { hasText: label }).click();
      await onPage(page, name);
      await expect(page).toHaveURL(url);
      await expect(page).toHaveTitle(title);
      await expect(page.locator(".nav__links a", { hasText: label })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.locator(".nav__links a[aria-current]")).toHaveCount(1);
      await expect(page.locator(".nav__pill")).toHaveAttribute("data-on", "");
      await expect(page.locator("main h1")).toBeFocused();
      await expect(page.locator("#route-announcer")).toHaveText(
        title.replace(". glassy-liquid", ""),
      );
      expect(await page.evaluate(() => scrollY)).toBeLessThan(2);
    }
    await page.locator(".nav .brand").click();
    await onPage(page, "home");
    await expect(page.locator(".nav__links a[aria-current]")).toHaveCount(0);
    await expect(page.locator(".nav__pill")).not.toHaveAttribute("data-on", "");
    expect(await sameDocument(page)).toBe(true);
  });

  test("glass-button links and the footer navigate in place too", async ({ page }) => {
    await page.setViewportSize(desktop);
    await boot(page);
    await page.locator(".opener glass-button", { hasText: "Open the playground" }).click();
    await onPage(page, "playground");
    await page.locator(".foot a", { hasText: "Theming" }).click();
    await onPage(page, "theming");
    // Theming lives under the guide, so the pill marks Guide while no link is current.
    await expect(page.locator(".nav__links a", { hasText: "Guide" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(".foot a", { hasText: "Theming" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await sameDocument(page)).toBe(true);
  });

  test("back and forward restore the page and its scroll position", async ({ page }) => {
    await page.setViewportSize(desktop);
    await boot(page, "/getting-started.html");
    await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "instant" }));
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => scrollY);
    expect(before).toBeGreaterThan(1000);
    await page.locator(".nav__links a", { hasText: "Components" }).click();
    await onPage(page, "components");
    await page.goBack();
    await onPage(page, "getting-started");
    await expect(page.locator("main h1")).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 40);
    expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(40);
    await page.goForward();
    await onPage(page, "components");
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
    expect(await sameDocument(page)).toBe(true);
  });

  // Sample scrollY in the first frames after the page changes. A smooth scroll
  // that starts mid-page and glides up shows as a large first sample.
  const sampleFrames = (page: Page, read: string) =>
    page.evaluate((read) => {
      const w = window as Window & { __frames?: number[] };
      w.__frames = [];
      const page = document.body.dataset.page;
      new MutationObserver((_, mo) => {
        if (document.body.dataset.page === page) return;
        mo.disconnect();
        let n = 0;
        const tick = () => {
          w.__frames!.push(Function(`return ${read}`)() as number);
          if (++n < 8) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }).observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
    }, read);
  const frames = async (page: Page) => {
    await expect
      .poll(
        () =>
          page.evaluate(() => (window as Window & { __frames?: number[] }).__frames?.length ?? 0),
        // Eight animation frames take a fraction of a second, but a loaded machine
        // (WebKit at DPR 3, two workers) can stall rAF for seconds.
        { timeout: 20_000 },
      )
      .toBe(8);
    return page.evaluate(() => (window as Window & { __frames?: number[] }).__frames ?? []);
  };

  for (const [label, viewport] of [
    ["desktop", desktop],
    ["390px", { width: 390, height: 844 }],
  ] as const) {
    test(`from deep in a page, the next page starts at the top at once (${label})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await boot(page, "/getting-started.html");
      await page.evaluate(() => window.scrollTo({ top: 1800, behavior: "instant" }));
      await sampleFrames(page, "scrollY");
      // A link that stays in view wherever the page is scrolled.
      await page.evaluate(() => {
        const a = document.createElement("a");
        a.href = "./playground.html";
        a.id = "jump";
        a.textContent = "Playground";
        a.style.cssText =
          "position:fixed;left:8px;bottom:8px;z-index:99;background:#fff;padding:12px";
        document.body.append(a);
      });
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1000);
      await page.locator("#jump").click();
      await onPage(page, "playground");
      const seen = await frames(page);
      for (const y of seen) expect(Math.abs(y), seen.join(", ")).toBeLessThanOrEqual(1);
      expect(await sameDocument(page)).toBe(true);
    });
  }

  test("an anchor on another page is reached at once and stays put", async ({ page }) => {
    await page.setViewportSize(desktop);
    await boot(page, "/getting-started.html");
    await page.evaluate(() => window.scrollTo({ top: 1800, behavior: "instant" }));
    await sampleFrames(
      page,
      "Math.round(document.getElementById('parts')?.getBoundingClientRect().top ?? -1e6)",
    );
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.href = "./theming.html#parts";
      a.id = "jump";
      a.textContent = "Parts";
      a.style.cssText =
        "position:fixed;left:8px;bottom:8px;z-index:99;background:#fff;padding:12px";
      document.body.append(a);
    });
    await page.locator("#jump").click();
    await onPage(page, "theming");
    const seen = await frames(page);
    for (const top of seen) {
      expect(top, seen.join(", ")).toBeGreaterThanOrEqual(0);
      expect(top, seen.join(", ")).toBeLessThan(140);
    }
    expect(Math.max(...seen) - Math.min(...seen), seen.join(", ")).toBeLessThanOrEqual(2);
  });

  test("the logo on the home page scrolls up instead of rebuilding it", async ({ page }) => {
    await page.setViewportSize(desktop);
    // The bare folder URL and ./index.html are the same page.
    await boot(page, "/");
    await expect(page.locator("#hero-player")).toHaveAttribute("data-ready", "");
    await page.locator("#hero-player [data-play]").click();
    await expect(page.locator("#hero-player")).toHaveAttribute("data-state", "playing");
    await page.evaluate(() => {
      (window as Window & { __main?: Element | null }).__main = document.querySelector("main");
      window.scrollTo({ top: 900, behavior: "instant" });
    });
    await page.locator(".nav .brand").click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __main?: Element | null }).__main ===
          document.querySelector("main"),
      ),
    ).toBe(true);
    await expect(page.locator("#hero-player")).toHaveAttribute("data-state", "playing");
    expect(await sameDocument(page)).toBe(true);
  });

  test("going back two entries to a fragment without saved state lands on it", async ({ page }) => {
    await page.setViewportSize(desktop);
    await boot(page, "/getting-started.html");
    // Two fragment entries the router never saw; the second one gets saved when we leave.
    await page.evaluate(() => {
      history.pushState(null, "", "#api");
      history.pushState(null, "", "#own");
    });
    await page.locator(".nav__links a", { hasText: "Components" }).click();
    await onPage(page, "components");
    await page.evaluate(() => history.go(-2));
    await onPage(page, "getting-started");
    await expect(page).toHaveURL(/getting-started\.html#api$/);
    await expect
      .poll(() => page.locator("#api").evaluate((el) => Math.round(el.getBoundingClientRect().top)))
      .toBeLessThan(140);
    const top = await page.locator("#api").evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    await expect(page.locator("#api")).toBeFocused();
    expect(await sameDocument(page)).toBe(true);
  });

  test("a link to another page's anchor lands on the anchor", async ({ page }) => {
    await page.setViewportSize(desktop);
    await boot(page);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.href = "./theming.html#parts";
      a.id = "deep";
      a.textContent = "Parts";
      document.querySelector("main")!.prepend(a);
    });
    await page.locator("#deep").click();
    await onPage(page, "theming");
    await expect(page).toHaveURL(/theming\.html#parts$/);
    const top = await page.locator("#parts").evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(140);
    await expect(page.locator("#parts")).toBeFocused();
    expect(await sameDocument(page)).toBe(true);
  });

  test("deep links still load directly", async ({ page }) => {
    await page.goto("/components.html#c-slider");
    await expect(page.locator("#cx-name")).toHaveText("Slider");
    await page.goto("/getting-started.html#api");
    await expect
      .poll(() => page.locator("#api").evaluate((el) => el.getBoundingClientRect().top))
      .toBeLessThan(140);
  });

  test("search jumps across pages without a reload", async ({ page }) => {
    await page.setViewportSize(desktop);
    await boot(page);
    await page.getByRole("button", { name: "Search the docs" }).click();
    await expect(page.locator("#cmdk")).toHaveClass(/is-open/);
    await page.locator("#cmdk input").fill("slider");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/components\.html#c-slider$/);
    await expect(page.locator("#cx-name")).toHaveText("Slider");
    await expect(page.locator("#cx-tab-slider")).toHaveAttribute("aria-selected", "true");
    // The palette still works on the new page.
    await page.keyboard.press("Control+k");
    await expect(page.locator("#cmdk")).toHaveClass(/is-open/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#cmdk")).not.toHaveClass(/is-open/);
    expect(await sameDocument(page)).toBe(true);
  });

  test("live demos work after navigating to them", async ({ page }) => {
    // Several page swaps in a row: about 40 s in Mobile Safari on a loaded machine.
    test.setTimeout(90_000);
    await page.setViewportSize(desktop);
    await boot(page, "/browser-support.html");
    await page.locator(".nav__links a", { hasText: "Components" }).click();
    await onPage(page, "components");
    await expect(page.locator("#cx-picker .picker__chip")).toHaveCount(11);
    await page.locator("#cx-tab-switch").click();
    await expect(page.locator("#cx-demo glass-switch")).toHaveCount(2);
    await page.locator(".nav__links a", { hasText: "Playground" }).click();
    await onPage(page, "playground");
    await page.locator("#k-refraction").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#o-refraction")).toHaveText("48px");
    await expect(page.locator("#play-code pre[data-panel='html']")).toContainText("refraction: 48");
    await page.locator(".nav .brand").click();
    await onPage(page, "home");
    await expect(page.locator("#hero-player")).toHaveAttribute("data-ready", "");
    await page.locator("#hero-player [data-play]").click();
    await expect(page.locator("#hero-player")).toHaveAttribute("data-state", "playing");
    await page.locator("#highlights").scrollIntoViewIfNeeded();
    await page.locator('.pager__dot[data-to="2"]').click();
    await expect(page.locator('.pager__dot[data-to="2"]')).toHaveAttribute("aria-current", "true");
    expect(await sameDocument(page)).toBe(true);
  });

  test("repeated navigation leaves no extra WebGL contexts, sheets, or players behind", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      const w = window as Window & { __gl?: number };
      w.__gl = 0;
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        const ctx = (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
        if (ctx && /webgl/.test(type)) w.__gl = (w.__gl ?? 0) + 1;
        return ctx;
      } as typeof orig;
    });
    await page.setViewportSize(desktop);
    await boot(page);
    const count = () =>
      page.evaluate(() => ({
        gl: (window as Window & { __gl?: number }).__gl ?? 0,
        sheets: document.querySelectorAll("glass-sheet").length,
        players: document.querySelectorAll("#hero-player").length,
        mains: document.querySelectorAll("main").length,
      }));
    const roundTrip = async () => {
      await page.locator(".nav__links a", { hasText: "Components" }).click();
      await onPage(page, "components");
      await page.locator("#cx-tab-sheet").click();
      await page.locator(".nav .brand").click();
      await onPage(page, "home");
      await expect(page.locator("#hero-player")).toHaveAttribute("data-ready", "");
    };
    // The first trip may create the support probe and the one shared renderer.
    await roundTrip();
    const first = await count();
    expect(first.gl).toBeLessThanOrEqual(2);
    for (let i = 0; i < 5; i++) await roundTrip();
    const after = await count();
    expect(after.gl).toBe(first.gl);
    expect(after.players).toBe(1);
    expect(after.mains).toBe(1);
    // Only the menu sheet is left; the demo sheet left with the components page.
    expect(after.sheets).toBe(1);
    expect(await sameDocument(page)).toBe(true);
  });

  test("the mobile menu navigates in place", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await page.locator("#open-menu").click();
    await expect(page.locator("#menu-sheet")).toHaveAttribute("open", "");
    await page.locator(".menu-links a", { hasText: "Accessibility" }).click();
    await onPage(page, "accessibility");
    await expect(page.locator("#menu-sheet")).not.toHaveAttribute("open", "");
    await expect(page.locator(".menu-links a", { hasText: "Accessibility" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The sheet hands focus back to its button; the new page takes it from there.
    await expect(page.locator("main h1")).toBeFocused();
    expect(await sameDocument(page)).toBe(true);
  });

  test("reduced motion swaps without an entrance animation", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: desktop });
    const page = await context.newPage();
    await boot(page);
    await page.locator(".nav__links a", { hasText: "Guide" }).click();
    await onPage(page, "getting-started");
    await expect(page.locator("main")).not.toHaveClass(/route-enter/);
    const pill = await page
      .locator(".nav__pill")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(pill).toMatch(/^0s/);
    expect(await sameDocument(page)).toBe(true);
    await context.close();
  });

  test("a second click right after the first still wins", async ({ page }) => {
    await page.setViewportSize(desktop);
    await boot(page);
    await page.locator(".nav__links a", { hasText: "Components" }).click();
    await page.locator(".nav__links a", { hasText: "Support" }).click();
    await onPage(page, "browser-support");
    await expect(page).toHaveURL(/browser-support\.html$/);
    await page.waitForTimeout(400);
    await expect(page.locator("body")).toHaveAttribute("data-page", "browser-support");
    await expect(page.locator(".nav__links a[aria-current]")).toHaveText("Support");
    expect(await sameDocument(page)).toBe(true);
  });

  test("a page that fails to load falls back to a normal load", async ({ page }) => {
    await page.setViewportSize(desktop);
    // Every fetch of the page fails; the browser's own navigation still works.
    await page.route("**/playground.html", (route) =>
      route.request().resourceType() === "fetch" ? route.abort() : route.continue(),
    );
    await boot(page);
    await page.locator(".nav__links a", { hasText: "Playground" }).click();
    await onPage(page, "playground");
    expect(await sameDocument(page)).toBe(false);
  });

  test("feedback comes in the same frame as the click", async ({ page }) => {
    await page.setViewportSize(desktop);
    // Hold the next page back until the loading state has been seen, so a
    // fast server or an early prefetch cannot hide it.
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/components.html", async (route) => {
      await gate;
      await route.continue();
    });
    await boot(page);
    await page.evaluate(() => {
      // Runs after the router's capture listener, inside the same task as the click.
      window.addEventListener("click", () => {
        const link = document.querySelector('.nav__links a[href$="components.html"]');
        (window as Window & { __sync?: unknown }).__sync = {
          pending: link?.hasAttribute("data-pending"),
          pill: document.querySelector(".nav__pill")?.hasAttribute("data-on"),
          page: document.body.dataset.page,
        };
      });
    });
    await page.locator(".nav__links a", { hasText: "Components" }).click();
    expect(await page.evaluate(() => (window as Window & { __sync?: unknown }).__sync)).toEqual({
      pending: true,
      pill: true,
      page: "home",
    });
    await expect(page.locator("html")).toHaveAttribute("data-route-loading", "");
    release();
    await onPage(page, "components");
    await expect(page.locator("html")).not.toHaveAttribute("data-route-loading", "");
    await expect(page.locator(".nav__links a[data-pending]")).toHaveCount(0);
  });
});
