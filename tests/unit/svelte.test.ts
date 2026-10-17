// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fire } from "./stubs";
import { flushSync, mount, unmount } from "svelte";
import GlassSwitch from "../../src/svelte/components/GlassSwitch.svelte";
import GlassMenu from "../../src/svelte/components/GlassMenu.svelte";
import MenuSlots from "./fixtures/MenuSlots.svelte";
import MenuSlotsRunes from "./fixtures/MenuSlotsRunes.svelte";
import { glassProps } from "../../src/svelte/actions";

describe("svelte bindings", () => {
  it("components write attributes, assign properties and map callback props", () => {
    const target = document.createElement("div");
    const onCheckedChange = vi.fn();
    const app = mount(GlassSwitch, {
      target,
      props: { checked: true, disabled: true, name: "wifi", class: "x", onCheckedChange },
    });
    flushSync();
    const el = target.querySelector("glass-switch") as HTMLElement & { checked: boolean };
    expect(el.checked).toBe(true);
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.getAttribute("name")).toBe("wifi");
    expect(el.getAttribute("class")).toBe("x");
    el.checked = false;
    fire(el, "change");
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    unmount(app);
  });

  it("forwards custom-event details like react", () => {
    const target = document.createElement("div");
    const onSelect = vi.fn();
    const app = mount(GlassMenu, { target, props: { onSelect, lightAngle: 30 } });
    flushSync();
    const el = target.querySelector("glass-menu")!;
    fire(el, "select", { value: "copy" });
    expect(onSelect).toHaveBeenCalledWith("copy");
    expect(el.getAttribute("light-angle")).toBe("30");
    unmount(app);
  });

  function expectNamedSlots(target: HTMLElement) {
    const button = target.querySelector("glass-button")!;
    expect(button.querySelector(":scope > [slot=icon]")?.classList.contains("ico")).toBe(true);
    expect(button.querySelector(":scope > [slot=trailing]")?.textContent).toBe("S");
    expect(button.textContent).toContain("Save");
    const menu = target.querySelector("glass-menu")!;
    expect(menu.querySelector(":scope > [slot=trigger]")?.textContent).toBe("Open");
    expect(
      menu.querySelector("glass-menu-item")?.querySelector(":scope > [slot=shortcut]")?.textContent,
    ).toBe("C");
  }

  it("Svelte 4 slot attributes land on the custom element", () => {
    const target = document.createElement("div");
    const app = mount(MenuSlots, { target });
    flushSync();
    expectNamedSlots(target);
    unmount(app);
  });

  it("a Svelte 5 runes parent passes the same slot attributes", () => {
    const target = document.createElement("div");
    const app = mount(MenuSlotsRunes, { target });
    flushSync();
    expectNamedSlots(target);
    unmount(app);
  });

  it("the glassProps action (Svelte 4 + 5) applies, updates and cleans up", () => {
    const el = document.createElement("glass-slider") as HTMLElement & { value: number };
    const onValueChange = vi.fn();
    const action = glassProps<Record<string, unknown>>(el, {
      value: 0.3,
      ticks: true,
      onValueChange,
    });
    expect(el.value).toBe(0.3);
    expect(el.hasAttribute("ticks")).toBe(true);
    action.update!({ value: 0.5, onValueChange });
    expect(el.value).toBe(0.5);
    expect(el.hasAttribute("ticks")).toBe(false);
    el.value = 0.9;
    fire(el, "input");
    expect(onValueChange).toHaveBeenCalledWith(0.9);
    action.destroy!();
    fire(el, "input");
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });
});
