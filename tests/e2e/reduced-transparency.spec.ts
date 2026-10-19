import { expect, test, type Page } from "@playwright/test";

/**
 * `prefers-reduced-transparency: reduce` (macOS "Reduce transparency") turns
 * the glass opaque. Text and icons on it have to follow the opaque fill, in
 * either appearance and for both materials. Playwright has no option for this
 * media feature, so Chromium sets it through CDP. Other browsers skip.
 */
async function reduceTransparency(page: Page, browserName: string): Promise<void> {
  test.skip(browserName !== "chromium", "only Chromium can emulate prefers-reduced-transparency");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-transparency", value: "reduce" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
}

async function settle(page: Page, ready: string): Promise<void> {
  await page.waitForFunction((tag) => customElements.get(tag) !== undefined, ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches),
  ).toBe(true);
}

interface Probe {
  name: string;
  box: [number, number, number, number];
  floor: number;
}

/**
 * Every text run and icon on glass (inside an element with a glass engine,
 * or on the segmented track) that is visible and enabled. Text needs 4.5:1,
 * icons 3:1 (WCAG 1.4.11).
 */
function collectProbes(page: Page, fullPage: boolean): Promise<Probe[]> {
  return page.evaluate((fullPage) => {
    const probes: Array<{
      name: string;
      box: [number, number, number, number];
      floor: number;
    }> = [];
    const onGlass = (el: Element) =>
      el.closest("[data-glass-engine], glass-segmented, glass-menu, glass-sheet") &&
      !el.closest("[disabled], [aria-disabled=true], [hidden], .lens, .hero__engine");
    const visible = (r: DOMRect) =>
      r.width > 2 &&
      r.height > 2 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.left < innerWidth &&
      (fullPage || (r.top >= 0 && r.bottom <= innerHeight));
    // Scrolled out of a clipping box, or covered by something else (an open sheet).
    const clipped = (owner: Element, r: DOMRect) => {
      for (let el = owner.parentElement; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const c = el.getBoundingClientRect();
        if (
          r.top < c.top - 1 ||
          r.bottom > c.bottom + 1 ||
          r.left < c.left - 1 ||
          r.right > c.right + 1
        )
          return true;
      }
      if (r.bottom > innerHeight) return false;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && !hit.contains(owner) && !owner.contains(hit) && !hit.closest(".nav__pill");
    };
    const add = (owner: Element, r: DOMRect, name: string, floor: number) => {
      if (
        !visible(r) ||
        !owner.checkVisibility({ opacityProperty: true, visibilityProperty: true }) ||
        clipped(owner, r)
      )
        return;
      owner.setAttribute("data-rt-probe", "");
      probes.push({
        name,
        box: fullPage
          ? [r.x + scrollX, r.y + scrollY, r.width, r.height]
          : [r.x, r.y, r.width, r.height],
        floor,
      });
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      const text = n.textContent!.trim();
      if (!parent || !text || !onGlass(parent) || parent.closest("svg, script, style")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      // Menu section headers and destructive items use the iOS secondary label
      // and system red. They sit near 3.6:1 on white glass too, so they get the
      // 3:1 floor. A white-on-white label is around 1.1:1 either way.
      const muted = parent.closest("glass-menu-label, glass-menu-item[destructive]");
      for (const r of range.getClientRects())
        add(parent, r, `"${text.slice(0, 24)}"`, muted ? 3 : 4.5);
    }
    for (const svg of document.querySelectorAll("svg")) {
      if (!onGlass(svg) || svg.closest("[data-rt-probe]")) continue;
      add(
        svg,
        svg.getBoundingClientRect(),
        `icon in ${svg.parentElement!.className || svg.parentElement!.localName}`,
        3,
      );
    }
    return probes;
  }, fullPage);
}

/**
 * Captures the page twice, with the probed content and without it, and
 * compares the ink (strongest pixel that differs from the empty background)
 * with the background behind it. Opacity, text shadows, and fills all count
 * because only rendered pixels are measured.
 */
async function lowContrast(page: Page, label: string, fullPage = true): Promise<string[]> {
  const probes = await collectProbes(page, fullPage);
  expect(probes.length, `${label}: nothing to measure`).toBeGreaterThan(0);
  const full = await page.screenshot({ fullPage });
  const hide = await page.addStyleTag({
    content:
      "[data-rt-probe],[data-rt-probe] *{color:transparent!important;text-shadow:none!important;fill:transparent!important;stroke:transparent!important}",
  });
  await page.waitForTimeout(200);
  const bare = await page.screenshot({ fullPage });
  await hide.evaluate((s) => (s as Element).remove());
  const ratios = await page.evaluate(
    async ({ full, bare, probes, fullPage }) => {
      const load = async (data: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const width = fullPage ? document.documentElement.scrollWidth : innerWidth;
        return { ctx, scale: img.width / width };
      };
      const a = await load(full);
      const b = await load(bare);
      const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum = (d: Uint8ClampedArray, i: number) =>
        0.2126 * lin(d[i]!) + 0.7152 * lin(d[i + 1]!) + 0.0722 * lin(d[i + 2]!);
      const ratio = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      return probes.map(({ box }) => {
        const [x, y, w, h] = box.map((v) => Math.round(v * a.scale)) as [
          number,
          number,
          number,
          number,
        ];
        const ink = a.ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data;
        const ground = b.ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data;
        const bg: number[] = [];
        for (let i = 0; i < ground.length; i += 4) bg.push(lum(ground, i));
        bg.sort((p, q) => p - q);
        const median = bg[bg.length >> 1]!;
        const contrast: number[] = [];
        for (let i = 0; i < ink.length; i += 4) contrast.push(ratio(lum(ink, i), median));
        contrast.sort((p, q) => p - q);
        // The 99th percentile skips stray edge pixels but still lands inside a glyph stroke.
        return contrast[Math.floor(contrast.length * 0.99)]!;
      });
    },
    { full: full.toString("base64"), bare: bare.toString("base64"), probes, fullPage },
  );
  await page.evaluate(() =>
    document.querySelectorAll("[data-rt-probe]").forEach((e) => e.removeAttribute("data-rt-probe")),
  );
  return probes
    .map((p, i) => ({ ...p, ratio: ratios[i]! }))
    .filter((p) => p.ratio < p.floor)
    .map((p) => `${label} ${p.name}: ${p.ratio.toFixed(2)} < ${p.floor}`);
}

test.describe("reduced transparency", () => {
  test.use({ viewport: { width: 420, height: 900 } });

  test("component labels and icons stay readable on the opaque material", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await reduceTransparency(page, browserName);
    const failures: string[] = [];
    for (const material of ["regular", "clear"]) {
      for (const appearance of ["light", "dark"]) {
        await page.goto(`/fixtures/components.html?appearance=${appearance}&bg=lake`);
        await settle(page, "glass-sheet");
        if (material === "clear")
          await page.evaluate(() =>
            document
              .querySelectorAll("#phone glass-surface, #phone glass-button, #phone glass-tab-bar")
              .forEach((el) => el.setAttribute("material", "clear")),
          );
        await page.waitForTimeout(300);
        failures.push(...(await lowContrast(page, `components ${material}/${appearance}`)));

        await page.goto(`/fixtures/components2.html?appearance=${appearance}`);
        await settle(page, "glass-sheet");
        if (material === "clear")
          await page.evaluate(() =>
            document
              .querySelectorAll("glass-toolbar, glass-button, glass-search, glass-sheet")
              .forEach((el) => el.setAttribute("material", "clear")),
          );
        await page.click("#menu glass-button[slot=trigger]");
        await page.waitForTimeout(500);
        failures.push(...(await lowContrast(page, `menu ${material}/${appearance}`)));
        await page.keyboard.press("Escape");
        await page.click("#opensheet");
        await page.waitForTimeout(800);
        failures.push(...(await lowContrast(page, `sheet ${material}/${appearance}`)));
      }
    }
    expect(failures).toEqual([]);
  });

  test("the plain parts stay transparent and nothing runs a backdrop filter", async ({
    page,
    browserName,
  }) => {
    await reduceTransparency(page, browserName);
    await page.goto("/fixtures/components2.html");
    await settle(page, "glass-sheet");
    const layers = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-glass-engine]")].map((el) => {
        const b = el.shadowRoot?.querySelector("gl-fx > .b") ?? el.querySelector("gl-fx > .b");
        const cs = getComputedStyle(b!);
        return {
          name: `${el.localName}${el.getAttribute("variant") ? `[${el.getAttribute("variant")}]` : ""}`,
          fill: cs.backgroundColor,
          filter: cs.backdropFilter,
        };
      }),
    );
    expect(layers.length).toBeGreaterThan(4);
    for (const layer of layers) {
      expect(layer.filter, layer.name).toBe("none");
      if (layer.name === "glass-button[plain]")
        expect(layer.fill, layer.name).toBe("rgba(0, 0, 0, 0)");
      else expect(layer.fill, layer.name).toMatch(/^rgb\(/);
    }
  });
});

test.describe("reduced transparency on the docs site", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("home: nav, player, and lens", async ({ page, browserName }) => {
    test.setTimeout(60_000);
    await reduceTransparency(page, browserName);
    await page.goto("/index.html");
    await settle(page, "glass-surface");
    const failures = await lowContrast(page, "home");
    await page.click("[data-queue-toggle]");
    await page.waitForTimeout(400);
    failures.push(...(await lowContrast(page, "home queue")));
    await page.evaluate(() => scrollTo(0, 1200));
    await page.waitForTimeout(600);
    failures.push(...(await lowContrast(page, "home scrolled")));
    expect(failures).toEqual([]);
  });

  test("playground, light and dark, regular and clear", async ({ page, browserName }) => {
    test.setTimeout(60_000);
    await reduceTransparency(page, browserName);
    await page.goto("/playground.html");
    await settle(page, "glass-surface");
    const failures: string[] = [];
    for (const material of ["regular", "clear"]) {
      for (const appearance of ["light", "dark"]) {
        await page.click(`[data-choice=material][data-value=${material}]`);
        await page.click(`[data-choice=appearance][data-value=${appearance}]`);
        await page.waitForTimeout(400);
        failures.push(...(await lowContrast(page, `playground ${material}/${appearance}`)));
      }
    }
    expect(failures).toEqual([]);
  });

  test("components page, every demo", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await reduceTransparency(page, browserName);
    await page.goto("/components.html");
    await settle(page, "glass-surface");
    const failures: string[] = [];
    const chips = page.locator(".picker__chip");
    const count = await chips.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) {
      await chips.nth(i).click();
      await page.locator("#cx-demo").scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      failures.push(
        ...(await lowContrast(
          page,
          `components ${await chips.nth(i).getAttribute("data-id")}`,
          false,
        )),
      );
    }
    expect(failures).toEqual([]);
  });
});

test("without the preference the glass stays translucent", async ({ page }) => {
  await page.goto("/fixtures/components.html?appearance=dark");
  await page.waitForFunction(() => customElements.get("glass-sheet") !== undefined);
  await page.waitForTimeout(400);
  const surface = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("#phone glass-surface")!;
    const fx = el.shadowRoot!.querySelector<HTMLElement>("gl-fx")!;
    return {
      solid: fx.style.getPropertyValue("--gl-solid"),
      fill: getComputedStyle(fx.querySelector(".b")!).backgroundColor,
      fg: el.style.getPropertyValue("--gl-fg"),
    };
  });
  expect(surface.solid).toBe("");
  expect(surface.fill).toMatch(/^rgba\(.*, 0\.\d+\)$/);
  expect(surface.fg).toBe("rgba(255,255,255,0.94)");
});
