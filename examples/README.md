# Examples

Four small apps that use glassy-liquid the way a consumer would. They are npm workspaces of the root package and depend on it through `file:../..`, so run `npm install` in the repository root first. That also builds `dist/`.

| Folder        | What it shows                                        | Start                                                      |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `vanilla-cdn` | Web Components from the minified module, no framework | `npm run dev --prefix examples/vanilla-cdn` (port 5201)    |
| `react`       | React components with controlled state               | `npm run dev --prefix examples/react` (port 5202)          |
| `vue`         | Vue components with `v-model`                        | `npm run dev --prefix examples/vue` (port 5203)            |
| `svelte`      | Svelte 5 components with `bind:`, plus a Svelte 4 file | `npm run dev --prefix examples/svelte` (port 5204)       |

`npm run examples:build` in the root builds all four. `tests/e2e/examples.spec.ts` starts each one and checks that it renders glass without console errors.
