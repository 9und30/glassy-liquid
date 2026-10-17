/**
 * Shared observers. One ResizeObserver and one IntersectionObserver serve all
 * surfaces, instead of one per element.
 */
type ResizeCb = (width: number, height: number) => void;
type VisibleCb = (visible: boolean) => void;

const resizeCbs = new WeakMap<Element, ResizeCb>();
const visibleCbs = new WeakMap<Element, VisibleCb>();
let ro: ResizeObserver | undefined;
let io: IntersectionObserver | undefined;

export function observeSize(el: Element, cb: ResizeCb): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  ro ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const fn = resizeCbs.get(e.target);
      if (!fn) continue;
      const box = e.borderBoxSize?.[0];
      // Untransformed layout size (transforms from press/morph animations are excluded).
      const w = box ? box.inlineSize : (e.target as HTMLElement).offsetWidth;
      const h = box ? box.blockSize : (e.target as HTMLElement).offsetHeight;
      fn(w, h);
    }
  });
  resizeCbs.set(el, cb);
  ro.observe(el, { box: "border-box" });
  return () => {
    resizeCbs.delete(el);
    ro?.unobserve(el);
  };
}

export function observeVisibility(el: Element, cb: VisibleCb): () => void {
  if (typeof IntersectionObserver === "undefined") {
    cb(true);
    return () => {};
  }
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) visibleCbs.get(e.target)?.(e.isIntersecting);
    },
    { rootMargin: "200px" },
  );
  visibleCbs.set(el, cb);
  io.observe(el);
  return () => {
    visibleCbs.delete(el);
    io?.unobserve(el);
  };
}
