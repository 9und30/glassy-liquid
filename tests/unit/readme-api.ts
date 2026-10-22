/**
 * Renders the README API reference from `src/bindings/specs.ts`.
 * Shadow parts come from `shadow-parts.ts`, the same parse as the theming table.
 * `readme-api.test.ts` fails if the README section drifts from this output,
 * and this module fails if a spec field has no documentation entry.
 */
import {
  glassAttrs,
  modelEvents,
  specs,
  type ComponentName,
  type Spec,
} from "../../src/bindings/specs";
import { shadowParts } from "./shadow-parts";

export const API_START = "<!-- api:start -->";
export const API_END = "<!-- api:end -->";

interface FieldDoc {
  type: string;
  def: string;
  description: string;
}

interface EventDoc extends FieldDoc {
  /** DOM event name. Must match the spec. */
  dom: string;
}

interface DefaultDoc extends FieldDoc {
  /** Attribute the uncontrolled prop writes. Must match the spec. */
  attribute: string;
}

interface ComponentDoc {
  summary: string;
  /** `true` when the element has a default slot. */
  defaultSlot: boolean;
  namedSlots: string[];
  attrs: Record<string, FieldDoc>;
  props: Record<string, FieldDoc>;
  events: Record<string, EventDoc>;
  defaults: Record<string, DefaultDoc>;
  notes: string[];
}

const glassDocs: Record<(typeof glassAttrs)[number], FieldDoc> = {
  material: {
    type: "`regular` or `clear`",
    def: "`regular`",
    description: "Frosted and adaptive, or transparent for media.",
  },
  appearance: {
    type: "`auto`, `light`, or `dark`",
    def: "`auto`",
    description: "`auto` reads `--glass-appearance`, then the page `color-scheme`.",
  },
  radius: {
    type: "number, `capsule`, or `circle`",
    def: "per component",
    description: "Corner radius in CSS pixels.",
  },
  refraction: {
    type: "number",
    def: "scales with size",
    description: "Maximum rim displacement in CSS pixels.",
  },
  bezel: { type: "number", def: "`18`", description: "Width of the refracting rim in CSS pixels." },
  blur: { type: "number", def: "material", description: "Frost before refraction, in CSS pixels." },
  dispersion: {
    type: "number (0 to 1)",
    def: "`0.25` in WebGL, else `0`",
    description: "Chromatic split at the rim.",
  },
  tint: { type: "CSS color", def: "none", description: "Color of tinted glass." },
  specular: { type: "number (0 to 2)", def: "`1`", description: "Rim light strength." },
  lightAngle: { type: "degrees", def: "`-135`", description: "Light direction. `-90` is the top." },
  shadow: {
    type: "boolean or CSS `box-shadow`",
    def: "`true`",
    description: "`true` uses the material shadow. A string is used as the shadow.",
  },
  profile: {
    type: "`squircle`, `convex`, `lip`, or `flat`",
    def: "`squircle`",
    description: "Cross-section of the rim.",
  },
  engine: {
    type: "`auto`, `backdrop`, `scene-gl`, `scene-dom`, or `css`",
    def: "`auto`",
    description: "Force a renderer. Mainly for tests.",
  },
  interactive: {
    type: "boolean",
    def: "per component",
    description: "Press response: swell, light, and gel stretch.",
  },
};

const docs: Record<ComponentName, ComponentDoc> = {
  GlassScene: {
    summary:
      "Real refraction for Safari, iOS, iPadOS, and Firefox. Chromium keeps the faster page-backdrop path unless `force` is set.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {
      src: {
        type: "string",
        def: "none",
        description: "Image URL. The scene creates a cover image in its shadow root.",
      },
      backdrop: {
        type: "string",
        def: "direct child",
        description:
          "When omitted, the direct child `[glass-backdrop]` or `[data-glass-backdrop]`. A set value is a CSS selector, queried on the scene and then on `document`.",
      },
      force: {
        type: "boolean",
        def: "`false`",
        description: "Use scene rendering even in Chromium.",
      },
      mode: {
        type: "`gl` or `dom`",
        def: "auto",
        description: "Force WebGL (`gl`) or the DOM content filter (`dom`).",
      },
    },
    props: {},
    events: {},
    defaults: {},
    notes: [
      "The automatic `src` image is not a light-DOM child. Style it with `glass-scene::part(backdrop)`.",
      "With no `src` and no `backdrop` selector, that direct child is the backdrop. An image, video, or canvas uses WebGL. Any other element uses the DOM content filter.",
      "Glass anywhere inside the scene, including inside shadow roots, picks the scene up on its own.",
    ],
  },
  GlassSurface: {
    summary: "Generic slab for cards, widgets, and bars. The default radius is 24.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {},
    props: {},
    events: {},
    defaults: {},
    notes: ["Accepts every glass attribute. Content goes in the default slot."],
  },
  GlassButton: {
    summary:
      "iOS 26 glass button. `prominent` fills with the accent, `plain` draws no glass of its own.",
    defaultSlot: true,
    namedSlots: ["icon", "trailing"],
    attrs: {
      variant: {
        type: "`glass`, `prominent`, or `plain`",
        def: "`glass`",
        description: "Visual style.",
      },
      size: {
        type: "`small`, `medium`, or `large`",
        def: "`medium`",
        description: "32, 44, or 52 CSS pixels tall.",
      },
      shape: {
        type: "`capsule`, `circle`, or `rounded`",
        def: "`capsule`",
        description: "`rounded` uses a 12px radius unless `radius` is set.",
      },
      disabled: {
        type: "boolean",
        def: "`false`",
        description: "Disables interaction and sets `aria-disabled`.",
      },
      type: {
        type: "`button`, `submit`, or `reset`",
        def: "`button`",
        description: "Form action when the button has no `href`.",
      },
      href: {
        type: "string",
        def: "none",
        description: 'Renders as a link (`role="link"`) and navigates on click.',
      },
      target: {
        type: "string",
        def: "none",
        description: "Link target. Anything other than `_self` opens with `noopener`.",
      },
    },
    props: {},
    events: {},
    defaults: {},
    notes: [
      "Native event: `click`. Enter and Space activate the button.",
      "Slots: `icon`, then the default slot (the label), then `trailing`.",
      'Form-associated. Inside a form, `type="submit"` calls `requestSubmit()` and `type="reset"` resets.',
      "Accepts every glass attribute. Default radius is `capsule`. `interactive` is on.",
    ],
  },
  GlassSwitch: {
    summary: "Toggle whose thumb lifts into a lens. Form-associated, role `switch`.",
    defaultSlot: false,
    namedSlots: [],
    attrs: {
      disabled: { type: "boolean", def: "`false`", description: "Disables the control." },
      name: { type: "string", def: "none", description: "Form field name." },
      value: { type: "string", def: "`on`", description: "Value submitted when the switch is on." },
    },
    props: {
      checked: {
        type: "boolean",
        def: "`false`",
        description:
          "Controlled on state. Set the property, or the `checked` attribute for the initial value.",
      },
    },
    events: {
      onCheckedChange: {
        type: "`(checked: boolean) => void`",
        def: "none",
        description: "Fires when the user toggles the switch.",
        dom: "change",
      },
      onChange: {
        type: "`(event: Event) => void`",
        def: "none",
        description: "The same DOM `change` event, passed through unchanged.",
        dom: "change",
      },
    },
    defaults: {
      defaultChecked: {
        type: "boolean",
        def: "`false`",
        description: "Uncontrolled initial `checked` attribute. Later updates are ignored.",
        attribute: "checked",
      },
    },
    notes: [
      "Also fires `input` on a user toggle.",
      "Keyboard: Space and Enter toggle. A wrapping `<label>` activates it.",
      "Vue: `v-model:checked`. Svelte: `bind:checked`.",
    ],
  },
  GlassSlider: {
    summary:
      "Slider with a thumb that magnifies into a lens while dragged. Form-associated, role `slider`.",
    defaultSlot: false,
    namedSlots: [],
    attrs: {
      min: { type: "number", def: "`0`", description: "Range start." },
      max: { type: "number", def: "`100`", description: "Range end." },
      step: {
        type: "number",
        def: "`0` (continuous)",
        description: "Snap increment. `0` keeps the value continuous.",
      },
      ticks: { type: "boolean", def: "`false`", description: "Draw tick marks at each step." },
      showValue: {
        type: "boolean",
        def: "`false`",
        description: "Show a floating value while dragging or keyboard-focused.",
      },
      disabled: { type: "boolean", def: "`false`", description: "Disables the control." },
      name: { type: "string", def: "none", description: "Form field name." },
    },
    props: {
      value: {
        type: "number",
        def: "`min`",
        description: "Controlled value. When omitted, the value is `min`.",
      },
    },
    events: {
      onValueChange: {
        type: "`(value: number) => void`",
        def: "none",
        description: "Fires while the value is changing.",
        dom: "input",
      },
      onValueCommit: {
        type: "`(value: number) => void`",
        def: "none",
        description: "Fires when the user commits (pointer up or keyboard).",
        dom: "change",
      },
    },
    defaults: {
      defaultValue: {
        type: "number",
        def: "`min`",
        description:
          "Uncontrolled initial value. When the attribute is omitted, the value is `min`.",
        attribute: "value",
      },
    },
    notes: [
      "Keyboard: Arrow keys nudge, Home and End jump to the ends.",
      "With `show-value`, the label uses `aria-valuetext` when provided, otherwise the numeric value. Update `aria-valuetext` as the value changes. Long labels are truncated to the slider width; leave space above the control and avoid clipping ancestors.",
      "Vue: `v-model:value`. Svelte: `bind:value`.",
    ],
  },
  GlassTabBar: {
    summary:
      "Floating tab bar. The selection is a pill that lifts into a draggable magnifying lens.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {
      value: {
        type: "string",
        def: "first enabled item",
        description: "Selected item value. When omitted, the first enabled item is selected.",
      },
    },
    props: {},
    events: {
      onValueChange: {
        type: "`(value: string) => void`",
        def: "none",
        description: "Fires when the selection changes. Detail is `{ value, index }`.",
        dom: "change",
      },
    },
    defaults: {},
    notes: [
      "Children are `<glass-tab>` elements in the default slot.",
      "Role `tablist`. Arrow keys, Home, and End move the selection.",
      "Accepts every glass attribute. Default radius is `capsule`.",
      "Vue: `v-model:value`. Svelte: `bind:value`.",
    ],
  },
  GlassSegmented: {
    summary: "Segmented control with the same selection lens, on a quiet frosted track.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {
      value: {
        type: "string",
        def: "first enabled item",
        description: "Selected item value. When omitted, the first enabled item is selected.",
      },
    },
    props: {},
    events: {
      onValueChange: {
        type: "`(value: string) => void`",
        def: "none",
        description: "Fires when the selection changes. Detail is `{ value, index }`.",
        dom: "change",
      },
    },
    defaults: {},
    notes: [
      "Children are `<glass-segment>` elements in the default slot.",
      "The track itself is not a glass surface. Only the lens is.",
      "Vue: `v-model:value`. Svelte: `bind:value`.",
    ],
  },
  GlassTab: {
    summary: "One item in a `<glass-tab-bar>`. Role `tab`.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {
      value: {
        type: "string",
        def: "index",
        description: "Item value. Defaults to the child index when omitted.",
      },
      disabled: {
        type: "boolean",
        def: "`false`",
        description: "Skips the item for pointer and keyboard selection.",
      },
    },
    props: {},
    events: {},
    defaults: {},
    notes: ["The default slot is the label, often an icon plus text."],
  },
  GlassSegment: {
    summary: "One item in a `<glass-segmented>`. Role `tab`.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {
      value: {
        type: "string",
        def: "index",
        description: "Item value. Defaults to the child index when omitted.",
      },
      disabled: {
        type: "boolean",
        def: "`false`",
        description: "Skips the item for pointer and keyboard selection.",
      },
    },
    props: {},
    events: {},
    defaults: {},
    notes: ["The default slot is the label."],
  },
  GlassMenu: {
    summary:
      "Pull-down menu that morphs out of its trigger. Press, drag, and release selects in one gesture.",
    defaultSlot: true,
    namedSlots: ["trigger"],
    attrs: {
      open: {
        type: "boolean",
        def: "`false`",
        description: "Open state. The attribute presence opens the menu.",
      },
      placement: {
        type: "`bottom-start`, `bottom-end`, `bottom`, `top-start`, `top-end`, or `top`",
        def: "`bottom-start`",
        description: "Where the panel sits relative to the trigger.",
      },
    },
    props: {},
    events: {
      onSelect: {
        type: "`(value: string) => void`",
        def: "none",
        description: "Fires when an item is chosen. Detail is `{ value, item }`. Cancelable.",
        dom: "select",
      },
      onOpenChange: {
        type: "`(open: boolean) => void`",
        def: "none",
        description: "Fires when the menu opens or closes. Detail is `{ open }`.",
        dom: "toggle",
      },
    },
    defaults: {},
    notes: [
      "Put the trigger in the `trigger` slot. Items, labels, and separators go in the default slot.",
      "The panel is glass. Set the element's `glass` property (`GlassOptions`) to tune that surface. It is not a binding prop.",
      "Vue: `v-model:open`. Svelte: `bind:open`.",
    ],
  },
  GlassMenuItem: {
    summary:
      "A row in a menu. Role `menuitem`, or `menuitemcheckbox` when `checked` or `checkable` is set.",
    defaultSlot: true,
    namedSlots: ["icon", "shortcut"],
    attrs: {
      value: {
        type: "string",
        def: "text content",
        description: "Value reported by `select`. Falls back to the trimmed text.",
      },
      disabled: { type: "boolean", def: "`false`", description: "Dims the row and skips it." },
      destructive: { type: "boolean", def: "`false`", description: "Uses the destructive color." },
      checked: { type: "boolean", def: "`false`", description: "Shows a check mark." },
      checkable: {
        type: "boolean",
        def: "`false`",
        description: "Reserves space for a check even when unchecked.",
      },
      group: {
        type: "string",
        def: "none",
        description: "Items that share a group behave as a single-select set.",
      },
    },
    props: {},
    events: {},
    defaults: {},
    notes: [
      "Slots: the default slot is the label, plus optional `icon` and `shortcut`. Put icons in `icon`: they trail the row at 20px, as on iOS. An SVG or image in any slot is capped at 20px.",
    ],
  },
  GlassMenuSeparator: {
    summary: "A hairline between menu rows. Role `separator`.",
    defaultSlot: false,
    namedSlots: [],
    attrs: {},
    props: {},
    events: {},
    defaults: {},
    notes: ["No props and no slots."],
  },
  GlassMenuLabel: {
    summary: "A section header inside a menu. Role `presentation`.",
    defaultSlot: false,
    namedSlots: [],
    attrs: {},
    props: {},
    events: {},
    defaults: {},
    notes: ["The label is light-DOM text. The element has no shadow slot."],
  },
  GlassToolbar: {
    summary:
      "A row of buttons and groups with arrow-key focus. Role `toolbar`. The bar itself is not glass.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {},
    props: {},
    events: {},
    defaults: {},
    notes: [
      "Arrow keys move focus between enabled buttons, links, and switches. Home and End jump to the ends.",
      '`aria-orientation="vertical"` uses ArrowUp and ArrowDown.',
    ],
  },
  GlassGroup: {
    summary: "One shared capsule around several controls, as in an iOS 26 toolbar.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {},
    props: {},
    events: {},
    defaults: {},
    notes: ["Accepts every glass attribute. Default radius is `capsule`. Role `group`."],
  },
  GlassSpacer: {
    summary: "Flexible or fixed space inside a toolbar. `aria-hidden`.",
    defaultSlot: false,
    namedSlots: [],
    attrs: {
      size: {
        type: "number",
        def: "flex",
        description: "Fixed width in CSS pixels. Omit it and the spacer grows.",
      },
    },
    props: {},
    events: {},
    defaults: {},
    notes: ["No slots."],
  },
  GlassSearch: {
    summary: "Search field on a glass capsule, with a clear button. Form-associated.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {
      placeholder: {
        type: "string",
        def: "`Search`",
        description: "Placeholder and the default accessible name.",
      },
      name: { type: "string", def: "none", description: "Form field name." },
      disabled: { type: "boolean", def: "`false`", description: "Disables the input." },
    },
    props: {
      value: { type: "string", def: '`""`', description: "Controlled field value." },
    },
    events: {
      onValueChange: {
        type: "`(value: string) => void`",
        def: "none",
        description: "Fires on each edit, including clear.",
        dom: "input",
      },
      onSearch: {
        type: "`(value: string) => void`",
        def: "none",
        description: "Fires when the user presses Enter. Detail is `{ value }`.",
        dom: "search",
      },
    },
    defaults: {},
    notes: [
      "Also fires a native `change` event from the inner input.",
      "Escape clears the field when it has text.",
      "The default slot is trailing content after the clear button.",
      "Accepts every glass attribute. Default radius is `capsule`.",
      "Vue: `v-model:value`. Svelte: `bind:value`.",
    ],
  },
  GlassSheet: {
    summary:
      "Bottom sheet with detents, a grabber, drag to resize, and swipe to dismiss. Role `dialog`.",
    defaultSlot: true,
    namedSlots: [],
    attrs: {
      open: { type: "boolean", def: "`false`", description: "Open state." },
      detents: {
        type: "string",
        def: "`medium large`",
        description:
          "Space or comma separated `small`, `medium`, `large`, percentages, or pixel lengths.",
      },
      modal: {
        type: "boolean",
        def: "`false`",
        description:
          "Dim the page, block pointer input outside the sheet, and keep keyboard focus inside it. The dialog gets `aria-modal`.",
      },
      noDismiss: {
        type: "boolean",
        def: "`false`",
        description:
          "Keep the sheet open on scrim click, Escape, and a swipe past the last detent.",
      },
    },
    props: {},
    events: {
      onOpenChange: {
        type: "`(open: boolean) => void`",
        def: "none",
        description: "Fires when the sheet opens or closes. Detail is `{ open }`.",
        dom: "toggle",
      },
      onDetentChange: {
        type: "`(index: number) => void`",
        def: "none",
        description: "Fires when the resting detent changes. Detail is `{ index, height }`.",
        dom: "detent",
      },
    },
    defaults: {},
    notes: [
      "The default slot is the sheet body.",
      "`small` is 25vh, `medium` is 50vh, `large` fills the viewport inset.",
      "Vue: `v-model:open`. Svelte: `bind:open`.",
    ],
  },
  GlassProgressiveBlur: {
    summary:
      "iOS 26 scroll-edge blur. Content fades into a stronger blur toward one edge. `aria-hidden`.",
    defaultSlot: false,
    namedSlots: [],
    attrs: {
      edge: {
        type: "`top`, `bottom`, `left`, or `right`",
        def: "`top`",
        description: "Edge the blur grows toward.",
      },
      size: { type: "number", def: "`96`", description: "Thickness of the effect in CSS pixels." },
      blur: { type: "number", def: "`16`", description: "Maximum blur in CSS pixels." },
      layers: {
        type: "number (2 to 8)",
        def: "`6`",
        description: "How many stacked blur bands to paint.",
      },
      tint: {
        type: "CSS color",
        def: "none",
        description: "Optional gradient tint over the blur.",
      },
    },
    props: {},
    events: {},
    defaults: {},
    notes: [
      "Position it yourself (`position: fixed` or `absolute` over the scrolling content).",
      "`prefers-reduced-transparency: reduce` removes the blur.",
    ],
  },
};

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function table(rows: Array<[string, string, string, string, string]>): string {
  const head = "| Prop | Kind | Type | Default | Description |";
  const rule = "| --- | --- | --- | --- | --- |";
  const body = rows.map((row) => `| ${row.map(cell).join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

function assertDocs(): void {
  const names = Object.keys(specs) as ComponentName[];
  if (names.length !== 19) throw new Error(`expected 19 components, found ${names.length}`);
  for (const name of names) {
    const spec = specs[name] as unknown as Spec;
    const doc = docs[name];
    if (!doc) throw new Error(`missing docs for ${name}`);
    const same = (label: string, fromSpec: string[], fromDocs: string[]) => {
      const a = [...fromSpec].sort();
      const b = [...fromDocs].sort();
      if (a.join("\0") !== b.join("\0"))
        throw new Error(`${name} ${label} drift: spec [${a.join(", ")}] docs [${b.join(", ")}]`);
    };
    same("attrs", [...spec.attrs], Object.keys(doc.attrs));
    same("props", [...spec.props], Object.keys(doc.props));
    same("events", Object.keys(spec.events), Object.keys(doc.events));
    same("defaults", Object.keys(spec.defaults), Object.keys(doc.defaults));
    for (const [prop, pair] of Object.entries(spec.events as Record<string, [string, unknown]>)) {
      if (doc.events[prop]?.dom !== pair[0])
        throw new Error(
          `${name}.${prop} DOM event drift: spec ${pair[0]} docs ${doc.events[prop]?.dom}`,
        );
    }
    for (const [prop, attr] of Object.entries(spec.defaults as Record<string, string>)) {
      if (doc.defaults[prop]?.attribute !== attr)
        throw new Error(
          `${name}.${prop} default attribute drift: spec ${attr} docs ${doc.defaults[prop]?.attribute}`,
        );
    }
  }
}

function slotLine(doc: ComponentDoc): string {
  const slots = [...(doc.defaultSlot ? ["default"] : []), ...doc.namedSlots];
  return slots.length
    ? slots.map((slot) => (slot === "default" ? "default" : `\`${slot}\``)).join(", ")
    : "none";
}

/** Markdown between the api markers. Throws if docs and specs disagree. */
export function renderApiReference(): string {
  assertDocs();
  const exposed = shadowParts();
  const lines: string[] = [];
  lines.push("### Glass attributes");
  lines.push("");
  lines.push(
    "These props are accepted on every framework component. They change the material on `<glass-surface>`, `<glass-button>`, `<glass-group>`, `<glass-tab-bar>`, and `<glass-search>`. `<glass-sheet>` applies `material`, `blur`, and `tint` to its slab, including through `::part(glass)`. `glass()` and `useGlass()` take the same fields, plus `zoom` (default `1`), `backdrop` (default `true`), and `fill`.",
  );
  lines.push("");
  lines.push(
    table(
      glassAttrs.map((name) => {
        const doc = glassDocs[name];
        return [`\`${name}\``, "attribute", doc.type, doc.def, doc.description];
      }),
    ),
  );
  lines.push("");
  lines.push(
    "Framework components also forward `class`, `style`, and other DOM attributes, and take `children` for the default slot. React refs and Vue `el` point at the custom element. Svelte uses `bind:element`.",
  );
  lines.push("");
  lines.push("### Components");
  lines.push("");

  for (const name of Object.keys(specs) as ComponentName[]) {
    const spec = specs[name] as unknown as Spec;
    const doc = docs[name];
    lines.push(`#### ${name}`);
    lines.push("");
    lines.push(`Custom element: \`<${spec.tag}>\`. ${doc.summary}`);
    lines.push("");
    const rows: Array<[string, string, string, string, string]> = [];
    for (const prop of spec.attrs) {
      const field = doc.attrs[prop]!;
      rows.push([`\`${prop}\``, "attribute", field.type, field.def, field.description]);
    }
    for (const prop of spec.props) {
      const field = doc.props[prop]!;
      rows.push([`\`${prop}\``, "property", field.type, field.def, field.description]);
    }
    for (const prop of Object.keys(spec.defaults)) {
      const field = doc.defaults[prop]!;
      rows.push([
        `\`${prop}\``,
        `uncontrolled \`${field.attribute}\``,
        field.type,
        field.def,
        field.description,
      ]);
    }
    for (const prop of Object.keys(spec.events)) {
      const field = doc.events[prop]!;
      rows.push([
        `\`${prop}\``,
        `event \`${field.dom}\``,
        field.type,
        field.def,
        field.description,
      ]);
    }
    if (rows.length) {
      lines.push(table(rows));
      lines.push("");
    } else {
      lines.push("No component-specific props.");
      lines.push("");
    }
    lines.push(`Slots: ${slotLine(doc)}.`);
    lines.push("");
    const parts = exposed.get(spec.tag);
    if (!parts) throw new Error(`${name} (${spec.tag}) is missing from the parsed part list`);
    lines.push(
      parts.length
        ? `Parts: ${parts.map((part) => `\`::part(${part})\``).join(", ")}.`
        : "Parts: none.",
    );
    lines.push("");
    for (const note of doc.notes) lines.push(`- ${note}`);
    lines.push("");
  }

  lines.push("### Two-way bindings");
  lines.push("");
  lines.push(
    "Vue `v-model:*` and Svelte `bind:*` follow the same events as the React change callbacks:",
  );
  lines.push("");
  for (const name of Object.keys(specs) as ComponentName[]) {
    const models = Object.keys(modelEvents(name));
    if (!models.length) continue;
    const bits = models.map((key) => `\`v-model:${key}\` / \`bind:${key}\``);
    lines.push(`- \`${name}\`: ${bits.join(", ")}`);
  }
  lines.push("");
  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/**
 * The documentation entry for one prop, as the README table shows it. Component
 * entries win over the shared glass attributes. `component` undefined means the
 * `GlassAttributes` interface itself.
 */
export function fieldDoc(component: ComponentName | undefined, prop: string): FieldDoc | undefined {
  if (component) {
    const doc = docs[component];
    const own = doc.attrs[prop] ?? doc.props[prop] ?? doc.events[prop] ?? doc.defaults[prop];
    if (own) return own;
    const applied = (specs[component] as unknown as Spec).glass ?? glassAttrs;
    if (!applied.includes(prop)) return undefined;
  }
  return (glassDocs as Record<string, FieldDoc>)[prop];
}

export function componentSlotMap(): Record<
  ComponentName,
  { defaultSlot: boolean; namedSlots: string[] }
> {
  return Object.fromEntries(
    (Object.keys(docs) as ComponentName[]).map((name) => [
      name,
      { defaultSlot: docs[name].defaultSlot, namedSlots: [...docs[name].namedSlots] },
    ]),
  ) as Record<ComponentName, { defaultSlot: boolean; namedSlots: string[] }>;
}
