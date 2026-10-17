/**
 * Svelte actions for glassy-liquid. They work in Svelte 4 and 5 and use the
 * exact prop and callback names of `glassy-liquid/react`.
 *
 * ```svelte
 * <glass-switch use:glassProps={{ checked, onCheckedChange: (v) => (checked = v) }}></glass-switch>
 * <div use:useGlass={{ radius: 28, material: "clear" }}>…</div>
 * ```
 *
 * Svelte 5 projects can use the ready-made components instead
 * (`import { GlassSwitch } from "glassy-liquid/svelte"`).
 */
import { glass, type GlassOptions } from "../engine/surface.js";
import {
  DEFER_HYDRATION,
  release,
  type Written,
  type Spec,
  applyAttrs,
  assign,
  isServer,
  listen,
  modelEvents,
  partition,
  propNames,
  registerElements,
  specForTag,
  specs,
  type ComponentName,
} from "../bindings/specs.js";

registerElements();

export interface ActionReturn<P> {
  update?: (props: P) => void;
  destroy?: () => void;
}

/**
 * Apply React-style props (attributes, controlled properties, `on…` callbacks)
 * to a glass custom element. The binding is chosen from the element's tag.
 */
export function glassProps<P extends object = Record<string, unknown>>(
  node: HTMLElement,
  props: P = {} as P,
): ActionReturn<P> {
  const found = specForTag(node.tagName);
  if (!found) throw new Error(`glassProps: <${node.tagName.toLowerCase()}> is not a glass element`);
  const [, spec] = found;
  let current = props as Record<string, unknown>;
  let written: Written | undefined;
  const apply = () => {
    const { attrs, initial, deferred } = partition(spec, current);
    written = applyAttrs(node, attrs, written, initial);
    release(node);
    assign(node, deferred);
  };
  apply();
  const off = listen(node, spec, () => partition(spec, current).handlers);
  return {
    update(next) {
      current = next as Record<string, unknown>;
      apply();
    },
    destroy: off,
  };
}

/** Turn any element into glass (counterpart of React's `useGlass`). */
export function useGlass(
  node: HTMLElement,
  options: GlassOptions = {},
): ActionReturn<GlassOptions> {
  const surface = glass(node, options);
  let key = JSON.stringify(options);
  return {
    update(next = {}) {
      const k = JSON.stringify(next);
      if (k !== key) {
        key = k;
        surface.set(next);
      }
    },
    destroy: () => surface.destroy(),
  };
}

/**
 * Used by the generated Svelte 5 components: splits props into the spec bucket
 * (handled by `glassProps`) and plain HTML attributes, and routes the
 * `on…Change` callbacks through the bindable value so `bind:` works.
 */
export function svelteProps(
  name: ComponentName,
  rest: Record<string, unknown>,
  bound: Record<string, unknown>,
  set: (prop: string, value: unknown) => void,
): { own: Record<string, unknown>; html: Record<string, unknown>; ssr: Record<string, string> } {
  const known = new Set(propNames(name));
  const own: Record<string, unknown> = {};
  const html: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) (known.has(k) ? own : html)[k] = v;
  Object.assign(own, bound);
  for (const prop of Object.keys(modelEvents(name))) {
    const key = `on${prop[0]!.toUpperCase()}${prop.slice(1)}Change`;
    const user = rest[key];
    own[key] = (v: unknown) => {
      set(prop, v);
      if (typeof user === "function") (user as (v: unknown) => void)(v);
    };
  }
  // Server rendering: actions do not run there, so put the attributes in the markup.
  // On the client this is empty and `glassProps` owns the attributes.
  let ssr: Record<string, string> = {};
  if (isServer) {
    const { attrs, initial } = partition(specs[name] as unknown as Spec, own);
    ssr = { ...initial, ...attrs, [DEFER_HYDRATION]: "" };
  }
  return { own, html, ssr };
}

export { componentNames, specs, propNames } from "../bindings/specs.js";
