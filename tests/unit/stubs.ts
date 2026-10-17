// Minimal stand-ins for the real custom elements (the engine needs a real browser;
// jsdom only has to prove the bindings wire attributes, properties and events).
import { vi } from "vitest";
vi.mock("../../src/elements.js", () => ({}));

class Stub extends HTMLElement {
  checked = false;
  value: unknown = undefined;
}
for (const tag of [
  "glass-switch",
  "glass-slider",
  "glass-search",
  "glass-menu",
  "glass-sheet",
  "glass-button",
  "glass-tab-bar",
  "glass-surface",
]) {
  if (!customElements.get(tag)) customElements.define(tag, class extends Stub {});
}

export const fire = (el: Element, type: string, detail?: unknown) =>
  el.dispatchEvent(
    detail === undefined
      ? new Event(type, { bubbles: true })
      : new CustomEvent(type, { detail, bubbles: true }),
  );
