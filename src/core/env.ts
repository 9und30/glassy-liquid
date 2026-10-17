/**
 * Environment and capability detection. Evaluated lazily and cached.
 */
export type EngineKind = "backdrop" | "scene-gl" | "scene-dom" | "css";

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

let backdropUrl: boolean | undefined;

/**
 * Whether `backdrop-filter: url(#svg)` actually renders. Only Chromium-based
 * engines do (Chrome, Edge, Opera, Samsung Internet, Electron, Android
 * WebView). WebKit parses but drops it, Gecko does not support it. Every
 * browser on iOS/iPadOS is WebKit, regardless of its brand.
 */
export function supportsBackdropSvg(): boolean {
  if (backdropUrl !== undefined) return backdropUrl;
  if (!isBrowser) return (backdropUrl = false);
  const nav = navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } };
  const brands = nav.userAgentData?.brands;
  let chromium: boolean;
  if (brands && brands.length)
    chromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand));
  else {
    const ua = navigator.userAgent;
    const ios =
      /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    chromium = !ios && /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
  }
  backdropUrl = chromium && cssSupports("backdrop-filter", "url(#a)");
  return backdropUrl;
}

export function cssSupports(property: string, value: string): boolean {
  return (
    isBrowser &&
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports(property, value)
  );
}

export function supportsBackdropFilter(): boolean {
  return (
    cssSupports("backdrop-filter", "blur(1px)") ||
    cssSupports("-webkit-backdrop-filter", "blur(1px)")
  );
}

let webgl: boolean | undefined;
export function supportsWebGL(): boolean {
  if (webgl !== undefined) return webgl;
  if (!isBrowser) return (webgl = false);
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}

export function devicePixelRatio(): number {
  return isBrowser ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1;
}

function media(query: string): boolean {
  return isBrowser && typeof matchMedia === "function" && matchMedia(query).matches;
}

export const prefersReducedMotion = (): boolean => media("(prefers-reduced-motion: reduce)");
export const prefersReducedTransparency = (): boolean =>
  media("(prefers-reduced-transparency: reduce)");
export const prefersDark = (): boolean => media("(prefers-color-scheme: dark)");
export const forcedColors = (): boolean => media("(forced-colors: active)");
export const finePointer = (): boolean => media("(hover: hover) and (pointer: fine)");

/** Subscribe to a media query; returns an unsubscribe function. */
export function watchMedia(query: string, cb: () => void): () => void {
  if (!isBrowser || typeof matchMedia !== "function") return () => {};
  const mq = matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

let uid = 0;
export const nextId = (prefix: string): string => `${prefix}${(++uid).toString(36)}`;

export { isBrowser };
