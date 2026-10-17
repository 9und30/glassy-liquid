import { describe, expect, it } from "vitest";
import { partition, propNames, specs, type GlassSheetProps } from "../../src/bindings/specs";

function accept(props: GlassSheetProps): GlassSheetProps {
  return props;
}

describe("glass-sheet props", () => {
  it("lists only the attributes the element applies", () => {
    expect(propNames("GlassSheet")).toEqual([
      "blur",
      "detents",
      "material",
      "modal",
      "noDismiss",
      "onDetentChange",
      "onOpenChange",
      "open",
      "tint",
    ]);
    const split = partition(specs.GlassSheet, {
      tint: "#c4622d",
      blur: 12,
      material: "clear",
      open: true,
      radius: 8,
      refraction: 16,
    });
    expect(split.attrs).toEqual({
      tint: "#c4622d",
      blur: "12",
      material: "clear",
      open: "",
    });
    expect(split.rest).toEqual({ radius: 8, refraction: 16 });
  });

  it("types accept tint, blur, and material", () => {
    const props = accept({
      material: "clear",
      blur: 12,
      tint: "#c4622d",
      open: true,
      detents: "408",
      modal: true,
      noDismiss: true,
    });
    expect(props.tint).toBe("#c4622d");
  });

  it("types reject glass attributes the sheet ignores", () => {
    // @ts-expect-error radius is not applied by glass-sheet
    accept({ radius: 8 });
    // @ts-expect-error refraction is not applied by glass-sheet
    accept({ refraction: 16 });
    // @ts-expect-error appearance is not applied by glass-sheet
    accept({ appearance: "dark" });
    // @ts-expect-error bezel is not applied by glass-sheet
    accept({ bezel: 18 });
  });
});
