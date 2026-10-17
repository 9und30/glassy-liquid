import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  exports: Record<string, unknown>;
};

/** Every import specifier the exports map allows, with `components/*` expanded from dist. */
function specifiers(): string[] {
  const out: string[] = [];
  for (const key of Object.keys(pkg.exports)) {
    // `glassy-liquid/svelte` points at .svelte sources that only a Svelte compiler loads.
    if (key === "./svelte" || key === "./package.json") continue;
    if (key === "./components/*") {
      for (const file of readdirSync(join(root, "dist/components")))
        if (file.endsWith(".js")) out.push(`${pkg.name}/components/${file.slice(0, -3)}`);
      continue;
    }
    out.push(key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`);
  }
  return out;
}

describe("server-side import", () => {
  it("loads every exports entry from dist in plain Node", { timeout: 60_000 }, () => {
    expect(existsSync(join(root, "dist/index.js")), "run npm run build first").toBe(true);
    const list = specifiers();
    expect(list).toContain(pkg.name);
    expect(list).toContain(`${pkg.name}/elements`);
    expect(list).toContain(`${pkg.name}/components/button`);
    // A fresh Node process: no DOM globals, the package resolves itself by name.
    const script = `
      if (typeof HTMLElement !== "undefined" || typeof customElements !== "undefined") throw new Error("not plain Node");
      const failed = [];
      for (const id of ${JSON.stringify(list)}) {
        try { await import(id); } catch (error) { failed.push(id + ": " + error.message); }
      }
      const json = await import("${pkg.name}/package.json", { with: { type: "json" } });
      if (json.default.name !== "${pkg.name}") failed.push("package.json");
      console.log(JSON.stringify(failed));
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      encoding: "utf8",
    });
    expect(JSON.parse(out.trim().split("\n").pop()!)).toEqual([]);
  });
});
