// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fire } from "./stubs";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { GlassButton, GlassMenu, GlassMenuItem, GlassSwitch } from "../../src/react/index";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("react bindings", () => {
  it("writes attributes, assigns properties and maps events", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const onCheckedChange = vi.fn();
    await act(async () =>
      root.render(
        React.createElement(GlassSwitch, {
          checked: true,
          disabled: true,
          name: "wifi",
          className: "x",
          onCheckedChange,
        }),
      ),
    );
    const el = host.querySelector("glass-switch") as HTMLElement & { checked: boolean };
    expect(el.checked).toBe(true);
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.getAttribute("name")).toBe("wifi");
    expect(el.getAttribute("class")).toBe("x");
    el.checked = false;
    fire(el, "change");
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    const onSelect = vi.fn();
    await act(async () =>
      root.render(React.createElement(GlassMenu, { onSelect, lightAngle: 30 } as never)),
    );
    const menu = host.querySelector("glass-menu")!;
    expect(menu.getAttribute("light-angle")).toBe("30");
    fire(menu, "select", { value: "copy" });
    expect(onSelect).toHaveBeenCalledWith("copy");

    await act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            GlassButton,
            null,
            React.createElement("svg", { slot: "icon", className: "ico" }),
            "Save",
            React.createElement("span", { slot: "trailing", className: "tr" }, "S"),
          ),
          React.createElement(
            GlassMenu,
            null,
            React.createElement("button", { slot: "trigger", className: "trig" }, "Open"),
            React.createElement(
              GlassMenuItem,
              null,
              "Copy",
              React.createElement("span", { slot: "shortcut", className: "sc" }, "C"),
            ),
          ),
        ),
      ),
    );
    const btn = host.querySelector("glass-button")!;
    expect(btn.querySelector(":scope > [slot=icon]")?.classList.contains("ico")).toBe(true);
    expect(btn.querySelector(":scope > [slot=trailing]")?.textContent).toBe("S");
    expect(btn.textContent).toContain("Save");
    const menuEl = host.querySelector("glass-menu")!;
    expect(menuEl.querySelector(":scope > [slot=trigger]")?.textContent).toBe("Open");
    expect(
      menuEl.querySelector("glass-menu-item")?.querySelector(":scope > [slot=shortcut]")
        ?.textContent,
    ).toBe("C");
    await act(async () => root.unmount());
  });
});
