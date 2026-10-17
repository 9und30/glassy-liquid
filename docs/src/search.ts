import { demos, glassProps, type Demo } from "./demos";

export interface SearchEntry {
  label: string;
  hint: string;
  href: string;
  group: string;
  text: string;
  synonyms: string[];
}

const STOP = new Set([
  "how",
  "do",
  "i",
  "the",
  "a",
  "an",
  "to",
  "of",
  "for",
  "and",
  "or",
  "on",
  "in",
  "is",
  "it",
  "my",
  "with",
  "can",
  "what",
  "which",
  "does",
  "me",
  "from",
  "into",
  "that",
  "this",
  "are",
  "be",
  "if",
  "we",
  "you",
]);

/** Lowercase terms. CamelCase splits, stopwords drop, the original token stays. */
export function queryTokens(query: string): string[] {
  const split = query
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9.+#]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOP.has(term));
  return [...new Set(split)];
}

function entry(partial: Omit<SearchEntry, "synonyms"> & { synonyms?: string[] }): SearchEntry {
  return { synonyms: [], ...partial };
}

function demoText(demo: Demo): string {
  return [
    demo.lede,
    demo.html,
    demo.react,
    demo.vue,
    demo.svelte,
    ...(demo.props ?? []).flat(),
    ...(demo.events ?? []).flat(),
  ].join(" ");
}

const pageEntries: SearchEntry[] = [
  entry({
    label: "Home",
    hint: "the catalog",
    href: "./index.html",
    group: "Pages",
    text: "liquid glass refraction catalog components",
  }),
  entry({
    label: "Bundle size",
    hint: "gzip for every component",
    href: "./index.html#performance",
    group: "Pages",
    text: "gzip for every component, all renderers and the WebGL path. Bundle size. Performance.",
    synonyms: ["bundle size", "gzip", "kb", "size", "bundle"],
  }),
  entry({
    label: "Getting started",
    hint: "install and first glass",
    href: "./getting-started.html",
    group: "Pages",
    text: "npm install glassy-liquid first surface button switch glass-scene",
  }),
  entry({
    label: "Next.js and server rendering",
    hint: "use client, defer-hydration",
    href: "./getting-started.html#ssr",
    group: "Pages",
    text: "Next.js App Router server rendering. The React entry is a Client Component because the file starts with use client. Bindings render defer-hydration and remove it after hydration. Every entry point is safe to import on the server. Custom elements register only in the browser. Call glass(), useGlass(), and attachPress() in an effect or onMount.",
    synonyms: ["next.js", "nextjs", "ssr", "server component", "use client", "hydration", "app router"],
  }),
  entry({
    label: "Playground",
    hint: "every option, live",
    href: "./playground.html",
    group: "Pages",
    text: "tune blur refraction tint radius",
  }),
  entry({
    label: "Theming",
    hint: "accent, appearance, parts",
    href: "./theming.html",
    group: "Pages",
    text: "accent appearance font parts",
  }),
  entry({
    label: "Appearance",
    hint: "light, dark, and dark mode",
    href: "./theming.html#properties",
    group: "Guide",
    text: "appearance auto light dark. --glass-appearance. color-scheme. A page can follow the operating system or stay light.",
    synonyms: ["dark mode", "light mode", "color scheme", "colour scheme", "theme", "dark"],
  }),
  entry({
    label: "Sheet tint",
    hint: "tint, blur, and material on glass-sheet",
    href: "./theming.html#sheet",
    group: "Guide",
    text: "glass-sheet tint blur material ::part(glass) recipe",
    synonyms: ["sheet tint", "tint a sheet"],
  }),
  entry({
    label: "Accessibility",
    hint: "keyboard, motion, contrast",
    href: "./accessibility.html",
    group: "Pages",
    text: "keyboard focus reduced motion contrast roles switch slider",
    synonyms: ["keyboard", "focus", "reduced motion", "a11y"],
  }),
  entry({
    label: "Browser support",
    hint: "Safari 16.4+, Firefox 103+, Chromium",
    href: "./browser-support.html",
    group: "Pages",
    text: "Safari 16.4+ on macOS and every browser on iOS and iPadOS uses a frosted fallback on the page and WebGL inside a scene. Firefox 103+ does the same. Chrome, Edge, Opera, Samsung Internet, and Electron refract the live page. Safari fallback. Which browsers.",
    synonyms: ["safari", "safari fallback", "webkit", "firefox", "chrome", "which browsers", "browsers", "ios"],
  }),
];

const optionEntries: SearchEntry[] = glassProps.map(([name, type, def, note]) =>
  entry({
    label: name,
    hint: "glass option",
    href: "./playground.html",
    group: "Options",
    text: `${name} ${type} ${def} ${note}`,
    synonyms:
      name === "blur"
        ? ["change the blur", "frost", "how do i change the blur"]
        : name === "appearance"
          ? ["dark mode", "light mode"]
          : [],
  }),
);

const componentEntries: SearchEntry[] = demos.flatMap((demo) => {
  const base = entry({
    label: demo.title,
    hint: demo.lede,
    href: `./components.html#c-${demo.id}`,
    group: "Components",
    text: demoText(demo),
  });
  if (demo.id !== "slider") return [base];
  return [
    base,
    entry({
      label: "Slider events",
      hint: "input, change, onValueChange, onValueCommit",
      href: "./components.html#c-slider",
      group: "Components",
      text: "slider input change onValueChange onValueCommit while dragging and on release",
      synonyms: ["onchange", "onvaluechange", "onvaluecommit", "slider event", "slider events"],
    }),
  ];
});

export const searchEntries: SearchEntry[] = [...pageEntries, ...componentEntries, ...optionEntries];

export interface Ranked {
  entry: SearchEntry;
  score: number;
  /**
   * Matched the label or a synonym. A hint or body hit is weak: "keyboard
   * support" on Menu should not sit under Browser support.
   */
  strong: boolean;
}

export function rankEntries(query: string, entries: SearchEntry[] = searchEntries): SearchEntry[] {
  const terms = queryTokens(query);
  if (!terms.length) return entries.filter((item) => item.group !== "Options");
  const phrase = query.toLowerCase().replace(/\s+/g, " ").trim();
  const ranked: Ranked[] = [];
  for (const item of entries) {
    const label = item.label.toLowerCase();
    const hint = item.hint.toLowerCase();
    const body = `${item.text} ${item.group}`.toLowerCase();
    const synonyms = item.synonyms.map((synonym) => synonym.toLowerCase());
    let score = 0;
    let hits = 0;
    let strong = false;
    if (phrase && (label === phrase || synonyms.some((synonym) => synonym === phrase))) {
      score += 20;
      strong = true;
    } else if (phrase && synonyms.some((synonym) => synonym.includes(phrase))) {
      score += 12;
      strong = true;
    }
    for (const term of terms) {
      if (synonyms.some((synonym) => synonym === term)) {
        score += 14;
        hits += 1;
        strong = true;
      } else if (label.includes(term)) {
        score += 8;
        hits += 1;
        strong = true;
      } else if (synonyms.some((synonym) => synonym.includes(term))) {
        score += 6;
        hits += 1;
        strong = true;
      } else if (hint.includes(term)) {
        score += 4;
        hits += 1;
      } else if (body.includes(term)) {
        score += 3;
        hits += 1;
      }
    }
    if (!hits) continue;
    if (hits === terms.length) score += 10;
    score += hits;
    ranked.push({ entry: item, score, strong });
  }
  ranked.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  const top = ranked[0]?.score ?? 0;
  const anyStrong = ranked.some((item) => item.strong);
  return ranked
    .filter((item) => {
      // A generic word inside a component's source (Menu, Sheet, Scroll edge)
      // should not sit under the page that actually owns the query.
      if (anyStrong && !item.strong) return false;
      return top <= 0 || item.score >= top * 0.55;
    })
    .map((item) => item.entry);
}
