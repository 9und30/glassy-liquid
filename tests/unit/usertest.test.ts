import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import { compile as compileSvelte } from "svelte/compiler";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";
import { cdnGzipLabel } from "../../scripts/cdn-gzip";
import { customSource } from "../../docs/src/custom-sample";
import { demos } from "../../docs/src/demos";
import {
  apiReference,
  htmlExample,
  llmsFullTxt,
  llmsTxt,
  reactExample,
  robotsTxt,
  SITE_URL,
  sitemapXml,
  svelteExample,
  vueExample,
} from "../../docs/src/llms";
import { playgroundSnippets } from "../../docs/src/playground-snippets";
import { sampleSource } from "../../docs/src/samples";
import { SCENE_PHOTO } from "../../docs/src/scene-photo";
import { queryTokens, rankEntries } from "../../docs/src/search";
import {
  injectComponentPage,
  injectGettingStarted,
  injectPlaygroundPage,
} from "../../docs/src/static-docs";

const root = resolve(import.meta.dirname, "../..");

describe("search", () => {
  const top = (query: string) => rankEntries(query)[0]?.label;

  it("drops stopwords and keeps camelCase parts", () => {
    expect(queryTokens("how do I change the blur")).toEqual(["change", "blur"]);
    expect(queryTokens("onValueChange")).toEqual(["value", "change"]);
  });

  it("answers the walkthrough questions", () => {
    expect(top("how do I change the blur")).toBe("blur");
    expect(top("dark mode")).toBe("Appearance");
    expect(top("safari")).toBe("Browser support");
    expect(top("safari fallback")).toBe("Browser support");
    expect(top("which browsers")).toBe("Browser support");
    expect(top("bundle size")).toBe("Bundle size");
    expect(top("gzip")).toBe("Bundle size");
    expect(top("slider onchange")).toBe("Slider events");
    expect(top("slider event")).toBe("Slider events");
    expect(top("onValueChange")).toBe("Slider events");
    expect(top("keyboard")).toBe("Accessibility");
    expect(top("next.js")).toBe("Next.js and server rendering");
    expect(top("ssr")).toBe("Next.js and server rendering");
    expect(top("support")).toBe("Browser support");
    expect(top("size")).toBe("Bundle size");
    expect(top("blur")).toBe("blur");
    expect(top("change")).toBe("blur");
  });

  it("drops weak body-only hits for generic words", () => {
    const unrelated = ["Menu", "Sheet", "Scroll edge", "Toolbar", "Segmented"];
    for (const query of [
      "support",
      "change",
      "size",
      "blur",
      "how do I change the blur",
      "bundle size",
    ]) {
      const labels = rankEntries(query).map((item) => item.label);
      expect(labels.length, query).toBeGreaterThan(0);
      for (const name of unrelated) expect(labels, query).not.toContain(name);
    }
  });
});

describe("static docs", () => {
  const components = readFileSync(resolve(root, "docs/components.html"), "utf8");
  const playground = readFileSync(resolve(root, "docs/playground.html"), "utf8");

  it("fills every framework tab and the hidden catalog", () => {
    const html = injectComponentPage(components);
    expect(html).toContain("export function WifiSwitch");
    expect(html).toContain("import { useState }");
    expect(html).toContain('id="all-snippets"');
    expect(html).toContain("snippet-slider");
    expect(html).toContain("onValueChange");
    expect(html).toContain(".open = true");
    expect(html).not.toContain("<svg />");
    expect(html).not.toContain("&lt;svg /&gt;");
    expect(html).toContain("&lt;svg");
    expect(injectComponentPage(html)).toBe(html);
  });

  it("fills the playground with a sized client snippet", () => {
    const html = injectPlaygroundPage(playground);
    expect(html).toContain("use client");
    expect(html).toContain("width: 280px");
    expect(html).toContain("height: 168px");
  });

  it("fills the custom-element sample before JavaScript runs", () => {
    const started = readFileSync(resolve(root, "docs/getting-started.html"), "utf8");
    const html = injectGettingStarted(started);
    expect(html).toContain("class NowPlaying");
    expect(html).toContain("customElements.define");
    expect(started).not.toContain("/photo.jpg");
    expect(started).toContain("examples/svelte/src/Svelte4.svelte");
    expect(started).toContain("blob/main/examples/svelte/src/Svelte4.svelte");
    expect(injectGettingStarted(html)).toBe(html);
  });

  it("writes llms text, and a sitemap only when the origin is known", () => {
    const brief = llmsTxt();
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      version: string;
      exports: Record<string, unknown>;
    };
    const [major, minor] = pkg.version.split(".");
    expect(brief).toContain(`npm/glassy-liquid@${major}.${minor}/dist/glassy-liquid.min.js`);
    for (const key of Object.keys(pkg.exports)) {
      const shown = key === "." ? "glassy-liquid" : `glassy-liquid/${key.slice(2)}`;
      expect(brief, key).toContain(shown);
    }
    expect(brief).toContain("package metadata, not a runtime entry");
    const cdn = brief.split("## Export map")[0] ?? "";
    expect(cdn).toContain("glassy-liquid.min.js");
    expect(cdn).toContain("<glass-scene");
    expect(cdn).toContain("<glass-button");
    expect(cdn).toContain("<glass-switch");
    expect(brief).toContain("npm install glassy-liquid");
    expect(brief).toContain("glassy-liquid/elements");
    expect(brief).toContain("glassy-liquid/react");
    expect(brief).toContain("glassy-liquid/vue");
    expect(brief).toContain("glassy-liquid/svelte");
    expect(brief).toContain("glassy-liquid/cdn");
    expect(brief).toContain(SCENE_PHOTO);
    expect(brief).toContain("glass-button");
    expect(brief).toContain("glass-switch");
    expect(brief).toContain("Every entry point is safe to import on the server.");
    expect(brief).toContain(`[Getting started](${SITE_URL}getting-started.html)`);
    expect(brief).not.toMatch(/\]\(\.\.?\//);
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const full = llmsFullTxt(readme);
    expect(full.length).toBeGreaterThan(brief.length);
    expect(full).toContain(customSource);
    expect(full).toContain(apiReference(readme));
    expect(full).toContain("#### GlassSheet");
    expect(full).not.toContain("<!-- api:");
    // llmstxt.org: one H1, then the blockquote summary.
    expect(brief.match(/^# /gm)).toHaveLength(1);
    expect(brief.split("\n")[2]).toMatch(/^> /);
    expect(brief).toContain(`- [llms-full.txt](${SITE_URL}llms-full.txt): `);
    expect(brief).toMatch(/^## Optional$/m);
    // The package copy links files inside the tarball, and the pages by their public URL.
    const packaged = llmsTxt("package");
    expect(packaged).toContain("[README.md](../../README.md)");
    expect(packaged).not.toMatch(/\]\(\.\/[\w-]+\.html\)/);
    expect(packaged).toContain(`[Components](${SITE_URL}components.html)`);
    expect(packaged).toContain(`[Home](${SITE_URL})`);
    expect(brief).toContain(`Docs site: ${SITE_URL}`);
    expect(SITE_URL).toBe("https://9und30.github.io/glassy-liquid/");
    expect(llmsFullTxt(readme, "package")).toContain(apiReference(readme));
    expect(robotsTxt(undefined)).toContain("DOCS_ORIGIN");
    expect(robotsTxt(undefined)).not.toContain("Sitemap:");
    expect(robotsTxt("https://example.com")).toContain("Sitemap: https://example.com/sitemap.xml");
    // Same URLs as the canonical links: the folder for the home page.
    const sitemap = sitemapXml("https://9und30.github.io/glassy-liquid");
    expect(sitemap).toContain("<loc>https://9und30.github.io/glassy-liquid/</loc>");
    expect(sitemap).toContain("<loc>https://9und30.github.io/glassy-liquid/components.html</loc>");
    expect(sitemap).not.toContain("index.html");
  });
});

describe("pasted samples", () => {
  it("replaces icon tokens with real svg", () => {
    for (const demo of demos) {
      const html = sampleSource(demo.html);
      expect(html, demo.id).not.toMatch(/\{\{\w+(:\w+)?\}\}/);
      expect(html, demo.id).not.toContain("<svg />");
      if (demo.html.includes("{{")) expect(html, demo.id).toContain("<svg");
      for (const svg of html.match(/<svg\b[\s\S]*?<\/svg>/g) ?? []) {
        expect(svg.match(/stroke-width=/g) ?? [], demo.id).toHaveLength(
          svg.includes("stroke=") ? 1 : 0,
        );
      }
    }
  });

  it("stamps the slot of an {{icon:slot}} token onto its svg", () => {
    expect(sampleSource("Share {{share:icon}}")).toMatch(/^Share <svg slot="icon" viewBox=/);
    expect(sampleSource("{{share}}")).not.toContain("slot=");
    const menu = demos.find((d) => d.id === "menu")!;
    const rows = sampleSource(menu.html).match(/<glass-menu-item[^>]*>[^<]*<svg[^>]*>/g) ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toContain('<svg slot="icon"');
  });

  // Compiles and typechecks every sample: well past the default 5 s on a loaded machine.
  it("compiles every React, Vue, and Svelte sample", { timeout: 120_000 }, async () => {
    const react: Array<[string, string]> = demos.map((demo) => [demo.id, demo.react]);
    react.push(["welcome", reactExample], ["playground", playgroundSnippets().react]);
    const vue: Array<[string, string]> = demos.map((demo) => [demo.id, demo.vue]);
    vue.push(["welcome", vueExample], ["playground", playgroundSnippets().vue]);
    const svelte: Array<[string, string]> = demos.map((demo) => [demo.id, demo.svelte]);
    svelte.push(["welcome", svelteExample], ["playground", playgroundSnippets().svelte]);

    for (const [id, source] of react) {
      const built = await esbuild.transform(source, {
        loader: "tsx",
        jsx: "automatic",
        format: "esm",
      });
      expect(built.code.length, id).toBeGreaterThan(0);
    }
    expect(typecheckReact(react)).toEqual([]);

    for (const [id, source] of vue) {
      const parsed = parse(source, { filename: `${id}.vue` });
      expect(parsed.errors.map(String), id).toEqual([]);
      if (parsed.descriptor.script || parsed.descriptor.scriptSetup) {
        compileScript(parsed.descriptor, { id });
      }
      const template = parsed.descriptor.template?.content ?? "";
      const compiled = compileTemplate({ source: template, filename: `${id}.vue`, id });
      expect(compiled.errors.map(String), id).toEqual([]);
    }

    for (const [id, source] of svelte) {
      const wrapped = source.trimStart().startsWith("<script")
        ? source
        : `<script></script>\n${source}`;
      compileSvelte(wrapped, { filename: `${id}.svelte`, generate: "client" });
    }

    const js = playgroundSnippets().html;
    const built = await esbuild.transform(js, { loader: "ts", format: "esm" });
    expect(built.code).toContain("280");
  });
});

describe("published examples", () => {
  it("keeps wallpaper.jpg out of the hello worlds", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const started = readFileSync(resolve(root, "docs/getting-started.html"), "utf8");
    expect(readme).not.toContain("/wallpaper.jpg");
    expect(started).not.toContain("/wallpaper.jpg");
    expect(started).not.toContain("/photo.jpg");
    const home = readFileSync(resolve(root, "docs/index.html"), "utf8");
    const label = cdnGzipLabel();
    expect(home).toContain("{{cdn-gzip}}");
    expect(home).not.toContain("34.0 kB");
    expect(readme).toContain(label);
    expect(readme).toContain(`gzip-${label.replace(" ", "%20")}`);
    expect(readme.match(/\b\d+\.\d kB gzip\b/g)?.every((m) => m.startsWith(label))).toBe(true);
    expect(readme).not.toContain("34.0 KB");
    expect(readme).toContain(SCENE_PHOTO);
    expect(started).toContain("glass-switch");
    expect(started).toContain('id="ssr"');
    expect(htmlExample).toContain("glass-switch");
    expect(reactExample).toContain("useState");
    expect(vueExample).toContain("v-model:checked");
    expect(svelteExample).toContain("bind:checked");
  });
});

function typecheckReact(files: Array<[string, string]>): string[] {
  const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const virtual = new Map<string, string>();
  const names: string[] = [];
  for (const [id, source] of files) {
    const file = resolve(root, `tests/unit/.snippets/${id}.tsx`);
    virtual.set(file, source);
    names.push(file);
  }
  const host = ts.createCompilerHost(parsed.options, true);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const source = host.getSourceFile.bind(host);
  host.fileExists = (file) => virtual.has(file) || exists(file);
  host.readFile = (file) => virtual.get(file) ?? read(file);
  host.getSourceFile = (file, languageVersion, onError, shouldCreate) => {
    const text = virtual.get(file);
    if (text !== undefined)
      return ts.createSourceFile(file, text, languageVersion, true, ts.ScriptKind.TSX);
    return source(file, languageVersion, onError, shouldCreate);
  };
  const program = ts.createProgram(names, { ...parsed.options, noEmit: true }, host);
  const messages: string[] = [];
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const file = diagnostic.file?.fileName;
    if (!file || !virtual.has(file)) continue;
    const where =
      diagnostic.start === undefined
        ? ""
        : `:${diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start).line}`;
    messages.push(
      `${file}${where} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    );
  }
  return messages;
}
