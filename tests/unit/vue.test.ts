// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fire } from "./stubs";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import {
  GlassButton,
  GlassMenu,
  GlassMenuItem,
  GlassSlider,
  GlassSwitch,
} from "../../src/vue/index";

describe("vue bindings", () => {
  it("writes attributes, assigns properties and maps callback props", async () => {
    const onCheckedChange = vi.fn();
    const w = mount(GlassSwitch, {
      props: { checked: true, disabled: true, name: "wifi", onCheckedChange },
      attrs: { class: "x" },
    });
    const el = w.element as HTMLElement & { checked: boolean };
    expect(el.tagName).toBe("GLASS-SWITCH");
    expect(el.checked).toBe(true);
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.getAttribute("name")).toBe("wifi");
    expect(el.className).toBe("x");
    el.checked = false;
    fire(el, "change");
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    expect(w.emitted("update:checked")).toEqual([[false]]);
  });

  it("supports v-model:checked and v-model:value", async () => {
    const on = ref(false);
    const level = ref(0.2);
    const App = defineComponent({
      render: () => [
        h(GlassSwitch, { checked: on.value, "onUpdate:checked": (v: boolean) => (on.value = v) }),
        h(GlassSlider, { value: level.value, "onUpdate:value": (v: number) => (level.value = v) }),
      ],
    });
    const w = mount(App, { attachTo: document.body });
    const sw = w.find("glass-switch").element as HTMLElement & { checked: boolean };
    const sl = w.find("glass-slider").element as HTMLElement & { value: number };
    sw.checked = true;
    fire(sw, "change");
    sl.value = 0.8;
    fire(sl, "input");
    expect(on.value).toBe(true);
    await nextTick();
    expect(level.value).toBe(0.8);
    on.value = false;
    await nextTick();
    expect(sw.checked).toBe(false);
    w.unmount();
  });

  it("forwards custom-event details like react", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    const w = mount(GlassMenu, { props: { onSelect, onOpenChange, lightAngle: 30 } });
    fire(w.element, "select", { value: "copy" });
    fire(w.element, "toggle", { open: true });
    expect(onSelect).toHaveBeenCalledWith("copy");
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(w.emitted("update:open")).toEqual([[true]]);
    expect(w.element.getAttribute("light-angle")).toBe("30");
  });

  it("forwards named slots onto the custom element", () => {
    const button = mount(GlassButton, {
      slots: {
        icon: '<svg class="ico"></svg>',
        default: "Save",
        trailing: '<span class="tr">S</span>',
      },
    });
    const icon = button.element.querySelector(":scope > [slot=icon]");
    const trailing = button.element.querySelector(":scope > [slot=trailing]");
    expect(icon?.classList.contains("ico")).toBe(true);
    expect(trailing?.textContent).toBe("S");
    expect(button.element.textContent).toContain("Save");

    const menu = mount(GlassMenu, {
      slots: {
        trigger: '<button class="trig">Open</button>',
        default: h(
          GlassMenuItem,
          {},
          { default: () => "Copy", shortcut: () => h("span", { class: "sc" }, "C") },
        ),
      },
    });
    const trigger = menu.element.querySelector(":scope > [slot=trigger]");
    expect(trigger?.tagName).toBe("BUTTON");
    expect(trigger?.textContent).toBe("Open");
    const item = menu.element.querySelector("glass-menu-item");
    expect(item?.querySelector(":scope > [slot=shortcut]")?.textContent).toBe("C");
    expect(item?.textContent).toContain("Copy");
  });
});
