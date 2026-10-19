import { expect, test, type Page } from "@playwright/test";
import { SCENE_PHOTO } from "../../docs/src/scene-photo";
import * as esbuild from "esbuild";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile as compileSvelte } from "svelte/compiler";
import { compileScript, parse } from "vue/compiler-sfc";
import { browserSnippetIds } from "../readme/snippets";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readme = readFileSync(resolve(root, "README.md"), "utf8");

function fence(id: string): { lang: string; code: string } {
  for (const match of readme.matchAll(/```([a-z0-9]+)\n([\s\S]*?)```/g)) {
    if (new RegExp(`snippet:\\s*${id}\\b`).test(match[2]!))
      return { lang: match[1]!, code: match[2]! };
  }
  throw new Error(`README is missing snippet ${id}`);
}

const resolveJs: esbuild.Plugin = {
  name: "resolve-js-to-ts",
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer || args.importer.includes("node_modules")) return null;
      const ts = resolve(dirname(args.importer), args.path.replace(/\.js$/, ".ts"));
      if (existsSync(ts)) return { path: ts };
      return null;
    });
  },
};

const sveltePlugin: esbuild.Plugin = {
  name: "svelte",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, (args) => {
      const compiled = compileSvelte(readFileSync(args.path, "utf8"), {
        filename: args.path,
        generate: "client",
        css: "injected",
      });
      return { contents: compiled.js.code, loader: "js", resolveDir: dirname(args.path) };
    });
  },
};

const svelteIndex: esbuild.Plugin = {
  name: "svelte-index",
  setup(build) {
    const names = readdirSync(resolve(root, "src/svelte/components"))
      .filter((file) => file.endsWith(".svelte"))
      .map((file) => file.replace(/\.svelte$/, ""));
    const contents = [
      ...names.map((name) => `export { default as ${name} } from "./components/${name}.svelte";`),
      'export * from "./actions.ts";',
      "",
    ].join("\n");
    build.onResolve({ filter: /^glassy-liquid\/svelte$/ }, () => ({
      path: "glassy-liquid/svelte",
      namespace: "svelte-index",
    }));
    build.onLoad({ filter: /.*/, namespace: "svelte-index" }, () => ({
      contents,
      loader: "js",
      resolveDir: resolve(root, "src/svelte"),
    }));
  },
};

async function bundle(
  entry: string,
  loader: esbuild.Loader,
  extra: esbuild.Plugin[] = [],
): Promise<string> {
  const result = await esbuild.build({
    stdin: { contents: entry, loader, resolveDir: root, sourcefile: "readme-snippet." + loader },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [resolveJs, sveltePlugin, svelteIndex, ...extra],
    alias: {
      "glassy-liquid/react": resolve(root, "src/react/index.ts"),
      "glassy-liquid/vue": resolve(root, "src/vue/index.ts"),
      "glassy-liquid/svelte/actions": resolve(root, "src/svelte/actions.ts"),
      "glassy-liquid/elements": resolve(root, "src/elements.ts"),
      "glassy-liquid": resolve(root, "src/index.ts"),
    },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  return result.outputFiles[0]!.text;
}

async function open(page: Page, html: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*Iceberg_reflection*", (route) =>
    route.fulfill({
      path: resolve(root, "docs/public/img/glacier.webp"),
      contentType: "image/webp",
    }),
  );
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(250);
  return errors;
}

function pageHtml(body: string, script = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;
}

async function mountReact(code: string, component: string): Promise<string> {
  const entry = `${code}\nimport { createRoot } from "react-dom/client";\nimport { createElement } from "react";\ncreateRoot(document.getElementById("root")).render(createElement(${component}));\n`;
  return bundle(entry, "tsx");
}

test.describe("README snippets", () => {
  test.describe.configure({ timeout: 60_000 });
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "snippet execution is checked once, in Chromium",
  );

  test("every browser snippet id has a fence", () => {
    for (const id of browserSnippetIds) fence(id);
  });

  test("quick start upgrades a scene and a prominent button", async ({ page }) => {
    const { code } = fence("quick-start");
    const markup = code.replace(/<script[\s\S]*?<\/script>/g, "");
    const script = await bundle('import "glassy-liquid/elements";\n', "ts");
    const errors = await open(page, pageHtml(markup, script));
    await expect(page.locator("glass-button")).toHaveText("Continue");
    expect(await page.locator("glass-button").evaluate((el) => el.shadowRoot !== null)).toBe(true);
    await expect(page.locator("glass-scene")).toHaveAttribute("src", SCENE_PHOTO);
    await expectFullHeightScene(page);
    expect(errors).toEqual([]);
  });

  test("CDN bundle registers the elements", async ({ page }) => {
    const file = resolve(root, "dist/glassy-liquid.min.js");
    expect(
      existsSync(file),
      "run npm run build so the CDN snippet can load dist/glassy-liquid.min.js",
    ).toBe(true);
    const { code } = fence("cdn");
    await page.route(
      "https://cdn.jsdelivr.net/npm/glassy-liquid@0.1/dist/glassy-liquid.min.js",
      (route) => route.fulfill({ path: file, contentType: "text/javascript" }),
    );
    const errors = await open(page, pageHtml(code));
    await page.waitForFunction(() => customElements.get("glass-surface") !== undefined);
    await expect(page.locator("glass-surface")).toContainText("Hello, glass.");
    expect(await page.locator("glass-surface").evaluate((el) => el.shadowRoot !== null)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("scene markup upgrades both backdrops", async ({ page }) => {
    const { code } = fence("scenes");
    const script = await bundle('import "glassy-liquid/elements";\n', "ts");
    const errors = await open(page, pageHtml(code, script));
    await expect(page.locator("glass-scene")).toHaveCount(2);
    await expect(page.locator("glass-surface")).toHaveAttribute("radius", "capsule");
    expect(errors).toEqual([]);
  });

  test("glass() paints a card and reports an engine", async ({ page }) => {
    const { code } = fence("glass-api");
    const script = await bundle(
      `${code}\nglobalThis.__readme = { engine: surface.engine };\n`,
      "ts",
    );
    const errors = await open(
      page,
      pageHtml('<div class="card" style="width:220px;height:80px">Card</div>', script),
    );
    const engine = await page.evaluate(
      () => (globalThis as { __readme?: { engine?: string } }).__readme?.engine,
    );
    expect(["backdrop", "scene-gl", "scene-dom", "css"]).toContain(engine);
    expect(errors).toEqual([]);
  });

  test("custom element example defines now-playing", async ({ page }) => {
    const { code } = fence("custom-element");
    const script = await bundle(code, "ts");
    const errors = await open(page, pageHtml("", script));
    await expect(page.locator("now-playing")).toContainText("Caustic Hour");
    expect(await page.locator("now-playing").evaluate((el) => el.shadowRoot !== null)).toBe(true);
    const hostile = await page.evaluate(() => {
      const el = document.createElement("now-playing");
      el.id = "hostile";
      el.setAttribute("title", "<img src=x onerror=alert(1)>");
      document.body.append(el);
      const title = el.shadowRoot?.querySelector("b");
      return { text: title?.textContent ?? "", img: el.shadowRoot?.querySelector("img") != null };
    });
    expect(hostile.text).toBe("<img src=x onerror=alert(1)>");
    expect(hostile.img).toBe(false);
    expect(errors).toEqual([]);
  });

  test("theme custom properties apply", async ({ page }) => {
    const { code } = fence("theme");
    const errors = await open(
      page,
      pageHtml(`<style>${code}</style><script>
      const cs = getComputedStyle(document.documentElement);
      document.documentElement.dataset.accent = cs.getPropertyValue("--glass-accent").trim();
      document.documentElement.dataset.appearance = cs.getPropertyValue("--glass-appearance").trim();
    </script>`),
    );
    await expect(page.locator("html")).toHaveAttribute("data-accent", "#0a84ff");
    await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
    expect(errors).toEqual([]);
  });

  test("Vue custom-element predicate classifies glass tags", async ({ page }) => {
    const { code } = fence("vue-custom-element");
    const script = await bundle(
      `${code}
      const fn = vuePluginOptions.template.compilerOptions.isCustomElement;
      document.documentElement.dataset.glass = String(fn("glass-button"));
      document.documentElement.dataset.div = String(fn("div"));
    `,
      "ts",
    );
    const errors = await open(page, pageHtml("", script));
    await expect(page.locator("html")).toHaveAttribute("data-glass", "true");
    await expect(page.locator("html")).toHaveAttribute("data-div", "false");
    expect(errors).toEqual([]);
  });

  test("React settings render a switch and a button", async ({ page }) => {
    const script = await mountReact(fence("react-settings").code, "Settings");
    const errors = await open(page, pageHtml('<div id="root"></div>', script));
    await expect(page.locator("glass-switch")).toHaveAttribute("aria-label", "Wi-Fi");
    await expect(page.locator("glass-button")).toHaveText("Done");
    await expectBoundLevel(page);
    await expectFullHeightScene(page);
    expect(errors).toEqual([]);
  });

  test("useGlass turns a div into glass", async ({ page }) => {
    const script = await mountReact(fence("use-glass").code, "Card");
    const errors = await open(page, pageHtml('<div id="root"></div>', script));
    await expect(page.locator(".card")).toHaveText("Card");
    const engine = await page.locator(".card").getAttribute("data-glass-engine");
    expect(["backdrop", "scene-gl", "scene-dom", "css"]).toContain(engine);
    expect(errors).toEqual([]);
  });

  test("migration example renders a glass surface", async ({ page }) => {
    const script = await mountReact(fence("migrate").code, "ClickMe");
    const errors = await open(page, pageHtml('<div id="root"></div>', script));
    await expect(page.locator("glass-surface")).toContainText("Click Me");
    expect(await page.locator("glass-surface").evaluate((el) => el.shadowRoot !== null)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("Vue example renders the same controls", async ({ page }) => {
    const source = fence("vue-settings").code;
    const parsed = parse(source, { filename: "App.vue" });
    const script = compileScript(parsed.descriptor, { id: "readme-vue", inlineTemplate: true });
    const entry = `${script.content.replace("export default", "const __sfc =")}
      import { createApp } from "vue";
      createApp(__sfc).mount("#root");
    `;
    const bundled = await bundle(entry, "ts");
    const errors = await open(page, pageHtml('<div id="root"></div>', bundled));
    await expect(page.locator("glass-switch")).toHaveAttribute("aria-label", "Wi-Fi");
    await expect(page.locator("glass-button")).toHaveText("Done");
    await expectBoundLevel(page);
    await expectFullHeightScene(page);
    expect(errors).toEqual([]);
  });

  test("Svelte components render a switch and a slider", async ({ page }) => {
    await mountSvelte(page, fence("svelte-settings").code, "glass-switch");
    await expectBoundLevel(page);
    await expectFullHeightScene(page);
  });

  test("Svelte actions render a switch and a glass card", async ({ page }) => {
    await mountSvelte(page, fence("svelte-actions").code, "glass-switch");
    await expect(page.locator(".card")).toHaveText("Glass card");
  });
});

// The framework quick starts are a whole screen. Without a height the scene is
// only as tall as its controls, and the rest of the page stays blank.
async function expectFullHeightScene(page: Page): Promise<void> {
  const { scene, viewport } = await page.evaluate(() => ({
    scene: document.querySelector("glass-scene")!.getBoundingClientRect().height,
    viewport: innerHeight,
  }));
  expect(scene).toBeGreaterThanOrEqual(viewport);
}

async function expectBoundLevel(page: Page): Promise<void> {
  const readout = page.locator(".readout");
  await expect(readout).toHaveText("on 50");
  await expect(page.locator("glass-switch")).toHaveJSProperty("checked", true);
  await expect(page.locator("glass-slider")).toHaveJSProperty("value", 50);
  await page.locator("glass-slider").evaluate((el) => {
    const node = el as HTMLElement & { value: number };
    node.value = 80;
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(readout).toHaveText("on 80");
  await page.locator("glass-switch").evaluate((el) => {
    const node = el as HTMLElement & { checked: boolean };
    node.checked = false;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(readout).toHaveText("off 80");
}

const slotMarkup = {
  vue: `<script setup lang="ts">
import { GlassButton, GlassMenu, GlassMenuItem } from "glassy-liquid/vue";
</script>
<template>
  <GlassButton>
    <template #icon><svg class="ico"></svg></template>
    Save
    <template #trailing><span class="tr">S</span></template>
  </GlassButton>
  <GlassMenu>
    <template #trigger><button class="trig" type="button">Open</button></template>
    <GlassMenuItem>
      Copy
      <template #shortcut><span class="sc">C</span></template>
    </GlassMenuItem>
  </GlassMenu>
</template>`,
  react: `import { GlassButton, GlassMenu, GlassMenuItem } from "glassy-liquid/react";
export function Slots() {
  return (
    <>
      <GlassButton>
        <svg slot="icon" className="ico" />
        Save
        <span slot="trailing" className="tr">S</span>
      </GlassButton>
      <GlassMenu>
        <button slot="trigger" className="trig" type="button">Open</button>
        <GlassMenuItem>
          Copy
          <span slot="shortcut" className="sc">C</span>
        </GlassMenuItem>
      </GlassMenu>
    </>
  );
}`,
  svelte4: `<script>
  import { GlassButton, GlassMenu, GlassMenuItem } from "glassy-liquid/svelte";
</script>
<GlassButton>
  <svg slot="icon" class="ico"></svg>
  Save
  <span slot="trailing" class="tr">S</span>
</GlassButton>
<GlassMenu>
  <button slot="trigger" class="trig" type="button">Open</button>
  <GlassMenuItem>
    Copy
    <span slot="shortcut" class="sc">C</span>
  </GlassMenuItem>
</GlassMenu>`,
  svelte5: `<script>
  import { GlassButton, GlassMenu, GlassMenuItem } from "glassy-liquid/svelte";
  let label = $state("Open");
</script>
<GlassButton>
  <svg slot="icon" class="ico"></svg>
  Save
  <span slot="trailing" class="tr">S</span>
</GlassButton>
<GlassMenu>
  <button slot="trigger" class="trig" type="button">{label}</button>
  <GlassMenuItem>
    Copy
    <span slot="shortcut" class="sc">C</span>
  </GlassMenuItem>
</GlassMenu>`,
};

async function mountVue(page: Page, source: string): Promise<string[]> {
  const parsed = parse(source, { filename: "Slots.vue" });
  const script = compileScript(parsed.descriptor, { id: "named-slots", inlineTemplate: true });
  const entry = `${script.content.replace("export default", "const __sfc =")}
    import { createApp } from "vue";
    createApp(__sfc).mount("#root");
  `;
  return open(page, pageHtml('<div id="root"></div>', await bundle(entry, "ts")));
}

async function expectNamedSlots(page: Page): Promise<void> {
  await expect(page.locator("glass-button > [slot=icon]")).toHaveCount(1);
  await expect(page.locator("glass-button > [slot=trailing]")).toHaveText("S");
  await expect(page.locator("glass-button")).toContainText("Save");
  await expect(page.locator("glass-menu > [slot=trigger]")).toHaveText("Open");
  await expect(page.locator("glass-menu-item > [slot=shortcut]")).toHaveText("C");
  await page.locator("glass-menu > [slot=trigger]").click();
  await expect(page.locator("glass-menu > [slot=trigger]")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
}

test.describe("named slots", () => {
  test.describe.configure({ timeout: 60_000 });

  test("Vue template #trigger opens the menu", async ({ page }) => {
    const errors = await mountVue(page, slotMarkup.vue);
    await expectNamedSlots(page);
    expect(errors).toEqual([]);
  });

  test("React slot attributes open the menu", async ({ page }) => {
    const errors = await open(
      page,
      pageHtml('<div id="root"></div>', await mountReact(slotMarkup.react, "Slots")),
    );
    await expectNamedSlots(page);
    expect(errors).toEqual([]);
  });

  test("Svelte 4 slot attributes open the menu", async ({ page }) => {
    await mountSvelte(page, slotMarkup.svelte4, "[slot=trigger]");
    await expectNamedSlots(page);
  });

  test("Svelte 5 runes parent slot attributes open the menu", async ({ page }) => {
    await mountSvelte(page, slotMarkup.svelte5, "[slot=trigger]");
    await expectNamedSlots(page);
  });
});

async function mountSvelte(page: Page, source: string, selector: string): Promise<void> {
  const compiled = compileSvelte(source, {
    filename: "App.svelte",
    generate: "client",
    css: "injected",
  });
  const virtual: esbuild.Plugin = {
    name: "virtual-svelte",
    setup(build) {
      build.onResolve({ filter: /^virtual:app$/ }, () => ({
        path: "virtual:app",
        namespace: "virtual",
      }));
      build.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({
        contents: compiled.js.code,
        loader: "js",
        resolveDir: resolve(root, "src/svelte"),
      }));
    },
  };
  const bundled = await bundle(
    `import { mount } from "svelte";\nimport App from "virtual:app";\nmount(App, { target: document.getElementById("root") });\n`,
    "ts",
    [sveltePlugin, virtual],
  );
  const errors = await open(page, pageHtml('<div id="root"></div>', bundled));
  await expect(page.locator(selector).first()).toBeVisible();
  expect(errors).toEqual([]);
}
