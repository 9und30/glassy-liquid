import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { cdnGzipLabel } from "../../scripts/cdn-gzip";

function shotDir(): string | null {
  if (!process.env.DOCS_SCREENSHOTS) return null;
  return path.join("test-results", "docs-screenshots");
}

const pages = [
  { path: "/index.html", name: "home" },
  { path: "/components.html", name: "components" },
  { path: "/playground.html", name: "playground" },
  { path: "/getting-started.html", name: "getting-started" },
  { path: "/theming.html", name: "theming" },
  { path: "/accessibility.html", name: "accessibility" },
  { path: "/browser-support.html", name: "browser-support" },
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/favicon|ResizeObserver loop|WebGL|WEBGL|bench\.json/.test(m.text())) return;
    errors.push(m.text());
  });
  return errors;
}

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => customElements.get("glass-button") !== undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

const glassSelector = [
  "glass-surface",
  "glass-button",
  "glass-switch",
  "glass-slider",
  "glass-tab-bar",
  "glass-tab",
  "glass-segmented",
  "glass-segment",
  "glass-menu",
  "glass-menu-item",
  "glass-toolbar",
  "glass-group",
  "glass-search",
  "glass-sheet",
  "glass-progressive-blur",
  "glass-spacer",
  "now-playing",
].join(", ");

async function axe(page: Page): Promise<string[]> {
  // Glass paints its fill in a shadow layer axe cannot see, so contrast inside a
  // slab is checked by the library's own suite. This run covers the page chrome.
  const results = await new AxeBuilder({ page }).exclude(glassSelector).analyze();
  return results.violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
}

async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = true): Promise<void> {
  const dir = shotDir();
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${name}-${testInfo.project.name}.png`),
    fullPage,
    animations: "disabled",
  });
}

async function noOverflow(page: Page): Promise<{ scroll: number; offenders: string[] }> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const scrollers =
      "pre, .table-scroll, .gallery__track, .picker__scroll, .code__bar, .guide__tabs, .doc__toc, .cmdk__list";
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => {
      if (e.closest(scrollers)) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      return r.right > w + 1 || r.left < -1;
    });
    return {
      scroll: document.documentElement.scrollWidth - w,
      offenders: offenders
        .slice(0, 8)
        .map((e) => `${e.tagName}.${String(e.className).slice(0, 80)}`),
    };
  });
}

test.describe("docs site", () => {
  for (const entry of pages) {
    test(`${entry.name} loads, is accessible, and has no console errors`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(60_000);
      const errors = watchErrors(page);
      await page.goto(entry.path);
      await settle(page);
      expect(errors, errors.join("\n")).toEqual([]);
      const violations = await axe(page);
      expect(violations, violations.join("\n")).toEqual([]);
      await shot(page, testInfo, entry.name);
      if (entry.name === "home") {
        await page.locator("#opener-title").scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await shot(page, testInfo, "home-title");
      }
      if (entry.name === "components") {
        await expect(page.locator("#cx-picker .picker__chip")).toHaveCount(11);
        await page.locator("#cx-tab-switch").click();
        await expect(page.locator("#cx-demo glass-switch")).toHaveCount(2);
        await expect(page.locator('#cx-code pre[data-panel="html"]')).toContainText("glass-switch");
        await page.locator('#cx-code [data-tab="vue"]').click();
        await expect(page.locator('#cx-code pre[data-panel="vue"]')).toBeVisible();
        await expect(page.locator('#cx-code pre[data-panel="vue"]')).toContainText("GlassSwitch");
        await page.locator('#cx-code [data-tab="svelte"]').click();
        await expect(page.locator('#cx-code pre[data-panel="svelte"]')).toContainText(
          "GlassSwitch",
        );
        await page.locator("#cx-tab-switch").focus();
        await page.locator("#cx-tab-switch").press("ArrowRight");
        await expect(page.locator("#cx-name")).toHaveText("Slider");
      }
      if (entry.name === "playground") {
        await expect(page.locator("#play-code pre[data-panel='html']")).toContainText("refraction");
        const slider = page.locator("#k-refraction");
        await slider.focus();
        await page.keyboard.press("End");
        await expect(page.locator("#o-refraction")).toHaveText("48px");
        await expect(page.locator("#play-code pre[data-panel='html']")).toContainText(
          "refraction: 48",
        );
        await page.locator('#play-code [data-tab="react"]').click();
        await expect(page.locator("#play-code pre[data-panel='react']")).toContainText("useGlass");
        await page.locator("#play-code .copy").click();
        await expect(page.locator("#play-code .copy")).toContainText("Copied");
      }
      if (entry.name === "getting-started") {
        await page.locator('[data-tab="vue"]').first().click();
        await expect(page.locator("[data-panel='vue']")).toContainText("glassy-liquid/vue");
        await expect(page.locator("now-playing")).toBeVisible();
      }
      if (entry.name === "theming") {
        await page.locator('[data-accent="#c4622d"]').click();
        await expect(page.locator("#theme-stage")).toHaveAttribute("style", /#c4622d/);
      }
      if (entry.name === "browser-support") {
        await expect(page.locator(".engine")).toHaveCount(3);
        await expect(page.locator("#your-engine")).not.toHaveText(/a renderer/);
      }
    });
  }

  test("home gallery moves between plates", async ({ page }) => {
    await page.goto("/index.html");
    await settle(page);
    await page.locator("#highlights").scrollIntoViewIfNeeded();
    await page.locator('.pager__dot[data-to="2"]').click();
    await expect(page.locator('.pager__dot[data-to="2"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#gallery-track > li")).toHaveCount(4);
  });

  test("the menu sheet covers the page type", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    for (const [width, height] of [
      [390, 844],
      [375, 812],
      [360, 740],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/index.html");
      await settle(page);
      await page.locator("#open-menu").click();
      await expect(page.locator("#menu-sheet")).toHaveAttribute("open", "");
      await page.waitForTimeout(700);
      await expect(page.locator(".menu-links a").first()).toBeVisible();
      const engine = await page.locator("#menu-sheet").evaluate((el) => {
        const host = el.shadowRoot?.querySelector(".sheet");
        const fx = host?.querySelector("gl-fx");
        const fill = fx instanceof HTMLElement ? fx.style.getPropertyValue("--gl-fill") : "";
        const links = el.querySelector(".menu-links");
        const grab = el.shadowRoot?.querySelector(".grab");
        const body = el.shadowRoot?.querySelector(".body");
        const pad = body ? getComputedStyle(body) : null;
        const linksH = links?.getBoundingClientRect().height ?? 0;
        const chrome =
          (grab?.getBoundingClientRect().height ?? 0) +
          (parseFloat(pad?.paddingTop || "") || 0) +
          (parseFloat(pad?.paddingBottom || "") || 0);
        return {
          engine: host instanceof HTMLElement ? (host.dataset.glassEngine ?? "") : "",
          fill,
          slack: (host?.getBoundingClientRect().height ?? 0) - linksH - chrome,
        };
      });
      expect(engine.engine, `${width}`).toBe("css");
      expect(engine.fill.replace(/\s/g, "")).toContain("244,239,230");
      expect(engine.slack, `${width} empty sheet`).toBeLessThan(24);
      const wordmark = await page.locator(".brand__name").innerText();
      expect(wordmark.replace(/\s+/g, " ")).toContain("liquid");
      await shot(page, testInfo, `menu-open-${width}`, false);
    }
  });

  test("hero badge and the install line stay clear down to 320px", async ({ page }) => {
    test.setTimeout(90_000);
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/index.html", "/getting-started.html"]) {
        await page.goto(path);
        await settle(page);
        const issues = await page.evaluate(() => {
          const problems: string[] = [];
          const overlap = (a: DOMRect, b: DOMRect) => {
            const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            return ix > 1 && iy > 1;
          };
          const lens = document.querySelector<HTMLElement>("#hero-lens");
          const badge = document.querySelector<HTMLElement>(".hero__kicker");
          if (lens && badge && overlap(lens.getBoundingClientRect(), badge.getBoundingClientRect()))
            problems.push("lens overlaps volume badge");
          for (const code of document.querySelectorAll<HTMLElement>(".install code")) {
            const text = (code.textContent ?? "").replace(/\s+/g, " ").trim();
            if (text !== "npm install glassy-liquid") problems.push(`install text ${text}`);
            if (code.scrollWidth > code.clientWidth + 1)
              problems.push(`install overflow ${code.scrollWidth - code.clientWidth}`);
            if (code.scrollHeight > code.clientHeight + 1) problems.push("install clipped");
            const copy = code.parentElement?.querySelector<HTMLElement>(":scope > .copy");
            if (!copy) {
              problems.push("install copy missing");
              continue;
            }
            const box = copy.getBoundingClientRect();
            const vw = document.documentElement.clientWidth;
            if (box.width < 40 || box.height < 40) problems.push("copy too small");
            if (box.left < -1 || box.right > vw + 1) problems.push("copy offscreen");
            const range = document.createRange();
            range.selectNodeContents(code);
            if (overlap(range.getBoundingClientRect(), box)) problems.push("copy covers command");
          }
          return problems;
        });
        expect(issues, `${path} @ ${width}: ${issues.join("; ")}`).toEqual([]);
      }
    }
  });

  test("code tabs and Copy stay apart down to 320px", async ({ page }) => {
    test.setTimeout(90_000);
    const paths = ["/playground.html", "/components.html", "/getting-started.html"];
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of paths) {
        await page.goto(path);
        await settle(page);
        const issues = await page.evaluate(() => {
          const problems: string[] = [];
          const vw = document.documentElement.clientWidth;
          const overlap = (a: DOMRect, b: DOMRect) => {
            const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            return ix > 1 && iy > 1;
          };
          for (const bar of document.querySelectorAll<HTMLElement>(".code__bar, .guide__tabs")) {
            const box = bar.getBoundingClientRect();
            if (box.width < 2) continue;
            if (box.right > vw + 1 || box.left < -1) problems.push(`bar outside ${bar.className}`);
            const copy = bar.querySelector<HTMLElement>(":scope > .copy");
            const tabs = [
              ...bar.querySelectorAll<HTMLElement>(
                ":scope > .code__tab, :scope > .code__tabs > .code__tab, :scope > .pill-tab",
              ),
            ];
            const scroller =
              bar.querySelector<HTMLElement>(":scope > .code__tabs") ??
              (bar.classList.contains("guide__tabs") ? bar : null);
            const shown = (el: HTMLElement) => {
              const t = el.getBoundingClientRect();
              if (!scroller) return t;
              const s = scroller.getBoundingClientRect();
              const left = Math.max(t.left, s.left);
              const right = Math.min(t.right, s.right);
              return new DOMRect(left, t.top, Math.max(0, right - left), t.height);
            };
            for (const tab of tabs) {
              if (tab.scrollWidth > tab.clientWidth + 1)
                problems.push(`clipped ${tab.textContent?.trim()}`);
              if (copy && overlap(shown(tab), copy.getBoundingClientRect()))
                problems.push(`overlap ${tab.textContent?.trim()}`);
            }
            if (!scroller) continue;
            const prev = scroller.scrollLeft;
            for (const tab of tabs) {
              const before =
                tab.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
              scroller.scrollLeft = Math.max(0, scroller.scrollLeft + before - 2);
              const t = tab.getBoundingClientRect();
              const s = scroller.getBoundingClientRect();
              if (t.left < s.left - 1 || t.right > s.right + 1)
                problems.push(`cannot reveal ${tab.textContent?.trim()}`);
            }
            scroller.scrollLeft = prev;
          }
          return problems;
        });
        expect(issues, `${path} @ ${width}: ${issues.join("; ")}`).toEqual([]);
      }
    }
  });

  test("the GitHub mark is in the header and stays clear of the wordmark and menu", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    for (const entry of pages) {
      for (const width of [320, 360, 390, 1440]) {
        await page.setViewportSize({ width, height: width >= 1440 ? 900 : 800 });
        await page.goto(entry.path);
        await settle(page);
        const link = page.getByRole("link", { name: "glassy-liquid on GitHub" });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", "https://github.com/9und30/glassy-liquid");
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener");
        const issues = await page.evaluate(() => {
          const problems: string[] = [];
          const overlap = (a: DOMRect, b: DOMRect) => {
            const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            return ix > 1 && iy > 1;
          };
          const link = document.querySelector<HTMLElement>(".nav__github");
          const brand = document.querySelector<HTMLElement>(".brand");
          const name = document.querySelector<HTMLElement>(".brand__name");
          const menu = document.querySelector<HTMLElement>("#open-menu");
          const bar = document.querySelector<HTMLElement>(".nav__bar");
          if (!link || !brand || !name || !menu || !bar) {
            problems.push("header parts missing");
            return problems;
          }
          const box = link.getBoundingClientRect();
          const vw = document.documentElement.clientWidth;
          if (box.width < 44 || box.height < 44) problems.push(`hit ${box.width}x${box.height}`);
          if (box.left < -1 || box.right > vw + 1) problems.push("mark offscreen");
          const range = document.createRange();
          range.selectNodeContents(name);
          const word = range.getBoundingClientRect();
          const mark = brand.querySelector("svg")?.getBoundingClientRect();
          if (overlap(box, word)) problems.push("mark overlaps wordmark");
          if (mark && overlap(box, mark)) problems.push("mark overlaps brand mark");
          const menuStyle = getComputedStyle(menu);
          if (menuStyle.display !== "none" && menuStyle.visibility !== "hidden") {
            const menuBox = menu.getBoundingClientRect();
            if (menuBox.width > 1 && overlap(box, menuBox)) problems.push("mark overlaps menu");
          }
          const svg = link.querySelector("svg");
          if (!svg) problems.push("svg missing");
          else {
            const g = svg.getBoundingClientRect();
            const ratio = g.width / g.height;
            if (Math.abs(ratio - 98 / 96) > 0.02) problems.push(`aspect ${ratio.toFixed(3)}`);
            const fill = svg.querySelector("path")?.getAttribute("fill");
            if (fill !== "currentColor") problems.push(`fill ${fill}`);
          }
          const barBox = bar.getBoundingClientRect();
          if (barBox.right > vw + 1 || barBox.left < -1) problems.push("bar offscreen");
          if (word.right > box.left - 1) problems.push("wordmark runs into the mark");
          return problems;
        });
        expect(issues, `${entry.name} @ ${width}: ${issues.join("; ")}`).toEqual([]);
      }
    }
  });

  test("command palette opens and jumps to a component", async ({ page }) => {
    await page.goto("/index.html");
    await settle(page);
    await expect(async () => {
      if (!/is-open/.test((await page.locator("#cmdk").getAttribute("class")) ?? ""))
        await page.keyboard.press("Control+k");
      await expect(page.locator("#cmdk")).toHaveClass(/is-open/, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.locator("#cmdk input")).toBeFocused();
    await page.keyboard.type("slider");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/components\.html#c-slider$/);
    await expect(page.locator("#cx-name")).toHaveText("Slider");
    await expect(page.locator("#cx-tab-slider")).toHaveAttribute("aria-selected", "true");
  });

  test("search answers full questions", async ({ page }) => {
    test.skip(test.info().project.name !== "chromium", "query ranking is checked once");
    // About 30 queries through the palette: close to the default 30 s on a loaded machine.
    test.setTimeout(90_000);
    const queries: Array<[string, string]> = [
      ["how do I change the blur", "blur"],
      ["dark mode", "Appearance"],
      ["safari", "Browser support"],
      ["safari fallback", "Browser support"],
      ["which browsers", "Browser support"],
      ["bundle size", "Bundle size"],
      ["gzip", "Bundle size"],
      ["slider onchange", "Slider events"],
      ["slider event", "Slider events"],
      ["onValueChange", "Slider events"],
      ["keyboard", "Accessibility"],
      ["next.js", "Next.js and server rendering"],
      ["ssr", "Next.js and server rendering"],
      ["support", "Browser support"],
      ["size", "Bundle size"],
      ["blur", "blur"],
      ["change", "blur"],
    ];
    await page.goto("/index.html");
    await settle(page);
    for (const [query, label] of queries) {
      await page.getByRole("button", { name: "Search the docs" }).click();
      await expect(page.locator("#cmdk")).toHaveClass(/is-open/);
      await page.locator("#cmdk input").fill(query);
      await expect(page.locator("#cmdk .cmdk__item").first()).toContainText(label);
      if (["support", "change", "size", "blur"].includes(query)) {
        const rows = await page
          .locator("#cmdk .cmdk__item")
          .evaluateAll((els) => els.map((el) => el.childNodes[0]?.textContent ?? ""));
        expect(rows[0], query).toBe(label);
        for (const unrelated of ["Menu", "Sheet", "Scroll edge"]) {
          expect(rows, query).not.toContain(unrelated);
        }
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("#cmdk")).not.toHaveClass(/is-open/);
    }
  });

  test("static HTML includes every snippet, llms.txt, and robots.txt", async ({ page }) => {
    test.skip(test.info().project.name !== "chromium", "the HTML transform is checked once");
    const components = await (await page.request.get("/components.html")).text();
    expect(components).toContain('id="all-snippets"');
    expect(components).toContain("export function WifiSwitch");
    expect(components).toContain("import { useState }");
    expect(components).toContain(".open = true");
    expect(components).toContain("onValueChange");
    expect(components).not.toContain("<svg />");
    expect(components).toContain("<svg");
    const playground = await (await page.request.get("/playground.html")).text();
    expect(playground).toContain("use client");
    expect(playground).toContain("width: 280px");
    expect(playground).toContain("height: 168px");
    const llms = await (await page.request.get("/llms.txt")).text();
    expect(llms).toContain("npm install glassy-liquid");
    expect(llms).toContain("glassy-liquid/cdn");
    expect(llms).toContain("Every entry point is safe to import on the server.");
    expect(llms).toContain("glass-switch");
    const full = await (await page.request.get("/llms-full.txt")).text();
    expect(full.length).toBeGreaterThan(llms.length);
    expect(full).toContain("export function Volume");
    const robots = await (await page.request.get("/robots.txt")).text();
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("DOCS_ORIGIN");
    expect((await page.request.get("/sitemap.xml")).status()).toBe(404);
    const started = await (await page.request.get("/getting-started.html")).text();
    expect(started).toContain("Iceberg_reflection");
    expect(started).toContain('id="ssr"');
    expect(started).toContain("Every entry point is safe to import on the server.");
    expect(started).not.toContain("/wallpaper.jpg");
    expect(started).not.toContain("/photo.jpg");
    expect(started).toContain("class NowPlaying");
    expect(started).toContain('rel="alternate"');
    expect(started).toContain('href="llms.txt"');
    expect(started).toContain('href="./llms.txt"');
    expect(llms.split("## Export map")[0] ?? "").toContain("<glass-button");
    expect(llms).toContain("glassy-liquid/components/*");
    expect(llms).toContain("glassy-liquid/scene");
    expect(llms).toContain("glassy-liquid/package.json");
    const fullNow = await (await page.request.get("/llms-full.txt")).text();
    expect(fullNow).toContain("class NowPlaying");
    const home = await (await page.request.get("/index.html")).text();
    expect(home).toContain(cdnGzipLabel());
    expect(home).not.toContain("{{cdn-gzip}}");
    expect(home).not.toContain("34.0 kB");
    const theming = await (await page.request.get("/theming.html")).text();
    expect(theming).toContain('id="sheet"');
    expect(theming).toContain("glass-sheet::part(glass)");
    const browsers = await (await page.request.get("/browser-support.html")).text();
    expect(browsers).toContain("Safari 16.4+");
    expect(browsers).toContain("Firefox 103+");
  });

  test("the gzip tile matches the hero after scripts run", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "Chromium and WebKit load the homepage script");
    const label = cdnGzipLabel();
    const bench = page.waitForResponse((res) => res.url().includes("/bench.json") && res.ok());
    await page.goto("/index.html");
    const body = (await (await bench).json()) as { metrics: Array<{ value: string }> };
    expect(body.metrics[0]?.value).toBe(label);
    const tile = page.locator('[data-metric="0"] .measures__value');
    const hero = page.locator(".index span", { hasText: "gzip" });
    await expect(tile).toHaveText(label);
    await expect(hero).toContainText(label);
    expect(await hero.textContent()).toContain(label);
    expect(await tile.textContent()).toBe(label);
    await expect(page.locator('[data-metric="1"] .measures__value')).toHaveText("99 ms");
    await expect(page.locator('[data-metric="2"] .measures__value')).toHaveText("60 fps");
    await expect(page.locator('[data-metric="3"] .measures__value')).toHaveText("60 fps");
  });

  test("glass() is fully inside the guide nav", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto("/getting-started.html");
      await settle(page);
      const link = page.locator('.doc__toc a[href="#api"]');
      await expect(link).toHaveText("glass()");
      const clipped = await link.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        let node: HTMLElement | null = el.parentElement;
        let cut = false;
        while (node) {
          const overflow = getComputedStyle(node).overflowX;
          if (
            overflow === "hidden" ||
            overflow === "clip" ||
            overflow === "scroll" ||
            overflow === "auto"
          ) {
            const box = node.getBoundingClientRect();
            if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5) cut = true;
          }
          node = node.parentElement;
        }
        return {
          cut,
          left: rect.left,
          right: rect.right,
          width: document.documentElement.clientWidth,
        };
      });
      expect(clipped.cut, `clipped at ${width}`).toBe(false);
      expect(clipped.left).toBeGreaterThanOrEqual(0);
      expect(clipped.right).toBeLessThanOrEqual(clipped.width + 0.5);
    }
  });

  test("the component list shows 04 Slider at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/components.html");
    await settle(page);
    const chip = page.getByRole("tab", { name: /04\s+Slider/ });
    const picker = page.locator("#cx-picker");
    const box = await chip.boundingBox();
    const frame = await picker.boundingBox();
    expect(box).not.toBeNull();
    expect(frame).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(frame!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
  });

  test("slider events are open and name the framework callbacks", async ({ page }) => {
    test.skip(test.info().project.name !== "chromium", "the events table is checked once");
    await page.goto("/components.html#c-slider");
    await settle(page);
    await expect(page.locator("#cx-name")).toHaveText("Slider");
    await expect(page.locator("#cx-props-wrap")).toHaveAttribute("open", "");
    await expect(page.locator("#cx-props")).toContainText("onValueChange");
    await expect(page.locator("#cx-props")).toContainText("onValueCommit");
    await expect(page.locator("#cx-props")).toContainText("@value-change");
  });

  for (const width of [375, 390]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const height = width === 375 ? 812 : 844;
      await page.setViewportSize({ width, height });
      for (const entry of pages) {
        await page.goto(entry.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);
        const overflow = await noOverflow(page);
        expect(overflow.scroll, `${entry.name} scroll`).toBeLessThanOrEqual(1);
        expect(overflow.offenders, `${entry.name} offenders`).toEqual([]);
        if (testInfo.project.name === "mobile-safari" || testInfo.project.name === "chromium") {
          await shot(page, testInfo, `${entry.name}-${width}`);
        }
      }
    });
  }
});
