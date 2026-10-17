import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demos, glassProps } from "../../docs/src/demos";
import { llmsFullTxt, themingSection } from "../../docs/src/llms";
import { cdnGzipLabel, patchBenchJson } from "../../scripts/cdn-gzip";
import { defaultGlassOptions } from "../../src/engine/surface";
import { shadowParts } from "./shadow-parts";

function row(name: string): [string, string, string, string] {
  const found = glassProps.find((entry) => entry[0] === name);
  if (!found) throw new Error(`missing glass() row ${name}`);
  return found;
}

function demoDefault(id: string, prop: string): string {
  const found = demos.find((demo) => demo.id === id)?.props?.find((entry) => entry[0] === prop);
  if (!found) throw new Error(`missing ${id}.${prop}`);
  return found[2];
}

function attrDefault(source: string, attr: string): string {
  const match = source.match(new RegExp(`getAttribute\\("${attr}"\\) \\?\\? "([^"]+)"`));
  if (!match?.[1]) throw new Error(`no ?? default for ${attr}`);
  return match[1];
}

describe("documented glass options match GlassOptions", () => {
  it("lists every option and no extras", () => {
    const fromType = Object.keys(defaultGlassOptions).sort();
    const fromDocs = glassProps.map((entry) => entry[0]).sort();
    expect(fromDocs).toEqual(fromType);
    expect(fromDocs).not.toContain("interactive");
  });

  it("uses the resolved defaults", () => {
    expect(row("material")[2]).toBe(defaultGlassOptions.material);
    expect(row("appearance")[2]).toBe(defaultGlassOptions.appearance);
    expect(row("radius")[2]).toBe(String(defaultGlassOptions.radius));
    expect(row("bezel")[2]).toBe(String(defaultGlassOptions.bezel));
    expect(row("specular")[2]).toBe(String(defaultGlassOptions.specular));
    expect(row("lightAngle")[2]).toBe(String(defaultGlassOptions.lightAngle));
    expect(row("shadow")[2]).toBe(String(defaultGlassOptions.shadow));
    expect(row("profile")[2]).toBe(defaultGlassOptions.profile);
    expect(row("zoom")[2]).toBe(String(defaultGlassOptions.zoom));
    expect(row("backdrop")[2]).toBe(String(defaultGlassOptions.backdrop));
    expect(row("engine")[2]).toBe(defaultGlassOptions.engine);
    expect(defaultGlassOptions.tint).toBeNull();
    expect(row("tint")[2]).toBe("none");
    expect(defaultGlassOptions.fill).toBeNull();
    expect(row("fill")[2]).toBe("none");
    expect(defaultGlassOptions.refraction).toBeUndefined();
    expect(row("refraction")[2].toLowerCase()).toContain("scale");
    expect(defaultGlassOptions.blur).toBeUndefined();
    expect(row("blur")[2].toLowerCase()).toContain("material");
    expect(defaultGlassOptions.dispersion).toBeUndefined();
    const surface = readFileSync("src/engine/surface.ts", "utf8");
    expect(surface).toContain(
      'this.opts.dispersion ?? (this.engineKind === "scene-gl" ? 0.25 : 0)',
    );
    expect(row("dispersion")[2]).toContain("0.25");
    expect(row("dispersion")[2]).toMatch(/else 0/);
  });
});

describe("documented component defaults match the source", () => {
  it("matches progressive blur, including the layers clamp", () => {
    const source = readFileSync("src/components/progressive-blur.ts", "utf8");
    expect(demoDefault("scroll-edge", "edge")).toBe(attrDefault(source, "edge"));
    expect(demoDefault("scroll-edge", "size")).toBe(attrDefault(source, "size"));
    expect(demoDefault("scroll-edge", "blur")).toBe(attrDefault(source, "blur"));
    expect(demoDefault("scroll-edge", "layers")).toBe(attrDefault(source, "layers"));
    expect(source).toContain("Math.max(2, Math.min(8,");
    const layers = demos
      .find((demo) => demo.id === "scroll-edge")
      ?.props?.find((entry) => entry[0] === "layers");
    expect(layers?.[3]).toMatch(/2 to 8/);
    expect(demoDefault("scroll-edge", "tint")).toBe("none");
  });

  it("matches sheet, search, menu, slider, and button defaults", () => {
    const sheet = readFileSync("src/components/sheet.ts", "utf8");
    expect(demoDefault("sheet", "detents")).toBe(attrDefault(sheet, "detents"));
    const search = readFileSync("src/components/search.ts", "utf8");
    const placeholder = search.match(/getAttribute\("placeholder"\) \?\? "([^"]+)"/)?.[1];
    expect(demoDefault("search", "placeholder")).toBe(placeholder);
    const menu = readFileSync("src/components/menu.ts", "utf8");
    expect(menu).toContain('|| "bottom-start"');
    expect(demoDefault("menu", "placement")).toBe("bottom-start");
    const slider = readFileSync("src/components/slider.ts", "utf8");
    expect(slider).toMatch(/get min\(\): number \{[\s\S]*return Number\.isFinite\(v\) \? v : 0;/);
    expect(slider).toMatch(/get max\(\): number \{[\s\S]*return Number\.isFinite\(v\) \? v : 100;/);
    expect(demoDefault("slider", "min / max")).toBe("0 / 100");
    const button = readFileSync("src/components/button.ts", "utf8");
    expect(button).toContain("--glass-button-height,44px");
    expect(button).toContain("--glass-button-height:32px");
    expect(button).toContain("--glass-button-height:52px");
    expect(demoDefault("button", "size")).toBe("medium");
    expect(demoDefault("button", "variant")).toBe("glass");
    expect(demoDefault("button", "shape")).toBe("capsule");
    expect(demoDefault("button", "type")).toBe("button");
  });
});

describe("docs follow the merged bench and Vue slots", () => {
  it("shows Vue named slots with template #trigger", () => {
    const vue = demos.find((demo) => demo.id === "menu")?.vue ?? "";
    expect(vue).toContain("<template #trigger>");
    expect(vue).not.toContain('slot="trigger"');
    const page = readFileSync("docs/components.html", "utf8");
    for (const name of ["#trigger", "#icon", "#trailing", "#shortcut"]) {
      expect(page).toContain(name);
    }
  });

  it("prints the bench.json figures and the 60 Hz cap", () => {
    const raw = readFileSync("docs/public/bench.json", "utf8");
    const bench = JSON.parse(raw) as {
      metrics: Array<{ value: string; label: string; detail: string }>;
      note: string;
      summary: {
        glassy: { move: { init: number }; scroll: { fps: number }; resize: { fps: number } };
        glasshq: { move: { init: number }; scroll: { fps: number }; resize: { fps: number } };
      };
    };
    expect(bench.note).toContain("60 Hz");
    const page = readFileSync("docs/index.html", "utf8");
    expect(page).toContain("60 Hz");
    expect(page).toContain(bench.note);
    expect(bench.metrics[0]?.value).toBe("{{cdn-gzip}}");
    expect(bench.metrics[0]?.label.startsWith("gzip")).toBe(true);
    // Setup time and both frame rates still match the recorded summary.
    expect(bench.metrics[1]?.value).toBe(`${bench.summary.glassy.move.init.toFixed(0)} ms`);
    expect(bench.metrics[2]?.value).toBe(`${bench.summary.glassy.scroll.fps.toFixed(0)} fps`);
    expect(bench.metrics[3]?.value).toBe(`${bench.summary.glassy.resize.fps.toFixed(0)} fps`);
    expect(bench.metrics[1]?.detail).toContain(`${bench.summary.glasshq.move.init.toFixed(0)} ms`);
    expect(bench.metrics[2]?.detail).toContain(
      `${bench.summary.glasshq.scroll.fps.toFixed(0)} fps`,
    );
    expect(bench.metrics[3]?.detail).toContain(
      `${bench.summary.glasshq.resize.fps.toFixed(0)} fps`,
    );
    for (const metric of bench.metrics) {
      expect(page).toContain(metric.label);
      expect(page).toContain(metric.detail);
      if (metric.value === "{{cdn-gzip}}") continue;
      expect(page).toContain(metric.value);
    }
    const served = JSON.parse(patchBenchJson(raw)) as { metrics: Array<{ value: string }> };
    expect(served.metrics[0]?.value).toBe(cdnGzipLabel());
    expect(served.metrics[0]?.value).not.toBe("34.0 kB");
    expect(page).toContain("{{cdn-gzip}}");
  });
});

describe("NOTICE names the fonts that ship", () => {
  it("points at Fraunces, Outfit, and IBM Plex Mono license files", () => {
    const notice = readFileSync("NOTICE", "utf8");
    expect(notice).not.toMatch(/Inter|JetBrains/);
    expect(notice).not.toContain("docs/public/fonts/");
    const files = [
      "docs/src/fonts/OFL-Fraunces.txt",
      "docs/src/fonts/OFL-Outfit.txt",
      "docs/src/fonts/OFL-IBMPlex.txt",
    ];
    for (const file of files) {
      expect(notice).toContain(file);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toMatch(/SIL OPEN FONT LICENSE/);
    }
    expect(notice).toContain("Copyright 2020 The Fraunces Project Authors");
    expect(notice).toContain("Copyright 2021 The Outfit Project Authors");
    expect(notice).toContain('Copyright 2017 IBM Corp. Reserved Font Name "Plex"');
  });
});

describe("the button specimen is the same control on every tab", () => {
  it("shows Back, Edit, and Done, and no extra Clear button", () => {
    const demo = demos.find((entry) => entry.id === "button");
    if (!demo) throw new Error("missing button demo");
    expect(demo.html.match(/<glass-button\b/g)).toHaveLength(3);
    expect(demo.react.match(/<GlassButton\b/g)).toHaveLength(3);
    expect(demo.vue.match(/<GlassButton\b/g)).toHaveLength(3);
    expect(demo.svelte.match(/<GlassButton\b/g)).toHaveLength(3);
    for (const source of [demo.html, demo.react, demo.vue, demo.svelte]) {
      expect(source).toContain('aria-label="Back"');
      expect(source).toContain(">Edit<");
      expect(source).toContain('variant="prominent"');
      expect(source).toContain(">Done<");
      expect(source).not.toContain(">Clear<");
    }
  });
});

describe("documented shadow parts match the source", () => {
  // Parses or compiles the whole source with TypeScript: seconds on a loaded machine.
  it("lists the parts each element actually exposes", { timeout: 60_000 }, () => {
    const derived = shadowParts();
    expect(derived.get("glass-tab-bar")).not.toContain("track");
    expect(derived.get("glass-segmented")).toContain("track");
    expect(derived.get("glass-switch")).toEqual(expect.arrayContaining(["thumb", "glass"]));
    expect(derived.get("glass-slider")).toEqual(expect.arrayContaining(["thumb", "glass"]));
    expect(derived.get("glass-button")).toContain("glass");
    expect(derived.get("glass-surface")).toEqual(["glass"]);
    expect(derived.get("glass-toolbar")).toEqual([]);
    expect(derived.get("glass-spacer")).toEqual([]);
    expect(derived.get("glass-progressive-blur")).toEqual([]);
    expect(derived.get("glass-menu-separator")).toEqual([]);
    expect(derived.get("glass-menu-label")).toEqual([]);

    const documented = partsTable(readFileSync("docs/theming.html", "utf8"));
    const exposed = Object.fromEntries(
      [...derived.entries()]
        .filter(([, parts]) => parts.length > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    expect(documented).toEqual(exposed);
  });
});

function partsTable(html: string): Record<string, string[]> {
  const start = html.indexOf('id="parts"');
  const end = html.indexOf('id="materials"');
  if (start < 0 || end < start) throw new Error("parts section missing");
  const section = html.slice(start, end);
  const rows = [...section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1);
  const out: Record<string, string[]> = {};
  for (const match of rows) {
    const row = match[1];
    if (!row) throw new Error("empty parts row");
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1] ?? "");
    if (cells.length !== 2) throw new Error(`parts row needs two cells: ${row}`);
    const elements = codes(cells[0] ?? "");
    if (elements.length !== 1) throw new Error(`parts row must name one element: ${row}`);
    const name = elements[0];
    if (!name || out[name]) throw new Error(`duplicate or empty parts row: ${row}`);
    out[name] = codes(cells[1] ?? "");
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function codes(cell: string): string[] {
  return [...cell.matchAll(/<code>([^<]+)<\/code>/g)].map((match) => match[1] ?? "");
}

describe("theming docs", () => {
  const readme = readFileSync("README.md", "utf8");
  const section = themingSection(readme);
  const named = (text: string) => new Set(text.match(/--glass-[a-z-]+/g) ?? []);

  it("lists every custom property the source reads", () => {
    const read = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith(".ts"))
          for (const [, name] of readFileSync(path, "utf8").matchAll(/var\((--glass-[a-z-]+)/g))
            read.add(name!);
      }
    };
    walk("src");
    // --glass-r is an internal radius hand-off. --glass-appearance is read with getComputedStyle.
    read.delete("--glass-r");
    read.add("--glass-appearance");
    expect([...named(section)].sort()).toEqual([...read].sort());
  });

  it("shows the same properties on the theming page and in llms-full.txt", () => {
    const page = readFileSync("docs/theming.html", "utf8");
    const full = llmsFullTxt(readme);
    for (const name of named(section)) {
      expect(page, name).toContain(name);
      expect(full, name).toContain(name);
    }
  });
});
