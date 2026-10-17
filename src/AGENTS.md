# AGENTS.md for the library source

Everything under `src/` is published (compiled to `dist/`). The root [AGENTS.md](../AGENTS.md) still applies.

## Layers

Imports point one way. `core/` imports nothing else from `src/`. `engine/` builds on `core/`, `interaction/` on both, `components/` on all three, and `scene/` also on `components/base.ts`. `bindings/specs.ts` uses `core/` and `engine/` types, and the React, Vue, and Svelte bindings sit on top. Do not import a higher layer from a lower one, and never import a framework binding from an element.

## Public API changes

- `src/index.ts`, `src/elements.ts`, `src/react/index.ts`, `src/vue/index.ts`, `src/svelte/actions.ts`, `src/scene/scene.ts`, and `src/components/*.ts` are package entry points. Renaming or removing an export there is a breaking change. Note it in `CHANGELOG.md`.
- A prop, attribute, default, or event of a framework component is declared once in `bindings/specs.ts`. Then document it in `tests/unit/readme-api.ts` and run `npx vite-node tests/readme/print-api.ts`. That updates the README API block and the props JSDoc here. Do not hand-edit the JSDoc on the props interfaces. `tests/unit/readme-api.test.ts` fails when it drifts.
- React and Vue export the same components in the same order with the same type parameter. Svelte is generated (`node scripts/gen-svelte.mjs`). Never edit `svelte/components/*.svelte`.
- A new attribute on a `GlassElement` subclass goes in its `static extraAttributes` (handled in `attributeChanged`). Elements with their own `observedAttributes` getter list it there. Then add the spec entry above.

## Runtime rules

- Every entry point is imported during SSR, and `tests/unit/node-import.test.ts` imports each one from `dist/` in plain Node. Never touch `window`, `document`, `customElements`, or `HTMLElement` at module scope. Element classes extend `HTMLElementBase` from `components/base.ts` (a plain class on the server), `define()` registers only where `customElements` exists, and the bindings register the elements on the client (`registerElements()` in `bindings/specs.ts`).
- In the React binding use `useIsomorphicLayoutEffect`, never `React.useLayoutEffect`: React 18 warns for each layout effect during server rendering. `tests/unit/react-ssr.test.ts` fails on any server warning.
- Server-rendered elements carry `defer-hydration` and must stay inert (no `role`, `tabindex`, or styles) until it is removed. See `components/base.ts`.
- Assign controlled values through `assign()` in `bindings/specs.ts`, which waits for the element upgrade. Setting a property before the upgrade would shadow the class accessor.
- Animation work goes through the shared ticker in `core/ticker.ts`, which sleeps when idle. Do not start your own `requestAnimationFrame` loop.
- Respect `prefers-reduced-motion` (no elastic or snap animation) and `prefers-reduced-transparency` (opaque material).
- The minified CDN bundle (`dist/glassy-liquid.min.js`) has a gzip budget in `package.json` (`size-limit`). Check `npm run build && npm run size` after adding code to an element.

## Checks for a source change

```sh
npm run typecheck
npm test
npm run build
npm run size
npx playwright test tests/e2e/components.spec.ts tests/e2e/interaction.spec.ts --workers=2
```

Add `tests/e2e/engines.spec.ts` and `layout.spec.ts` for engine or renderer work, and `tests/e2e/examples.spec.ts` for binding or SSR work.
