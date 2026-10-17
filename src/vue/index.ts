/**
 * Vue 3 bindings for glassy-liquid - 1:1 with `glassy-liquid/react`: the same
 * components, prop names, callback props and behavior, driven by the shared
 * binding table in `bindings/specs.ts`.
 *
 * ```vue
 * <script setup lang="ts">
 * import { ref } from "vue";
 * import { GlassButton, GlassSwitch } from "glassy-liquid/vue";
 * const on = ref(false);
 * </script>
 * <template>
 *   <GlassSwitch v-model:checked="on" />
 *   <GlassButton variant="prominent" @click="save">Done</GlassButton>
 * </template>
 * ```
 *
 * Callback props work as listeners too: `onValueChange` ⇔ `@value-change`.
 * Vue-only addition: controlled values also emit `update:<prop>` so
 * `v-model:checked` / `v-model:value` / `v-model:open` work.
 */
import {
  Comment,
  Fragment,
  Text,
  cloneVNode,
  defineComponent,
  h,
  isVNode,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  shallowRef,
  toValue,
  watch,
  type DefineSetupFnComponent,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
  type Slots,
  type VNode,
} from "vue";
import {
  glass,
  type GlassOptions,
  type GlassSurface as SurfaceController,
} from "../engine/surface.js";
import {
  DEFER_HYDRATION,
  release,
  type Written,
  SKIP,
  applyAttrs,
  isServer,
  modelEvents,
  assign,
  listen,
  partition,
  propNames,
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

type Emits<P> = {
  [K in keyof P as K extends "checked" | "value" | "open" ? `update:${K & string}` : never]-?: (
    value: NonNullable<P[K]>,
  ) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GlassVueComponent<P extends Record<string, any>> = DefineSetupFnComponent<P, Emits<P>>;

/**
 * Custom elements assign light-DOM children by the `slot` attribute. Vue named
 * slots (`<template #trigger>`) do not set that attribute, so stamp it onto
 * each vnode. Every component uses this path, including button (`icon`,
 * `trailing`), menu (`trigger`), and menu item (`icon`, `shortcut`).
 */
function stampSlot(node: VNode, name: string): VNode[] {
  if (node.type === Comment) return [];
  if (node.type === Fragment) return stampChild(node.children, name);
  if (node.type === Text || typeof node.type === "symbol") {
    const text = typeof node.children === "string" ? node.children : "";
    if (!text.trim()) return [];
    return [h("span", { slot: name }, text)];
  }
  return [cloneVNode(node, { slot: name })];
}

function stampChild(children: unknown, name: string): VNode[] {
  if (children == null || children === true || children === false) return [];
  if (typeof children === "string" || typeof children === "number") {
    const text = String(children);
    return text.trim() ? [h("span", { slot: name }, text)] : [];
  }
  if (Array.isArray(children)) return children.flatMap((child) => stampChild(child, name));
  if (isVNode(children)) return stampSlot(children, name);
  return [];
}

function renderSlots(slots: Slots): VNode[] {
  const out: VNode[] = [];
  for (const name of Object.keys(slots)) {
    const fn = slots[name];
    if (typeof fn !== "function") continue;
    const rendered = fn();
    if (name === "default") {
      if (Array.isArray(rendered)) out.push(...rendered);
      else if (isVNode(rendered)) out.push(rendered);
      continue;
    }
    out.push(...stampChild(rendered, name));
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function create<P extends Record<string, any>>(name: ComponentName): GlassVueComponent<P> {
  const spec = specs[name] as unknown as Spec;
  const model = modelEvents(name);
  return defineComponent({
    name,
    props: propNames(name),
    emits: Object.keys(model).map((k) => `update:${k}`),
    setup(props, { slots, emit, expose }) {
      const el = ref<HTMLElement | null>(null);
      expose({ el });
      let off: (() => void) | undefined;
      let written: Written | undefined;
      const sync = () => {
        if (!el.value) return;
        const { attrs, initial, deferred } = partition(spec, props as Record<string, unknown>);
        // Attributes go through setAttribute: Vue would assign same-named element properties.
        written = applyAttrs(el.value, attrs, written, initial);
        release(el.value);
        assign(el.value, deferred);
      };
      onMounted(() => {
        const node = el.value!;
        const unlisten = listen(node, spec, () => props as Record<string, unknown>);
        const extra: Array<() => void> = [];
        for (const [prop, [type, map]] of Object.entries(model)) {
          const fn = (e: Event) => {
            const v = map(e);
            if (v !== SKIP) emit(`update:${prop}`, v);
          };
          node.addEventListener(type, fn);
          extra.push(() => node.removeEventListener(type, fn));
        }
        off = () => (unlisten(), extra.forEach((f) => f()));
        sync();
      });
      onUpdated(sync);
      onBeforeUnmount(() => off?.());
      return () => {
        const { attrs, initial } = partition(spec, props as Record<string, unknown>);
        // Server: plain attributes in the markup. Client: written in sync().
        return h(
          spec.tag,
          { ...(isServer ? { ...initial, ...attrs, [DEFER_HYDRATION]: "" } : {}), ref: el },
          renderSlots(slots),
        );
      };
    },
  }) as unknown as GlassVueComponent<P>;
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
 * Turn any element into glass from Vue (counterpart of React's `useGlass`).
 *
 * ```ts
 * const card = ref<HTMLElement | null>(null);
 * useGlass(card, { radius: 28, material: "clear" });
 * ```
 */
export function useGlass<T extends HTMLElement>(
  target: Ref<T | null>,
  options: MaybeRefOrGetter<GlassOptions> = {},
): ShallowRef<SurfaceController | null> {
  const surface = shallowRef<SurfaceController | null>(null);
  onMounted(() => {
    if (target.value) surface.value = glass(target.value, toValue(options));
  });
  watch(
    () => JSON.stringify(toValue(options)),
    () => surface.value?.set(toValue(options)),
  );
  onBeforeUnmount(() => {
    surface.value?.destroy();
    surface.value = null;
  });
  return surface;
}

/** Tags of every glass custom element, e.g. for `compilerOptions.isCustomElement`. */
export const isGlassElement = (tag: string) => tag.startsWith("glass-");

export type { GlassOptions, GlassSurface as GlassSurfaceController } from "../engine/surface.js";
