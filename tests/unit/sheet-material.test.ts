// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

describe("glass-sheet material", () => {
  it("applies tint, blur, and material, and clears them when the attribute goes away", async () => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
    const { getSurface } = await import("../../src/engine/surface");
    const { GlassSheetElement } = await import("../../src/components/sheet");
    if (!customElements.get("glass-sheet")) customElements.define("glass-sheet", GlassSheetElement);
    const sheet = document.createElement("glass-sheet") as InstanceType<typeof GlassSheetElement>;
    sheet.setAttribute("tint", "#c4622d");
    sheet.setAttribute("blur", "12");
    sheet.setAttribute("material", "clear");
    document.body.append(sheet);
    sheet.show();
    const host = sheet.shadowRoot?.querySelector(".sheet");
    if (!(host instanceof HTMLElement)) throw new Error("sheet host missing");
    const surface = getSurface(host);
    expect(surface).toBeTruthy();
    expect(surface?.options.tint).toBe("#c4622d");
    expect(surface?.options.blur).toBe(12);
    expect(surface?.options.material).toBe("clear");
    sheet.setAttribute("tint", "#0a84ff");
    sheet.setAttribute("blur", "3");
    sheet.setAttribute("material", "regular");
    expect(surface?.options.tint).toBe("#0a84ff");
    expect(surface?.options.blur).toBe(3);
    expect(surface?.options.material).toBe("regular");
    sheet.removeAttribute("tint");
    sheet.removeAttribute("blur");
    expect(surface?.options.tint).toBeNull();
    expect(surface?.options.blur).toBeUndefined();
    sheet.remove();
  });
});
