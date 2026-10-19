// @vitest-environment jsdom
// Glass far off screen does no work and catches up when it comes back.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GlassSceneElement } from "../../src/scene/scene";

const observers: FakeIntersectionObserver[] = [];
class FakeIntersectionObserver {
  readonly targets = new Set<Element>();
  constructor(
    readonly cb: (entries: unknown[]) => void,
    readonly options?: IntersectionObserverInit,
  ) {
    observers.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
}

/** Deliver an entry the way the browser does after layout. */
function report(el: Element, isIntersecting: boolean) {
  for (const o of observers) if (o.targets.has(el)) o.cb([{ target: el, isIntersecting }]);
}

const resizers = new Map<Element, (entries: unknown[]) => void>();
/** Deliver a border-box size the way the browser does after layout. */
function resize(el: Element, inlineSize: number, blockSize: number) {
  resizers.get(el)?.([{ target: el, borderBoxSize: [{ inlineSize, blockSize }] }]);
}

const frames: FrameRequestCallback[] = [];
const raf = vi.fn((cb: FrameRequestCallback) => frames.push(cb));
function flushFrames() {
  for (const cb of frames.splice(0)) cb(performance.now());
}

vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
vi.stubGlobal(
  "ResizeObserver",
  class {
    constructor(readonly cb: (entries: unknown[]) => void) {}
    observe(el: Element) {
      resizers.set(el, this.cb);
    }
    unobserve() {}
    disconnect() {}
  },
);
vi.stubGlobal("requestAnimationFrame", raf);
vi.stubGlobal("cancelAnimationFrame", () => {});
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

const { glass } = await import("../../src/engine/surface");
await import("../../src/scene/scene");

/** jsdom does no layout, so give the glass a box. */
function sized<T extends HTMLElement>(el: T): T {
  Object.defineProperty(el, "offsetWidth", { value: 200 });
  Object.defineProperty(el, "offsetHeight", { value: 80 });
  return el;
}

function card() {
  return document.body.appendChild(sized(document.createElement("div")));
}

beforeEach(() => {
  frames.length = 0;
  raf.mockClear();
});

describe("glass off screen", () => {
  it("observes with a margin, so glass is ready before it scrolls in", () => {
    glass(card());
    expect(observers).toHaveLength(1);
    expect(observers[0]!.options?.rootMargin).toBe("100%");
  });

  it("updates glass near the viewport as before", () => {
    const el = card();
    const surface = glass(el);
    report(el, true);
    surface.set({ radius: 30 });
    expect(surface.offscreen).toBe(false);
    expect(raf).toHaveBeenCalledTimes(1);
    flushFrames();
    expect(el.style.getPropertyValue("--glass-r")).toBe("30px");
  });

  it("skips updates while far off screen and applies the latest on return", () => {
    const el = card();
    const surface = glass(el);
    const render = vi.spyOn(surface, "render");
    report(el, false);
    expect(surface.offscreen).toBe(true);
    surface.set({ radius: 12 });
    surface.set({ radius: 40 });
    surface.invalidate();
    expect(raf).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(el.style.getPropertyValue("--glass-r")).toBe("24px");

    report(el, true);
    // Synchronously in the observer callback, a full viewport before the glass is visible.
    expect(render).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue("--glass-r")).toBe("40px");
    expect(surface.offscreen).toBe(false);

    // Nothing was pending, so leaving and coming back again does not render.
    report(el, false);
    report(el, true);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("keeps geometry driven by an animation immediate", () => {
    const el = card();
    const surface = glass(el);
    report(el, false);
    surface.setGeometry({ width: 200, height: 50 }, 25);
    expect(el.style.getPropertyValue("--glass-r")).toBe("25px");
  });

  it("skips resizes while far off screen", () => {
    const el = card();
    const surface = glass(el);
    const render = vi.spyOn(surface, "render");
    report(el, false);
    resize(el, 260, 90);
    expect(render).not.toHaveBeenCalled();
    report(el, true);
    expect(render).toHaveBeenCalledTimes(1);
    expect(surface.metrics.width).toBe(260);
  });

  it("renders glass shown again after display: none before it is painted", () => {
    // The observer does not report glass that loses its box while off screen,
    // so it still counts as hidden when it is shown somewhere on screen.
    const el = card();
    const surface = glass(el);
    report(el, false);
    resize(el, 0, 0);
    surface.set({ radius: 18 });
    const render = vi.spyOn(surface, "render");
    resize(el, 200, 80);
    expect(render).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue("--glass-r")).toBe("18px");
  });

  it("never pauses without IntersectionObserver (server, old engines)", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    try {
      const el = card();
      const before = observers.flatMap((o) => [...o.targets]).length;
      const surface = glass(el);
      expect(observers.flatMap((o) => [...o.targets])).toHaveLength(before);
      expect(surface.offscreen).toBe(false);
      surface.set({ radius: 10 });
      expect(raf).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    }
  });

  it("stops a scene's frame loop off screen and restarts it on return without a scroll event", async () => {
    const scene = document.createElement("glass-scene") as GlassSceneElement;
    const backdrop = document.createElement("div");
    backdrop.setAttribute("glass-backdrop", "");
    scene.append(backdrop);
    document.body.append(scene);
    report(scene, true);
    const surface = glass(scene.appendChild(sized(document.createElement("div"))));
    await Promise.resolve();
    expect(surface.engine).toBe("scene-dom");
    flushFrames();
    raf.mockClear();

    report(scene, false);
    report(surface.host, false);
    scene.invalidate();
    window.dispatchEvent(new Event("scroll"));
    surface.set({ radius: 16 });
    flushFrames();
    expect(raf).not.toHaveBeenCalled();

    report(scene, true);
    expect(raf).toHaveBeenCalled();
    scene.remove();
  });
});
