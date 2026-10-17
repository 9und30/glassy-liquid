/** Default playground state. The static HTML and the live knobs start here. */
export interface PlayState {
  material: "regular" | "clear";
  appearance: "light" | "dark";
  profile: "squircle" | "convex" | "lip" | "flat";
  radius: number;
  refraction: number;
  bezel: number;
  blur: number;
  dispersion: number;
  specular: number;
  lightAngle: number;
  zoom: number;
  tint: string | null;
  shadow: boolean;
  interactive: boolean;
}

export const defaultPlayState = (): PlayState => ({
  material: "regular",
  appearance: "light",
  profile: "squircle",
  radius: 36,
  refraction: 28,
  bezel: 22,
  blur: 8,
  dispersion: 0.35,
  specular: 1.1,
  lightAngle: -135,
  zoom: 1,
  tint: null,
  shadow: true,
  interactive: true,
});

const SLAB_CSS = `.slab {\n  width: 280px;\n  height: 168px;\n}`;

function formatNumber(n: number, step: number): string {
  const places =
    step > 0 && step < 1 ? Math.min(4, (String(step).split(".")[1] ?? "").replace(/0+$/, "").length) : 0;
  const f = 10 ** places;
  return String(Math.round(n * f) / f);
}

function literal(state: PlayState, pad: string): string {
  const lines = [
    `${pad}material: "${state.material}",`,
    `${pad}appearance: "${state.appearance}",`,
    `${pad}radius: ${formatNumber(state.radius, 1)},`,
    `${pad}refraction: ${formatNumber(state.refraction, 1)},`,
    `${pad}bezel: ${formatNumber(state.bezel, 1)},`,
    `${pad}blur: ${formatNumber(state.blur, 0.5)},`,
    `${pad}dispersion: ${formatNumber(state.dispersion, 0.05)},`,
    `${pad}specular: ${formatNumber(state.specular, 0.05)},`,
    `${pad}lightAngle: ${formatNumber(state.lightAngle, 5)},`,
    `${pad}zoom: ${formatNumber(state.zoom, 0.01)},`,
    `${pad}shadow: ${state.shadow},`,
    `${pad}profile: "${state.profile}",`,
  ];
  if (state.tint) lines.push(`${pad}tint: "${state.tint}",`);
  return lines.join("\n");
}

export function playgroundSnippets(state: PlayState = defaultPlayState()): {
  html: string;
  react: string;
  vue: string;
  svelte: string;
} {
  const opts = literal(state, "  ");
  const press = state.interactive ? `\nattachPress(slab, surface);` : "";
  const html = `/* ${SLAB_CSS.replace(/\n/g, " ")} */
import { glass${state.interactive ? ", attachPress" : ""} } from "glassy-liquid";

const slab = document.querySelector("#slab");
if (!(slab instanceof HTMLElement)) throw new Error("Add an element with id slab.");
slab.style.width = "280px";
slab.style.height = "168px";
const surface = glass(slab, {
${opts}
});${press}`;

  const reactPress = state.interactive
    ? `

  useEffect(() => {
    const el = ref.current;
    const ctrl = surface.current;
    if (!el || !ctrl) return;
    const press = attachPress(el, ctrl);
    return () => press.dispose();
  }, [surface]);`
    : "";
  const react = `"use client";
// Next.js App Router: keep this file a Client Component. useGlass reads the DOM.
import { useRef${state.interactive ? ", useEffect" : ""} } from "react";
import { useGlass } from "glassy-liquid/react";
${state.interactive ? `import { attachPress } from "glassy-liquid";\n` : ""}
/* ${SLAB_CSS.replace(/\n/g, " ")} */

export function Slab() {
  const ref = useRef<HTMLDivElement>(null);
  const surface = useGlass(ref, {
${literal(state, "    ")}
  });${reactPress}
  return (
    <div ref={ref} className="slab" style={{ width: 280, height: 168 }}>
      Field glass
    </div>
  );
}`;

  const vue = `<script setup>
// ${SLAB_CSS.replace(/\n/g, " ")}
import { ref${state.interactive ? ", onMounted, onBeforeUnmount" : ""} } from "vue";
import { useGlass } from "glassy-liquid/vue";
${state.interactive ? `import { attachPress } from "glassy-liquid";\n` : ""}
const slab = ref(null);
const surface = useGlass(slab, {
${literal(state, "  ")}
});
${
  state.interactive
    ? `let press;
onMounted(() => {
  if (slab.value && surface.value) press = attachPress(slab.value, surface.value);
});
onBeforeUnmount(() => press?.dispose());`
    : ""
}
</script>

<template>
  <div ref="slab" class="slab" style="width: 280px; height: 168px">Field glass</div>
</template>`;

  const svelte = `<script>
  // ${SLAB_CSS.replace(/\n/g, " ")}
  import { useGlass } from "glassy-liquid/svelte";
  ${
    state.interactive
      ? `import { onMount } from "svelte";
  import { attachPress, getSurface } from "glassy-liquid";`
      : ""
  }
  let slab;
  const options = {
${literal(state, "    ")}
  };
  ${
    state.interactive
      ? `onMount(() => {
    const surface = getSurface(slab);
    if (!surface) return;
    const press = attachPress(slab, surface);
    return () => press.dispose();
  });`
      : ""
  }
</script>

<div bind:this={slab} use:useGlass={options} class="slab" style="width: 280px; height: 168px">Field glass</div>`;

  return { html, react, vue, svelte };
}

export { formatNumber, SLAB_CSS };
