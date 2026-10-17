/**
 * The tactile response of Liquid Glass: on touch the slab swells and lights up
 * from the contact point, follows the finger elastically (rubber-banded, with
 * volume-preserving stretch) and settles with a gel-like overshoot on release.
 *
 * Only `scale`, `translate` and a few custom properties are written, so the
 * element's own `transform` keeps composing, and everything is driven by the
 * shared frame ticker (nothing runs while idle).
 */
import { finePointer, prefersReducedMotion } from "../core/env.js";
import { Spring, rubberBand, springs } from "../core/spring.js";
import { addTask, wake, type FrameTask } from "../core/ticker.js";
import type { GlassSurface } from "../engine/surface.js";

export interface PressOptions {
  /** Grow factor at full press. Default: scales with size (small controls grow more). */
  grow?: number;
  /** Follow the finger while held. Default true. */
  stretch?: boolean;
  /** Light up under the finger. Default true. */
  glow?: boolean;
  /** Target for scale/translate (defaults to the host). */
  target?: HTMLElement;
  /** Called when press state changes. */
  onPressChange?: (pressed: boolean) => void;
}

export interface PressController {
  readonly pressed: boolean;
  dispose(): void;
}

const claimed = new WeakSet<Event>();

/** Movement (CSS px) after which a press counts as a drag rather than a tap; fingers jitter more than mice. */
export function tapSlop(e: PointerEvent): number {
  return e.pointerType === "mouse" ? 6 : 10;
}

function isDisabled(el: Element): boolean {
  return el.matches(":disabled, [disabled], [aria-disabled='true']");
}

export function attachPress(
  host: HTMLElement,
  surface: GlassSurface | null,
  options: PressOptions = {},
): PressController {
  const target = options.target ?? host;
  const press = new Spring(0, springs.press);
  const glow = new Spring(0, springs.glow);
  const tx = new Spring(0, springs.track);
  const ty = new Spring(0, springs.track);
  let pointer: { id: number; x: number; y: number; cx: number; cy: number } | null = null;
  let keyboard = false;
  let hovering = false;
  let gx = 0;
  let gy = 0;
  let written = false;
  let rect: DOMRect | null = null;
  const size = () => ({ w: host.offsetWidth || 1, h: host.offsetHeight || 1 });

  const setPressed = (v: boolean) => {
    if (v) host.setAttribute("data-pressed", "");
    else host.removeAttribute("data-pressed");
    options.onPressChange?.(v);
  };

  const locate = (clientX: number, clientY: number) => {
    const r = host.getBoundingClientRect();
    const { w, h } = size();
    // Convert from the transformed (visual) box back to layout pixels.
    gx = ((clientX - r.left) * w) / (r.width || 1);
    gy = ((clientY - r.top) * h) / (r.height || 1);
  };

  const task: FrameTask = {
    read() {
      if (pointer) rect = host.getBoundingClientRect();
    },
    write(_now, dt) {
      const { w, h } = size();
      const max = Math.max(w, h);
      const elastic = !prefersReducedMotion();
      if (pointer && rect && options.stretch !== false && elastic) {
        const cx = rect.left + rect.width / 2 - tx.value;
        const cy = rect.top + rect.height / 2 - ty.value;
        const small = max <= 80;
        // Small controls follow the finger a little; big surfaces only resist at their edges.
        const ox = small
          ? pointer.x - pointer.cx - (cx - pointer.cx)
          : pointer.x - Math.max(cx - w / 2, Math.min(cx + w / 2, pointer.x));
        const oy = small
          ? pointer.y - pointer.cy - (cy - pointer.cy)
          : pointer.y - Math.max(cy - h / 2, Math.min(cy + h / 2, pointer.y));
        const limit = small ? 4 + 0.14 * max : Math.min(10, 3 + 0.035 * max);
        tx.to(rubberBand(ox, limit));
        ty.to(rubberBand(oy, limit));
      }
      press.step(dt);
      glow.step(dt);
      tx.step(dt);
      ty.step(dt);

      const growMax = options.grow ?? Math.min(0.16, 7.5 / max);
      const grow = elastic ? growMax * press.value : 0;
      const ex = elastic
        ? Math.min(0.14, (0.5 * Math.abs(tx.value)) / w + 0.00006 * Math.abs(tx.velocity))
        : 0;
      const ey = elastic
        ? Math.min(0.14, (0.5 * Math.abs(ty.value)) / h + 0.00006 * Math.abs(ty.velocity))
        : 0;
      const sx = ((1 + grow) * (1 + ex)) / Math.sqrt(1 + ey);
      const sy = ((1 + grow) * (1 + ey)) / Math.sqrt(1 + ex);
      const moved = Math.abs(tx.value) > 0.01 || Math.abs(ty.value) > 0.01;
      const scaled = Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4;
      const lit = glow.value > 0.002 && options.glow !== false;

      if (moved || scaled || lit) {
        written = true;
        target.style.translate = moved ? `${tx.value.toFixed(2)}px ${ty.value.toFixed(2)}px` : "";
        target.style.scale = scaled ? `${sx.toFixed(4)} ${sy.toFixed(4)}` : "";
        surface?.setGlow(gx, gy, lit ? glow.value : 0, Math.max(48, Math.min(260, max * 1.15)));
      } else if (written) {
        written = false;
        target.style.translate = "";
        target.style.scale = "";
        surface?.setGlow(gx, gy, 0);
      }
      return !!pointer || keyboard || !press.settled || !glow.settled || !tx.settled || !ty.settled;
    },
  };
  const removeTask = addTask(task);

  function onMove(e: PointerEvent) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    locate(e.clientX, e.clientY);
    wake(task);
  }
  function onUp(e?: PointerEvent) {
    if (e && (!pointer || e.pointerId !== pointer.id)) return;
    pointer = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    press.to(0, springs.release);
    tx.to(0, springs.release);
    ty.to(0, springs.release);
    glow.to(hovering ? 0.28 : 0, springs.glow);
    setPressed(false);
    wake(task);
  }
  function onDown(e: PointerEvent) {
    if (claimed.has(e) || e.button !== 0 || isDisabled(host)) return;
    claimed.add(e);
    const r = host.getBoundingClientRect();
    pointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
    locate(e.clientX, e.clientY);
    press.to(1, springs.press);
    glow.to(1, springs.press);
    const max = Math.max(r.width, r.height);
    const follow = { duration: springs.track.duration + 0.0005 * max, bounce: 0 };
    tx.configure(follow);
    ty.configure(follow);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    setPressed(true);
    wake(task);
  }
  function onHover(e: PointerEvent) {
    if (e.pointerType === "touch" || !finePointer()) return;
    hovering = e.type !== "pointerleave";
    if (hovering && !pointer) locate(e.clientX, e.clientY);
    if (!pointer && !keyboard) glow.to(hovering ? 0.28 : 0, springs.glow);
    wake(task);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key !== " " && e.key !== "Enter") return;
    if (e.type === "keydown") {
      if (e.repeat || claimed.has(e) || isDisabled(host) || pointer) return;
      claimed.add(e);
      keyboard = true;
      const { w, h } = size();
      gx = w / 2;
      gy = h / 2;
      press.to(1, springs.press);
      glow.to(1, springs.press);
      setPressed(true);
    } else if (keyboard) {
      keyboard = false;
      press.to(0, springs.release);
      glow.to(0, springs.glow);
      setPressed(false);
    }
    wake(task);
  }
  function onBlur() {
    if (!keyboard) return;
    keyboard = false;
    press.to(0, springs.release);
    glow.to(0, springs.glow);
    setPressed(false);
    wake(task);
  }
  // Native drags of links/images inside would cancel the press.
  function onDragStart(e: DragEvent) {
    if (!pointer) return;
    const t = e.target as Element | null;
    if (!(t instanceof Element) || !t.closest('[draggable="true"]')) e.preventDefault();
  }

  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerenter", onHover);
  host.addEventListener("pointermove", onHover);
  host.addEventListener("pointerleave", onHover);
  host.addEventListener("keydown", onKey);
  host.addEventListener("keyup", onKey);
  host.addEventListener("focusout", onBlur);
  host.addEventListener("dragstart", onDragStart);

  return {
    get pressed() {
      return !!pointer || keyboard;
    },
    dispose() {
      onUp();
      removeTask();
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerenter", onHover);
      host.removeEventListener("pointermove", onHover);
      host.removeEventListener("pointerleave", onHover);
      host.removeEventListener("keydown", onKey);
      host.removeEventListener("keyup", onKey);
      host.removeEventListener("focusout", onBlur);
      host.removeEventListener("dragstart", onDragStart);
      target.style.translate = "";
      target.style.scale = "";
      surface?.setGlow(0, 0, 0);
    },
  };
}
