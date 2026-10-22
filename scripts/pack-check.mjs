// Fail when `npm pack` would ship tests, benchmarks, docs sources, or scratch files.
import { execSync } from "node:child_process";

const raw = execSync("npm pack --dry-run --json", { encoding: "utf8" });
// `prepare` logs land on stdout ahead of the pretty-printed JSON document.
const start = raw.lastIndexOf("\n[\n");
if (start === -1) {
  console.error(raw);
  console.error("npm pack did not print a JSON file list");
  process.exit(1);
}
const packed = JSON.parse(raw.slice(start + 1));
const files = packed[0]?.files?.map((file) => file.path) ?? [];
if (!files.length) {
  console.error("npm pack produced an empty file list");
  process.exit(1);
}

const allowed = (path) =>
  path === "package.json" || path === "README.md" || path === "LICENSE" || path.startsWith("dist/");
const forbidden =
  /^(tests?|bench|docs|examples|scripts|src|scratch|\.github)(\/|$)|scratch|__snapshots__|\.map$/;

const bad = files.filter((path) => !allowed(path) || forbidden.test(path));
if (bad.length) {
  console.error("npm pack includes files that should not be published:");
  for (const path of bad) console.error(`  ${path}`);
  process.exit(1);
}

const required = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/elements.js",
  "dist/elements.d.ts",
  "dist/cdn.d.ts",
  "dist/glassy-liquid.min.js",
  "dist/react/index.js",
  "dist/react/index.d.ts",
  "dist/vue/index.js",
  "dist/vue/index.d.ts",
  "dist/svelte/index.js",
  "dist/svelte/index.d.ts",
  "dist/svelte/actions.js",
  "dist/svelte/actions.d.ts",
  "dist/scene/scene.js",
  "dist/scene/scene.d.ts",
  "dist/docs/llms.txt",
  "dist/docs/llms-full.txt",
  "README.md",
  "LICENSE",
];
const missing = required.filter((path) => !files.includes(path));
if (missing.length) {
  console.error("npm pack is missing required files:");
  for (const path of missing) console.error(`  ${path}`);
  process.exit(1);
}

console.log(`pack ok: ${files.length} files`);
