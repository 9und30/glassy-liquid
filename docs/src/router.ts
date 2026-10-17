/**
 * Client-side navigation for the docs. Every page is plain static HTML, so the
 * router only fetches the next page, swaps <main>, and keeps the URL, history,
 * scroll, focus, and title honest. Anything it does not understand falls back
 * to a normal page load, so static hosting needs no rewrites.
 */

/** The seven pages the site ships. Links to anything else load normally. */
export const docsPages = [
  "index.html",
  "components.html",
  "playground.html",
  "getting-started.html",
  "theming.html",
  "accessibility.html",
  "browser-support.html",
] as const;

interface RouteState {
  docsRoute: true;
  scroll: number;
}

export interface RouterHooks {
  isPage(url: URL): boolean;
  /** The click is accepted; the page is not here yet. Instant feedback goes here. */
  start(url: URL): void;
  /** The new <main> is in the document. Wire it up. */
  swap(url: URL): void;
  /** The navigation fell through to a full page load or was abandoned. */
  fail(): void;
}

const dir = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);
// The 404 page has a <base> at the site folder, because Pages serves it at any depth.
const siteDir = dir(new URL(document.baseURI).pathname);
const hasBase = () => !!document.querySelector("base[href]");

/** A link target the way the browser reads it: against <base>, and fragments against this page. */
export const resolveHref = (href: string): URL =>
  new URL(href, href.startsWith("#") ? location.href : document.baseURI);

/** Page file name for a URL inside the docs folder, or null. "/" counts as index.html. */
export function pageFile(url: URL): string | null {
  if (url.origin !== location.origin) return null;
  if (dir(url.pathname) !== siteDir) return null;
  const file = url.pathname.slice(siteDir.length) || "index.html";
  return (docsPages as readonly string[]).includes(file) ? file : null;
}

export const isDocsPage = (url: URL) => pageFile(url) !== null;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/**
 * One key per page: "/" and "/index.html" (or "/glassy-liquid/" and its
 * index.html) are the same page. Query and fragment do not count.
 */
const key = (url: URL) => {
  const file = pageFile(url);
  return file ? `${url.origin}${siteDir}${file}` : url.href.split("#")[0]!;
};

/** True when the URL points at the page that is on screen now. */
export const samePage = (url: URL) => key(url) === rendered;

const cache = new Map<string, Promise<string>>();

function load(url: URL): Promise<string> {
  const k = key(url);
  let hit = cache.get(k);
  if (!hit) {
    hit = fetch(k, { credentials: "same-origin" }).then((res) => {
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !/html/.test(type)) throw new Error(`${res.status} ${type}`);
      return res.text();
    });
    // A failed prefetch must not poison the click that follows.
    hit.catch(() => cache.delete(k));
    cache.set(k, hit);
  }
  return hit;
}

/** Warm the cache for a link. Cheap and idempotent. */
export function prefetch(url: URL): void {
  if (!pageFile(url) || samePage(url)) return;
  void load(url).catch(() => {});
}

let hooks: RouterHooks | null = null;
let rendered = key(new URL(location.href));
let token = 0;

function saveScroll(): void {
  const state: RouteState = { ...(history.state as object | null), docsRoute: true, scroll: scrollY };
  history.replaceState(state, "");
}

// "instant" by name: html { scroll-behavior: smooth } would otherwise animate
// every jump, and Chromium ignores a scroll-behavior toggled in the same task.
function instantScroll(top: number): void {
  window.scrollTo({ top, left: 0, behavior: "instant" });
}

function scrollToHash(hash: string): boolean {
  const id = decodeURIComponent(hash.slice(1));
  const el = id ? document.getElementById(id) : null;
  if (!el) return false;
  el.scrollIntoView({ block: "start", behavior: "instant" });
  return true;
}

/** Scroll anchoring off for a moment, so late layout cannot nudge a jump. */
let anchorTimer = 0;
function pauseAnchoring(ms: number): void {
  const root = document.documentElement;
  root.style.overflowAnchor = "none";
  window.clearTimeout(anchorTimer);
  anchorTimer = window.setTimeout(() => root.style.removeProperty("overflow-anchor"), ms);
}

/** Coalesce observer callbacks into one frame, so a callback never feeds its own observer. */
export function perFrame(fn: () => void): () => void {
  let queued = 0;
  return () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      fn();
    });
  };
}

let announcer: HTMLElement | null = null;
function announce(text: string): void {
  if (!announcer) {
    announcer = document.createElement("p");
    announcer.className = "sr-only";
    announcer.setAttribute("aria-live", "polite");
    announcer.id = "route-announcer";
    document.body.append(announcer);
  }
  announcer.textContent = text;
}

/** Same module, same stylesheet: otherwise this is another build and needs a real load. */
function compatible(next: Document, url: URL): boolean {
  const sig = (doc: Document, base: string) =>
    Array.from(doc.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]'), (el) => {
      const ref = new URL(el.getAttribute("src") ?? el.getAttribute("href") ?? "", base);
      // The dev server stamps ?t= on modules; the file is what matters.
      return ref.origin + ref.pathname;
    }).join("|");
  return sig(next, url.href) === sig(document, document.baseURI);
}

function focusPage(hash: string): void {
  const id = hash ? decodeURIComponent(hash.slice(1)) : "";
  const target = (id && document.getElementById(id)) || document.querySelector<HTMLElement>("main h1") || document.querySelector<HTMLElement>("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.setAttribute("data-route-focus", "");
    target.addEventListener("blur", () => {
      if (target.hasAttribute("data-route-focus")) {
        target.removeAttribute("tabindex");
        target.removeAttribute("data-route-focus");
      }
    }, { once: true });
  }
  target.focus({ preventScroll: true });
  // A closing popover (the menu sheet) may hand focus back to its button a
  // moment later. Until the reader does something, keep focus on the page.
  let acted = false;
  const act = () => (acted = true);
  const keep = (e: FocusEvent) => {
    const to = e.target as Node | null;
    if (acted || !to || document.querySelector("main")?.contains(to)) return;
    target.focus({ preventScroll: true });
  };
  document.addEventListener("pointerdown", act, true);
  document.addEventListener("keydown", act, true);
  document.addEventListener("focusin", keep);
  setTimeout(() => {
    document.removeEventListener("pointerdown", act, true);
    document.removeEventListener("keydown", act, true);
    document.removeEventListener("focusin", keep);
  }, 1200);
}

const frame = () =>
  new Promise<void>((done) => {
    requestAnimationFrame(() => setTimeout(done, 0));
    setTimeout(done, 100);
  });

const glassy = (el: Element) => el.localName.startsWith("glass-") || !!el.querySelector("glass-scene, glass-surface, glass-button, glass-slider, glass-switch, glass-toolbar, glass-tab-bar");

/**
 * Children of the new <main> that can wait a frame: from the third child on,
 * everything after the first one that carries glass. Every glass element sets
 * itself up the moment it is connected, so this lets the top of the page paint
 * before the sections below the fold are built.
 */
function later(fresh: Element): Element[] {
  const kids = Array.from(fresh.children);
  const from = kids.findIndex((el, i) => i >= 2 && glassy(el));
  return from < 0 ? [] : kids.slice(from);
}

async function apply(next: Document, url: URL, popped: boolean, pop: RouteState | null): Promise<void> {
  const main = document.querySelector("main");
  const incoming = next.querySelector("main");
  if (!main || !incoming) throw new Error("no main");
  const fresh = document.adoptNode(incoming);
  pauseAnchoring(1000);
  // Back, forward, and anchors need the full height before they scroll.
  const rest = popped || url.hash ? [] : later(fresh);
  for (const el of rest) el.remove();
  document.title = next.title;
  const desc = next.querySelector('meta[name="description"]')?.getAttribute("content");
  if (desc) document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
  document.body.dataset.page = next.body.dataset.page ?? "";
  if (!popped) history.pushState({ docsRoute: true, scroll: 0 } satisfies RouteState, "", url.href);
  rendered = key(url);
  if (!reducedMotion()) {
    fresh.classList.add("route-enter");
    // A page that lands on an anchor or a saved offset only fades: no slide under the reader.
    if (popped || url.hash) fresh.classList.add("route-in-place");
  }
  main.replaceWith(fresh);
  if (rest.length) {
    instantScroll(0);
    await frame();
    fresh.append(...rest);
  }
  hooks?.swap(url);
  // A popped entry with a saved offset goes back there; one without (a fragment
  // the browser added) goes to its fragment, like a fresh visit.
  if (pop) holdScroll(pop.scroll, fresh);
  else if (!url.hash || !scrollToHash(url.hash)) instantScroll(0);
  focusPage(pop ? "" : url.hash);
  announce(next.title.replace(/\. glassy-liquid$/, "").replace(/^glassy-liquid\. /, ""));
}

/**
 * Back and forward: go to the saved offset and hold it for a moment while
 * late layout settles (upgraded elements, scroll anchoring), unless the reader
 * scrolls first.
 */
function holdScroll(top: number, main: Element): void {
  instantScroll(top);
  const ro = new ResizeObserver(
    perFrame(() => {
      if (Math.abs(scrollY - top) > 1) instantScroll(top);
    }),
  );
  ro.observe(main);
  ro.observe(document.body);
  const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  const stop = () => {
    ro.disconnect();
    for (const t of events) removeEventListener(t, stop, true);
  };
  for (const t of events) addEventListener(t, stop, { capture: true, passive: true });
  requestAnimationFrame(() => {
    if (Math.abs(scrollY - top) > 1) instantScroll(top);
  });
  setTimeout(stop, 1000);
}

/** A swap in progress; the next one waits for it so two never interleave. */
let swapping: Promise<void> = Promise.resolve();

/**
 * Go to a docs page without a full load. Resolves once the new page is in
 * place, or after it handed off to the browser.
 */
export async function navigate(
  target: URL | string,
  opts: { popped?: boolean; pop?: RouteState | null } = {},
): Promise<void> {
  const url = typeof target === "string" ? resolveHref(target) : target;
  // A swapped page would keep this page's <base>, so leave the 404 page with a real load.
  if (!hooks || !hooks.isPage(url) || hasBase()) {
    location.assign(url.href);
    return;
  }
  const popped = !!opts.popped;
  const pop = opts.pop ?? null;
  const mine = ++token;
  if (!popped) saveScroll();
  hooks.start(url);
  // Let the feedback paint before the swap. A prefetched page would otherwise
  // be built inside the click's own task, and the pill would only move once
  // the whole new page was ready.
  const painted = frame();
  const root = document.documentElement;
  const slow = window.setTimeout(() => {
    if (mine === token) root.setAttribute("data-route-loading", "");
  }, 120);
  // Only the latest navigation owns the loading state.
  const settle = () => {
    window.clearTimeout(slow);
    if (mine === token) root.removeAttribute("data-route-loading");
  };
  let html: string;
  try {
    html = await load(url);
  } catch {
    settle();
    if (mine !== token) return;
    hooks.fail();
    location.assign(url.href);
    return;
  }
  settle();
  await painted;
  if (mine !== token) return;
  const next = new DOMParser().parseFromString(html, "text/html");
  if (!next.querySelector("main") || !compatible(next, url)) {
    console.warn("docs router: full load, the next page is from another build");
    hooks.fail();
    location.assign(url.href);
    return;
  }
  // No View Transitions API: while one runs the page ignores input, and in
  // WebKit that window reached 1.5 s. The new <main> fades in on its own
  // instead, and the next click is answered at once.
  await swapping;
  if (mine !== token) return;
  try {
    performance.mark("docs-route-swap");
    swapping = apply(next, url, popped, pop);
    await swapping;
    performance.measure("docs-route-swap", "docs-route-swap");
  } catch (err) {
    swapping = Promise.resolve();
    console.warn("docs router: full load after a failed swap", err);
    hooks.fail();
    location.assign(url.href);
  }
}

function linkFrom(e: Event): { url: URL; el: Element } | null {
  for (const node of e.composedPath()) {
    if (!(node instanceof Element)) continue;
    const isLink = node instanceof HTMLAnchorElement || node.localName === "glass-button";
    if (!isLink) continue;
    const href = node.getAttribute("href");
    if (!href) return null;
    const target = node.getAttribute("target");
    if (target && target !== "_self") return null;
    if (node.hasAttribute("download")) return null;
    if (node.getAttribute("rel")?.includes("external")) return null;
    return { url: resolveHref(href), el: node };
  }
  return null;
}

export function initRouter(h: RouterHooks): void {
  hooks = h;
  if (!("fetch" in window) || !("DOMParser" in window) || !history.pushState) return;
  history.scrollRestoration = "manual";
  if (!(history.state as RouteState | null)?.docsRoute) history.replaceState({ ...(history.state as object | null), docsRoute: true, scroll: scrollY }, "");
  else {
    const saved = (history.state as RouteState).scroll;
    // Reload or return to this entry: put the reader back where they were.
    if (saved && !location.hash) requestAnimationFrame(() => instantScroll(saved));
  }

  // Capture: runs before <glass-button href> would call location.assign.
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = linkFrom(e);
      if (link && hasBase() && link.el.getAttribute("href")?.startsWith("#")) {
        // Under <base> the browser would send "#main" to the site folder. Stay on this page.
        e.preventDefault();
        location.hash = link.el.getAttribute("href")!;
        return;
      }
      if (!link || !h.isPage(link.url) || hasBase()) return;
      const { url } = link;
      if (samePage(url)) {
        // Same page: a fragment scrolls natively; the bare page link goes to the top.
        if (url.hash) {
          saveScroll();
          return;
        }
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
        return;
      }
      e.preventDefault();
      void navigate(url);
    },
    { capture: true },
  );

  const warm = (e: Event) => {
    const link = linkFrom(e);
    if (link) prefetch(link.url);
  };
  document.addEventListener("pointerover", warm, { passive: true });
  document.addEventListener("focusin", warm);
  document.addEventListener("touchstart", warm, { passive: true });

  addEventListener("popstate", (e) => {
    const url = new URL(location.href);
    if (samePage(url)) {
      // A fragment entry on this page.
      const state = e.state as RouteState | null;
      if (state?.docsRoute) instantScroll(state.scroll);
      else if (url.hash) scrollToHash(url.hash);
      return;
    }
    if (!h.isPage(url)) {
      location.reload();
      return;
    }
    const state = e.state as RouteState | null;
    void navigate(url, { popped: true, pop: state?.docsRoute ? state : null });
  });

  addEventListener("pagehide", saveScroll);

  // Once the page is idle, fetch the pages the header links to.
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? "")) return;
  const idle = (cb: () => void) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(cb, { timeout: 4000 });
    else setTimeout(cb, 1500);
  };
  const warmNav = () =>
    idle(() => {
      for (const a of document.querySelectorAll(".nav a[href], .nav glass-button[href]"))
        prefetch(resolveHref(a.getAttribute("href") ?? ""));
    });
  if (hasBase()) return;
  if (document.readyState === "complete") warmNav();
  else addEventListener("load", warmNav, { once: true });
}
