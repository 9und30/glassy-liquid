// A plain static file server, like GitHub Pages: no rewrites, no SPA
// fallback. A missing path under the base gets the site's 404.html with
// status 404 when there is one, the way a Pages project site answers.
//
//   node tests/tools/static-serve.mjs <dir> [port] [base]
//   node tests/tools/static-serve.mjs docs-dist 4311
//   node tests/tools/static-serve.mjs docs-dist-pages 4312 /glassy-liquid/
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

export function serve(dir, port = 4311, base = "/") {
  const root = resolve(dir);
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    if (`${path}/` === prefix) {
      // Pages redirects the bare project URL to the folder.
      res.writeHead(301, { location: prefix }).end();
      return;
    }
    if (!path.startsWith(prefix)) {
      res.writeHead(404).end("not found");
      return;
    }
    let file = normalize(join(root, path.slice(prefix.length)));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (statSync(file).isDirectory()) file = join(file, "index.html");
      statSync(file);
    } catch {
      const page = join(root, "404.html");
      try {
        statSync(page);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
        return;
      }
      res.writeHead(404, { "content-type": types[".html"] });
      createReadStream(page).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  // Loopback only: this is a test server, not something to expose on the network.
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir = "docs-dist", port = "4311", base = "/"] = process.argv.slice(2);
  await serve(dir, Number(port), base);
  console.log(`serving ${dir} at http://127.0.0.1:${port}${base}`);
}
