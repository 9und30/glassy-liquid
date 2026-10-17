import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { componentNames, specs, type ComponentName, type Spec } from "../../src/bindings/specs";
import { API_END, API_START, componentSlotMap, renderApiReference } from "./readme-api";
import { renderSpecsJsDoc } from "./specs-jsdoc";
import { browserSnippetIds, shellSnippetIds } from "../readme/snippets";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function apiSection(markdown: string): string {
  const start = markdown.indexOf(API_START);
  const end = markdown.indexOf(API_END);
  expect(start, "api start marker").toBeGreaterThanOrEqual(0);
  expect(end, "api end marker").toBeGreaterThan(start);
  return (
    markdown
      .slice(start + API_START.length, end)
      .replace(/^\n/, "")
      .replace(/\n$/, "") + "\n"
  );
}

function fences(markdown: string): Array<{ lang: string; id: string; code: string }> {
  const out: Array<{ lang: string; id: string; code: string }> = [];
  for (const match of markdown.matchAll(/```([a-z0-9]+)\n([\s\S]*?)```/g)) {
    const lang = match[1]!;
    const code = match[2]!;
    const id = /snippet:\s*([a-z0-9-]+)/.exec(code)?.[1];
    expect(id, `fence (${lang}) is missing a snippet id`).toBeTruthy();
    out.push({ lang, id: id!, code });
  }
  return out;
}

describe("README API reference", () => {
  const readme = read("README.md");
  const section = apiSection(readme);

  // Parses or compiles the whole source with TypeScript: seconds on a loaded machine.
  it("matches the reference generated from specs", { timeout: 60_000 }, () => {
    expect(section).toBe(renderApiReference());
  });

  it("documents all 19 components, tags, props, events, and defaults", () => {
    expect(componentNames).toHaveLength(19);
    for (const name of componentNames) {
      const spec = specs[name] as unknown as Spec;
      expect(section).toContain(`#### ${name}`);
      expect(section).toContain(`\`<${spec.tag}>\``);
      for (const attr of spec.attrs) expect(section, `${name}.${attr}`).toContain(`\`${attr}\``);
      for (const prop of spec.props) expect(section, `${name}.${prop}`).toContain(`\`${prop}\``);
      for (const [prop, pair] of Object.entries(spec.events as Record<string, [string, unknown]>)) {
        expect(section, name).toContain(`\`${prop}\``);
        expect(section, `${name}.${prop}`).toContain(`event \`${pair[0]}\``);
      }
      for (const [prop, attr] of Object.entries(spec.defaults as Record<string, string>)) {
        expect(section, name).toContain(`\`${prop}\``);
        expect(section, `${name}.${prop}`).toContain(`uncontrolled \`${attr}\``);
      }
    }
  });

  it("keeps slots aligned with the component source and the Svelte generator", () => {
    const slots = componentSlotMap();
    const files: Array<{ file: string; components: ComponentName[] }> = [
      { file: "src/scene/scene.ts", components: ["GlassScene"] },
      { file: "src/components/button.ts", components: ["GlassButton"] },
      { file: "src/components/menu.ts", components: ["GlassMenu", "GlassMenuItem"] },
      { file: "src/components/search.ts", components: ["GlassSearch"] },
      { file: "src/components/sheet.ts", components: ["GlassSheet"] },
      {
        file: "src/components/selector.ts",
        components: ["GlassTabBar", "GlassSegmented", "GlassTab", "GlassSegment"],
      },
    ];
    const extract = (source: string) => {
      const named = new Set<string>();
      let hasDefault = false;
      for (const match of source.matchAll(/<slot\b([^>]*)>/g)) {
        const name = /name="([^"]*)"/.exec(match[1] ?? "");
        if (name) named.add(name[1]!);
        else hasDefault = true;
      }
      if (source.includes('createElement("slot")')) hasDefault = true;
      return { named: [...named].sort(), hasDefault };
    };
    for (const { file, components } of files) {
      const found = extract(read(file));
      const named = [...new Set(components.flatMap((name) => slots[name].namedSlots))].sort();
      const hasDefault = components.some((name) => slots[name].defaultSlot);
      expect(found, file).toEqual({ named, hasDefault });
    }
    for (const name of ["GlassSurface", "GlassToolbar", "GlassGroup"] as const) {
      expect(slots[name].defaultSlot, name).toBe(true);
    }
    expect(read("src/components/surface.ts")).not.toMatch(/override render/);
    expect(read("src/components/toolbar.ts")).not.toMatch(/override render/);
    expect(read("src/components/base.ts")).toContain("<slot></slot>");

    const literal = /const slots = (\{[\s\S]*?\});/.exec(read("scripts/gen-svelte.mjs"));
    expect(literal).toBeTruthy();
    const svelteSlots = Function(`"use strict"; return (${literal![1]});`)() as Record<
      string,
      string[]
    >;
    for (const name of componentNames) {
      const named = slots[name].namedSlots;
      if (named.length)
        expect([...(svelteSlots[name] ?? [])].sort(), name).toEqual([...named].sort());
      else expect(svelteSlots[name], name).toBeUndefined();
    }
  });

  it("mentions every shadow part the components expose", () => {
    const files = [
      "src/components/button.ts",
      "src/components/switch.ts",
      "src/components/slider.ts",
      "src/components/menu.ts",
      "src/components/search.ts",
      "src/components/selector.ts",
      "src/components/sheet.ts",
      "src/scene/scene.ts",
      "src/engine/surface.ts",
      "src/interaction/thumb.ts",
    ];
    const parts = new Set<string>();
    for (const file of files) {
      const source = read(file);
      for (const match of source.matchAll(/part="([^"]+)"/g)) parts.add(match[1]!);
      for (const match of source.matchAll(/setAttribute\(\s*"part"\s*,\s*"([^"]+)"\s*\)/g))
        parts.add(match[1]!);
    }
    expect(parts.size).toBeGreaterThan(8);
    for (const part of parts) expect(section, part).toContain(`::part(${part})`);
  });
});

describe("props JSDoc", () => {
  it("matches the README entries for every public props member", () => {
    const source = read("src/bindings/specs.ts");
    expect(
      renderSpecsJsDoc(source),
      "run npx vite-node tests/readme/print-api.ts to regenerate the JSDoc",
    ).toBe(source);
    expect(source).toContain("@defaultValue `glass`");
  });
});

describe("README snippets", () => {
  const blocks = fences(read("README.md"));

  it("covers exactly the snippets the browser and shell checks know about", () => {
    expect(blocks.map((block) => block.id).sort()).toEqual(
      [...browserSnippetIds, ...shellSnippetIds].sort(),
    );
    const langs = new Map(blocks.map((block) => [block.id, block.lang]));
    for (const id of shellSnippetIds) expect(langs.get(id)).toBe("sh");
    for (const id of browserSnippetIds)
      expect(["html", "js", "ts", "tsx", "vue", "svelte", "css"]).toContain(langs.get(id));
  });

  it("points shell commands at this package and its scripts", () => {
    const pkg = JSON.parse(read("package.json")) as {
      name: string;
      version: string;
      scripts: Record<string, string>;
      exports: Record<string, string | { import?: string }>;
    };
    const byId = new Map(blocks.map((block) => [block.id, block.code]));
    expect(byId.get("install")).toContain(`npm install ${pkg.name}`);
    const cdn = pkg.exports["./cdn"];
    expect(typeof cdn === "string" ? cdn : cdn?.import).toBe("./dist/glassy-liquid.min.js");
    // The CDN URL pins the current minor release, so a breaking 0.x release does not reach pages.
    const [major, minor] = pkg.version.split(".");
    expect(byId.get("cdn")).toContain(
      `https://cdn.jsdelivr.net/npm/glassy-liquid@${major}.${minor}/dist/glassy-liquid.min.js`,
    );
    for (const script of ["dev", "test", "test:e2e", "build", "bench"]) {
      expect(byId.get("scripts"), script).toContain(`npm run ${script}`);
      expect(pkg.scripts[script], script).toBeTruthy();
    }
  });
});

describe("public text", () => {
  // Every tracked text file plus the type declarations shipped in the package.
  it("avoids em dashes and en dashes", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
      .split("\0")
      .filter((file) => file && !/\.(png|webp|gif|jpe?g|ico|woff2?|tgz)$/i.test(file));
    const declarations: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
        const path = `${dir}${entry.name}`;
        if (entry.isDirectory()) walk(`${path}/`);
        else if (path.endsWith(".d.ts")) declarations.push(path);
      }
    };
    if (existsSync(new URL("dist/", root))) walk("dist/");
    expect(tracked).toContain("README.md");
    expect(tracked).toContain("src/components/base.ts");
    const offenders = [...tracked, ...declarations].filter((file) => {
      const path = new URL(file, root);
      return existsSync(path) && /[\u2013\u2014]/.test(readFileSync(path, "utf8"));
    });
    expect(offenders).toEqual([]);
  });
});
