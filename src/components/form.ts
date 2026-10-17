/**
 * Shared helpers for form-associated glass controls.
 */
export function attachInternals(el: HTMLElement): ElementInternals | null {
  try {
    return el.attachInternals();
  } catch {
    return null;
  }
}

/** Read a CSS custom property from an element (trimmed), with fallback. */
export function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** iOS system colors, light/dark. */
export const systemColors = {
  green: ["#34c759", "#30d158"],
  blue: ["#007aff", "#0a84ff"],
  fill: ["rgba(120,120,128,0.2)", "rgba(120,120,128,0.36)"],
  track: ["rgba(120,120,128,0.2)", "rgba(120,120,128,0.32)"],
} as const;
