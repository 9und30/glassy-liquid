// Server rendering (node, no window): attributes must be in the markup.
import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { createSSRApp, h } from "vue";
import { renderToString as vueToString } from "vue/server-renderer";
import { GlassSwitch, GlassButton } from "../../src/react/index";
import * as V from "../../src/vue/index";
import { ssrMarkup } from "./ssr-markup";

describe("ssr", () => {
  it("react renders attributes and defaults on the server", () => {
    const html = renderToString(
      React.createElement(
        "div",
        null,
        React.createElement(GlassButton, { variant: "prominent", lightAngle: 30 }, "Go"),
        React.createElement(GlassSwitch, { defaultChecked: true, name: "wifi" }),
      ),
    );
    expect(html).toBe(ssrMarkup);
  });

  it("vue renders attributes and defaults on the server", async () => {
    const app = createSSRApp({
      render: () =>
        h("div", [
          h(V.GlassButton, { variant: "prominent", lightAngle: 30 }, () => "Go"),
          h(V.GlassSwitch, { defaultChecked: true, name: "wifi" }),
        ]),
    });
    const html = await vueToString(app);
    expect(html).toContain(
      '<glass-button variant="prominent" light-angle="30" defer-hydration>Go</glass-button>',
    );
    expect(html).toContain('<glass-switch checked name="wifi" defer-hydration></glass-switch>');
  });
});
