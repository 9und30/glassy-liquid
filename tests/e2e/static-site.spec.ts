import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { SITE_URL, sitePages } from "../../docs/src/llms";
// @ts-expect-error plain ESM helper without types
import { serve } from "../tools/static-serve.mjs";

// The built site on a plain static server, the way GitHub Pages serves it: no
// rewrites, no SPA fallback, 404.html for any missing path. The Pages build
// uses the same DOCS_BASE and DOCS_ORIGIN as .github/workflows/docs-pages.yml.
// The relative build is the default `npm run docs:build` at a domain root.
const builds = [
  { name: "relative base", base: "", origin: "", port: 4391, prefix: "/" },
  {
    name: "Pages base",
    base: "/glassy-liquid/",
    origin: SITE_URL.replace(/\/$/, ""),
    port: 4392,
    prefix: "/glassy-liquid/",
  },
];

const pageFiles = sitePages.map(([, href]) => href.replace(/^\.\//, ""));

test.describe.configure({ mode: "serial" });
test.skip(({ browserName }) => browserName !== "chromium", "the build is browser independent");

for (const build of builds) {
  test.describe(`static build, ${build.name}`, () => {
    let server: Server | null = null;
    const origin = `http://127.0.0.1:${build.port}`;
    const site = `${origin}${build.prefix}`;

    test.beforeAll(async () => {
      test.setTimeout(180_000);
      const out = resolve("test-results", `static-${build.port}`);
      execFileSync(
        "npx",
        ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
        {
          env: { ...process.env, DOCS_BASE: build.base, DOCS_ORIGIN: build.origin },
          stdio: "pipe",
        },
      );
      server = (await serve(out, build.port, build.prefix)) as Server;
    });

    test.afterAll(() => {
      server?.close();
    });

    /** Every response of 400 or more and every failed request, except `allow`. */
    const missing = (page: Page, allow: (url: string) => boolean = () => false) => {
      const bad: string[] = [];
      page.on("response", (res) => {
        if (res.status() >= 400 && !res.url().endsWith("/sitemap.xml") && !allow(res.url()))
          bad.push(`${res.status()} ${res.url()}`);
      });
      page.on("requestfailed", (req) => {
        // Prefetches the router cancels when a click wins are not failures.
        if (req.failure()?.errorText === "net::ERR_ABORTED") return;
        bad.push(`failed ${req.url()} ${req.failure()?.errorText}`);
      });
      return bad;
    };

    /** Styles, fonts, and images of the page on screen all arrived. */
    const loaded = async (page: Page) => {
      await page.waitForLoadState("networkidle");
      const state = await page.evaluate(async () => {
        await document.fonts.ready;
        const fonts = [...document.fonts];
        return {
          family: getComputedStyle(document.body).fontFamily,
          fontsLoaded: fonts.filter((f) => f.status === "loaded").length,
          fontErrors: fonts.filter((f) => f.status === "error").map((f) => f.family),
          brokenImages: [...document.images]
            .filter((img) => img.complete && img.naturalWidth === 0 && img.currentSrc)
            .map((img) => img.currentSrc),
          elements: !!customElements.get("glass-button"),
        };
      });
      expect(state.family).toContain("Outfit");
      expect(state.fontsLoaded).toBeGreaterThan(0);
      expect(state.fontErrors).toEqual([]);
      expect(state.brokenImages).toEqual([]);
      expect(state.elements).toBe(true);
    };

    test("navigates in place and every asset resolves", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const bad = missing(page);
      // The bare folder URL, as Pages serves it.
      await page.goto(site);
      await expect(page.locator("#hero-player")).toHaveAttribute("data-ready", "");
      await page.evaluate(() => {
        (window as Window & { __same?: boolean }).__same = true;
      });
      for (const [label, name] of [
        ["Components", "components"],
        ["Playground", "playground"],
        ["Guide", "getting-started"],
        ["Support", "browser-support"],
      ] as const) {
        await page.locator(".nav__links a", { hasText: label }).click();
        await expect(page.locator("body")).toHaveAttribute("data-page", name);
        expect(new URL(page.url()).pathname.startsWith(build.prefix)).toBe(true);
      }
      await page.goBack();
      await expect(page.locator("body")).toHaveAttribute("data-page", "getting-started");
      await page.locator(".nav .brand").click();
      await expect(page.locator("body")).toHaveAttribute("data-page", "home");
      await expect(page.locator("#hero-player")).toHaveAttribute("data-ready", "");
      expect(await page.evaluate(() => (window as Window & { __same?: boolean }).__same)).toBe(
        true,
      );
      expect(bad).toEqual([]);
    });

    test("the footer reaches every page in place", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const bad = missing(page);
      await page.goto(`${site}index.html`);
      const hrefs = await page
        .locator(".nav a, .foot a, .menu-links a")
        .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
      const internal = [...new Set(hrefs.filter((href) => href.startsWith(origin)))];
      for (const href of internal) {
        const path = new URL(href).pathname;
        expect(path.startsWith(build.prefix), href).toBe(true);
        const file = path.slice(build.prefix.length) || "index.html";
        if (file.endsWith(".html")) expect(pageFiles, href).toContain(file);
        else expect((await page.request.get(href)).status(), href).toBe(200);
      }
      for (const file of pageFiles) expect(internal).toContain(`${site}${file}`);
      for (const [label, name] of [
        ["Theming", "theming"],
        ["Accessibility", "accessibility"],
        ["Components", "components"],
        ["Getting started", "getting-started"],
        ["Browser support", "browser-support"],
        ["Playground", "playground"],
      ] as const) {
        await page.locator(".foot__grid a", { hasText: label }).first().click();
        await expect(page.locator("body")).toHaveAttribute("data-page", name);
        expect(page.url().split("#")[0]).toBe(`${site}${name}.html`);
      }
      expect(bad).toEqual([]);
    });

    test("every page opens by deep link with its styles, fonts, and images", async ({ page }) => {
      test.setTimeout(150_000);
      const bad = missing(page);
      for (const file of pageFiles) {
        const res = await page.goto(`${site}${file}`);
        expect(res?.status(), file).toBe(200);
        await loaded(page);
        const alternate = await page.locator('link[rel="alternate"]').evaluate((l) => {
          return (l as HTMLLinkElement).href;
        });
        expect((await page.request.get(alternate)).status(), alternate).toBe(200);
        const canonical = page.locator('link[rel="canonical"]');
        if (build.origin)
          await expect(canonical).toHaveAttribute(
            "href",
            `${SITE_URL}${file === "index.html" ? "" : file}`,
          );
        else await expect(canonical).toHaveCount(0);
      }
      expect(bad).toEqual([]);
    });

    test("deep links and reloads work without rewrites", async ({ page }) => {
      const bad = missing(page);
      await page.goto(`${site}components.html#c-slider`);
      await expect(page.locator("#cx-name")).toHaveText("Slider");
      await page.goto(`${site}theming.html#parts`);
      await expect
        .poll(() => page.locator("#parts").evaluate((el) => el.getBoundingClientRect().top))
        .toBeLessThan(140);
      await page.reload();
      await expect(page.locator("body")).toHaveAttribute("data-page", "theming");
      expect(bad).toEqual([]);
    });

    test("every in-site anchor points at an id on its page", async ({ page }) => {
      test.setTimeout(150_000);
      const wanted = new Map<string, Set<string>>();
      for (const file of pageFiles) {
        await page.goto(`${site}${file}`);
        await page.waitForLoadState("networkidle");
        const hrefs = await page
          .locator("a[href*='#']")
          .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
        for (const href of hrefs) {
          const url = new URL(href);
          if (url.origin !== origin || !url.hash || url.hash === "#") continue;
          const target = url.pathname.slice(build.prefix.length) || "index.html";
          expect(pageFiles, href).toContain(target);
          if (!wanted.has(target)) wanted.set(target, new Set());
          wanted.get(target)!.add(decodeURIComponent(url.hash.slice(1)));
        }
      }
      expect(wanted.size).toBeGreaterThan(3);
      for (const [file, ids] of wanted) {
        await page.goto(`${site}${file}`);
        await page.waitForLoadState("networkidle");
        const absent = await page.evaluate(
          (list) => list.filter((id) => !document.getElementById(id)),
          [...ids],
        );
        expect(absent, file).toEqual([]);
      }
    });

    test("a missing path at any depth gets the styled 404 page", async ({ page }) => {
      test.setTimeout(90_000);
      for (const path of ["missing-page.html", "deep/nested/path/", "components.html/extra"]) {
        const url = `${site}${path}`;
        const bad = missing(page, (u) => u === url);
        const res = await page.goto(url);
        expect(res?.status(), path).toBe(404);
        await expect(page.locator("body")).toHaveAttribute("data-page", "not-found");
        await expect(page.locator("h1")).toHaveText("Nothing behind this glass.");
        await loaded(page);
        expect(bad, path).toEqual([]);
        page.removeAllListeners("response");
        page.removeAllListeners("requestfailed");
      }
      // Under <base>, a fragment link still means this page, not the site folder.
      await page.locator("a.skip").focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${site}components.html/extra#main`);
      await expect(page.locator("body")).toHaveAttribute("data-page", "not-found");
      // The search palette resolves its results against the site, not the deep path.
      await page.goto(`${site}deep/nested/path/`);
      await expect(async () => {
        if (!/is-open/.test((await page.locator("#cmdk").getAttribute("class")) ?? ""))
          await page.keyboard.press("Control+k");
        await expect(page.locator("#cmdk")).toHaveClass(/is-open/, { timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await page.keyboard.type("slider");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${site}components.html#c-slider`);
      await expect(page.locator("#cx-name")).toHaveText("Slider");
      await page.goto(`${site}deep/nested/path/`);
      await page.locator(".not-found a", { hasText: "Components" }).click();
      // The explorer adds the selected component as a fragment.
      await expect(page).toHaveURL(new RegExp(`^${site}components\\.html(#c-[a-z-]+)?$`));
      await expect(page.locator("body")).toHaveAttribute("data-page", "components");
      await page.goto(`${site}deep/nested/path/`);
      await page.locator(".not-found glass-button").click();
      await expect(page).toHaveURL(`${site}index.html`);
      await expect(page.locator("body")).toHaveAttribute("data-page", "home");
    });

    test("serves llms.txt and llms-full.txt, and their links resolve", async ({ page }) => {
      if (build.prefix !== "/") {
        // The project URL without the trailing slash, as typed into an address bar.
        const bare = await page.request.get(`${origin}${build.prefix.replace(/\/$/, "")}`, {
          maxRedirects: 0,
        });
        expect(bare.status()).toBe(301);
      }
      for (const name of ["llms.txt", "llms-full.txt"]) {
        const url = `${site}${name}`;
        const res = await page.request.get(url);
        expect(res.status(), name).toBe(200);
        expect(res.headers()["content-type"]).toContain("text/plain");
        const text = await res.text();
        expect(text).toContain(`Docs site: ${SITE_URL}`);
        const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
        expect(links.length, name).toBeGreaterThan(5);
        for (const link of links) {
          let local: string;
          if (link.startsWith(SITE_URL)) local = `${site}${link.slice(SITE_URL.length)}`;
          else if (/^https?:/.test(link)) continue;
          else local = new URL(link, url).href;
          expect((await page.request.get(local)).status(), `${name}: ${link}`).toBe(200);
        }
      }
      const sitemap = await page.request.get(`${site}sitemap.xml`);
      if (!build.origin) {
        expect(sitemap.status()).toBe(404);
        return;
      }
      expect(sitemap.status()).toBe(200);
      const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
      expect(locs).toHaveLength(pageFiles.length);
      for (const loc of locs) {
        expect(loc.startsWith(SITE_URL), loc).toBe(true);
        const local = `${site}${loc.slice(SITE_URL.length)}`;
        expect((await page.request.get(local)).status(), loc).toBe(200);
      }
      expect(await (await page.request.get(`${site}robots.txt`)).text()).toContain(
        `Sitemap: ${SITE_URL}sitemap.xml`,
      );
    });
  });
}
