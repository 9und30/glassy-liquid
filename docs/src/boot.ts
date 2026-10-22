import "glassy-liquid/elements";
import { GlassElement, attachPress, getSurface, glass, supportsBackdropSvg, supportsWebGL, updateAppearance, type GlassOptions } from "glassy-liquid";
import { demos, glassProps } from "./demos";
import { highlight, type Lang } from "./highlight";
import { icons } from "./icons";
import { formatNumber, playgroundSnippets } from "./playground-snippets";
import { defaultKnobState, knobRanges, knobsMarkup, type KnobState } from "./playground-knobs";
import { customSource } from "./custom-sample";
import { sampleSource } from "./samples";
import { demoMarkup, pickerMarkup, propsTable } from "./explorer-markup";
import { rankEntries, searchEntries, type SearchEntry } from "./search";
import { mountPlayer } from "./player";
import { initRouter, navigate, isDocsPage, perFrame, resolveHref, samePage } from "./router";
import { initNavIndicator } from "./nav-indicator";
import { watchLoading } from "./skeleton";
import { Scope } from "./scope";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function asset(path: string): string {
  const base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL || "./";
  if (base === "./" || base === "." || base === "") return path;
  return `${base.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
}

function paintIcons(root: ParentNode = document): void {
  for (const el of $$("[data-icon]", root)) {
    const name = el.getAttribute("data-icon") as keyof typeof icons;
    if (icons[name] && !el.firstElementChild) el.innerHTML = icons[name];
  }
}

function wireGrounds(scope: Scope): void {
  const scenes = $$("main glass-scene[data-src]");
  const apply = (scene: HTMLElement) => {
    const src = scene.dataset.src;
    if (src) scene.setAttribute("src", asset(src));
  };
  if (!("IntersectionObserver" in window)) {
    for (const s of scenes) apply(s);
    return;
  }
  const io = scope.observe(
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          apply(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "700px 0px" },
    ),
  );
  for (const s of scenes) io.observe(s);
}

class NowPlaying extends GlassElement {
  static override glassDefaults: GlassOptions = { radius: 30, material: "clear" };
  static override interactive = true;
  static override extraAttributes = ["title", "artist"];
  static override styles = `
    :host { display: flex; gap: 14px; align-items: center; padding: 12px 18px 12px 12px; color: #fff; max-width: 100%; }
    .art { width: 54px; height: 54px; border-radius: 14px; background: url(${asset("img/silk.webp")}) center/cover; flex: none; }
    b { display: block; font: 600 16px/1.2 var(--font-glass, system-ui); }
    span { font: 500 14px/1.3 var(--font-glass, system-ui); opacity: .75; }`;
  protected override render(): string {
    const t = (v: string | null) => (v ?? "").replace(/[<>&"]/g, "");
    return `<div class="art"></div><div><b>${t(this.getAttribute("title"))}</b><span>${t(this.getAttribute("artist"))}</span></div>`;
  }
}
if (!customElements.get("now-playing")) customElements.define("now-playing", NowPlaying);

function setCode(pre: HTMLPreElement, raw: string, lang: Lang = (pre.dataset.lang as Lang) || "html"): void {
  pre.dataset.raw = raw;
  pre.innerHTML = highlight(raw, lang);
  pre.tabIndex = 0;
}

function highlightAll(root: ParentNode = document): void {
  for (const pre of $$<HTMLPreElement>("pre[data-lang]", root)) {
    if (pre.dataset.done || pre.hasAttribute("data-live")) continue;
    pre.dataset.done = "1";
    setCode(pre, pre.textContent ?? "", (pre.dataset.lang as Lang) || "html");
  }
}

async function copyText(text: string, button: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const label = button.querySelector("[data-copy-label]") ?? button.lastChild;
  button.setAttribute("data-copied", "");
  if (label && label.textContent) label.textContent = "Copied";
  window.setTimeout(() => {
    button.removeAttribute("data-copied");
    if (label && label.textContent) label.textContent = "Copy";
  }, 1400);
}

const panelsOf = (box: Element) => $$<HTMLElement>(":scope > [data-panel], :scope > .code__panels > [data-panel]", box);

function activateTab(tab: HTMLElement): void {
  const box = tab.closest("[data-code-tabs]");
  if (!box) return;
  const tabs = $$<HTMLButtonElement>('[role="tab"]', box);
  for (const b of tabs) {
    const on = b === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of panelsOf(box)) p.hidden = p.dataset.panel !== tab.dataset.tab;
}

function paintTabStrip(el: HTMLElement): void {
  const overflow = el.scrollWidth > el.clientWidth + 1;
  el.classList.toggle("is-overflow", overflow);
  if (!overflow) {
    el.classList.remove("is-scrolled", "is-end");
    return;
  }
  const max = el.scrollWidth - el.clientWidth;
  el.classList.toggle("is-scrolled", el.scrollLeft > 2);
  el.classList.toggle("is-end", el.scrollLeft >= max - 2);
}

function maskTabStrips(): void {
  for (const el of $$<HTMLElement>(".code__tabs, .guide__tabs")) {
    paintTabStrip(el);
    if (el.dataset.maskBound) continue;
    el.dataset.maskBound = "1";
    el.addEventListener("scroll", () => paintTabStrip(el), { passive: true });
  }
}

function rovingTabs(): void {
  for (const list of $$("main [data-code-tabs] [role=tablist]")) {
    $$<HTMLElement>("[role=tab]", list).forEach((t) => (t.tabIndex = t.getAttribute("aria-selected") === "true" ? 0 : -1));
  }
}

function wireCode(): void {
  addEventListener("resize", maskTabStrips);
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const tab = target.closest<HTMLButtonElement>(".code__tab, .pill-tab");
    if (tab) {
      activateTab(tab);
      return;
    }
    const copy = target.closest<HTMLButtonElement>(".copy");
    if (!copy) return;
    if (copy.dataset.copy) {
      void copyText($(copy.dataset.copy)?.textContent ?? "", copy);
      return;
    }
    const box = copy.closest("[data-code-tabs]") ?? copy.closest(".code");
    const panel = box ? panelsOf(box).find((p) => !p.hidden) : undefined;
    const pre = (panel?.tagName === "PRE" ? panel : panel?.querySelector("pre")) as HTMLPreElement | null
      ?? box?.querySelector<HTMLPreElement>("pre")
      ?? null;
    void copyText(pre?.dataset.raw ?? pre?.textContent ?? "", copy);
  });
  document.addEventListener("keydown", (e) => {
    const tab = (e.target as HTMLElement).closest?.<HTMLElement>(".code__tab, .pill-tab");
    if (!tab || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const tabs = $$<HTMLButtonElement>("[role=tab]", tab.parentElement!);
    const i = tabs.indexOf(tab as HTMLButtonElement);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    if (!next) return;
    next.focus();
    activateTab(next);
    e.preventDefault();
  });
}

const engineNames: Record<string, string> = {
  backdrop: "Live, SVG backdrop refraction",
  "scene-gl": "Live, WebGL refraction",
  "scene-dom": "Live, content-filter refraction",
  css: "Live, frosted fallback",
};

function wireLens(scope: Scope): void {
  const hero = $("#top");
  const lens = $("#hero-lens");
  if (!hero || !lens) return;
  lens.style.position = "absolute";
  const surface = glass(lens, { radius: "circle", material: "clear", zoom: 1.18, refraction: 30, bezel: 42, dispersion: 0.35, specular: 1.15 });
  // With reduced transparency an opaque lens would be a blank disc. A
  // transparent fill keeps it a ring of rim light that still drags over the photo.
  const reducedTransparency = matchMedia("(prefers-reduced-transparency: reduce)");
  const fill = () => surface.set({ fill: reducedTransparency.matches ? "transparent" : undefined });
  fill();
  scope.on(reducedTransparency, "change", fill);
  const press = attachPress(lens, surface, { grow: 0.05 });
  scope.add(() => {
    press.dispose();
    surface.destroy();
  });
  const deck = hero.querySelector<HTMLElement>(".deck");
  const engine = hero.querySelector<HTMLElement>(".hero__engine");
  let fx = 0.62;
  let fy = 0.42;
  let moved = false;
  const home = () => {
    const narrow = hero.clientWidth < 720;
    fx = narrow ? 0.72 : 0.66;
    fy = narrow ? 0.38 : 0.46;
  };
  const local = (el: Element) => {
    const r = el.getBoundingClientRect();
    const h = hero.getBoundingClientRect();
    return { left: r.left - h.left, top: r.top - h.top, right: r.right - h.left, bottom: r.bottom - h.top };
  };
  const apply = () => {
    const s = lens.offsetWidth || 160;
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    let minX = 12;
    let maxX = w - s - 12;
    // At 320 the resting lens crosses the volume badge. Nudge it right.
    // 360 and wider already clear, so this does not move that layout.
    if (!moved && w < 360) {
      const badge = hero.querySelector(".hero__kicker");
      if (badge) {
        const clear = badge.getBoundingClientRect().right - hero.getBoundingClientRect().left + 8;
        minX = Math.min(Math.ceil(clear), w - s - 4);
        maxX = Math.max(minX, w - s - 8);
      }
    }
    let x = Math.max(minX, Math.min(maxX, fx * w - s / 2));
    let y = Math.max(72, Math.min(h - s - 48, fy * h - s / 2));
    if (!moved) {
      // The resting lens keeps clear of the player and the engine note.
      for (const el of [deck, engine]) {
        if (!el || !el.offsetWidth) continue;
        const r = local(el);
        const hit = x < r.right + 12 && x + s > r.left - 12 && y < r.bottom + 12 && y + s > r.top - 12;
        if (!hit) continue;
        if (r.right + 20 + s <= w - 12) x = r.right + 20;
        else y = Math.max(72, r.top - s - 12);
      }
    }
    lens.style.setProperty("--lens-x", `${x.toFixed(1)}px`);
    lens.style.setProperty("--lens-y", `${y.toFixed(1)}px`);
  };
  home();
  apply();
  const ro = scope.observe(
    new ResizeObserver(
      perFrame(() => {
        if (!scope.alive) return;
        if (!moved) home();
        apply();
      }),
    ),
  );
  ro.observe(hero);
  const badge = hero.querySelector(".hero__kicker");
  if (badge) ro.observe(badge);
  if (deck) ro.observe(deck);
  void document.fonts.ready.then(() => {
    if (!moved && scope.alive) apply();
  });
  let drag: { id: number; dx: number; dy: number } | null = null;
  scope.on(lens, "pointerdown", (e) => {
    if (e.button !== 0) return;
    const r = hero.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left - (parseFloat(lens.style.getPropertyValue("--lens-x")) || 0), dy: e.clientY - r.top - (parseFloat(lens.style.getPropertyValue("--lens-y")) || 0) };
    lens.setPointerCapture(e.pointerId);
    lens.setAttribute("data-dragging", "");
    moved = true;
    $("#lens-hint")?.classList.add("is-done");
  });
  scope.on(lens, "pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const r = hero.getBoundingClientRect();
    const s = lens.offsetWidth || 160;
    const x = e.clientX - r.left - drag.dx;
    const y = e.clientY - r.top - drag.dy;
    fx = (x + s / 2) / r.width;
    fy = (y + s / 2) / r.height;
    apply();
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    lens.removeAttribute("data-dragging");
  };
  scope.on(lens, "pointerup", end);
  scope.on(lens, "pointercancel", end);
  const note = $("#engine-note");
  if (!note) return;
  const report = () => {
    note.textContent = engineNames[surface.engine] ?? engineNames.css!;
  };
  report();
  scope.observe(new MutationObserver(report)).observe(lens, { attributes: true, attributeFilter: ["data-glass-engine"] });
}

function wirePlayer(scope: Scope): void {
  const deck = $("#hero-player");
  if (!deck) return;
  paintIcons(deck);
  mountPlayer(deck, scope);
}

function wireGallery(scope: Scope): void {
  const track = $("#gallery-track");
  if (!track) return;
  const cards = $$("li.plate", track);
  const dots = $$<HTMLButtonElement>(".pager__dot");
  const arrows = $$<HTMLElement>(".pager__arrow");
  const caption = $("#plate-caption");
  const titles = cards.map((c) => c.dataset.title ?? "");
  let index = 0;
  const inset = () => parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, i));
    const card = cards[next];
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft - inset(), behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const sync = () => {
    const x = track.scrollLeft + inset();
    let best = 0;
    let dist = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - x);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) best = cards.length - 1;
    index = best;
    dots.forEach((d, i) => (i === index ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    arrows.forEach((a) => {
      const dir = Number(a.dataset.step);
      a.setAttribute("aria-disabled", String((dir < 0 && index === 0) || (dir > 0 && index === cards.length - 1)));
    });
    if (caption) caption.textContent = titles[index] ?? "";
  };
  let raf = 0;
  scope.add(() => cancelAnimationFrame(raf));
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sync);
  }, { passive: true });
  dots.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.to))));
  arrows.forEach((a) => a.addEventListener("click", () => {
    if (a.getAttribute("aria-disabled") === "true") return;
    go(index + Number(a.dataset.step));
  }));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else return;
    e.preventDefault();
  });
  scope.on(window, "resize", () => go(index), { passive: true });
  scope.observe(new ResizeObserver(() => sync())).observe(track);
  sync();
}

const codeOf = sampleSource;

let selectComponent: (id: string) => void = () => {};

function wireExplorer(scope: Scope): void {
  const stage = $("#cx-stage");
  const demo = $("#cx-demo");
  const picker = $("#cx-picker");
  if (!stage || !demo || !picker) return;
  const name = $("#cx-name")!;
  const lede = $("#cx-lede")!;
  const props = $("#cx-props")!;
  const propsWrap = $<HTMLDetailsElement>("#cx-props-wrap")!;
  const panels: Record<string, HTMLPreElement | null> = {
    html: $<HTMLPreElement>('#cx-code pre[data-panel="html"]'),
    react: $<HTMLPreElement>('#cx-code pre[data-panel="react"]'),
    vue: $<HTMLPreElement>('#cx-code pre[data-panel="vue"]'),
    svelte: $<HTMLPreElement>('#cx-code pre[data-panel="svelte"]'),
  };
  let moved: Element[] = [];
  // The build prints the first component; a dev page without it fills in here.
  if (!picker.firstElementChild) picker.innerHTML = pickerMarkup();
  demo.setAttribute("role", "tabpanel");
  const chips = $$<HTMLButtonElement>(".picker__chip", picker);

  const select = (id: string) => {
    const d = demos.find((x) => x.id === id) ?? demos[0]!;
    for (const el of moved) el.remove();
    moved = [];
    stage.setAttribute("src", asset(`img/${d.bg}.webp`));
    stage.style.minHeight = `${d.height ?? 300}px`;
    // The printed first component is kept as is, so loading the page does not rebuild it.
    if (demo.dataset.id !== d.id || !demo.firstElementChild) demo.innerHTML = demoMarkup(d);
    demo.dataset.id = d.id;
    paintIcons(demo);
    const opener = $("#open-demo-sheet", demo);
    opener?.addEventListener("click", () => {
      const sheet = $<HTMLElement & { show?: () => void }>("#demo-sheet");
      sheet?.show?.();
    });
    for (const sheet of $$("glass-sheet", demo)) {
      document.body.append(sheet);
      moved.push(sheet);
    }
    demo.setAttribute("aria-labelledby", `cx-tab-${d.id}`);
    name.textContent = d.title;
    lede.textContent = d.lede;
    const table = propsTable(d.props, d.events);
    props.innerHTML = table;
    propsWrap.hidden = !table;
    propsWrap.open = Boolean(d.events?.length);
    const langs: Array<[string, string, Lang]> = [
      ["html", codeOf(d.html), "html"],
      ["react", d.react, "jsx"],
      ["vue", d.vue, "vue"],
      ["svelte", d.svelte, "svelte"],
    ];
    for (const [key, raw, lang] of langs) {
      const pre = panels[key];
      if (pre) setCode(pre, raw, lang);
    }
    for (const c of chips) {
      const on = c.dataset.id === d.id;
      c.setAttribute("aria-selected", String(on));
      c.tabIndex = on ? 0 : -1;
      if (on) {
        const left = c.offsetLeft - (picker.clientWidth - c.offsetWidth) / 2;
        picker.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? "auto" : "smooth" });
      }
    }
    if (location.hash !== `#c-${d.id}`) history.replaceState(history.state, "", `#c-${d.id}`);
  };
  selectComponent = select;
  scope.add(() => {
    for (const el of moved) el.remove();
    moved = [];
    selectComponent = () => {};
  });
  picker.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>(".picker__chip");
    if (chip?.dataset.id) select(chip.dataset.id);
  });
  picker.addEventListener("keydown", (e) => {
    const i = chips.findIndex((c) => c === document.activeElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % chips.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + chips.length) % chips.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = chips.length - 1;
    if (next < 0) return;
    e.preventDefault();
    chips[next]?.focus({ preventScroll: true });
    const id = chips[next]?.dataset.id;
    if (id) select(id);
  });
  const fromHash = location.hash.startsWith("#c-") ? location.hash.slice(3) : "";
  select(demos.some((d) => d.id === fromHash) ? fromHash : demos[0]!.id);
}

function wireCommandPalette(): void {
  const root = $("#cmdk");
  const input = $<HTMLInputElement>("#cmdk-input");
  const list = $("#cmdk-list");
  if (!root || !input || !list) return;
  const entries: SearchEntry[] = searchEntries;
  let active = 0;
  let shown: SearchEntry[] = entries;
  let last: HTMLElement | null = null;
  const draw = () => {
    shown = rankEntries(input.value, entries);
    active = Math.min(active, Math.max(0, shown.length - 1));
    if (!shown.length) {
      list.innerHTML = `<p class="cmdk__empty">Nothing matches.</p>`;
      return;
    }
    let group = "";
    list.innerHTML = shown
      .map((e, i) => {
        const head = e.group !== group ? `<p class="cmdk__group">${(group = e.group)}</p>` : "";
        return `${head}<button class="cmdk__item${i === active ? " is-active" : ""}" role="option" type="button" aria-selected="${i === active}" data-i="${i}">${e.label}<span>${e.hint.replace(/</g, "")}</span></button>`;
      })
      .join("");
    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  };
  const open = () => {
    last = document.activeElement as HTMLElement | null;
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    input.value = "";
    active = 0;
    draw();
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    document.documentElement.style.overflow = "hidden";
  };
  const close = () => {
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    last?.focus?.({ preventScroll: true });
  };
  const go = (e: SearchEntry | undefined) => {
    if (!e) return;
    close();
    const url = resolveHref(e.href);
    if (samePage(url)) {
      if (url.hash.startsWith("#c-") && demos.some((d) => d.id === url.hash.slice(3))) selectComponent(url.hash.slice(3));
      const id = url.hash.slice(1);
      if (id) document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
      history.replaceState(history.state, "", url.hash || url.pathname);
      return;
    }
    void navigate(url);
  };
  for (const b of $$("[data-cmdk]")) b.addEventListener("click", open);
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-close]")) close();
    const item = t.closest<HTMLButtonElement>(".cmdk__item");
    if (item) go(shown[Number(item.dataset.i)]);
  });
  input.addEventListener("input", () => {
    active = 0;
    draw();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (root.classList.contains("is-open")) close();
      else open();
      return;
    }
    if (!root.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      draw();
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(shown[active]);
    }
  });
}

const paperFill = "rgb(244, 239, 230)";

function steadyFill(host: HTMLElement | null, sheet?: HTMLElement | null): void {
  if (!host) return;
  const surface = getSurface(host);
  if (!surface) return;
  // closest() does not cross the sheet's shadow root, so the menu passes its host in.
  const menu = sheet ?? host.closest("#menu-sheet");
  if (menu) {
    // One paper, every engine. A scene or a live backdrop would change color with the page.
    surface.set({ fill: paperFill, blur: 18, refraction: 0, engine: "css" });
    menu.setAttribute("data-paper", "");
    return;
  }
  if (surface.engine === "css") {
    surface.set({ fill: paperFill, blur: 20 });
    host.closest("glass-sheet")?.setAttribute("data-css-fallback", "");
  }
}

function fitMenu(sheet: HTMLElement): void {
  const links = sheet.querySelector<HTMLElement>(".menu-links");
  const body = sheet.shadowRoot?.querySelector(".body");
  const grab = sheet.shadowRoot?.querySelector(".grab");
  if (!links || !body || !grab) return;
  // scrollHeight stays honest while the opening spring still clips the body.
  if (links.scrollHeight < 40) return;
  const pad = getComputedStyle(body);
  const height = Math.ceil(
    grab.getBoundingClientRect().height +
      links.scrollHeight +
      (parseFloat(pad.paddingTop) || 0) +
      (parseFloat(pad.paddingBottom) || 0) +
      1,
  );
  const max = Math.round(window.innerHeight - 24);
  sheet.setAttribute("detents", String(Math.min(height, max)));
}

function tuneNav(): void {
  const bar = $(".nav__bar");
  if (!bar) return;
  const surface = getSurface(bar);
  if (!surface) return;
  const overPhoto = bar.getAttribute("appearance") === "dark";
  if (overPhoto) {
    // CSS frost is a solid ink capsule. Backdrop keeps the live refraction.
    if (surface.engine === "css") surface.set({ fill: "rgb(28, 24, 20)", blur: 16 });
    else surface.set({ fill: undefined });
    return;
  }
  // Paper pages: an opaque CSS fill, or a paper veil over real refraction,
  // so a heading scrolling underneath cannot be read through the capsule.
  surface.set({
    fill: surface.engine === "css" ? paperFill : "rgba(244, 239, 230, 0.88)",
    ...(surface.engine === "css" ? { blur: 16 } : {}),
  });
}

function wireMenu(): void {
  const sheet = $<HTMLElement & { show?: () => void; hide?: () => void }>("#menu-sheet");
  if (!sheet) return;
  const tune = () => {
    requestAnimationFrame(() => {
      steadyFill(sheet.shadowRoot?.querySelector<HTMLElement>(".sheet") ?? null, sheet);
      steadyFill($(".cmdk__panel"));
    });
  };
  $("#open-menu")?.addEventListener("click", () => {
    sheet.show?.();
    requestAnimationFrame(() => {
      fitMenu(sheet);
      tune();
    });
  });
  sheet.addEventListener("toggle", () => {
    fitMenu(sheet);
    tune();
  });
  addEventListener("resize", () => {
    if (sheet.hasAttribute("open")) fitMenu(sheet);
  });
  sheet.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) sheet.hide?.();
  });
  tune();
}

function wireCurrentNav(): void {
  const page = document.body.dataset.page ?? "";
  const file = page === "home" ? "index.html" : `${page}.html`;
  for (const a of $$<HTMLAnchorElement>(".nav__link, .foot a, .menu-links a")) {
    const href = a.getAttribute("href") ?? "";
    if (href.endsWith(file)) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function wireAdaptiveNav(): () => void {
  const nav = $(".nav");
  const bar = $(".nav__bar");
  if (!nav || !bar) return () => {};
  let zones = $$("main [data-ground]");
  let state = "";
  const check = () => {
    const r = bar.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const zone = zones.find((z) => {
      const b = z.getBoundingClientRect();
      return b.top <= y && b.bottom >= y;
    });
    const next = zone?.dataset.ground ?? "light";
    if (next === state) return;
    state = next;
    nav.dataset.over = next === "photo" ? "photo" : "light";
    bar.setAttribute("appearance", next === "photo" ? "dark" : "light");
    tuneNav();
  };
  addEventListener("scroll", check, { passive: true });
  addEventListener("resize", check, { passive: true });
  check();
  tuneNav();
  return () => {
    zones = $$("main [data-ground]");
    check();
  };
}

function wireReveal(scope: Scope): void {
  const nodes = $$("main .reveal");
  if (!nodes.length) return;
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    for (const el of nodes) el.classList.add("is-in");
    return;
  }
  const io = scope.observe(
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" }),
  );
  for (const el of nodes) io.observe(el);
}

async function renderBench(scope: Scope): Promise<void> {
  const tiles = $$("[data-metric]");
  if (!tiles.length) return;
  // The gzip tile is `{{cdn-gzip}}` in bench.json. The docs server fills that
  // token from dist, the same string the hero already shows.
  try {
    const res = await fetch(asset("bench.json"), { cache: "no-store" });
    if (!res.ok) throw new Error("no data");
    const data = (await res.json()) as { metrics: Array<{ value: string; label: string; detail: string }>; note?: string };
    if (!scope.alive) return;
    for (const tile of tiles) {
      const m = data.metrics[Number(tile.dataset.metric)];
      if (!m) continue;
      const value = $(".measures__value", tile);
      const label = $(".measures__label", tile);
      const detail = $(".measures__detail", tile);
      if (value) value.textContent = m.value;
      if (label) label.textContent = m.label;
      if (detail) detail.textContent = m.detail;
    }
    const note = $("#bench-note");
    if (data.note && note) note.innerHTML = data.note;
  } catch {
    /* Keep the figures shipped in the page. */
  }
}

function markEngine(): void {
  const kind = supportsBackdropSvg() ? "backdrop" : supportsWebGL() ? "scene" : "css";
  $(`.engine[data-engine="${kind}"]`)?.setAttribute("data-yours", "");
  const live = $("#your-engine");
  if (live) {
    const names: Record<string, string> = {
      backdrop: "backdrop refraction, on the live page",
      scene: "scene rendering, WebGL or a content filter inside glass-scene",
      css: "calibrated frost",
    };
    live.textContent = names[kind] ?? kind;
  }
}

function wirePlayground(scope: Scope): void {
  const host = $("#play-glass");
  const stage = $("#play-stage");
  const knobs = $("#knobs");
  if (!host || !stage || !knobs) return;
  const state: KnobState = defaultKnobState();
  const ranges = knobRanges;
  // The build prints the knobs; a dev page without them fills in here.
  if (!knobs.firstElementChild) knobs.innerHTML = knobsMarkup(state);

  const syncChoices = () => {
    for (const b of $$<HTMLButtonElement>("[data-choice]", knobs)) {
      const key = b.dataset.choice as keyof KnobState;
      const current = key === "tint" ? (state.tint ?? "") : String(state[key]);
      b.setAttribute("aria-pressed", String(b.dataset.value === current));
    }
    for (const [key, , , , step, unit] of ranges) {
      const slider = $<HTMLElement & { value: number }>(`#k-${key}`);
      const out = $(`#o-${key}`);
      if (slider) slider.value = Number(state[key]);
      if (out) out.textContent = `${formatNumber(Number(state[key]), step)}${unit}`;
    }
  };

  const surface = glass(host, {});
  let press: { dispose: () => void } | null = null;
  scope.add(() => {
    press?.dispose();
    press = null;
    surface.destroy();
  });
  const apply = () => {
    const opts: GlassOptions = {
      material: state.material,
      appearance: state.appearance,
      radius: state.radius,
      refraction: state.refraction,
      bezel: state.bezel,
      blur: state.blur,
      dispersion: state.dispersion,
      specular: state.specular,
      lightAngle: state.lightAngle,
      zoom: state.zoom,
      shadow: state.shadow,
      profile: state.profile,
      tint: state.tint,
    };
    surface.set(opts);
    stage.setAttribute("src", asset(`img/${state.bg}.webp`));
    if (state.interactive && !press) press = attachPress(host, surface);
    if (!state.interactive && press) {
      press.dispose();
      press = null;
    }
    host.setAttribute("data-appearance-demo", state.appearance);
    const snip = playgroundSnippets(state);
    const map: Array<[string, string, Lang]> = [
      ["html", snip.html, "js"],
      ["react", snip.react, "jsx"],
      ["vue", snip.vue, "vue"],
      ["svelte", snip.svelte, "svelte"],
    ];
    for (const [panel, raw, lang] of map) {
      const pre = $<HTMLPreElement>(`#play-code pre[data-panel="${panel}"]`);
      if (pre) setCode(pre, raw, lang);
    }
    const note = $("#play-engine");
    if (note) note.textContent = engineNames[surface.engine] ?? "Rendering";
    syncChoices();
  };

  knobs.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-choice]");
    if (!b) return;
    const key = b.dataset.choice as keyof KnobState;
    const value = b.dataset.value ?? "";
    if (key === "tint") state.tint = value || null;
    else (state as unknown as Record<string, string>)[key] = value;
    apply();
  });
  knobs.addEventListener("input", (e) => {
    const t = e.target as HTMLElement & { value: number | string };
    if (t.id === "tint-custom") {
      state.tint = String(t.value);
      apply();
      return;
    }
    const key = t.dataset.key as keyof KnobState | undefined;
    if (!key) return;
    (state as unknown as Record<string, number>)[key] = Number(t.value);
    apply();
  });
  knobs.addEventListener("change", (e) => {
    const t = e.target as HTMLElement & { checked?: boolean };
    if (t.id === "k-shadow") state.shadow = Boolean(t.checked);
    else if (t.id === "k-press") state.interactive = Boolean(t.checked);
    else return;
    apply();
  });
  scope.observe(new MutationObserver(() => {
    const note = $("#play-engine");
    if (note) note.textContent = engineNames[surface.engine] ?? "Rendering";
  })).observe(host, { attributes: true, attributeFilter: ["data-glass-engine"] });
  apply();
}

function wireThemeLab(scope: Scope): void {
  const lab = $("#theme-lab");
  if (!lab) return;
  const stage = $("#theme-stage");
  scope.on(lab, "click", (e) => {
    const swatch = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-accent]");
    if (!swatch || !stage) return;
    const accent = swatch.dataset.accent ?? "#0a84ff";
    stage.style.setProperty("--glass-accent", accent);
    for (const b of $$<HTMLButtonElement>("[data-accent]", lab)) b.setAttribute("aria-pressed", String(b === swatch));
    const out = $<HTMLPreElement>("#theme-accent-code");
    if (out) setCode(out, `:root {\n  --glass-accent: ${accent};\n}`, "css");
  });
  const appearance = $<HTMLElement & { value: string }>("#theme-appearance");
  if (appearance)
    scope.on(appearance, "change", () => {
      stage?.style.setProperty("--glass-appearance", appearance.value);
      updateAppearance();
    });
}

function fillStatic(): void {
  const propsBody = $("#glass-props tbody");
  if (propsBody && !propsBody.firstElementChild) {
    propsBody.innerHTML = glassProps
      .map(([a, t, d, n]) => `<tr><td><code>${a}</code></td><td>${t}</td><td>${d}</td><td>${n}</td></tr>`)
      .join("");
  }
  const custom = $("#custom-code");
  if (custom && !custom.textContent?.trim()) custom.textContent = customSource;
}

/** Everything that belongs to the page in <main>. Runs again after each client-side navigation. */
function mountPage(scope: Scope): void {
  const main = $("main") ?? document.body;
  fillStatic();
  paintIcons(main);
  highlightAll(main);
  rovingTabs();
  maskTabStrips();
  wireGrounds(scope);
  watchLoading(main, scope);
  wireCurrentNav();
  wireExplorer(scope);
  wireLens(scope);
  wirePlayer(scope);
  wireGallery(scope);
  wirePlayground(scope);
  wireThemeLab(scope);
  markEngine();
  wireReveal(scope);
  void renderBench(scope);
}

paintIcons();
wireCode();
wireCommandPalette();
wireMenu();
let page = new Scope();
mountPage(page);
const refreshNav = wireAdaptiveNav();
const indicator = initNavIndicator();
initRouter({
  isPage: isDocsPage,
  start: (url) => indicator.go(url),
  swap: () => {
    page.dispose();
    page = new Scope();
    mountPage(page);
    refreshNav();
    indicator.sync();
  },
  fail: () => indicator.sync(),
});
