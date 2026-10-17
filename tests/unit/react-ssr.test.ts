import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";
import { playgroundSnippets } from "../../docs/src/playground-snippets";

const root = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/**
 * Server-render every React component plus the playground snippet in a fresh
 * Node process, the way a Next.js server would. React 18 prints a warning for
 * each useLayoutEffect on the server, so the bindings must not call it there.
 */
describe("react server rendering", () => {
  it(
    "renders every component and the playground snippet without a warning",
    { timeout: 60_000 },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "glassy-liquid-ssr-"));
      try {
        writeFileSync(join(dir, "Slab.tsx"), playgroundSnippets().react);
        const entry = `
        import * as React from "react";
        import { renderToString } from "react-dom/server";
        import * as Glass from "glassy-liquid/react";
        import { Slab } from "./Slab";
        const names = Object.keys(Glass).filter((name) => /^Glass[A-Z]/.test(name));
        const tree = React.createElement("div", null,
          ...names.map((name) => React.createElement(Glass[name], { key: name })),
          React.createElement(Glass.GlassSwitch, { key: "on", checked: true, onCheckedChange() {} }),
          React.createElement(Slab, { key: "slab" }));
        const html = renderToString(tree);
        console.log(JSON.stringify({ names, html, errors, layout }));
      `;
        // Runs before the bundle: count layout effects and collect warnings.
        const banner = `
        const errors = [];
        let layout = 0;
        console.error = console.warn = (...args) => errors.push(args.map(String).join(" "));
        const ReactCjs = require("react");
        const useLayoutEffect = ReactCjs.useLayoutEffect;
        ReactCjs.useLayoutEffect = (...args) => { layout++; return useLayoutEffect(...args); };
      `;
        await esbuild.build({
          stdin: { contents: entry, resolveDir: dir, loader: "tsx" },
          bundle: true,
          platform: "node",
          format: "cjs",
          jsx: "automatic",
          outfile: join(dir, "out.cjs"),
          external: ["react", "react-dom"],
          nodePaths: [join(root, "node_modules")],
          alias: {
            "glassy-liquid/react": join(root, "src/react/index.ts"),
            "glassy-liquid": join(root, "src/index.ts"),
          },
          banner: { js: banner },
          logLevel: "silent",
        });
        const out = execFileSync(process.execPath, [join(dir, "out.cjs")], {
          cwd: root,
          encoding: "utf8",
          env: { ...process.env, NODE_PATH: join(root, "node_modules") },
        });
        const result = JSON.parse(out.trim().split("\n").pop()!) as {
          names: string[];
          html: string;
          errors: string[];
          layout: number;
        };
        expect(result.names).toHaveLength(19);
        expect(result.errors).toEqual([]);
        expect(result.layout).toBe(0);
        expect(result.html).toContain("<glass-switch");
        expect(result.html).toContain("Field glass");
        expect(result.html.match(/defer-hydration/g)?.length).toBeGreaterThanOrEqual(20);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
