/**
 * Light or dark glass, and keeping it in sync with the page.
 *
 * `auto` resolves, in order:
 *   1. the nearest inherited `--glass-appearance` (`light` | `dark`);
 *   2. the page's color scheme - `color-scheme` on the element or an
 *      ancestor, else `<meta name="color-scheme">`;
 *   3. the OS preference, but only where the page supports both schemes.
 *
 * A page that never opted into dark mode therefore keeps light glass in OS
 * dark mode, exactly like native form controls, so text the page styles
 * itself stays readable on the glass.
 */
import { isBrowser, prefersDark } from "../core/env.js";
import type { GlassAppearance } from "./materials.js";

/** Effective appearance of an element. `explicit` overrides its `appearance` attribute. */
export function resolveAppearance(el: Element, explicit?: string | null): GlassAppearance {
  const attr = explicit ?? el.getAttribute("appearance");
  if (attr === "light" || attr === "dark") return attr;
  const cs = getComputedStyle(el);
  const inherited = cs.getPropertyValue("--glass-appearance").trim();
  if (inherited === "dark" || inherited === "light") return inherited;
  return schemeAppearance(cs.colorScheme);
}

function schemeAppearance(value: string | undefined): GlassAppearance {
  let scheme = (value ?? "").trim();
  if (!scheme || scheme === "normal")
    scheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content ?? "";
  const dark = /\bdark\b/.test(scheme);
  if (!dark) return "light";
  return /\blight\b/.test(scheme) ? (prefersDark() ? "dark" : "light") : "dark";
}

const listeners = new Set<() => void>();
let watching = false;
let queued = 0;

function flush(): void {
  queued = 0;
  for (const cb of Array.from(listeners)) cb();
}

function notify(): void {
  if (queued) return;
  if (typeof requestAnimationFrame !== "function") return flush();
  queued = requestAnimationFrame(flush);
}

function watch(): void {
  if (watching || !isBrowser) return;
  watching = true;
  if (typeof matchMedia === "function")
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", notify);
  if (typeof MutationObserver === "undefined") return;
  // Theme switches usually flip a class, attribute or inline style on <html>
  // or <body>, or rewrite the color-scheme meta tag.
  const mo = new MutationObserver(notify);
  mo.observe(document.documentElement, { attributes: true });
  const observeBody = () => document.body && mo.observe(document.body, { attributes: true });
  if (document.body) observeBody();
  else document.addEventListener("DOMContentLoaded", observeBody, { once: true });
  if (document.head)
    mo.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content", "name"],
    });
}

/**
 * Run `callback` whenever the appearance may have changed (OS scheme, page
 * theme switch, `updateAppearance()`). Returns an unsubscribe function.
 */
export function onAppearanceChange(callback: () => void): () => void {
  listeners.add(callback);
  watch();
  return () => listeners.delete(callback);
}

/**
 * Re-resolve every glass element's appearance on the next frame. Changes on
 * `<html>`, `<body>` and the color-scheme meta tag are picked up on their
 * own; call this after setting `--glass-appearance` or `color-scheme` on any
 * other element.
 */
export function updateAppearance(): void {
  if (isBrowser) notify();
}
