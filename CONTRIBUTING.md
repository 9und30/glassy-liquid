# Contributing to glassy-liquid

Thanks for your interest. Please read the [code of conduct](CODE_OF_CONDUCT.md) first.

## Issues yes, pull requests not for now

**Bug reports and feature requests are very welcome.** They are the most useful way to help right now. Open one from the [issue chooser](https://github.com/9und30/glassy-liquid/issues/new/choose).

**Pull requests are not accepted at the moment.** glassy-liquid is maintained by one person, and every change has to land in the Web Components and, 1:1, in the React, Vue, and Svelte bindings, plus the docs, the README API reference, and the browser tests. Keeping that consistent is easier when the maintainer writes the code. A pull request from outside the project is closed automatically with a pointer back to the issue tracker. That is not a judgment of the change. If you already wrote a fix, open an issue that describes the problem and link your fork or branch. The idea can still land that way.

This policy may change later. This file will say so when it does.

## Filing a good bug report

Search the [existing issues](https://github.com/9und30/glassy-liquid/issues?q=is%3Aissue) first. If one matches, add your details there instead of opening a new one.

A report that can be reproduced gets fixed first. Please include:

- **Version**: the `glassy-liquid` version from your lockfile, or the commit you built.
- **Entry point**: Web Components (`glassy-liquid/elements` or the CDN bundle), React, Vue, or Svelte, with the framework version.
- **Browser and OS**: for example Safari 18 on iOS 18, or Chrome 130 on Windows 11. Rendering differs per engine, so this matters.
- **A minimal reproduction**: the smallest HTML or component that shows the problem. A link to a StackBlitz, CodePen, or a small repository is ideal. Remove everything that is not needed to see the bug.
- **Expected and actual result**: what you expected to see, what you saw instead, and a screenshot or short clip when the problem is visual.
- **Console output**: errors or warnings from the browser console or the server (for SSR).
- **Settings that change rendering**: whether `prefers-reduced-motion` or `prefers-reduced-transparency` is on, and whether you set `engine`, `material`, or a `<glass-scene>`.

## Reporting a docs problem

A broken link, a wrong statement, or a missing explanation: use the [docs problem form](https://github.com/9und30/glassy-liquid/issues/new?template=docs_problem.yml) and give the page URL.

## Requesting a feature

Describe the problem first, then the API you have in mind. A new component or prop always ships as a Web Component plus matching React, Vue, and Svelte bindings, so say how you would use it in the framework you care about. Links to the Apple control you want to match, or to another library that already does it, help a lot.

## Security issues

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md) and use a private security advisory.

## Working on a fork

You are welcome to fork the project and change it for your own use under the [MIT license](LICENSE). The rest of this file describes the local setup.

### Setup

Node 22.18 or newer for development (`.nvmrc` pins 22). The published package itself runs on Node 18 or newer.

```sh
git clone https://github.com/9und30/glassy-liquid.git
cd glassy-liquid
npm install
```

`npm install` builds `dist/` (the `prepare` script). The docs site and playground run at <http://localhost:5199>:

```sh
npm run dev
```

### Scripts

| Script                 | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`          | Docs and playground (Vite, port 5199)                                               |
| `npm run lint`         | ESLint for TypeScript, Vue, and Svelte                                              |
| `npm run format:check` | Prettier check (`npm run format` rewrites)                                          |
| `npm run typecheck`    | `tsc` for the library and the tests                                                 |
| `npm test`             | Unit tests (Vitest), including binding parity and the README API check              |
| `npm run test:e2e`     | Playwright in Chromium, WebKit, Firefox, and Mobile Safari                          |
| `npm run build`        | `dist/`: per-file ESM, type declarations, Svelte sources, minified CDN bundle       |
| `npm run docs:build`   | Static docs site in `docs-dist/` (`npm run docs:preview` serves it)                 |
| `npm run size`         | Gzip budget for the CDN bundle (needs a build)                                      |
| `npm run pack:check`   | Fails when `npm pack` would ship tests, sources, or other files outside `dist/`     |
| `npm run check`        | typecheck, unit tests, and build                                                    |
| `npm run bench`        | Benchmark against `@glass-sdk/liquid-glass` (`bench:competitor` builds its bundles) |
| `npm run test:all`     | typecheck, unit tests, and Playwright                                               |

The local gate. CI also builds the examples, runs publint and attw, and builds the docs with both bases:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run docs:build
npm run pack:check
npm run size
npm run test:e2e
```

On Linux without a GPU, headless Firefox has no WebGL, so the WebGL cases in `tests/e2e/engines.spec.ts` fail locally while CI passes. Run Firefox the way CI does, headed under a virtual display: `CI=1 xvfb-run --auto-servernum npx playwright test --project=firefox`.

`npm run bench` builds the comparison bundles when they are missing. Rebuild them with `npm run bench:competitor`. See `bench/README.md`.

### Tests

- `tests/unit` covers the engine, bindings, SSR markup, and parity between React, Vue, and Svelte.
- `tests/unit/readme-api.test.ts` fails if `README.md` drifts from `src/bindings/specs.ts`, from the slots in the component source, or from the named-slot map in `scripts/gen-svelte.mjs`.
- `tests/e2e` drives the docs fixtures in real browsers. `tests/e2e/readme-snippets.spec.ts` extracts every README code sample and runs it.
- Playwright starts its own Vite server on port 5197. Do not point it at a server from another checkout.

Regenerate the README API block after editing the specs or the doc entries in `tests/unit/readme-api.ts`:

```sh
npx vite-node tests/readme/print-api.ts
```

Recapture the README still `docs/media/controls.webp` from the live docs. The script needs `ffmpeg` (with libwebp) on your `PATH` and defaults to `http://127.0.0.1:5199`, the same port as `npm run dev`. Pass another base URL when the site is elsewhere:

```sh
node tests/readme/capture.mjs
```

The intermediate PNG goes to a temporary directory and is deleted after the WebP is written. The README hero, `docs/media/player-lens.gif`, is a frame-by-frame recording of the docs hero encoded with gifski. The script does not produce it.

### How to add a component

The React, Vue, and Svelte wrappers are projections of one table. Add the custom element, then one spec entry, then the three exports.

1. Implement the element under `src/components/` (extend `GlassElement` when it should be a glass surface). Dispatch the DOM events you want frameworks to see (`change`, `input`, `select`, `toggle`, `search`, `detent`).
2. Register it in `src/elements.ts`. Scenes are imported first so glass inside them finds the scene on upgrade.
3. Add a props interface and a `specs` entry in `src/bindings/specs.ts`:
   - `attrs`: string or boolean attributes (camelCase; the binding writes kebab-case)
   - `props`: values assigned as element properties after mount (controlled `checked`, `value`)
   - `events`: callback prop to `[DOM event name, mapper]`
   - `defaults`: uncontrolled prop to the attribute it seeds (`defaultChecked` to `checked`)
4. Export a React wrapper in `src/react/index.ts`: `export const GlassThing = create<GlassThingProps>("GlassThing");`
5. Export the same wrapper, with the same type parameter, in `src/vue/index.ts`.
6. Regenerate Svelte: `node scripts/gen-svelte.mjs`. The generator reads the React exports. If the element has named slots, add them to the `slots` map in that script. The default slot is automatic.
7. Document the new props, slots, and parts in `tests/unit/readme-api.ts`, then run `npx vite-node tests/readme/print-api.ts`. The unit test fails until the README matches.
8. Add an end-to-end case if the component has interaction the existing fixtures do not cover.

`tests/unit/parity.test.ts` checks that all three frameworks export the same names, prop lists, and two-way bindings (`v-model` / `bind` follow `onCheckedChange`, `onValueChange`, and `onOpenChange`). You should not need a hand-written Vue or Svelte prop list.

Two-way bindings are derived in `modelEvents()`: `onCheckedChange` binds `checked`, `onValueChange` binds `value`, and `onOpenChange` binds `open`.

### Commit conventions

- Use an imperative subject, optionally with a `feat`, `fix`, or `docs` prefix and a scope: `fix(scene): upload backdrop photos after decode`.
- One concern per commit when you can.

Coding agents working in a checkout should read [AGENTS.md](AGENTS.md). It has the same commands plus the repository rules in one place.
