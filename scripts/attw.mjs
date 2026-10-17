// ESM-only package (`"type": "module"`). CommonJS require() of these entries resolves to ESM;
// that is expected, so that one attw rule is ignored. Node 10, Node 16 ESM, and bundler must pass.
// Concrete component entrypoints are included because `./components/*` is a wildcard attw does not expand.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const components = readdirSync(join(root, "dist/components"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `components/${name.slice(0, -3)}`);

if (!components.length) {
  console.error("dist/components is empty. Run npm run build first.");
  process.exit(1);
}

const attw = join(root, "node_modules/@arethetypeswrong/cli/dist/index.js");
execFileSync(process.execPath, [attw, "--pack", ".", "--include-entrypoints", ...components], {
  cwd: root,
  stdio: "inherit",
});
