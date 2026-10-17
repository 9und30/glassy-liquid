/** Identifiers marked `snippet: <id>` inside README code fences. */
export const browserSnippetIds = [
  "quick-start",
  "react-settings",
  "cdn",
  "vue-settings",
  "svelte-settings",
  "svelte-actions",
  "scenes",
  "glass-api",
  "use-glass",
  "theme",
  "custom-element",
  "vue-custom-element",
  "migrate",
] as const;

export const shellSnippetIds = ["install", "scripts"] as const;

export type BrowserSnippetId = (typeof browserSnippetIds)[number];
