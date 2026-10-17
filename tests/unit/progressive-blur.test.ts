// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const tag = "glass-progressive-blur";

/** The markup the element built with innerHTML before it switched to DOM calls. */
function previousMarkup(edge: string, size: number, max: number, n: number, tint?: string) {
  const dir = { top: "to top", bottom: "to bottom", left: "to left", right: "to right" }[edge]!;
  const vertical = edge === "top" || edge === "bottom";
  const layers: string[] = [];
  for (let i = 0; i < n; i++) {
    const blur = max / Math.pow(2, n - 1 - i);
    const a = (i / n) * 100;
    const b = ((i + 1) / n) * 100;
    const c = ((i + 2) / n) * 100;
    const mask = `linear-gradient(${dir}, rgba(0,0,0,0) ${a.toFixed(2)}%, #000 ${b.toFixed(2)}%, #000 ${Math.min(100, c).toFixed(2)}%, rgba(0,0,0,${i === n - 1 ? 1 : 0}) ${Math.min(100, c + 100 / n).toFixed(2)}%)`;
    layers.push(
      `<i style="-webkit-backdrop-filter:blur(${blur.toFixed(2)}px);backdrop-filter:blur(${blur.toFixed(2)}px);-webkit-mask-image:${mask};mask-image:${mask}"></i>`,
    );
  }
  const wash = tint
    ? `<b style="background:linear-gradient(${dir}, transparent, ${tint})"></b>`
    : "";
  return `<style>
:host{display:block;pointer-events:none;${vertical ? `height:${size}px` : `width:${size}px`};position:absolute;${edge}:0;${vertical ? "left:0;right:0" : "top:0;bottom:0"};}
i,b{position:absolute;inset:0;}
@media (prefers-reduced-transparency: reduce){i{-webkit-backdrop-filter:none;backdrop-filter:none;}}
</style>${layers.join("")}${wash}`;
}

function mount(attrs: Record<string, string>): ShadowRoot {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  document.body.append(el);
  return el.shadowRoot!;
}

/** A browser-like CSS.supports for colors, or one that accepts anything. */
function stubSupports(accept: (value: string) => boolean): void {
  (globalThis as { CSS?: unknown }).CSS = {
    supports: (property: string, value: string) => property === "color" && accept(value),
  };
}

const looksLikeColour = (value: string) =>
  /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]+)$/i.test(value);

const payloads = {
  tint: 'red)"></b><img src=x onerror=alert(1)>',
  edge: "top}</style><img src=x onerror=alert(1)><style>",
};

beforeAll(async () => {
  await import("../../src/components/progressive-blur");
});

afterEach(() => {
  document.body.replaceChildren();
  delete (globalThis as { CSS?: unknown }).CSS;
});

describe("glass-progressive-blur", () => {
  it("renders the same layers as before for valid values", () => {
    stubSupports(looksLikeColour);
    const cases: Array<[Record<string, string>, Parameters<typeof previousMarkup>]> = [
      [{}, ["top", 96, 16, 6]],
      [{ edge: "bottom", size: "120", blur: "24", layers: "4" }, ["bottom", 120, 24, 4]],
      [{ edge: "left", size: "64", layers: "8", tint: "#0a84ff" }, ["left", 64, 16, 8, "#0a84ff"]],
      [{ edge: "right", tint: "rgba(0, 0, 0, 0.4)" }, ["right", 96, 16, 6, "rgba(0, 0, 0, 0.4)"]],
      [{ layers: "20", size: "nope" }, ["top", 96, 16, 8]],
    ];
    for (const [attrs, expected] of cases) {
      expect(mount(attrs).innerHTML, JSON.stringify(attrs)).toBe(previousMarkup(...expected));
    }
  });

  it("updates when an attribute changes", () => {
    stubSupports(looksLikeColour);
    const el = document.createElement(tag);
    document.body.append(el);
    el.setAttribute("edge", "bottom");
    el.setAttribute("tint", "white");
    expect(el.shadowRoot!.innerHTML).toBe(previousMarkup("bottom", 96, 16, 6, "white"));
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("injects no element from a tint payload, even if CSS.supports accepts it", () => {
    for (const accept of [looksLikeColour, () => true]) {
      stubSupports(accept);
      const shadow = mount({ tint: payloads.tint });
      expect(shadow.querySelectorAll("img, b")).toHaveLength(0);
      expect([...shadow.children].map((el) => el.localName)).toEqual([
        "style",
        ...Array(6).fill("i"),
      ]);
      expect(shadow.innerHTML).not.toContain("onerror");
    }
  });

  it("injects no element from an edge payload and falls back to top", () => {
    stubSupports(looksLikeColour);
    const shadow = mount({ edge: payloads.edge, tint: "red" });
    expect(shadow.querySelectorAll("img")).toHaveLength(0);
    expect(shadow.querySelectorAll("style")).toHaveLength(1);
    expect(shadow.innerHTML).not.toContain("onerror");
    expect(shadow.innerHTML).toBe(previousMarkup("top", 96, 16, 6, "red"));
  });

  it("drops the tint when CSS.supports is not available", () => {
    const shadow = mount({ tint: "red" });
    expect(shadow.querySelectorAll("b")).toHaveLength(0);
    expect(shadow.innerHTML).toBe(previousMarkup("top", 96, 16, 6));
  });
});
