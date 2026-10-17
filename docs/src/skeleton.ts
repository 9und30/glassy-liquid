/**
 * Loading states for the photographs behind the glass. A scene holds its size
 * from CSS, so nothing moves; until its picture has decoded it shows a soft
 * sheen in the scene's own color, and the picture fades in over it.
 */
import type { Scope } from "./scope";

type Scene = HTMLElement & { backdrop?: Element | null };

function pictureOf(scene: Scene): HTMLImageElement | null {
  const el = scene.backdrop ?? scene.querySelector(":scope > img");
  return el instanceof HTMLImageElement ? el : null;
}

function track(scene: Scene, scope: Scope): void {
  let watched: HTMLImageElement | null = null;
  const done = () => {
    scene.removeAttribute("data-loading");
    scene.setAttribute("data-loaded", "");
  };
  const check = () => {
    if (!scope.alive) return;
    const img = pictureOf(scene);
    const pending = !img || !img.getAttribute("src");
    if (!pending && img.complete) {
      // A failed picture keeps the scene's own color, not an endless sheen.
      done();
      return;
    }
    scene.setAttribute("data-loading", "");
    scene.removeAttribute("data-loaded");
    if (img && img !== watched) {
      watched = img;
      scope.on(img, "load", check);
      scope.on(img, "error", check);
    }
  };
  check();
  // data-src turns into src when the scene nears the viewport; the explorer swaps it.
  scope.observe(new MutationObserver(() => queueMicrotask(check))).observe(scene, { attributes: true, attributeFilter: ["src"] });
}

export function watchLoading(root: ParentNode, scope: Scope): void {
  for (const scene of root.querySelectorAll<Scene>("glass-scene")) {
    const photo = scene.hasAttribute("src") || scene.hasAttribute("data-src") || pictureOf(scene);
    if (photo) track(scene, scope);
  }
}
