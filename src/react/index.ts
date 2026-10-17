"use client";
/**
 * React bindings for glassy-liquid. Thin, typed wrappers around the custom
 * elements: attributes for primitives, properties for complex values, and
 * idiomatic callbacks (`onCheckedChange`, `onValueChange`, …). SSR-safe: the
 * server renders plain custom-element markup that upgrades on the client.
 *
 * ```tsx
 * import { GlassButton, GlassSwitch } from "glassy-liquid/react";
 * <GlassButton variant="prominent" onClick={save}>Done</GlassButton>
 * <GlassSwitch checked={on} onCheckedChange={setOn} />
 * ```
 */
import * as React from "react";
import {
  glass,
  type GlassOptions,
  type GlassSurface as SurfaceController,
} from "../engine/surface.js";
import {
  DEFER_HYDRATION,
  release,
  type Written,
  applyAttrs,
  assign,
  isServer,
  listen,
  partition,
  registerElements,
  specs,
  type ComponentName,
  type Spec,
} from "../bindings/specs.js";
import type {
  GlassButtonProps,
  GlassEmptyProps,
  GlassGroupProps,
  GlassItemProps,
  GlassMenuItemProps,
  GlassMenuProps,
  GlassProgressiveBlurProps,
  GlassSceneProps,
  GlassSearchProps,
  GlassSelectorProps,
  GlassSheetProps,
  GlassSliderProps,
  GlassSpacerProps,
  GlassSurfaceProps,
  GlassSwitchProps,
} from "../bindings/specs.js";

export type {
  GlassAttributes,
  GlassButtonProps,
  GlassItemProps,
  GlassMenuItemProps,
  GlassMenuProps,
  GlassProgressiveBlurProps,
  GlassSceneProps,
  GlassSearchProps,
  GlassSelectorProps,
  GlassSheetProps,
  GlassSliderProps,
  GlassSurfaceProps,
  GlassSwitchProps,
} from "../bindings/specs.js";

registerElements();

// React 18 warns for every useLayoutEffect during server rendering. On the server
// no effect runs anyway, so useEffect is the same thing without the warning.
const useIsomorphicLayoutEffect = isServer ? React.useEffect : React.useLayoutEffect;

type Html = React.HTMLAttributes<HTMLElement>;

const subscribeNever = () => () => {};
const notHydrating = () => false;
const isHydrating = () => true;

function create<P extends object, E extends HTMLElement = HTMLElement>(name: ComponentName) {
  const spec = specs[name] as unknown as Spec;
  const Component = React.forwardRef<E, P & Html & { children?: React.ReactNode }>(
    function GlassComponent(input, forwarded) {
      const inner = React.useRef<E | null>(null);
      const props = input as Record<string, unknown>;
      const { attrs, initial, deferred, handlers, rest } = partition(spec, props);
      // Attributes are rendered into the markup on the server and during
      // hydration (so the hydrated tree matches the server HTML exactly), then
      // frozen: React never sees them change and never touches them again. All
      // later writes go through setAttribute in the layout effect below, because
      // React 19 would assign same-named element *properties* instead
      // (`open=""` → `el.open = ""` closes a sheet). Fresh client mounts start
      // empty and get their attributes from the same effect before paint.
      const hydrating = React.useSyncExternalStore(subscribeNever, notHydrating, isHydrating);
      const [markup] = React.useState(() =>
        isServer || hydrating ? { ...initial, ...attrs, [DEFER_HYDRATION]: "" } : null,
      );
      const out: Record<string, unknown> = { ...markup };
      for (const [k, v] of Object.entries(rest)) out[k === "className" ? "class" : k] = v;

      // Callbacks are read through a ref so listeners attach once.
      const live = React.useRef(handlers);
      live.current = handlers;
      React.useEffect(() => {
        const el = inner.current;
        if (!el) return;
        return listen(el, spec, () => live.current);
      }, []);

      const written = React.useRef<Written | undefined>(undefined);
      useIsomorphicLayoutEffect(() => {
        const el = inner.current;
        if (!el) return;
        // After hydration the server-rendered attributes count as already written.
        written.current = applyAttrs(
          el,
          attrs,
          written.current ?? (markup ? new Map(Object.entries(attrs)) : undefined),
          initial,
        );
        release(el);
        assign(el, deferred);
      });

      const setRef = React.useCallback(
        (el: E | null) => {
          inner.current = el;
          if (typeof forwarded === "function") forwarded(el);
          else if (forwarded) forwarded.current = el;
        },
        [forwarded],
      );
      out.ref = setRef;
      return React.createElement(spec.tag, out, props.children as React.ReactNode);
    },
  );
  Component.displayName = name;
  return Component;
}

export const GlassScene = create<GlassSceneProps>("GlassScene");
export const GlassSurface = create<GlassSurfaceProps>("GlassSurface");
export const GlassButton = create<GlassButtonProps>("GlassButton");
export const GlassSwitch = create<GlassSwitchProps>("GlassSwitch");
export const GlassSlider = create<GlassSliderProps>("GlassSlider");
export const GlassTabBar = create<GlassSelectorProps>("GlassTabBar");
export const GlassSegmented = create<GlassSelectorProps>("GlassSegmented");
export const GlassTab = create<GlassItemProps>("GlassTab");
export const GlassSegment = create<GlassItemProps>("GlassSegment");
export const GlassMenu = create<GlassMenuProps>("GlassMenu");
export const GlassMenuItem = create<GlassMenuItemProps>("GlassMenuItem");
export const GlassMenuSeparator = create<GlassEmptyProps>("GlassMenuSeparator");
export const GlassMenuLabel = create<GlassEmptyProps>("GlassMenuLabel");
export const GlassToolbar = create<GlassEmptyProps>("GlassToolbar");
export const GlassGroup = create<GlassGroupProps>("GlassGroup");
export const GlassSpacer = create<GlassSpacerProps>("GlassSpacer");
export const GlassSearch = create<GlassSearchProps>("GlassSearch");
export const GlassSheet = create<GlassSheetProps>("GlassSheet");
export const GlassProgressiveBlur = create<GlassProgressiveBlurProps>("GlassProgressiveBlur");

/**
 * Turn any element into glass from React.
 *
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * useGlass(ref, { radius: 28, material: "clear" });
 * return <div ref={ref}>…</div>;
 * ```
 */
export function useGlass<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  options: GlassOptions = {},
): React.RefObject<SurfaceController | null> {
  const surface = React.useRef<SurfaceController | null>(null);
  const key = JSON.stringify(options);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    surface.current = glass(el, options);
    return () => {
      surface.current?.destroy();
      surface.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
  useIsomorphicLayoutEffect(() => {
    surface.current?.set(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return surface;
}

export type { GlassOptions, GlassSurface as GlassSurfaceController } from "../engine/surface.js";
