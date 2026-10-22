import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build helper
import { minifyTemplates } from "../../scripts/minify-templates.mjs";

const value = (source: string, name: string, width = 32) =>
  Function("width", `${source}; return ${name};`)(width) as string;

describe("CDN template minification", () => {
  it("preserves CSS interpolation expressions and leaves unrelated templates alone", async () => {
    const source =
      "const css = /* css */ `.x { width: ${width / 2}px; color: #ffffff; }`; const text = ` hello ${width} `;";
    const compact = await minifyTemplates(source, "fixture.ts");
    expect(value(compact, "css")).toBe(".x{width:16px;color:#fff}");
    expect(value(compact, "css", 100)).toBe(".x{width:50px;color:#fff}");
    expect(value(compact, "text")).toBe(value(source, "text"));
  });

  it("preserves shader interface names, swizzles and separate operators", async () => {
    const source =
      "const code = /* glsl */ `uniform vec3 color; varying vec2 uv; void main() { /* note */ vec3 result = color.rgb; float amount = 0.5; result += vec3(amount); gl_FragColor = vec4(result, 1.0); }`;";
    const code = value(await minifyTemplates(source, "fixture.ts"), "code");
    expect(code).toContain("uniform vec3 color;");
    expect(code).toContain("varying vec2 uv;");
    expect(code).toContain("color.rgb");
    expect(code).toContain("void main()");
    expect(code).toContain("gl_FragColor");
    expect(code).not.toContain("result");
    expect(code).not.toContain("amount");
    expect(code).not.toContain("note");
    const operators =
      "const code = /* glsl */ `void main() { float value = 1.0; value = value - -1.0; value++; }`;";
    expect(value(await minifyTemplates(operators, "fixture.ts"), "code")).toContain("- -");
  });

  it("leaves preprocessor directives and structs intact", async () => {
    for (const shader of [
      "#define VALUE 1.0\nvoid main() {}",
      "struct Item { float amount; }; void main() {}",
      "uniform float first, amount; void main() { float amount = 1.0; }",
    ])
      expect(
        value(
          await minifyTemplates(
            `const code = /* glsl */ ${JSON.stringify(shader).replace(/^"|"$/g, "`")};`,
            "fixture.ts",
          ),
          "code",
        ),
      ).toBe(shader);
  });

  it("does not rename interfaces when a local has the same name", async () => {
    const source =
      "const code = /* glsl */ `uniform highp vec3 color; void main() { vec3 color = vec3(0.0); gl_FragColor = vec4(color, 1.0); }`;";
    const code = value(await minifyTemplates(source, "fixture.ts"), "code");
    expect(code).toContain("uniform highp vec3 color;");
    expect(code).toContain("vec3 color=");
    expect(code).toContain("vec4(color,1.0)");
  });

  it("keeps nested marked template expressions intact", async () => {
    const source = "const css = /* css */ `.x { width: ${(/* css */ `16`)}px; }`; const after = 7;";
    const compact = await minifyTemplates(source, "fixture.ts");
    expect(value(compact, "css")).toBe(".x{width:16px}");
    expect(value(compact, "after")).toBe(7);
  });

  it("rejects interpolated shaders instead of guessing their grammar", async () => {
    await expect(
      minifyTemplates("const code = /* glsl */ `float value = ${width};`;", "fixture.ts"),
    ).rejects.toThrow("Interpolated shaders are not supported");
  });

  it("preserves the string coercion hint of CSS interpolations", async () => {
    const source =
      'const dimension = { [Symbol.toPrimitive](hint) { return hint === "string" ? 24 : 99; } }; const css = /* css */ `.x { width: ${dimension}px; }`;';
    expect(value(await minifyTemplates(source, "fixture.ts"), "css")).toBe(".x{width:24px}");
  });
});
