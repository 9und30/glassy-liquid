// Library build: per-file ESM (tree-shakeable) + type declarations + a minified CDN bundle.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const src = join(root, "src");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
execSync("node scripts/gen-svelte.mjs", { cwd: root, stdio: "inherit" });

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) files.push(p);
  }
})(src);

await build({
  entryPoints: files,
  outdir: dist,
  outbase: src,
  format: "esm",
  target: "es2020",
  bundle: false,
  sourcemap: false,
  logLevel: "warning",
});

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
await build({
  entryPoints: [join(src, "elements.ts")],
  outfile: join(dist, "glassy-liquid.min.js"),
  // CDN users get the license with the file.
  banner: {
    js: `/*! ${pkg.name} v${pkg.version} | MIT | (c) 2026 thirtynine | ${pkg.repository.url.replace(/^git\+|\.git$/g, "")} */`,
  },
  format: "esm",
  target: "es2020",
  bundle: true,
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});

execSync("npx tsc -p tsconfig.build.json", { cwd: root, stdio: "inherit" });

// The CDN file is the bundled elements entry. Give `glassy-liquid/cdn` a typed path.
writeFileSync(
  join(dist, "cdn.d.ts"),
  '/** Types for the minified CDN bundle. It registers every custom element and re-exports the main API. */\nexport * from "./elements.js";\n',
);

// Keep "use client" as the very first statement of the React entry (Next.js app router).
const reactEntry = join(dist, "react", "index.js");
const code = readFileSync(reactEntry, "utf8");
if (!code.startsWith('"use client"'))
  writeFileSync(reactEntry, `"use client";\n${code.replace(/^\s*["']use client["'];?\s*/m, "")}`);

// Svelte: ship the .svelte sources (compiled by the consumer) plus a typed index.
execSync("node scripts/gen-svelte.mjs --dist", { cwd: root, stdio: "inherit" });

// Agent-readable docs in the package (dist/docs), from the same source as the docs site's
// llms.txt and llms-full.txt, so a coding agent can read them from node_modules offline.
const llms = await build({
  entryPoints: [join(root, "docs/src/llms.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  logLevel: "warning",
});
const scratch = mkdtempSync(join(tmpdir(), "glassy-liquid-llms-"));
try {
  const file = join(scratch, "llms.mjs");
  writeFileSync(file, llms.outputFiles[0].text);
  const { llmsTxt, llmsFullTxt } = await import(pathToFileURL(file).href);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  mkdirSync(join(dist, "docs"), { recursive: true });
  writeFileSync(join(dist, "docs", "llms.txt"), llmsTxt("package"));
  writeFileSync(join(dist, "docs", "llms-full.txt"), llmsFullTxt(readme, "package"));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// SI kilobytes and gzip level 9, the way size-limit and the README report sizes.
const report = (file) => {
  const buf = readFileSync(file);
  return `${relative(root, file).padEnd(34)} ${(buf.length / 1000).toFixed(1).padStart(6)} kB   gzip ${(gzipSync(buf, { level: 9 }).length / 1000).toFixed(1).padStart(5)} kB`;
};
console.log(report(join(dist, "glassy-liquid.min.js")));
console.log(report(join(dist, "index.js")));
for (const f of ["react/index.js", "vue/index.js", "svelte/actions.js", "bindings/specs.js"])
  console.log(report(join(dist, f)));
console.log(report(join(dist, "docs", "llms-full.txt")));
console.log(`built ${files.length} modules`);
