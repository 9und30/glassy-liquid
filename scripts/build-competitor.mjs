// Build bench/competitor/*.bundle.js from the pinned npm package.
// Those bundles are gitignored. `npm run bench` runs this when they are missing.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "bench", "competitor");
const bundlesOnly = process.argv.includes("--bundles-only");
const pkg = join(dir, "node_modules/@glass-sdk/liquid-glass/package.json");
const esbuild = join(dir, "node_modules/esbuild/bin/esbuild");

if (!bundlesOnly && !existsSync(pkg)) {
  execFileSync("npm", ["ci"], { cwd: dir, stdio: "inherit" });
}

if (!existsSync(esbuild)) {
  console.error(
    "bench/competitor dependencies are missing. From the repo root: npm run bench:competitor",
  );
  process.exit(1);
}

const bundle = (entry, outfile, extra = []) => {
  execFileSync(
    esbuild,
    [
      entry,
      "--bundle",
      "--minify",
      "--format=esm",
      `--outfile=${outfile}`,
      "--log-level=warning",
      ...extra,
    ],
    {
      cwd: dir,
      stdio: "inherit",
    },
  );
};

bundle("node_modules/@glass-sdk/liquid-glass/dist/dom.js", "dom.bundle.js");
bundle("node_modules/@glass-sdk/liquid-glass/dist/index.js", "react.bundle.js", [
  "--external:react",
  "--external:react-dom",
]);
console.log("competitor bundles written to bench/competitor/*.bundle.js");
