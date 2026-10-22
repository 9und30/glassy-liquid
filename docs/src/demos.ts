/**
 * Component demos. Markup is the source for both the live preview and the
 * Web Components snippet. `{{icon}}` becomes an SVG in the preview, and
 * `{{icon:slot}}` an SVG with that `slot` attribute, such as `{{share:icon}}`.
 */
export interface Demo {
  id: string;
  title: string;
  lede: string;
  bg: "lake" | "city" | "fruit" | "glacier";
  height?: number;
  html: string;
  react: string;
  vue: string;
  svelte: string;
  props?: Array<[string, string, string, string]>;
  events?: Array<[string, string, string?]>;
}

export const glassProps: Array<[string, string, string, string]> = [
  ["material", "regular | clear", "regular", "Frosted and adaptive, or transparent over photographs."],
  ["appearance", "auto | light | dark", "auto", "auto follows --glass-appearance, then the page color-scheme."],
  ["radius", "number | capsule | circle", "24", "Corner radius in CSS pixels. A component may set its own, such as capsule on a button."],
  ["refraction", "number", "scales with the surface", "Maximum displacement at the rim, in CSS pixels. Small controls bend more."],
  ["bezel", "number", "18", "Width of the refracting rim, in CSS pixels."],
  ["blur", "number", "the material's", "Frost before refraction (Gaussian sigma, CSS pixels)."],
  ["dispersion", "0 to 1", "0.25 on scene-gl, else 0", "Chromatic split at the rim. It is free on the WebGL scene path and off where it costs extra passes."],
  ["tint", "CSS color", "none", "A wash of color over the transmitted light."],
  ["specular", "0 to 2", "1", "Strength of the rim light."],
  ["lightAngle", "degrees", "-135", "Where the light comes from. 0 is the right, -90 is the top. In HTML: light-angle."],
  ["shadow", "boolean | CSS", "true", "Drop shadow under the slab. true uses the material shadow."],
  ["profile", "squircle | convex | lip | flat", "squircle", "Cross-section of the rim."],
  ["zoom", "number", "1", "Magnification of the center. A glass() option, not an HTML attribute."],
  ["backdrop", "boolean", "true", "Refract and blur the backdrop. false keeps only light, tint, and shadow."],
  ["fill", "CSS color", "none", "Override the material fill. A glass() option, not an HTML attribute."],
  ["engine", "auto | backdrop | scene-gl | scene-dom | css", "auto", "Force a renderer. auto uses backdrop in Chromium, a scene inside glass-scene elsewhere, and css when neither is available."],
];

export const demos: Demo[] = [
  {
    id: "button",
    title: "Button",
    lede: "Capsule, circle, or rounded. Glass by default, tinted with the accent when prominent, or plain inside a group. A press swells and lights up under the finger.",
    bg: "fruit",
    height: 300,
    html: `<glass-button shape="circle" aria-label="Back">{{back}}</glass-button>
<glass-button>Edit</glass-button>
<glass-button variant="prominent">Done</glass-button>`,
    react: `import { GlassButton } from "glassy-liquid/react";

export function Buttons() {
  return (
    <>
      <GlassButton shape="circle" aria-label="Back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </GlassButton>
      <GlassButton onClick={() => {}}>Edit</GlassButton>
      <GlassButton variant="prominent" onClick={() => {}}>Done</GlassButton>
    </>
  );
}`,
    vue: `<script setup lang="ts">
import { GlassButton } from "glassy-liquid/vue";
</script>

<template>
  <GlassButton shape="circle" aria-label="Back">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  </GlassButton>
  <GlassButton @click="() => {}">Edit</GlassButton>
  <GlassButton variant="prominent" @click="() => {}">Done</GlassButton>
</template>`,
    svelte: `<script>
  import { GlassButton } from "glassy-liquid/svelte";
</script>

<GlassButton shape="circle" aria-label="Back">
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" />
  </svg>
</GlassButton>
<GlassButton onclick={() => {}}>Edit</GlassButton>
<GlassButton variant="prominent" onclick={() => {}}>Done</GlassButton>`,
    props: [
      ["variant", "string", "glass", "glass, prominent (tinted with --glass-accent), or plain."],
      ["size", "string", "medium", "small, medium, large: 32, 44, or 52 px tall."],
      ["shape", "string", "capsule", "capsule, circle for icons, or rounded."],
      ["type", "string", "button", "submit and reset work inside forms."],
      ["href", "URL", "none", "Renders as a link."],
      ["disabled", "boolean", "false", ""],
    ],
    events: [["click", "Native click, also from Enter and Space."]],
  },
  {
    id: "surface",
    title: "Surface",
    lede: "The generic slab for cards, widgets, and bars. Put anything inside. The glass sizes itself to the element and does not rebuild its maps on resize.",
    bg: "lake",
    height: 340,
    html: `<glass-surface radius="34" style="width:170px;height:170px;padding:16px">
  <small>Mountain lake</small>
  <b>14°</b>
</glass-surface>
<glass-surface material="clear" radius="40" style="width:170px;height:170px"></glass-surface>`,
    react: `import { GlassSurface } from "glassy-liquid/react";

export function LakeCard() {
  return (
    <GlassSurface radius={34} style={{ width: 170, height: 170, padding: 16 }}>
      <small>Mountain lake</small>
      <b>14°</b>
    </GlassSurface>
  );
}`,
    vue: `<script setup lang="ts">
import { GlassSurface } from "glassy-liquid/vue";
</script>

<template>
  <GlassSurface :radius="34" style="width:170px;height:170px;padding:16px">
    <small>Mountain lake</small>
    <b>14°</b>
  </GlassSurface>
</template>`,
    svelte: `<script>
  import { GlassSurface } from "glassy-liquid/svelte";
</script>

<GlassSurface radius={34} style="width:170px;height:170px;padding:16px">
  <small>Mountain lake</small>
  <b>14°</b>
</GlassSurface>`,
  },
  {
    id: "switch",
    title: "Switch",
    lede: "The iOS 26 toggle. The thumb lifts into a clear lens while you hold it, follows a drag with rubber-banding, and lands with a soft bounce. It is form-associated.",
    bg: "city",
    height: 300,
    html: `<glass-surface radius="28" style="width:min(320px,100%);padding:6px 18px;display:flex;flex-direction:column">
  <label class="controls__row"><span class="controls__label">{{wifi}}Wi-Fi</span><glass-switch checked name="wifi"></glass-switch></label>
  <label class="controls__row"><span class="controls__label">{{plane}}Airplane Mode</span><glass-switch name="air"></glass-switch></label>
</glass-surface>`,
    react: `import { useState } from "react";
import { GlassSwitch } from "glassy-liquid/react";

export function WifiSwitch() {
  const [wifi, setWifi] = useState(true);
  return <GlassSwitch checked={wifi} onCheckedChange={setWifi} aria-label="Wi-Fi" />;
}`,
    vue: `<script setup lang="ts">
import { ref } from "vue";
import { GlassSwitch } from "glassy-liquid/vue";
const wifi = ref(true);
</script>

<template>
  <GlassSwitch v-model:checked="wifi" aria-label="Wi-Fi" />
</template>`,
    svelte: `<script>
  import { GlassSwitch } from "glassy-liquid/svelte";
  let wifi = $state(true);
</script>

<GlassSwitch bind:checked={wifi} aria-label="Wi-Fi" />`,
    props: [
      ["checked", "boolean", "false", "The attribute is the initial state. The property is the current state."],
      ["name / value", "string", "value=on", "Submitted with forms."],
      ["disabled", "boolean", "false", ""],
    ],
    events: [
      ["input", "On every change made by the user."],
      ["change", "Same moment. Read event.target.checked."],
    ],
  },
  {
    id: "slider",
    title: "Slider",
    lede: "Drag the thumb and it turns into a magnifying lens over the track. Add show-value for a floating value during drag or keyboard focus, or ticks for stepped values. Leave room above the control for the label. Keys: arrows, Page Up and Down, Home, End.",
    bg: "glacier",
    height: 300,
    html: `<glass-surface radius="28" style="width:min(320px,100%);padding:42px 18px 18px;display:flex;flex-direction:column;gap:22px">
  <glass-slider value="62" show-value aria-label="Brightness"></glass-slider>
  <glass-slider value="50" step="25" ticks aria-label="Speed"></glass-slider>
</glass-surface>`,
    react: `import { useState } from "react";
import { GlassSlider } from "glassy-liquid/react";

export function Volume() {
  const [volume, setVolume] = useState(62);
  const [speed, setSpeed] = useState(50);
  return (
    <>
      <GlassSlider value={volume} showValue onValueChange={(value) => setVolume(Math.round(value))} aria-label="Volume" />
      <p>{Math.round(volume)}</p>
      <GlassSlider value={speed} step={25} ticks onValueCommit={(value) => setSpeed(Math.round(value))} aria-label="Speed" />
    </>
  );
}`,
    vue: `<script setup lang="ts">
import { ref } from "vue";
import { GlassSlider } from "glassy-liquid/vue";
const volume = ref(62);
const speed = ref(50);
function commit(value: number) {
  speed.value = Math.round(value);
}
</script>

<template>
  <GlassSlider v-model:value="volume" show-value aria-label="Volume" />
  <p>{{ Math.round(volume) }}</p>
  <GlassSlider v-model:value="speed" :step="25" ticks aria-label="Speed" @value-commit="commit" />
</template>`,
    svelte: `<script>
  import { GlassSlider } from "glassy-liquid/svelte";
  let volume = $state(62);
  let speed = $state(50);
  function commit(value) {
    speed = Math.round(value);
  }
</script>

<GlassSlider bind:value={volume} showValue aria-label="Volume" />
<p>{Math.round(volume)}</p>
<GlassSlider bind:value={speed} step={25} ticks aria-label="Speed" onValueCommit={commit} />`,
    props: [
      ["value", "number", "min", "The attribute is the initial value. The property is current."],
      ["min / max", "number", "0 / 100", ""],
      ["step", "number", "continuous", "Snaps on release."],
      ["ticks", "boolean", "false", "Dots at every step."],
      ["show-value", "boolean", "false", "Floating value during drag or keyboard focus. Uses aria-valuetext when set; update it with the value."],
    ],
    events: [
      ["input", "While dragging.", "React onValueChange. Vue @value-change or :onValueChange. Svelte onValueChange."],
      ["change", "On release, or when a key commits.", "React onValueCommit. Vue @value-commit. Svelte onValueCommit."],
    ],
  },
  {
    id: "tab-bar",
    title: "Tab bar",
    lede: "The floating iOS 26 tab bar. Touch it and the selection lifts into a lens you can slide across the tabs. It stretches with speed and snaps to the nearest tab.",
    bg: "fruit",
    height: 260,
    html: `<glass-tab-bar value="home" aria-label="Main" style="width:min(360px,100%)">
  <glass-tab value="home">{{home}}Home</glass-tab>
  <glass-tab value="library">{{stack}}Library</glass-tab>
  <glass-tab value="recent">{{clock}}Recent</glass-tab>
  <glass-tab value="profile">{{person}}Profile</glass-tab>
</glass-tab-bar>`,
    react: `import { useState } from "react";
import { GlassTabBar, GlassTab } from "glassy-liquid/react";

export function MainTabs() {
  const [tab, setTab] = useState("home");
  return (
    <GlassTabBar value={tab} onValueChange={setTab} aria-label="Main">
      <GlassTab value="home">Home</GlassTab>
      <GlassTab value="library">Library</GlassTab>
    </GlassTabBar>
  );
}`,
    vue: `<script setup lang="ts">
import { ref } from "vue";
import { GlassTabBar, GlassTab } from "glassy-liquid/vue";
const tab = ref("home");
</script>

<template>
  <GlassTabBar v-model:value="tab" aria-label="Main">
    <GlassTab value="home">Home</GlassTab>
    <GlassTab value="library">Library</GlassTab>
  </GlassTabBar>
</template>`,
    svelte: `<script>
  import { GlassTabBar, GlassTab } from "glassy-liquid/svelte";
  let tab = $state("home");
</script>

<GlassTabBar bind:value={tab} aria-label="Main">
  <GlassTab value="home">Home</GlassTab>
  <GlassTab value="library">Library</GlassTab>
</GlassTabBar>`,
    props: [["value", "string", "first tab", "The selected tab's value."]],
    events: [["change", "detail: { value, index }"]],
  },
  {
    id: "segmented",
    title: "Segmented",
    lede: "The same lens on a quieter track. The white pill becomes glass while you drag between segments.",
    bg: "lake",
    height: 240,
    html: `<glass-segmented value="week" aria-label="Range">
  <glass-segment value="day">Day</glass-segment>
  <glass-segment value="week">Week</glass-segment>
  <glass-segment value="month">Month</glass-segment>
  <glass-segment value="year">Year</glass-segment>
</glass-segmented>`,
    react: `import { useState } from "react";
import { GlassSegmented, GlassSegment } from "glassy-liquid/react";

export function Range() {
  const [range, setRange] = useState("week");
  return (
    <GlassSegmented value={range} onValueChange={setRange} aria-label="Range">
      <GlassSegment value="day">Day</GlassSegment>
      <GlassSegment value="week">Week</GlassSegment>
    </GlassSegmented>
  );
}`,
    vue: `<script setup lang="ts">
import { ref } from "vue";
import { GlassSegmented, GlassSegment } from "glassy-liquid/vue";
const range = ref("week");
</script>

<template>
  <GlassSegmented v-model:value="range" aria-label="Range">
    <GlassSegment value="day">Day</GlassSegment>
    <GlassSegment value="week">Week</GlassSegment>
  </GlassSegmented>
</template>`,
    svelte: `<script>
  import { GlassSegmented, GlassSegment } from "glassy-liquid/svelte";
  let range = $state("week");
</script>

<GlassSegmented bind:value={range} aria-label="Range">
  <GlassSegment value="day">Day</GlassSegment>
  <GlassSegment value="week">Week</GlassSegment>
</GlassSegmented>`,
    props: [["value", "string", "first segment", ""]],
    events: [["change", "detail: { value, index }"]],
  },
  {
    id: "menu",
    title: "Menu",
    lede: "A pull-down menu that morphs out of its trigger. Press, drag to an item, and release to choose in one gesture. Full keyboard support and type-ahead.",
    bg: "city",
    height: 380,
    html: `<glass-menu placement="bottom-start">
  <glass-button slot="trigger">Sort {{more}}</glass-button>
  <glass-menu-label>Sort by</glass-menu-label>
  <glass-menu-item value="name" checked group="sort">Name</glass-menu-item>
  <glass-menu-item value="date" checkable group="sort">Date Modified</glass-menu-item>
  <glass-menu-separator></glass-menu-separator>
  <glass-menu-item value="share">Share {{share:icon}}</glass-menu-item>
  <glass-menu-item value="delete" destructive>Delete {{trash:icon}}</glass-menu-item>
</glass-menu>`,
    react: `import { GlassMenu, GlassMenuItem, GlassButton } from "glassy-liquid/react";

export function SortMenu() {
  return (
    <GlassMenu onSelect={() => {}}>
      <GlassButton slot="trigger">Sort</GlassButton>
      <GlassMenuItem value="name" checked group="sort">Name</GlassMenuItem>
      <GlassMenuItem value="delete" destructive>Delete</GlassMenuItem>
    </GlassMenu>
  );
}`,
    vue: `<script setup lang="ts">
import { GlassMenu, GlassMenuItem, GlassButton } from "glassy-liquid/vue";
function run(_value: string) {}
</script>

<template>
  <GlassMenu @select="run">
    <template #trigger>
      <GlassButton>Sort</GlassButton>
    </template>
    <GlassMenuItem value="name" checked group="sort">Name</GlassMenuItem>
    <GlassMenuItem value="delete" destructive>Delete</GlassMenuItem>
  </GlassMenu>
</template>`,
    svelte: `<script>
  import { GlassMenu, GlassMenuItem, GlassButton } from "glassy-liquid/svelte";
  function run(_value) {}
</script>

<GlassMenu onSelect={run}>
  <GlassButton slot="trigger">Sort</GlassButton>
  <GlassMenuItem value="name" checked group="sort">Name</GlassMenuItem>
  <GlassMenuItem value="delete" destructive>Delete</GlassMenuItem>
</GlassMenu>`,
    props: [
      ["placement", "string", "bottom-start", "bottom or top, optionally -start or -end. Flips to stay on screen."],
      ["open", "boolean", "false", ""],
      ["checked, group", "item", "none", "Items that share a group behave like radios."],
      ["destructive, disabled", "item", "false", ""],
    ],
    events: [
      ["select", "detail: { value, item }. Cancelable, to keep the menu open."],
      ["toggle", "detail: { open }"],
    ],
  },
  {
    id: "toolbar",
    title: "Toolbar",
    lede: "iOS 26 toolbars share one capsule of glass between related actions. A group holds plain buttons. Spacers push groups apart. Arrow keys move focus.",
    bg: "glacier",
    height: 240,
    html: `<glass-toolbar style="width:min(360px,100%)">
  <glass-button shape="circle" aria-label="Back">{{back}}</glass-button>
  <glass-spacer></glass-spacer>
  <glass-group>
    <glass-button variant="plain" shape="circle" aria-label="Share">{{share}}</glass-button>
    <glass-button variant="plain" shape="circle" aria-label="Favorite">{{heart}}</glass-button>
  </glass-group>
  <glass-button shape="circle" aria-label="More">{{more}}</glass-button>
</glass-toolbar>`,
    react: `import { GlassToolbar, GlassGroup, GlassSpacer, GlassButton } from "glassy-liquid/react";

export function EditorBar() {
  return (
    <GlassToolbar>
      <GlassButton shape="circle" aria-label="Back">Back</GlassButton>
      <GlassSpacer />
      <GlassGroup>
        <GlassButton variant="plain" shape="circle" aria-label="Share">Share</GlassButton>
      </GlassGroup>
    </GlassToolbar>
  );
}`,
    vue: `<script setup lang="ts">
import { GlassToolbar, GlassGroup, GlassSpacer, GlassButton } from "glassy-liquid/vue";
</script>

<template>
  <GlassToolbar>
    <GlassButton shape="circle" aria-label="Back">Back</GlassButton>
    <GlassSpacer />
    <GlassGroup>
      <GlassButton variant="plain" shape="circle" aria-label="Share">Share</GlassButton>
    </GlassGroup>
  </GlassToolbar>
</template>`,
    svelte: `<script>
  import { GlassToolbar, GlassGroup, GlassSpacer, GlassButton } from "glassy-liquid/svelte";
</script>

<GlassToolbar>
  <GlassButton shape="circle" aria-label="Back">Back</GlassButton>
  <GlassSpacer />
  <GlassGroup>
    <GlassButton variant="plain" shape="circle" aria-label="Share">Share</GlassButton>
  </GlassGroup>
</GlassToolbar>`,
  },
  {
    id: "search",
    title: "Search",
    lede: "A capsule field with a clear button. Enter fires a search event. Escape clears. It participates in forms the way a native input does.",
    bg: "fruit",
    height: 240,
    html: `<div class="row" style="width:min(360px,100%)">
  <glass-search placeholder="Search fruit" aria-label="Search fruit" style="flex:1"></glass-search>
  <glass-button shape="circle" aria-label="Dictate">{{mic}}</glass-button>
</div>`,
    react: `import { useState } from "react";
import { GlassSearch } from "glassy-liquid/react";

export function FruitSearch() {
  const [query, setQuery] = useState("");
  return (
    <GlassSearch
      value={query}
      onValueChange={setQuery}
      onSearch={() => {}}
      placeholder="Search fruit"
      aria-label="Search fruit"
    />
  );
}`,
    vue: `<script setup lang="ts">
import { ref } from "vue";
import { GlassSearch } from "glassy-liquid/vue";
const query = ref("");
function submit(_value: string) {}
</script>

<template>
  <GlassSearch v-model:value="query" placeholder="Search fruit" aria-label="Search fruit" @search="submit" />
</template>`,
    svelte: `<script>
  import { GlassSearch } from "glassy-liquid/svelte";
  let query = $state("");
  function submit(_value) {}
</script>

<GlassSearch bind:value={query} placeholder="Search fruit" aria-label="Search fruit" onSearch={submit} />`,
    props: [
      ["value", "string", "empty", ""],
      ["placeholder", "string", "Search", ""],
    ],
    events: [
      ["input, change", "As a native input."],
      ["search", "detail: { value }, fired on Enter."],
    ],
  },
  {
    id: "sheet",
    title: "Sheet",
    lede: "A floating bottom sheet with detents. Drag the grabber to resize. Flick down to dismiss. Escape closes it and focus returns to the trigger.",
    bg: "lake",
    height: 240,
    html: `<glass-button variant="prominent" id="open-demo-sheet">Show sheet</glass-button>
<glass-sheet id="demo-sheet" detents="medium large" aria-label="Trip details">
  <h3>Mountain lake</h3>
  <p>Drag the grabber to resize. Flick down to close.</p>
</glass-sheet>
<script>
  document.getElementById("open-demo-sheet").addEventListener("click", () => {
    document.getElementById("demo-sheet").open = true;
  });
</script>`,
    react: `import { useState } from "react";
import { GlassSheet, GlassButton } from "glassy-liquid/react";

export function TripSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GlassButton variant="prominent" onClick={() => setOpen(true)}>Show sheet</GlassButton>
      <GlassSheet open={open} onOpenChange={setOpen} detents="medium large" aria-label="Trip details">
        <h3>Mountain lake</h3>
      </GlassSheet>
    </>
  );
}`,
    vue: `<script setup lang="ts">
import { ref } from "vue";
import { GlassSheet, GlassButton } from "glassy-liquid/vue";
const open = ref(false);
</script>

<template>
  <GlassButton variant="prominent" @click="open = true">Show sheet</GlassButton>
  <GlassSheet v-model:open="open" detents="medium large" aria-label="Trip details">
    <h3>Mountain lake</h3>
  </GlassSheet>
</template>`,
    svelte: `<script>
  import { GlassSheet, GlassButton } from "glassy-liquid/svelte";
  let open = $state(false);
</script>

<GlassButton variant="prominent" onclick={() => (open = true)}>Show sheet</GlassButton>
<GlassSheet bind:open={open} detents="medium large" aria-label="Trip details">
  <h3>Mountain lake</h3>
</GlassSheet>`,
    props: [
      ["detents", "string", "medium large", "Space or comma separated: small, medium, large, px, or %."],
      ["modal", "boolean", "false", "Dims the page, keeps keyboard focus inside the sheet, and closes on an outside tap."],
      ["no-dismiss", "boolean", "false", "Keeps it open."],
    ],
    events: [
      ["toggle", "detail: { open }"],
      ["detent", "detail: { index, height }"],
    ],
  },
  {
    id: "scroll-edge",
    title: "Scroll edge",
    lede: "The iOS 26 scroll-edge effect. Content dissolves into a growing blur under floating bars instead of hitting a hard divider. Scroll the list.",
    bg: "glacier",
    height: 360,
    html: `<div style="position:relative;width:min(340px,100%);height:280px;border-radius:26px;overflow:hidden">
  <div style="height:100%;overflow:auto;padding:76px 14px 14px;display:grid;gap:10px">
    <glass-surface radius="18" style="padding:14px 16px">Clear, 14°</glass-surface>
    <glass-surface radius="18" style="padding:14px 16px">Bright, 12°</glass-surface>
    <glass-surface radius="18" style="padding:14px 16px">High cloud, 9°</glass-surface>
    <glass-surface radius="18" style="padding:14px 16px">Still, 11°</glass-surface>
    <glass-surface radius="18" style="padding:14px 16px">Cold, 8°</glass-surface>
  </div>
  <glass-progressive-blur edge="top" size="92"></glass-progressive-blur>
  <glass-toolbar style="position:absolute;top:12px;left:12px;right:12px">
    <glass-button size="small">Today</glass-button>
    <glass-spacer></glass-spacer>
    <glass-button size="small" shape="circle" aria-label="Add">{{plus}}</glass-button>
  </glass-toolbar>
</div>`,
    react: `import { GlassProgressiveBlur, GlassToolbar, GlassButton, GlassSurface } from "glassy-liquid/react";

export function ScrollEdge() {
  return (
    <div style={{ position: "relative", width: 340, height: 280, borderRadius: 26, overflow: "hidden" }}>
      <div style={{ height: "100%", overflow: "auto", padding: "76px 14px 14px", display: "grid", gap: 10 }}>
        <GlassSurface radius={18} style={{ padding: "14px 16px" }}>Clear, 14°</GlassSurface>
        <GlassSurface radius={18} style={{ padding: "14px 16px" }}>Bright, 12°</GlassSurface>
        <GlassSurface radius={18} style={{ padding: "14px 16px" }}>Still, 11°</GlassSurface>
      </div>
      <GlassProgressiveBlur edge="top" size={92} />
      <GlassToolbar style={{ position: "absolute", top: 12, left: 12, right: 12 }}>
        <GlassButton size="small">Today</GlassButton>
      </GlassToolbar>
    </div>
  );
}`,
    vue: `<script setup lang="ts">
import { GlassProgressiveBlur, GlassToolbar, GlassButton, GlassSurface } from "glassy-liquid/vue";
</script>

<template>
  <div style="position: relative; width: 340px; height: 280px; border-radius: 26px; overflow: hidden">
    <div style="height: 100%; overflow: auto; padding: 76px 14px 14px; display: grid; gap: 10px">
      <GlassSurface :radius="18" style="padding: 14px 16px">Clear, 14°</GlassSurface>
      <GlassSurface :radius="18" style="padding: 14px 16px">Bright, 12°</GlassSurface>
      <GlassSurface :radius="18" style="padding: 14px 16px">Still, 11°</GlassSurface>
    </div>
    <GlassProgressiveBlur edge="top" :size="92" />
    <GlassToolbar style="position: absolute; top: 12px; left: 12px; right: 12px">
      <GlassButton size="small">Today</GlassButton>
    </GlassToolbar>
  </div>
</template>`,
    svelte: `<script>
  import { GlassProgressiveBlur, GlassToolbar, GlassButton, GlassSurface } from "glassy-liquid/svelte";
</script>

<div style="position: relative; width: 340px; height: 280px; border-radius: 26px; overflow: hidden">
  <div style="height: 100%; overflow: auto; padding: 76px 14px 14px; display: grid; gap: 10px">
    <GlassSurface radius={18} style="padding: 14px 16px">Clear, 14°</GlassSurface>
    <GlassSurface radius={18} style="padding: 14px 16px">Bright, 12°</GlassSurface>
    <GlassSurface radius={18} style="padding: 14px 16px">Still, 11°</GlassSurface>
  </div>
  <GlassProgressiveBlur edge="top" size={92} />
  <GlassToolbar style="position: absolute; top: 12px; left: 12px; right: 12px">
    <GlassButton size="small">Today</GlassButton>
  </GlassToolbar>
</div>`,
    props: [
      ["edge", "string", "top", "top, bottom, left, or right."],
      ["size", "number", "96", "Depth of the effect, in pixels."],
      ["blur", "number", "16", "Blur at the very edge, in pixels."],
      ["layers", "number", "6", "How many blur steps stack toward the edge. Clamped from 2 to 8."],
      ["tint", "CSS color", "none", "Optional color wash toward the edge."],
    ],
  },
];

export const iconTokens = /\{\{(\w+)(?::(\w+))?\}\}/g;
