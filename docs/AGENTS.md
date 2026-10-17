# AGENTS.md for the docs site

`docs/` is the Vite root of the docs site. The root [AGENTS.md](../AGENTS.md) still applies. Prettier ignores this folder (`.prettierignore`), so keep the existing formatting by hand. ESLint and `tsc` do cover `docs/src/`.

## Pages

The site has seven docs pages: `index`, `components`, `playground`, `getting-started`, `theming`, `accessibility`, and `browser-support` (each `<name>.html` here). A new page has to be added in every list that names them:

- `pages` in `vite.config.ts` (build inputs)
- `pages` in `docs/src/llms.ts` (`llms.txt` and `sitemap.xml`)
- the page list in `docs/src/router.ts` (client-side navigation)
- the entries in `docs/src/search.ts` (command palette)
- `partials/nav.html` and the menu sheet and footer in `partials/foot.html`

`404.html` is not a docs page and stays out of those lists. It is a build input in `vite.config.ts`. GitHub Pages serves it for every missing path at any depth, so the build gives it a `<base href>` at the site folder (`/glassy-liquid/` on Pages, `/` for a relative build). The router resolves links against `document.baseURI` and leaves a page with a `<base>` by a full load.

## How the HTML is built

- `<!--include:NAME-->` is replaced with `partials/<NAME>.html` (`htmlInclude` in `vite.config.ts`).
- `<span data-icon="NAME"></span>` is filled with the SVG from `src/icons.ts` at build time, so nothing shifts when the script runs.
- `<!--player-->` becomes the hero player markup from `src/player-data.ts`.
- `components.html`, `playground.html`, and `getting-started.html` get their code samples injected into the static HTML by `src/static-docs.ts`, so the snippets exist without JavaScript.
- `{{cdn-gzip}}` becomes the measured gzip size of the CDN bundle (`scripts/cdn-gzip.ts`).
- `llms.txt`, `llms-full.txt`, and `robots.txt` come from `src/llms.ts` through the `agent-docs` plugin in `vite.config.ts`. `sitemap.xml` is written only when `DOCS_ORIGIN` is set. The dev server serves the same files.

## Content rules

- `src/demos.ts` holds every component demo with four sources: Web Components HTML, React, Vue, and Svelte. The React, Vue, and Svelte sources stay 1:1 with each other, like the bindings. The HTML is also the live preview, so it may show the control in more context (two switches instead of one). `tests/unit/usertest.test.ts` compiles every React, Vue, and Svelte sample.
- `glassProps` in `src/demos.ts` documents the `glass()` options. `tests/unit/docs-drift.test.ts` checks it against `defaultGlassOptions` and the component source.
- Links between pages are relative (`./components.html`). The site is hosted at <https://9und30.github.io/glassy-liquid/>, and the same build must also work at a domain root. Never use a root-absolute `/` link or asset path. Resolve a link in TypeScript with `resolveHref()` from `src/router.ts`, not against `location.href`.
- `fixtures/` holds the pages the Playwright specs drive. They are served by the dev server and are not part of the production build.
- `public/` is copied as is. `public/bench.json` is patched with the measured CDN size at build time. Backdrop images come from `scripts/fetch-backdrops.py`.
- `media/` holds the README images: `controls.webp` (recapture with `node tests/readme/capture.mjs` against `npm run dev`, needs `ffmpeg`) and `player-lens.gif` (a manual frame-by-frame recording of the hero, encoded with gifski).
- This file is served by the dev server like any other file under the Vite root, but it is not part of the build.

## Checks

```sh
npm run typecheck
npx vitest run tests/unit/usertest.test.ts tests/unit/docs-drift.test.ts
npm run docs:build
npx playwright test tests/e2e/docs.spec.ts tests/e2e/navigation.spec.ts tests/e2e/static-site.spec.ts --workers=2
```

`tests/e2e/static-site.spec.ts` builds the site with both bases, serves each one from `tests/tools/static-serve.mjs` the way GitHub Pages does (no rewrites, `404.html` with status 404 for missing paths, a redirect from `/glassy-liquid` to `/glassy-liquid/`), and checks every page by deep link and by the nav, every asset and font, every in-site anchor, the 404 page at several depths, and the links in `llms.txt` and `llms-full.txt`. To look at the Pages build by hand, build it, serve it, and delete it afterwards (`docs-dist-pages/` is gitignored):

```sh
DOCS_BASE=/glassy-liquid/ DOCS_ORIGIN=https://9und30.github.io/glassy-liquid npx vite build --outDir ../docs-dist-pages
node tests/tools/static-serve.mjs docs-dist-pages 4312 /glassy-liquid/
rm -rf docs-dist-pages
```

Deploying is manual: run the "Docs site" workflow from the Actions tab. Never trigger it or change the Pages settings unless the maintainer asks.
