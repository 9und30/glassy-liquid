# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Sliders can opt into a floating value label with `show-value` (`showValue` in React, Vue, and Svelte). The label appears while dragging or using the keyboard and uses `aria-valuetext` when supplied.
- The docs hero has a Glass/Frost comparison that keeps the lens in place and shows the difference between refraction and blur.
- A contextual dock demo shows how the existing toolbar and buttons adapt to photo selection, sorting, and batch favorite actions.

### Changed

- Glass more than a viewport off screen pauses. It skips re-renders for resizes and for option, appearance, and pixel ratio changes, and catches up a viewport before it scrolls back in. A `<glass-scene>` off screen stops its frame loop, also for video backdrops, and a scene on screen skips WebGL draws for its glass that is far off screen. The new read-only `surface.offscreen` tells whether a surface is paused. Without `IntersectionObserver` (server, old engines) nothing pauses.

### Fixed

- Active slider drags survive synchronous DOM moves and still emit one commit. Disabling or removing a slider during its first input releases all global drag listeners.
- The hero lens keeps clear of the comparison controls, player, and renderer note in short windows and with larger text.
- Contextual dock actions reflow with enlarged text so their labels stay inside separate click targets.
- Glass stays readable with `prefers-reduced-transparency: reduce` (macOS "Reduce transparency"). The opaque fill used to be light gray in every case, so white text on dark or clear glass disappeared. It now follows the appearance, light or dark, for both materials, and text and icons switch to the matching color. Glass without a backdrop or with a transparent fill stays see-through, the backdrop filter is skipped behind the opaque fill, the segmented track turns opaque too, and switch, slider, and selection thumbs stay solid instead of lifting into a lens. `MaterialSpec` has two new fields for this, `solid` and `solidForeground`.
- Docs site: with reduced transparency the nav bar, the hero player, and the hero lens are readable again, and the current section is underlined instead of marked by a glass pill.
- The Vue and Svelte quick starts in the README give `GlassScene` a height of `100vh`, like the React one. Without it the scene was only as tall as its controls and the rest of the page stayed blank white.
- A `<glass-scene>` that comes back into view redraws at once instead of waiting for the next scroll event.

## [0.1.0] - 2026-10-18

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

[Unreleased]: https://github.com/9und30/glassy-liquid/compare/v0.1.0...HEAD
[0.1.0]: https://www.npmjs.com/package/glassy-liquid/v/0.1.0
