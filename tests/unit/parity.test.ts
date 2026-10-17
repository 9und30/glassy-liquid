import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as react from "../../src/react/index";
import * as vue from "../../src/vue/index";
import * as svelteActions from "../../src/svelte/actions";
import { componentNames, modelEvents, propNames, specs } from "../../src/bindings/specs";
// prettier-ignore
// @ts-expect-error plain .mjs script
import { components as genComponents, component as genComponent } from "../../scripts/gen-svelte.mjs";

const root = new URL("../../", import.meta.url).pathname;
const exported = (mod: object) =>
  Object.keys(mod)
    .filter((k) => /^Glass[A-Z]/.test(k) && k !== "GlassVueComponent")
    .sort();
const names = [...componentNames].sort();
const svelteDir = `${root}src/svelte/components`;

describe("react / vue / svelte parity", () => {
  it("export the same components", () => {
    expect(exported(react)).toEqual(names);
    expect(exported(vue)).toEqual(names);
    expect(
      readdirSync(svelteDir)
        .map((f) => f.replace(/\.svelte$/, ""))
        .sort(),
    ).toEqual(names);
    expect((genComponents as Array<{ name: string }>).map((c) => c.name).sort()).toEqual(names);
  });

  it("export the same helpers", () => {
    for (const mod of [react, vue, svelteActions])
      expect(typeof (mod as Record<string, unknown>).useGlass).toBe("function");
  });

  it("accept the same props in every framework", () => {
    for (const name of componentNames) {
      const vueProps = [...(vue[name] as unknown as { props: string[] }).props].sort();
      expect(vueProps, name).toEqual(propNames(name));
      expect((react[name] as { displayName?: string }).displayName).toBe(name);
    }
  });

  it("use one prop type per component in react, vue and svelte", () => {
    const re = (file: string) =>
      Object.fromEntries(
        [
          ...readFileSync(`${root}${file}`, "utf8").matchAll(
            /export const (\w+) = create<(\w+)>\("(\w+)"\)/g,
          ),
        ].map((m) => [m[1], m[2]]),
      );
    expect(re("src/vue/index.ts")).toEqual(re("src/react/index.ts"));
    expect(Object.keys(re("src/react/index.ts")).sort()).toEqual(names);
    const svelteTypes = Object.fromEntries(
      (genComponents as Array<{ name: string; type: string }>).map((c) => [c.name, c.type]),
    );
    expect(svelteTypes).toEqual(re("src/react/index.ts"));
  });

  it("generated svelte wrappers are up to date and bind the same models as vue", () => {
    for (const c of genComponents as Array<{ name: string }>) {
      expect(readFileSync(`${svelteDir}/${c.name}.svelte`, "utf8")).toBe(genComponent(c));
      const binds = [...genComponent(c).matchAll(/export let (\w+) = undefined/g)]
        .map((m) => m[1])
        .filter((b) => b !== "element")
        .sort();
      expect(binds, c.name).toEqual(Object.keys(modelEvents(c.name as keyof typeof specs)).sort());
    }
  });
});
