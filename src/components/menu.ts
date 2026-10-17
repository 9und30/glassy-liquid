/**
 * <glass-menu> - iOS 26 pull-down menu that morphs out of its trigger.
 *
 * ```html
 * <glass-menu placement="bottom-end">
 *   <glass-button slot="trigger" shape="circle" aria-label="More">…</glass-button>
 *   <glass-menu-label>Sort by</glass-menu-label>
 *   <glass-menu-item value="name" checked>Name</glass-menu-item>
 *   <glass-menu-item value="date">Date <svg slot="icon">…</svg></glass-menu-item>
 *   <glass-menu-separator></glass-menu-separator>
 *   <glass-menu-item value="delete" destructive>Delete</glass-menu-item>
 * </glass-menu>
 * ```
 * Events: `select` (detail { value, item }), `toggle` (detail { open }).
 * Press-drag-release on the trigger selects in one gesture, like iOS.
 */
import { prefersReducedMotion } from "../core/env.js";
import { Spring, clamp, springs } from "../core/spring.js";
import { addTask, wake, type FrameTask } from "../core/ticker.js";
import { resolveAppearance } from "../engine/appearance.js";
import { GlassSurface, type GlassOptions } from "../engine/surface.js";
import { adoptStyles } from "../engine/styles.js";
import { lerpRect, place, viewportRect, type Placement, type Rect } from "../interaction/morph.js";
import { HTMLElementBase, hostCss, define } from "./base.js";

const RADIUS = 26;
const PAD = 6;

const menuCss = /* css */ `
:host{display:inline-block;position:relative;vertical-align:middle;}
.panel{position:fixed;inset:auto;left:0;top:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;color:var(--gl-fg);
  width:0;height:0;z-index:2147483000;font-family:inherit;}
.panel:not(.open){display:none;}
.clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden;}
.content{position:absolute;left:0;top:0;padding:${PAD}px;transform-origin:0 0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;}
.content::-webkit-scrollbar{display:none;}
`;

const itemCss = /* css */ `
:host{display:flex;align-items:center;gap:12px;min-height:44px;padding:10px 14px;border-radius:${RADIUS - PAD}px;cursor:default;
  font-size:17px;line-height:1.2;letter-spacing:-.02em;outline:none;user-select:none;-webkit-user-select:none;position:relative;}
:host([data-highlighted]){background:var(--glass-menu-highlight,rgba(0,0,0,.08));}
:host([data-appearance=dark][data-highlighted]){background:var(--glass-menu-highlight,rgba(255,255,255,.12));}
:host([destructive]){color:var(--glass-destructive,#ff3b30);}
:host([data-appearance=dark][destructive]){color:var(--glass-destructive,#ff453a);}
:host([disabled]){opacity:.4;pointer-events:none;}
.check{width:16px;flex:none;display:none;font-weight:600;}
:host([checked]) .check,:host([checkable]) .check{display:block;}
.check svg{width:14px;height:14px;visibility:hidden;}
:host([checked]) .check svg{visibility:visible;}
.label{flex:1;min-width:0;}
::slotted(svg),::slotted(img),::slotted([slot=icon]){width:20px;height:20px;flex:none;vertical-align:middle;}
::slotted([slot=shortcut]){opacity:.5;font-size:15px;}
`;

/** <glass-menu-item> */
export class GlassMenuItem extends HTMLElementBase {
  private initialized = false;
  connectedCallback(): void {
    if (!this.initialized) {
      const shadow = this.attachShadow({ mode: "open" });
      adoptStyles(shadow, itemCss);
      shadow.innerHTML = `<span class="check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg></span><span class="label" part="label"><slot></slot></span><slot name="shortcut"></slot><slot name="icon"></slot>`;
      this.initialized = true;
    }
    const checkable = this.hasAttribute("checked") || this.hasAttribute("checkable");
    this.setAttribute("role", checkable ? "menuitemcheckbox" : "menuitem");
    if (checkable) this.setAttribute("aria-checked", String(this.hasAttribute("checked")));
    this.tabIndex = -1;
  }
  get value(): string {
    return this.getAttribute("value") ?? this.textContent?.trim() ?? "";
  }
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
}

/** <glass-menu-separator> */
export class GlassMenuSeparator extends HTMLElementBase {
  connectedCallback(): void {
    this.setAttribute("role", "separator");
    Object.assign(this.style, {
      display: "block",
      height: "1px",
      margin: "5px 14px",
      background: "currentColor",
      opacity: "0.12",
    });
  }
}

/** <glass-menu-label> - a section header. */
export class GlassMenuLabel extends HTMLElementBase {
  connectedCallback(): void {
    this.setAttribute("role", "presentation");
    Object.assign(this.style, {
      display: "block",
      padding: "8px 14px 4px",
      fontSize: "13px",
      opacity: "0.55",
      letterSpacing: "0",
    });
  }
}

export class GlassMenuElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ["open"];
  }

  private shadow: ShadowRoot;
  private panel!: HTMLElement;
  private content!: HTMLElement;
  private glassSurface: GlassSurface | null = null;
  private progress = new Spring(0, springs.morph);
  private from: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private to: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private isOpen = false;
  private removeTask: (() => void) | null = null;
  private highlighted: GlassMenuItem | null = null;
  private gesture: { id: number; moved: boolean; x: number; y: number } | null = null;
  private initialized = false;
  private supportsPopover =
    typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  get open(): boolean {
    return this.isOpen;
  }
  set open(v: boolean) {
    if (v) this.show();
    else this.hide();
  }

  get trigger(): HTMLElement | null {
    return this.querySelector<HTMLElement>(":scope > [slot=trigger]");
  }

  get items(): GlassMenuItem[] {
    return Array.from(
      this.querySelectorAll<GlassMenuItem>(
        ":scope > glass-menu-item, :scope > * > glass-menu-item",
      ),
    );
  }

  /** Glass options for the panel (override via the `glass` property). */
  glass: GlassOptions = {};

  private task: FrameTask = {
    write: (_now, dt) => {
      this.progress.step(dt);
      this.layout();
      if (this.progress.settled && this.progress.value === 0 && !this.isOpen) this.finishClose();
      return !this.progress.settled;
    },
  };

  connectedCallback(): void {
    if (!this.initialized) {
      adoptStyles(this.shadow, hostCss, menuCss);
      this.shadow.innerHTML = `<slot name="trigger"></slot><div class="panel" part="panel" role="menu"><div class="clip"><div class="content" part="content"><slot></slot></div></div></div>`;
      this.panel = this.shadow.querySelector(".panel")!;
      this.content = this.shadow.querySelector(".content")!;
      if (this.supportsPopover) this.panel.setAttribute("popover", "manual");
      // The trigger can arrive after connect (frameworks that append children later).
      this.shadow
        .querySelector('slot[name="trigger"]')!
        .addEventListener("slotchange", () => this.syncTrigger());
      this.initialized = true;
    }
    this.removeTask ??= addTask(this.task);
    this.addEventListener("pointerdown", this.onPointerDown);
    this.addEventListener("click", this.onClick);
    this.addEventListener("keydown", this.onKeyDown);
    this.panel.addEventListener("pointermove", this.onPanelMove);
    this.panel.addEventListener("pointerleave", this.onPanelLeave);
    this.syncTrigger();
    if (this.hasAttribute("open")) this.show();
  }

  private syncTrigger(): void {
    const t = this.trigger;
    if (t) {
      t.setAttribute("aria-haspopup", "menu");
      t.setAttribute("aria-expanded", String(this.isOpen));
    }
  }

  disconnectedCallback(): void {
    this.removeEventListener("pointerdown", this.onPointerDown);
    this.removeEventListener("click", this.onClick);
    this.removeEventListener("keydown", this.onKeyDown);
    this.panel.removeEventListener("pointermove", this.onPanelMove);
    this.panel.removeEventListener("pointerleave", this.onPanelLeave);
    this.detachGlobal();
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.removeTask?.();
      this.removeTask = null;
      this.glassSurface?.destroy();
      this.glassSurface = null;
    });
  }

  attributeChangedCallback(name: string): void {
    if (name === "open" && this.initialized) {
      if (this.hasAttribute("open") && !this.isOpen) this.show();
      else if (!this.hasAttribute("open") && this.isOpen) this.hide();
    }
  }

  /** Open the menu. `focusFirst` moves focus into it (keyboard opening). */
  show(focusFirst = false): void {
    if (this.isOpen) return;
    const trigger = this.trigger;
    this.isOpen = true;
    if (!this.hasAttribute("open")) this.setAttribute("open", "");
    trigger?.setAttribute("aria-expanded", "true");
    const appearance = resolveAppearance(this);
    this.panel.classList.add("open");
    if (this.supportsPopover && !this.panel.matches(":popover-open")) {
      try {
        this.panel.showPopover();
      } catch {
        /* not connected */
      }
    }
    for (const it of this.items) it.setAttribute("data-appearance", appearance);

    // Measure the content at its natural size.
    Object.assign(this.content.style, {
      width: "max-content",
      height: "auto",
      minWidth: "220px",
      maxWidth: "min(320px, calc(100vw - 16px))",
      transform: "none",
      opacity: "1",
    });
    const size = { width: this.content.offsetWidth, height: this.content.scrollHeight };
    this.from = trigger ? viewportRect(trigger) : viewportRect(this);
    const placed = place(
      this.from,
      size,
      (this.getAttribute("placement") as Placement) || "bottom-start",
    );
    this.to = placed;
    Object.assign(this.content.style, { width: `${placed.width}px`, height: `${placed.height}px` });

    this.glassSurface ??= new GlassSurface(this.panel, {
      material: "regular",
      radius: RADIUS,
      appearance,
      ...this.glass,
    });
    this.glassSurface.set({ appearance });
    if (prefersReducedMotion()) this.progress.set(1);
    else this.progress.to(1, springs.morph);
    this.layout();
    wake(this.task);
    this.attachGlobal();
    this.dispatchEvent(
      new CustomEvent("toggle", { detail: { open: true }, bubbles: true, composed: true }),
    );
    if (focusFirst) this.highlight(this.items.find((i) => !i.disabled) ?? null, true);
  }

  /** Close the menu, morphing back into the trigger. */
  hide(returnFocus = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.removeAttribute("open");
    this.trigger?.setAttribute("aria-expanded", "false");
    this.highlight(null);
    this.detachGlobal();
    if (prefersReducedMotion()) {
      this.progress.set(0);
      this.finishClose();
    } else this.progress.to(0, { duration: 0.34, bounce: 0 });
    wake(this.task);
    if (returnFocus) this.trigger?.focus();
    this.dispatchEvent(
      new CustomEvent("toggle", { detail: { open: false }, bubbles: true, composed: true }),
    );
  }

  toggle(): void {
    if (this.isOpen) this.hide();
    else this.show();
  }

  private finishClose(): void {
    this.panel.classList.remove("open");
    if (this.supportsPopover && this.panel.matches(":popover-open")) this.panel.hidePopover();
    const t = this.trigger;
    if (t) t.style.opacity = "";
  }

  private layout(): void {
    const p = this.progress.value;
    const t = clamp(p, 0, 1.08);
    const r = lerpRect(this.from, this.to, t);
    const s = this.panel.style;
    s.transform = `translate(${r.x.toFixed(2)}px,${r.y.toFixed(2)}px)`;
    s.width = `${Math.max(1, r.width).toFixed(2)}px`;
    s.height = `${Math.max(1, r.height).toFixed(2)}px`;
    // Same clamp the glass applies, so the clip and the slab always agree.
    s.borderRadius = `${Math.min(RADIUS, r.width / 2, r.height / 2).toFixed(2)}px`;
    // Content stays anchored to the final rect and fades in late.
    const c = this.content.style;
    const appear = clamp((p - 0.3) / 0.55, 0, 1);
    const scale = 0.94 + 0.06 * clamp(p, 0, 1);
    c.transform = `translate(${(this.to.x - r.x).toFixed(2)}px,${(this.to.y - r.y).toFixed(2)}px) scale(${scale.toFixed(4)})`;
    c.opacity = appear.toFixed(3);
    const trig = this.trigger;
    if (trig) trig.style.opacity = clamp(1 - p * 3, 0, 1).toFixed(3);
  }

  private attachGlobal(): void {
    document.addEventListener("pointerdown", this.onOutside, true);
    window.addEventListener("resize", this.onViewportChange);
    window.addEventListener("scroll", this.onViewportChange, true);
  }

  private detachGlobal(): void {
    document.removeEventListener("pointerdown", this.onOutside, true);
    window.removeEventListener("resize", this.onViewportChange);
    window.removeEventListener("scroll", this.onViewportChange, true);
    window.removeEventListener("pointermove", this.onGestureMove);
    window.removeEventListener("pointerup", this.onGestureUp);
  }

  private onViewportChange = (e: Event): void => {
    if (e.type === "scroll" && this.content.contains(e.target as Node)) return;
    this.hide();
  };

  private onOutside = (e: PointerEvent): void => {
    const path = e.composedPath();
    if (path.includes(this.panel) || (this.trigger && path.includes(this.trigger))) return;
    this.hide();
  };

  private itemAt(x: number, y: number): GlassMenuItem | null {
    for (const it of this.items) {
      if (it.disabled) continue;
      const r = it.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return it;
    }
    return null;
  }

  private highlight(item: GlassMenuItem | null, focus = false): void {
    if (this.highlighted === item) {
      if (focus) item?.focus({ preventScroll: false });
      return;
    }
    this.highlighted?.removeAttribute("data-highlighted");
    this.highlighted = item;
    if (item) {
      item.setAttribute("data-highlighted", "");
      if (focus) item.focus({ preventScroll: false });
    }
  }

  private choose(item: GlassMenuItem): void {
    if (item.disabled) return;
    if (item.hasAttribute("checkable") || item.hasAttribute("checked")) {
      const group = item.getAttribute("group");
      if (group)
        for (const other of this.items)
          if (other !== item && other.getAttribute("group") === group)
            other.removeAttribute("checked");
      item.toggleAttribute("checked", group ? true : !item.hasAttribute("checked"));
      item.setAttribute("aria-checked", String(item.hasAttribute("checked")));
    }
    const ok = this.dispatchEvent(
      new CustomEvent("select", {
        detail: { value: item.value, item },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    if (ok) this.hide(true);
  }

  private onPointerDown = (e: PointerEvent): void => {
    const t = this.trigger;
    if (!t || e.button !== 0 || !e.composedPath().includes(t)) return;
    if (this.isOpen) return;
    // Press-drag-release: open immediately and track the finger.
    this.gesture = { id: e.pointerId, moved: false, x: e.clientX, y: e.clientY };
    this.suppressClick = true;
    this.show();
    window.addEventListener("pointermove", this.onGestureMove);
    window.addEventListener("pointerup", this.onGestureUp);
  };

  private suppressClick = false;

  private onGestureMove = (e: PointerEvent): void => {
    if (!this.gesture || e.pointerId !== this.gesture.id) return;
    if (Math.hypot(e.clientX - this.gesture.x, e.clientY - this.gesture.y) > 6)
      this.gesture.moved = true;
    if (this.gesture.moved) this.highlight(this.itemAt(e.clientX, e.clientY));
  };

  private onGestureUp = (e: PointerEvent): void => {
    if (!this.gesture || e.pointerId !== this.gesture.id) return;
    const moved = this.gesture.moved;
    this.gesture = null;
    window.removeEventListener("pointermove", this.onGestureMove);
    window.removeEventListener("pointerup", this.onGestureUp);
    if (moved) {
      const item = this.itemAt(e.clientX, e.clientY);
      if (item) this.choose(item);
      else this.highlight(null);
    }
  };

  private onClick = (e: MouseEvent): void => {
    const path = e.composedPath();
    const t = this.trigger;
    if (t && path.includes(t)) {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.toggle();
      return;
    }
    const item = path.find((n): n is GlassMenuItem => n instanceof GlassMenuItem);
    if (item && this.isOpen) this.choose(item);
  };

  private onPanelMove = (e: PointerEvent): void => {
    if (e.pointerType === "touch" && !this.gesture) return;
    this.highlight(this.itemAt(e.clientX, e.clientY));
  };

  private onPanelLeave = (): void => {
    if (!this.gesture) this.highlight(null);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const t = this.trigger;
    const fromTrigger = t && e.composedPath().includes(t);
    if (!this.isOpen) {
      if (fromTrigger && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        this.suppressClick = e.key !== "ArrowDown";
        this.show(true);
      }
      return;
    }
    const items = this.items.filter((i) => !i.disabled);
    const i = this.highlighted ? items.indexOf(this.highlighted) : -1;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        this.hide(true);
        break;
      case "Tab":
        this.hide();
        break;
      case "ArrowDown":
        e.preventDefault();
        this.highlight(items[(i + 1) % items.length] ?? null, true);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.highlight(items[(i - 1 + items.length) % items.length] ?? null, true);
        break;
      case "Home":
        e.preventDefault();
        this.highlight(items[0] ?? null, true);
        break;
      case "End":
        e.preventDefault();
        this.highlight(items[items.length - 1] ?? null, true);
        break;
      case "Enter":
      case " ":
        if (this.highlighted && !fromTrigger) {
          e.preventDefault();
          this.choose(this.highlighted);
        }
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLowerCase();
          const start = i + 1;
          const match = [...items.slice(start), ...items.slice(0, start)].find((it) =>
            it.textContent?.trim().toLowerCase().startsWith(k),
          );
          if (match) this.highlight(match, true);
        }
    }
  };
}

define("glass-menu-item", GlassMenuItem);
define("glass-menu-separator", GlassMenuSeparator);
define("glass-menu-label", GlassMenuLabel);
define("glass-menu", GlassMenuElement);
