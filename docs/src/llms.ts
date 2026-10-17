import { customSource } from "./custom-sample";
import { demos } from "./demos";
import { playgroundSnippets } from "./playground-snippets";
import { sampleSource } from "./samples";
import { SCENE_FALLBACK, SCENE_PHOTO } from "./scene-photo";

const pages = [
  ["Home", "./index.html", "what the library does and the live hero"],
  ["Components", "./components.html", "every component with Web Components, React, Vue, and Svelte code"],
  ["Playground", "./playground.html", "tune glass options and copy the snippet"],
  ["Getting started", "./getting-started.html", "install, frameworks, SSR, and your own element"],
  ["Theming", "./theming.html", "CSS custom properties and shadow parts"],
  ["Accessibility", "./accessibility.html", "roles, keyboard, and reduced motion or transparency"],
  ["Browser support", "./browser-support.html", "which renderer runs in which browser"],
] as const;

const repo = "https://github.com/9und30/glassy-liquid";

/** Where the docs site is published (GitHub Pages project site). */
export const SITE_URL = "https://9und30.github.io/glassy-liquid/";

/**
 * Where the text is read. `site` is the docs build (`/llms.txt` next to the
 * pages). `package` is the copy in the npm package (`dist/docs/`), where the
 * HTML pages do not exist and the README sits two folders up.
 */
export type LlmsTarget = "site" | "package";

/** Markers around the generated API reference in README.md. */
const API_START = "<!-- api:start -->";
const API_END = "<!-- api:end -->";

/**
 * The README API reference (generated from `src/bindings/specs.ts` and kept in
 * sync by `tests/unit/readme-api.test.ts`), without the markers.
 */
/** The README "Theming" section (custom properties, component knobs, parts), without its heading. */
export function themingSection(readme: string): string {
  const start = readme.indexOf("\n## Theming\n");
  const end = readme.indexOf("\n## ", start + 1);
  if (start < 0 || end < start) throw new Error("README.md is missing the Theming section");
  return readme.slice(start + "\n## Theming\n".length, end).trim();
}

export function apiReference(readme: string): string {
  const start = readme.indexOf(API_START);
  const end = readme.indexOf(API_END);
  if (start < 0 || end < start) throw new Error("README.md is missing the api markers");
  return readme.slice(start + API_START.length, end).trim();
}

const sceneStyle = `height: 100vh; background: ${SCENE_FALLBACK}`;

const cdnExample = `<script type="module" src="https://cdn.jsdelivr.net/npm/glassy-liquid@0.1/dist/glassy-liquid.min.js"></script>

<glass-scene src="${SCENE_PHOTO}" style="${sceneStyle}">
  <glass-button variant="prominent">Continue</glass-button>
  <glass-switch checked aria-label="Wi-Fi"></glass-switch>
</glass-scene>`;

const htmlExample = `<script type="module">
  import "glassy-liquid/elements";
</script>

<glass-scene src="${SCENE_PHOTO}" style="${sceneStyle}">
  <glass-button variant="prominent">Continue</glass-button>
  <glass-switch checked aria-label="Wi-Fi"></glass-switch>
</glass-scene>`;

const reactExample = `"use client";

import { useState } from "react";
import { GlassScene, GlassButton, GlassSwitch } from "glassy-liquid/react";

export function Welcome() {
  const [on, setOn] = useState(true);
  return (
    <GlassScene src="${SCENE_PHOTO}" style={{ height: "100vh", background: "${SCENE_FALLBACK}" }}>
      <GlassButton variant="prominent">Continue</GlassButton>
      <GlassSwitch checked={on} onCheckedChange={setOn} aria-label="Wi-Fi" />
    </GlassScene>
  );
}`;

const vueExample = `<script setup lang="ts">
import { ref } from "vue";
import { GlassScene, GlassButton, GlassSwitch } from "glassy-liquid/vue";

const on = ref(true);
</script>

<template>
  <GlassScene src="${SCENE_PHOTO}" style="${sceneStyle}">
    <GlassButton variant="prominent">Continue</GlassButton>
    <GlassSwitch v-model:checked="on" aria-label="Wi-Fi" />
  </GlassScene>
</template>`;

const svelteExample = `<script>
  import { GlassScene, GlassButton, GlassSwitch } from "glassy-liquid/svelte";
  let on = true;
</script>

<GlassScene src="${SCENE_PHOTO}" style="${sceneStyle}">
  <GlassButton variant="prominent">Continue</GlassButton>
  <GlassSwitch bind:checked={on} aria-label="Wi-Fi" />
</GlassScene>`;

const ssr = `The React entry (\`glassy-liquid/react\`) is a Client Component: the file starts with \`"use client"\`. In the Next.js App Router, import the components from a Client Component.

The React, Vue, and Svelte bindings render \`defer-hydration\` on each element and remove it after hydration. While the attribute is present the element stays inert, so server markup matches the hydrated tree.

Every entry point is safe to import on the server. Custom elements register only in the browser, where \`customElements\` exists, so importing \`glassy-liquid\`, \`glassy-liquid/elements\`, or a component module from code the server evaluates does not throw. \`glass()\`, \`useGlass()\`, and \`attachPress()\` touch the DOM, so call them in an effect or in \`onMount\`, as the playground snippets do.`;

function docsList(target: LlmsTarget): string {
  if (target === "package")
    return [
      "- [llms-full.txt](./llms-full.txt): this file plus the API reference, theming, and every component in every framework",
      "- [README.md](../../README.md): the full guide shipped with the package",
      ...pages.map(([label, href, note]) => `- [${label}](${pageUrl(href)}): ${note}, on the docs site`),
    ].join("\n");
  // Absolute, so the links still work when the text is passed on without its URL.
  return [
    `- [llms-full.txt](${SITE_URL}llms-full.txt): this file plus the API reference, theming, and every component in every framework`,
    ...pages.map(([label, href, note]) => `- [${label}](${pageUrl(href)}): ${note}`),
  ].join("\n");
}

/** Absolute docs site URL for a page link such as `./index.html`. */
function pageUrl(href: string): string {
  const file = href.replace(/^\.\//, "");
  return file === "index.html" ? SITE_URL : `${SITE_URL}${file}`;
}

function optionalList(): string {
  return [
    `- [README](${repo}#readme): the full guide, FAQ, and migration notes`,
    `- [Changelog](${repo}/blob/main/CHANGELOG.md)`,
    `- [Issues](${repo}/issues/new/choose): bug reports and feature requests. Pull requests are not accepted for now`,
  ].join("\n");
}

function componentCatalog(): string {
  return demos
    .map((demo) => {
      return `### ${demo.title}

${demo.lede}

Web Components:

\`\`\`html
${sampleSource(demo.html)}
\`\`\`

React:

\`\`\`tsx
${demo.react}
\`\`\`

Vue:

\`\`\`vue
${demo.vue}
\`\`\`

Svelte:

\`\`\`svelte
${demo.svelte}
\`\`\``;
    })
    .join("\n\n");
}

export function llmsTxt(target: LlmsTarget = "site"): string {
  return `# glassy-liquid

> Liquid Glass for the web: refraction, specular light, and the iOS 26 controls as Web Components, with React, Vue, and Svelte bindings.

Docs site: ${SITE_URL}

Every control is a custom element (\`<glass-button>\`, \`<glass-switch>\`, ...). The React, Vue, and Svelte components wrap those elements and are generated from one binding table, so they have the same names, props, defaults, and events. React callbacks such as \`onCheckedChange\` are \`v-model:checked\` in Vue and \`bind:checked\` in Svelte. Chromium refracts the live page behind the glass. Safari, every iOS browser, and Firefox show a frosted fallback unless the glass sits inside a \`<glass-scene>\` that names its backdrop (an image URL in \`src\`, or a \`glass-backdrop\` child).

## Install

\`\`\`sh
npm install glassy-liquid
\`\`\`

## CDN

The \`glassy-liquid/cdn\` export is \`dist/glassy-liquid.min.js\`. The script registers every element. \`src\` is any image URL.

\`\`\`html
${cdnExample}
\`\`\`

## Export map

- \`glassy-liquid\`: \`glass()\`, \`attachPress\`, and the engine
- \`glassy-liquid/elements\`: registers every custom element
- \`glassy-liquid/react\`
- \`glassy-liquid/vue\`
- \`glassy-liquid/svelte\`
- \`glassy-liquid/svelte/actions\`
- \`glassy-liquid/components/*\`: one module per component
- \`glassy-liquid/scene\`: the scene element on its own
- \`glassy-liquid/cdn\`: the minified bundle
- \`glassy-liquid/package.json\`: package metadata, not a runtime entry

## Scene image

\`src\` on \`glass-scene\` accepts any image URL. The URL below is a public CC0 photograph, so the example works when pasted. The scene also paints \`${SCENE_FALLBACK}\` when the image fails, and it hides the broken-image icon.

${SCENE_PHOTO}

## Web Components

With a bundler such as Vite. Without a build step, use the CDN script above: a bare \`import "glassy-liquid/elements"\` only resolves through a bundler or an import map.

\`\`\`html
${htmlExample}
\`\`\`

## React

\`\`\`tsx
${reactExample}
\`\`\`

## Vue

\`\`\`vue
${vueExample}
\`\`\`

## Svelte

\`\`\`svelte
${svelteExample}
\`\`\`

## Next.js and server rendering

${ssr}

## Docs

${docsList(target)}

## Optional

${optionalList()}
`;
}

/**
 * `llms.txt` plus the API reference, the custom-element sample, and every
 * component demo. `readme` is the README.md text the API reference is taken from.
 */
export function llmsFullTxt(readme: string, target: LlmsTarget = "site"): string {
  const play = playgroundSnippets();
  return `${llmsTxt(target)}
## API reference

${apiReference(readme)}

## Theming

${themingSection(readme)}

## Your own element

\`\`\`js
${customSource}
\`\`\`

## Playground useGlass

The slab needs a size. The snippet sets 280 by 168. In Next.js the React file is a Client Component.

\`\`\`tsx
${play.react}
\`\`\`

## Every component

${componentCatalog()}
`;
}

export function robotsTxt(origin: string | undefined): string {
  const lines = ["User-agent: *", "Allow: /", ""];
  if (origin) {
    lines.push(`Sitemap: ${origin.replace(/\/$/, "")}/sitemap.xml`, "");
  } else {
    lines.push(
      "# Sitemap is omitted. This build uses a relative base (./ or a path prefix",
      "# such as /glassy-liquid/). A sitemap loc has to be an absolute URL.",
      "# Set DOCS_ORIGIN (the public URL of this folder, such as",
      "# https://9und30.github.io/glassy-liquid) when building to write sitemap.xml.",
      "",
    );
  }
  return lines.join("\n");
}

export function sitemapXml(origin: string): string {
  const root = origin.replace(/\/$/, "");
  const urls = pages
    .map(([, href]) => {
      const file = href.replace(/^\.\//, "");
      return `  <url><loc>${root}/${file === "index.html" ? "" : file}</loc></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export { htmlExample, reactExample, vueExample, svelteExample, pages as sitePages };
