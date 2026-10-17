// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "./stubs";
import * as React from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { GlassButton, GlassSwitch } from "../../src/react/index";
import { hydratedMarkup, ssrMarkup } from "./ssr-markup";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("react hydration", () => {
  it("hydrates server markup without warnings and keeps the attributes", async () => {
    const host = document.createElement("div");
    host.innerHTML = ssrMarkup;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRecoverableError = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(
        host,
        React.createElement(
          "div",
          null,
          React.createElement(GlassButton, { variant: "prominent", lightAngle: 30 }, "Go"),
          React.createElement(GlassSwitch, { defaultChecked: true, name: "wifi" }),
        ),
        { onRecoverableError },
      );
    });
    expect(error).not.toHaveBeenCalled();
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(host.innerHTML).toBe(hydratedMarkup);
    error.mockRestore();
    await act(async () => root.unmount());
  });
});
