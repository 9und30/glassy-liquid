# AGENTS.md

Instructions for coding agents working in this repository. Humans: [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) cover the same ground in more detail. A nested `AGENTS.md` in `src/` or `docs/` adds rules for that folder. The closest file to the code you edit wins.

## Project

glassy-liquid is Apple-style Liquid Glass for the web: refraction, specular light, and the iOS 26 controls. Every control is a framework-agnostic custom element (`<glass-button>`, `<glass-switch>`, ...). React, Vue, and Svelte bindings wrap those elements. The package is ESM only, TypeScript, MIT licensed, published as `glassy-liquid`.

Contribution policy: bug reports and feature requests through issues. **Pull requests from outside the project are not accepted for now** and are closed automatically by `.github/workflows/pr-policy.yml`. Do not open a pull request against `9und30/glassy-liquid` on behalf of someone who is not the maintainer. Suggest an issue instead.

## Repository layout

| Path                     | What lives there                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`              | Optics, shape, springs, displacement maps, PNG encoding, environment detection, the frame ticker. Imports nothing else from `src/`                                |
| `src/engine/`            | The glass surface (`glass()`), materials, SVG filter, styles, appearance                                                                                          |
| `src/interaction/`       | Press response, the thumb lens, popover placement and morphing                                                                                                    |
| `src/components/`        | The custom elements. `base.ts` has `GlassElement`, the base class for glass elements                                                                              |
| `src/scene/`             | `<glass-scene>`: WebGL (`gl.ts`) and DOM content filter (`dom.ts`) renderers                                                                                      |
| `src/bindings/specs.ts`  | The binding table every framework port is generated from, plus the public props interfaces                                                                        |
| `src/react/`, `src/vue/` | React and Vue bindings (`create<Props>("Name")` per component)                                                                                                    |
| `src/svelte/`            | `actions.ts` (Svelte actions) and `components/*.svelte`, **generated** by `scripts/gen-svelte.mjs`                                                                |
| `src/elements.ts`        | Side-effect entry that registers every element. `src/index.ts` is the main API                                                                                    |
| `docs/`                  | The docs site. It is the Vite root: HTML pages, `partials/`, `src/` (site TypeScript), `fixtures/` (pages the e2e tests drive), `public/`. See `docs/AGENTS.md`   |
| `tests/unit/`            | Vitest: engine, bindings, SSR, framework parity, README and docs drift checks                                                                                     |
| `tests/e2e/`             | Playwright specs against the docs fixtures, the static build, the examples, and the README snippets                                                               |
| `tests/readme/`          | `print-api.ts` (regenerates the README API block and the props JSDoc), `capture.mjs` (README media), `snippets.ts`                                                |
| `tests/tools/`           | Manual Playwright helpers (screenshots, probes, layout shift), plus `static-serve.mjs`, the Pages-like static server that `tests/e2e/static-site.spec.ts` imports |
| `scripts/`               | Library build, Svelte generator, pack check, attw, the CDN gzip label, competitor bundle build                                                                    |
| `examples/`              | npm workspaces (`vanilla-cdn`, `react`, `vue`, `svelte`) that depend on the package via `file:../..`                                                              |
| `bench/`                 | Benchmark against `@glass-sdk/liquid-glass`. See `bench/README.md`                                                                                                |
| `dist/`, `docs-dist/`    | Build output, gitignored. Never edit or commit them                                                                                                               |

## Setup

Node 22.18 or newer for development (`.nvmrc` pins 22, `devEngines` warns below 22.18). Consumers need Node 18 or newer. Use npm, the lockfile is `package-lock.json`.

```sh
npm ci          # also builds dist/ through the prepare script
npm run dev     # docs site and playground on http://localhost:5199
```

## Commands

| Command                                    | Use it for                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                             | ESLint (TypeScript, Vue, Svelte, React hooks)                                                                             |
| `npm run format:check`                     | Prettier check. `npm run format` rewrites. Prettier ignores `docs/`, `examples/`, and `README.md` (see `.prettierignore`) |
| `npm run typecheck`                        | `tsc` for `src` and `docs/src`, then for `tests`                                                                          |
| `npm test`                                 | Vitest unit tests                                                                                                         |
| `npx vitest run tests/unit/parity.test.ts` | One unit file                                                                                                             |
| `npm run build`                            | `dist/`: per-file ESM, `.d.ts`, generated Svelte sources, `dist/glassy-liquid.min.js`, `dist/docs/llms*.txt`              |
| `npm run docs:build`                       | Static docs site in `docs-dist/` with a relative base                                                                     |
| `npm run size`                             | size-limit budget for the CDN bundle (run `npm run build` first)                                                          |
| `npm run pack:check`                       | Fails when `npm pack` ships anything but `dist/`, `README.md`, `LICENSE`, `package.json`, or misses a required file       |
| `npm run publint`, `npm run attw`          | Package metadata and type resolution checks                                                                               |
| `npm run examples:build`                   | Builds the four example projects                                                                                          |
| `npm run test:e2e`                         | Playwright in Chromium, WebKit, Firefox, and Mobile Safari                                                                |
| `npx vite-node tests/readme/print-api.ts`  | Regenerates the README API block and the props JSDoc in `src/bindings/specs.ts`                                           |
| `node scripts/gen-svelte.mjs`              | Regenerates `src/svelte/components/*.svelte` from the React exports                                                       |

Playwright needs its browsers once: `npx playwright install`. It starts its own Vite server on port 5197 and reuses a server already on that port, so do not run anything else there. On a shared or small machine, cap workers: `npx playwright test --workers=2`. Narrow a run with a file and a project: `npx playwright test tests/e2e/components.spec.ts --project=chromium`. `tests/e2e/readme-snippets.spec.ts` loads `dist/`, so build first, and do not run `npm run build` while Playwright is running (the build deletes `dist/`).

## The 1:1 rule for React, Vue, and Svelte

The three framework ports must stay identical: same component names, props, defaults, events, two-way bindings, and behavior. They are projections of one table, so change the table, not a single port.

- Props, attributes, controlled properties, uncontrolled defaults, and events are declared once in `src/bindings/specs.ts`.
- `src/react/index.ts` and `src/vue/index.ts` each export one `create<Props>("Name")` line per component, in the same order with the same type parameter.
- Svelte components are generated from the React exports. Never edit `src/svelte/components/*.svelte` by hand. Run `node scripts/gen-svelte.mjs`. Named slots live in the `slots` map in that script.
- Vue `v-model:x` and Svelte `bind:x` are derived from `onCheckedChange`, `onValueChange`, and `onOpenChange` in `modelEvents()`.
- `tests/unit/parity.test.ts` fails when the exported names, prop lists, or bindings differ. `tests/unit/react.test.ts`, `vue.test.ts`, `svelte.test.ts`, `ssr.test.ts`, and `hydrate.test.ts` cover behavior per framework.

Adding a component is a fixed sequence. Follow "How to add a component" in [CONTRIBUTING.md](CONTRIBUTING.md#how-to-add-a-component).

## Generated and drift-checked content

Edit the source, regenerate, and let the tests confirm:

| Output                                                           | Source                                                                                  | Regenerate                                | Checked by                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| README block between `<!-- api:start -->` and `<!-- api:end -->` | `src/bindings/specs.ts` and the entries in `tests/unit/readme-api.ts`                   | `npx vite-node tests/readme/print-api.ts` | `tests/unit/readme-api.test.ts`                           |
| Props JSDoc in `src/bindings/specs.ts`                           | the same entries in `tests/unit/readme-api.ts`                                          | `npx vite-node tests/readme/print-api.ts` | `tests/unit/readme-api.test.ts`                           |
| `src/svelte/components/*.svelte`                                 | `src/react/index.ts` and `scripts/gen-svelte.mjs`                                       | `node scripts/gen-svelte.mjs`             | `tests/unit/parity.test.ts`, `svelte.test.ts`             |
| `llms.txt`, `llms-full.txt` (site and `dist/docs/`)              | `docs/src/llms.ts`, demos, and the README API block                                     | `npm run docs:build`, `npm run build`     | `tests/unit/usertest.test.ts`, `tests/e2e/docs.spec.ts`   |
| README code fences                                               | hand written, each needs a `snippet: <id>` comment listed in `tests/readme/snippets.ts` | none                                      | `readme-api.test.ts`, `tests/e2e/readme-snippets.spec.ts` |

## Coding conventions

- TypeScript strict mode with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`. Use `import type` for types.
- Relative imports inside `src/` end in `.js` (`../engine/surface.js`), because `dist/` is emitted file by file.
- ESM only. No default exports in `src/`.
- Prettier: 100 columns, double quotes, trailing commas. ESLint must pass with no unused disable directives.
- Custom elements extend `GlassElement` when they are glass, dispatch plain DOM events (`change`, `input`, `select`, `toggle`, `search`, `detent`), and stay inert while `defer-hydration` is present.
- Do not touch `window`, `document`, or `HTMLElement` at module scope in code the framework bindings import. They are imported during SSR.
- Keep the CDN bundle within the `size-limit` budget in `package.json`.
- Match the comment density of the surrounding code. Comments explain why, not what.
- Docs and community files use a plain hyphen, never an em dash or en dash. `tests/unit/readme-api.test.ts` checks the files it lists.
- New runtime dependencies need a strong reason. The package has none today.

## Verifying a change

Run the narrowest useful check while you work, then the full gate before you report a change as done:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run docs:build
npm run pack:check
npm run size
npx playwright test --workers=2
```

On Linux without a GPU, headless Firefox has no WebGL, and the WebGL cases in `tests/e2e/engines.spec.ts` fail although the code is fine. Do not change those tests. Run Firefox the way CI does, headed under a virtual display: `CI=1 xvfb-run --auto-servernum npx playwright test --project=firefox --workers=2` (`playwright.config.ts` switches Firefox to headed with software WebGL when `CI` is set). On a loaded machine a few timing tests can also time out. Rerun them with `npx playwright test --last-failed --workers=2` before you treat a failure as real.

Pick the e2e specs that match the change while iterating:

| You changed                                   | Run at least                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A component's rendering or interaction        | `tests/e2e/components.spec.ts`, `interaction.spec.ts`, `menu-icons.spec.ts`, `legibility.spec.ts` |
| The engine, materials, or a renderer          | `tests/e2e/engines.spec.ts`, `layout.spec.ts`, `contrast.spec.ts`, `reduced-transparency.spec.ts` |
| A framework binding or SSR                    | the unit tests, then `tests/e2e/examples.spec.ts`                                                 |
| The docs site, navigation, or the hero player | `tests/e2e/docs.spec.ts`, `navigation.spec.ts`, `player.spec.ts`, `static-site.spec.ts`           |
| README code samples                           | `npm run build`, then `tests/e2e/readme-snippets.spec.ts`                                         |

CI (`.github/workflows/ci.yml`, workflow name `CI`) runs lint, format, typecheck, unit tests, build, the docs build with both bases, the examples, pack check, publint, attw, size, and Playwright on every pull request and on pushes to `main` and `oss/**`. The README badge points at that file with `?branch=main`. Keep the filename, the query, and the name.

## Docs site

The site is published on GitHub Pages as a project site at <https://9und30.github.io/glassy-liquid/>. `docs/` is the Vite root, `npm run dev` serves it, and `npm run docs:build` writes `docs-dist/`. The default build uses a relative base (`./`). `.github/workflows/docs-pages.yml` builds with `DOCS_BASE=/glassy-liquid/` and `DOCS_ORIGIN=https://9und30.github.io/glassy-liquid`, which adds canonical links and `sitemap.xml`. `docs/404.html` is what Pages serves for any missing path. `llms.txt`, `llms-full.txt`, and `robots.txt` are generated by the `agent-docs` plugin in `vite.config.ts`. `tests/e2e/static-site.spec.ts` serves both builds the way Pages does and checks every page, asset, anchor, the 404 page, and the llms files. Details are in `docs/AGENTS.md`.

## Release and packaging

- The package ships `dist/`, `README.md`, and `LICENSE` (`files` in `package.json`). `dist/docs/llms.txt` and `dist/docs/llms-full.txt` are the agent docs for consumers.
- Every entry point is listed in `exports` and `typesVersions`, and its files in the required list in `scripts/pack-check.mjs`. A module that registers elements or otherwise has effects on import is also listed in `sideEffects`, with both its `dist/` and its `src/` path.
- `.github/workflows/release.yml` only packs a draft and never publishes. `.github/workflows/docs-pages.yml` deploys the docs only when run by hand. Do not run `npm publish`, deploy the docs, or change repository settings unless the maintainer asks.
- Record user-facing changes in `CHANGELOG.md` under `[Unreleased]`. At publish time, turn `[Unreleased]` into the new version with the date and start a new empty `[Unreleased]` section above it.

## Commits and branches

- Imperative subject, optionally with a `feat`, `fix`, or `docs` prefix and a scope: `fix(scene): upload backdrop photos after decode`.
- Work on a branch, never push to `main`, never force-push a shared branch.
