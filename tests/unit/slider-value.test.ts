// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

describe("continuous slider values", () => {
  it("keeps 62.4 and 0.4, and steps a 0 to 10 range by 0.1", async () => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
    if (typeof ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver;
    }
    const internals = ElementInternals.prototype as ElementInternals & {
      setFormValue?: (value: string | FormData | null) => void;
    };
    if (typeof internals.setFormValue !== "function") internals.setFormValue = () => {};
    const { GlassSliderElement } = await import("../../src/components/slider");
    if (!customElements.get("glass-slider"))
      customElements.define("glass-slider", GlassSliderElement);

    const wide = document.createElement("glass-slider") as InstanceType<typeof GlassSliderElement>;
    wide.setAttribute("value", "62.4");
    document.body.append(wide);
    expect(wide.value).toBe(62.4);
    expect(wide.getAttribute("aria-valuenow")).toBe("62.4");

    const unit = document.createElement("glass-slider") as InstanceType<typeof GlassSliderElement>;
    unit.setAttribute("min", "0");
    unit.setAttribute("max", "1");
    unit.setAttribute("value", "0.4");
    document.body.append(unit);
    expect(unit.value).toBe(0.4);
    expect(unit.getAttribute("aria-valuenow")).toBe("0.4");

    const keys = document.createElement("glass-slider") as InstanceType<typeof GlassSliderElement>;
    keys.setAttribute("min", "0");
    keys.setAttribute("max", "10");
    keys.setAttribute("value", "0");
    document.body.append(keys);
    keys.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(keys.value).toBe(0.1);
    expect(keys.getAttribute("aria-valuenow")).toBe("0.1");

    wide.remove();
    unit.remove();
    keys.remove();
  });
});
