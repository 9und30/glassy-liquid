/**
 * The glass pill under the header links. It is a real glass() surface on
 * springs: it leans toward a hovered link, squeezes under a press, and on a
 * click slides to the new section before the page has even arrived, stretching
 * with its speed like a drop of liquid, then settling with a little overshoot.
 */
import { Spring, glass, springs, type GlassSurface, type SpringConfig } from "glassy-liquid";
import { pageFile, perFrame, resolveHref } from "./router";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Which header link stands for each page. Guide covers the guide pages. */
const section: Record<string, string> = {
  "components.html": "components.html",
  "playground.html": "playground.html",
  "getting-started.html": "getting-started.html",
  "theming.html": "getting-started.html",
  "accessibility.html": "getting-started.html",
  "browser-support.html": "browser-support.html",
};

export interface NavIndicator {
  /** A navigation to this URL just started. */
  go(url: URL): void;
  /** The page changed (or a navigation was abandoned): match what is shown. */
  sync(): void;
}

export function initNavIndicator(): NavIndicator {
  const strip = document.querySelector<HTMLElement>(".nav__links");
  const bar = document.querySelector<HTMLElement>(".nav__bar");
  const noop: NavIndicator = { go: () => {}, sync: () => {} };
  if (!strip || !bar) return noop;
  const links = Array.from(strip.querySelectorAll<HTMLAnchorElement>("a.nav__link"));
  const pill = document.createElement("span");
  pill.className = "nav__pill";
  pill.setAttribute("aria-hidden", "true");
  strip.prepend(pill);
  strip.setAttribute("data-indicator", "");

  let surface: GlassSurface | null = null;
  const appearance = (): "dark" | "light" => (bar.getAttribute("appearance") === "dark" ? "dark" : "light");
  const tune = () => {
    const dark = appearance() === "dark";
    // Over a photo the bar is smoked glass; the pill stays the lighter, clearer drop in it.
    const opts = {
      radius: "capsule" as const,
      material: "clear" as const,
      appearance: "light" as const,
      refraction: 14,
      bezel: 14,
      blur: 3,
      specular: dark ? 1.5 : 1.25,
      dispersion: 0.2,
      shadow: false,
      fill: dark ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.62)",
    };
    if (surface) surface.set(opts);
    else surface = glass(pill, opts);
  };
  tune();
  new MutationObserver(tune).observe(bar, { attributes: true, attributeFilter: ["appearance"] });

  const x = new Spring(0, springs.snap);
  const w = new Spring(0, springs.snap);
  const press = new Spring(1, springs.press);
  let shown = false;
  let current: HTMLAnchorElement | null = null;
  let hover: HTMLAnchorElement | null = null;
  let raf = 0;
  let last = 0;

  const box = (a: HTMLAnchorElement) => {
    const s = strip.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    return { x: r.left - s.left, w: r.width };
  };

  const paint = () => {
    const speed = Math.abs(x.velocity);
    // Stretch along the motion, thin a little across it: liquid, not a block.
    const stretch = reducedMotion() ? 0 : Math.min(48, speed * 0.045);
    const squash = reducedMotion() ? 1 : 1 - Math.min(0.14, speed * 0.00016);
    const width = Math.max(0, w.value + stretch);
    pill.style.width = `${width.toFixed(2)}px`;
    pill.style.transform = `translate3d(${(x.value - stretch / 2).toFixed(2)}px, -50%, 0) scale(${press.value.toFixed(4)}, ${(press.value * squash).toFixed(4)})`;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    x.step(dt);
    w.step(dt);
    press.step(dt);
    paint();
    raf = x.settled && w.settled && press.settled ? 0 : requestAnimationFrame(frame);
  };

  const kick = () => {
    if (reducedMotion()) {
      x.set(x.target);
      w.set(w.target);
      press.set(press.target);
      paint();
      return;
    }
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const aim = (config: SpringConfig = springs.snap) => {
    if (!current) return;
    const home = box(current);
    let tx = home.x;
    let tw = home.w;
    if (hover && hover !== current) {
      // Lean toward the hovered link, as if the glass were drawn to it.
      const h = box(hover);
      tx += (h.x - home.x) * 0.1;
      tw += 4;
    }
    x.to(tx, config);
    w.to(tw, config);
    kick();
  };

  const show = (link: HTMLAnchorElement | null) => {
    const was = current;
    current = link;
    if (!link) {
      shown = false;
      pill.removeAttribute("data-on");
      return;
    }
    if (!shown || !was) {
      // Appear in place: no slide in from wherever the pill was last.
      const b = box(link);
      x.set(b.x);
      w.set(b.w);
      paint();
    }
    shown = true;
    pill.setAttribute("data-on", "");
    aim();
  };

  const linkFor = (url: URL): HTMLAnchorElement | null => {
    const file = pageFile(url);
    const target = file ? section[file] : undefined;
    if (!target) return null;
    return links.find((a) => (a.getAttribute("href") ?? "").endsWith(target)) ?? null;
  };

  const pending = (url: URL | null) => {
    const file = url ? pageFile(url) : null;
    for (const a of document.querySelectorAll<HTMLAnchorElement>(".nav__link, .menu-links a, .foot a")) {
      const on = !!file && pageFile(resolveHref(a.getAttribute("href") ?? "")) === file;
      a.toggleAttribute("data-pending", on);
    }
  };

  for (const a of links) {
    a.addEventListener("pointerenter", () => {
      hover = a;
      aim(springs.layout);
    });
    a.addEventListener("pointerleave", () => {
      if (hover === a) hover = null;
      aim(springs.layout);
    });
    a.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (a === current) {
        press.to(0.92, springs.press);
        kick();
      }
    });
  }
  const letGo = () => {
    if (press.target === 1) return;
    press.to(1, springs.release);
    kick();
  };
  addEventListener("pointerup", letGo);
  addEventListener("pointercancel", letGo);

  const ro = new ResizeObserver(
    perFrame(() => {
      if (!current) return;
      const b = box(current);
      x.set(b.x);
      w.set(b.w);
      paint();
    }),
  );
  ro.observe(strip);
  void document.fonts?.ready.then(() => api.sync());

  const api: NavIndicator = {
    go(url) {
      pending(url);
      const link = linkFor(url);
      hover = null;
      press.to(1, springs.release);
      show(link);
    },
    sync() {
      pending(null);
      show(linkFor(new URL(location.href)));
    },
  };
  api.sync();
  return api;
}
