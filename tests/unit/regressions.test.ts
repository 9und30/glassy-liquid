// @vitest-environment jsdom
// Bugs found in real-browser verification (scratch apps, Oct 2026).
import { describe, expect, it, vi } from "vitest";
import { fire } from "./stubs";
import { applyAttrs, assign, listen, partition, specs, type Spec } from "../../src/bindings/specs";

describe("binding regressions", () => {
  it("does not shadow accessors when a value is assigned before the element is defined", async () => {
    const tag = "late-switch-x";
    const el = document.createElement(tag) as HTMLElement & { checked: boolean };
    document.body.append(el);
    assign(el, { checked: true });
    expect(Object.prototype.hasOwnProperty.call(el, "checked")).toBe(false);
    let internal = false;
    customElements.define(
      tag,
      class extends HTMLElement {
        get checked() {
          return internal;
        }
        set checked(v: boolean) {
          internal = v;
        }
      },
    );
    await customElements.whenDefined(tag);
    await Promise.resolve();
    expect(internal).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(el, "checked")).toBe(false);
  });

  it("ignores the native popover `toggle` event (no detail) for onOpenChange", () => {
    const el = document.createElement("glass-sheet");
    const onOpenChange = vi.fn();
    const off = listen(el, specs.GlassSheet as unknown as Spec, () => ({ onOpenChange }));
    el.dispatchEvent(new Event("toggle"));
    fire(el, "toggle", { open: true });
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    off();
  });

  it("writes defaultChecked/defaultValue only once", () => {
    const el = document.createElement("glass-switch");
    const { attrs, initial } = partition(specs.GlassSwitch as unknown as Spec, {
      defaultChecked: true,
    });
    const written = applyAttrs(el, attrs, undefined, initial);
    expect(el.hasAttribute("checked")).toBe(true);
    el.removeAttribute("checked"); // the element reflects a user toggle
    applyAttrs(el, attrs, written, initial);
    expect(el.hasAttribute("checked")).toBe(false);
  });

  it("leaves attributes the element changed itself alone on re-render (diffs against last write)", () => {
    const el = document.createElement("glass-menu-item");
    const s = specs.GlassMenuItem as unknown as Spec;
    let written = applyAttrs(el, partition(s, { value: "name", checked: true }).attrs, undefined);
    el.removeAttribute("checked"); // the menu moved the radio selection
    written = applyAttrs(el, partition(s, { value: "name", checked: true }).attrs, written);
    expect(el.hasAttribute("checked")).toBe(false);
    written = applyAttrs(el, partition(s, { value: "name" }).attrs, written);
    applyAttrs(el, partition(s, { value: "name", checked: true }).attrs, written);
    expect(el.hasAttribute("checked")).toBe(true);
  });
});
