import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

const agentFiles = ["AGENTS.md", "src/AGENTS.md", "docs/AGENTS.md"];
const guides = [...agentFiles, "CONTRIBUTING.md"];

/** Backticked repository paths. Build output (dist, docs-dist) is not in the tree. */
function paths(markdown: string): string[] {
  const out = new Set<string>();
  for (const [, code] of markdown.matchAll(/`([^`\n]+)`/g)) {
    for (const word of code!.split(/\s+/)) {
      const path = word.replace(/[),.:]+$/, "");
      // Build output is not in the tree, and ./ or ../ paths are import or link examples.
      if (/^(dist|docs-dist)/.test(path) || /^\.\.?\//.test(path)) continue;
      if (/^https?:|[<>{}$=]|^-/.test(path)) continue;
      if (/^(\.github|src|docs|tests|scripts|examples|bench)\//.test(path)) out.add(path);
      else if (/^[\w.-]+\/[\w./*-]+\.(ts|mjs|js|html|md|yml|json|svelte|py)$/.test(path))
        out.add(path);
      else if (/^([A-Z_]+\.md|package\.json|[\w-]+\.config\.(ts|js))$/.test(path)) out.add(path);
    }
  }
  return [...out];
}

function exists(path: string, from: string): boolean {
  const resolved = (base: string) => {
    const full = join(root, base, path);
    if (!path.includes("*")) return existsSync(full);
    return existsSync(dirname(full.slice(0, full.indexOf("*"))));
  };
  return resolved("") || resolved(dirname(from));
}

describe("agent instructions", () => {
  it("CLAUDE.md imports AGENTS.md", () => {
    expect(read("CLAUDE.md").trim()).toBe("@AGENTS.md");
  });

  it("only name npm scripts that exist", () => {
    for (const file of guides) {
      for (const [, script] of read(file).matchAll(/npm run ([\w:-]+)/g))
        expect(pkg.scripts[script!], `${file}: npm run ${script}`).toBeTruthy();
    }
  });

  it("only name files and folders that exist", () => {
    for (const file of guides) {
      const found = paths(read(file));
      expect(found.length, file).toBeGreaterThan(3);
      for (const path of found) expect(exists(path, file), `${file}: ${path}`).toBe(true);
    }
  });

  it("lists every e2e spec somewhere in AGENTS.md", () => {
    const text = read("AGENTS.md");
    for (const spec of readdirSync(join(root, "tests/e2e")).filter((f) => f.endsWith(".spec.ts")))
      expect(text, spec).toContain(spec);
  });
});

describe("pull request policy workflow", () => {
  const workflow = read(".github/workflows/pr-policy.yml");

  it("never runs pull request code", () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request_target:\n/m);
    expect(workflow).not.toMatch(/^\s+pull_request:/m);
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).not.toContain("uses:");
    expect(workflow).not.toMatch(/github\.event\.pull_request\.(head|title|body)/);
    expect(workflow).not.toContain("secrets.");
  });

  it("asks for the smallest token", () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    const scopes = [...workflow.matchAll(/^ {6}([\w-]+): (read|write)$/gm)].map((m) => m[0].trim());
    expect(scopes).toEqual(["pull-requests: write"]);
  });

  it("skips the owner, members, collaborators, Dependabot, and owner reopens", () => {
    expect(workflow).toContain("github.event.pull_request.user.login != '9und30'");
    expect(workflow).toContain('"OWNER", "MEMBER", "COLLABORATOR"');
    expect(workflow).toContain('"dependabot[bot]"');
    expect(workflow).toContain("github.event.sender.login == '9und30'");
  });
});
