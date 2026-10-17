import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { cdnGzipLabel, patchBenchJson } from "./scripts/cdn-gzip";
import { icons } from "./docs/src/icons";
import { playerMarkup } from "./docs/src/player-data";
import { llmsFullTxt, llmsTxt, robotsTxt, sitemapXml } from "./docs/src/llms";
import {
  injectComponentPage,
  injectGettingStarted,
  injectPlaygroundPage,
} from "./docs/src/static-docs";

const root = __dirname;

function htmlInclude(): Plugin {
  return {
    name: "html-include",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return (
          html
            .replace(/<!--include:([\w-]+)-->/g, (_m, name: string) => {
              return readFileSync(resolve(root, "docs/partials", `${name}.html`), "utf8");
            })
            .replace("<!--player-->", () => playerMarkup())
            // Icons in the HTML, so nothing grows when the script runs.
            .replace(
              /(<span data-icon="(\w+)">)(<\/span>)/g,
              (m, open: string, name: string, close: string) => {
                const svg = icons[name as keyof typeof icons];
                return svg ? `${open}${svg}${close}` : m;
              },
            )
        );
      },
    },
  };
}

function agentDocs(): Plugin {
  let outDir = "";
  let base = "/";
  const files = (): Record<string, string> => {
    const origin = process.env.DOCS_ORIGIN;
    const out: Record<string, string> = {
      "llms.txt": llmsTxt(),
      "llms-full.txt": llmsFullTxt(readFileSync(resolve(root, "README.md"), "utf8")),
      "robots.txt": robotsTxt(origin),
    };
    if (origin) out["sitemap.xml"] = sitemapXml(origin);
    return out;
  };
  return {
    name: "agent-docs",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      base = config.base === "./" || config.base === "" ? "/" : config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const file = ctx.filename || ctx.path || "";
        if (file.includes("/fixtures/")) return html;
        let next = html;
        if (/(^|\/)404\.html$/.test(file)) next = notFoundBase(next, base);
        else if (process.env.DOCS_ORIGIN) next = canonical(next, file, process.env.DOCS_ORIGIN);
        if (/(^|\/)components\.html$/.test(file)) next = injectComponentPage(next);
        else if (/(^|\/)playground\.html$/.test(file)) next = injectPlaygroundPage(next);
        else if (/(^|\/)getting-started\.html$/.test(file)) next = injectGettingStarted(next);
        if (next.includes("{{cdn-gzip}}")) next = next.replaceAll("{{cdn-gzip}}", cdnGzipLabel());
        return next;
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (
          !process.env.DOCS_ORIGIN &&
          (url === "/sitemap.xml" || url === `${base}sitemap.xml`.replace(/\/{2,}/g, "/"))
        ) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("sitemap.xml is omitted until DOCS_ORIGIN is set\n");
          return;
        }
        if (url === "/bench.json" || url.endsWith("/bench.json")) {
          const raw = readFileSync(resolve(root, "docs/public/bench.json"), "utf8");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(patchBenchJson(raw));
          return;
        }
        for (const [file, body] of Object.entries(files())) {
          const prefixed = `${base}${file}`.replace(/\/{2,}/g, "/");
          if (url !== `/${file}` && url !== prefixed) continue;
          const type = file.endsWith(".xml") ? "application/xml" : "text/plain";
          res.setHeader("Content-Type", `${type}; charset=utf-8`);
          res.end(body);
          return;
        }
        next();
      });
    },
    closeBundle() {
      for (const [file, body] of Object.entries(files()))
        writeFileSync(resolve(outDir, file), body);
      const bench = readFileSync(resolve(root, "docs/public/bench.json"), "utf8");
      writeFileSync(resolve(outDir, "bench.json"), patchBenchJson(bench));
    },
  };
}

/**
 * GitHub Pages serves 404.html for every missing path, at any depth, so its
 * relative links and assets need a fixed base. Relative builds assume the
 * domain root.
 */
function notFoundBase(html: string, base: string): string {
  if (html.includes("<base ")) return html;
  return html.replace(/<meta charset="utf-8" \/>/, (m) => `${m}\n<base href="${base}" />`);
}

/** `<link rel="canonical">` for a page, when the public URL (DOCS_ORIGIN) is known. */
function canonical(html: string, file: string, origin: string): string {
  const name = /([\w-]+)\.html$/.exec(file)?.[1];
  if (!name || !pages.includes(name) || html.includes('rel="canonical"')) return html;
  const href = `${origin.replace(/\/$/, "")}/${name === "index" ? "" : `${name}.html`}`;
  return html.replace("</head>", `<link rel="canonical" href="${href}" />\n</head>`);
}

const pages = [
  "index",
  "components",
  "playground",
  "getting-started",
  "theming",
  "accessibility",
  "browser-support",
];

export default defineConfig({
  root: "docs",
  // Relative by default so one build works at a domain root and under a
  // subpath. The GitHub Pages workflow builds with DOCS_BASE=/glassy-liquid/
  // and DOCS_ORIGIN=https://9und30.github.io/glassy-liquid.
  base: process.env.DOCS_BASE || "./",
  plugins: [htmlInclude(), agentDocs()],
  resolve: {
    alias: {
      "glassy-liquid/react": resolve(root, "src/react/index.ts"),
      "glassy-liquid/elements": resolve(root, "src/elements.ts"),
      "glassy-liquid": resolve(root, "src/index.ts"),
    },
  },
  // Loopback by default. Pass --host to reach the dev server from another device.
  server: { port: 5199, host: "127.0.0.1" },
  preview: { port: 5199, host: "127.0.0.1" },
  build: {
    outDir: "../docs-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        ...Object.fromEntries(
          pages.map((name) => [
            name,
            resolve(root, "docs", name === "index" ? "index.html" : `${name}.html`),
          ]),
        ),
        // Served by GitHub Pages for any missing path. Not a docs page, so no canonical.
        "404": resolve(root, "docs", "404.html"),
      },
    },
  },
});
