# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

First release.

### Added

- Web Components for the iOS 26 Liquid Glass control set: scene, surface, button, switch, slider, tab bar, segmented control, menu, toolbar, group, spacer, search, sheet, and progressive blur.
- `<glass-scene>` for real refraction in Safari, iOS, iPadOS, and Firefox: WebGL for images, video, and canvas, and a DOM content filter for live markup. The image created for `src` lives in the scene shadow root. Style it with `glass-scene::part(backdrop)`.
- Tiered renderers: `backdrop` (Chromium), `scene-gl`, `scene-dom`, and a calibrated CSS frost fallback.
- `glass()` to turn any element into a glass surface, `attachPress()` for the press response, and a `GlassElement` base class for your own elements.
- React 18 and 19 bindings (`glassy-liquid/react`), including `useGlass`.
- Vue 3 bindings (`glassy-liquid/vue`) with the same props, callback props, and `v-model`.
- Svelte 4 and 5 bindings (`glassy-liquid/svelte`) with `bind:`, plus `glassy-liquid/svelte/actions` for raw elements.
- One binding table (`src/bindings/specs.ts`) behind all three frameworks, so React, Vue, and Svelte have the same components, props, defaults, and events.
- Server rendering and hydration through a `defer-hydration` attribute. Every entry point is safe to import on the server.
- Typed props with JSDoc descriptions and defaults.
- A minified CDN bundle, `dist/glassy-liquid.min.js` (about 35 kB gzip). No runtime dependencies.
- Agent-readable docs in the package: `dist/docs/llms.txt` and `dist/docs/llms-full.txt`.
- Docs site with live demos, a playground, and guides at https://9und30.github.io/glassy-liquid/.

[0.1.0]: https://www.npmjs.com/package/glassy-liquid/v/0.1.0
