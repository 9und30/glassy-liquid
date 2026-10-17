import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";

async function shot(
  page: { screenshot: (opts: { path: string; animations?: "disabled" }) => Promise<unknown> },
  name: string,
): Promise<void> {
  if (!process.env.DOCS_SCREENSHOTS) return;
  const dir = path.join("test-results", "docs-screenshots");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, name), animations: "disabled" });
}

const examples = [
  { name: "vanilla-cdn", dir: "examples/vanilla-cdn" },
  { name: "react", dir: "examples/react" },
  { name: "vue", dir: "examples/vue" },
  { name: "svelte", dir: "examples/svelte" },
];

/**
 * Start the example's own Vite with Node directly. Through npx, SIGTERM would only
 * stop the npx wrapper and leave the Vite server running after the test.
 */
function startVite(dir: string, port: number, stdio: "pipe" | "ignore"): ChildProcess {
  const cwd = path.resolve(dir);
  // vite does not export its bin, so go through its package.json.
  const pkg = createRequire(path.join(cwd, "package.json")).resolve("vite/package.json");
  const vite = path.join(path.dirname(pkg), "bin/vite.js");
  return spawn(
    process.execPath,
    [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd,
      stdio: stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "ignore",
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
}

/** Stop a server started by startVite and wait until it is gone. */
async function stopVite(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((done) => proc.once("exit", () => done()));
  proc.kill("SIGTERM");
  const timer = setTimeout(() => proc.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForServer(port: number, proc: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  let log = "";
  proc.stdout?.on("data", (d: Buffer) => {
    log += d.toString();
  });
  proc.stderr?.on("data", (d: Buffer) => {
    log += d.toString();
  });
  while (Date.now() < deadline) {
    if (proc.exitCode != null) throw new Error(`vite exited ${proc.exitCode}\n${log}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${port}\n${log}`);
}

test("example projects render glass without console errors", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  for (const example of examples) {
    const port = await freePort();
    const proc = startVite(example.dir, port, "pipe");
    const errors: string[] = [];
    const onError = (message: string) => errors.push(message);
    const onPageError = (e: Error) => onError(e.message);
    const onConsole = (m: { type: () => string; text: () => string }) => {
      if (m.type() === "error" && !/favicon|WebGL|WEBGL|ResizeObserver/.test(m.text()))
        onError(m.text());
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    try {
      await waitForServer(port, proc);
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () =>
          customElements.get("glass-button") !== undefined ||
          customElements.get("glass-switch") !== undefined,
      );
      await page.waitForTimeout(600);
      await expect(page.locator("glass-button, glass-switch").first()).toBeVisible();
      expect(errors, errors.join("\n")).toEqual([]);
      const results = await new AxeBuilder({ page }).analyze();
      const violations = results.violations
        .map((v) => {
          const nodes = v.nodes.filter((n) => !/glass-/i.test(`${n.target.join(" ")} ${n.html}`));
          if (!nodes.length && v.id === "color-contrast") return "";
          const kept = v.id === "color-contrast" ? nodes : v.nodes;
          if (!kept.length) return "";
          return `${v.id}: ${kept
            .slice(0, 2)
            .map((n) => n.target.join(" "))
            .join(" | ")}`;
        })
        .filter(Boolean);
      expect(violations, violations.join("\n")).toEqual([]);
      const box = testInfo.project.name === "mobile-safari" ? "mobile" : "desktop";
      await shot(page, `example-${example.name}-${box}-${testInfo.project.name}.png`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      page.off("pageerror", onPageError);
      page.off("console", onConsole);
      // Leave the page first, so its HMR client does not log reconnect errors.
      await page.goto("about:blank");
      await stopVite(proc);
    }
  }
});

test("mobile safari viewport 375 stays inside the screen", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "webkit" && testInfo.project.name !== "mobile-safari",
    "webkit only",
  );
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  const port = await freePort();
  const proc = startVite("examples/vanilla-cdn", port, "ignore");
  try {
    await waitForServer(port, proc);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(page, `example-vanilla-cdn-375-${browserName}.png`);
  } finally {
    await page.goto("about:blank");
    await stopVite(proc);
  }
});
