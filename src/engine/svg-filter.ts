/**
 * SVG filter graph that turns a backdrop (or a content layer) into liquid
 * glass: 9-slice displacement map → refraction (optionally with chromatic
 * dispersion) → tone curve.
 *
 * The graph is built once per structural configuration; geometry changes
 * (resizing, morphing) only update attributes, and map tiles are cached
 * globally, so animating a surface's size never encodes a new image.
 */
import { displacementSet, zoomGradient, type SliceKey } from "../core/maps.js";
import type { ShapeMetrics } from "../core/shape.js";
import { sliceLayout, type Slice } from "../core/shape.js";
import type { OpticsConfig } from "../core/optics.js";

const NS = "http://www.w3.org/2000/svg";

export interface FilterParams {
  metrics: ShapeMetrics;
  dpr: number;
  optics: OpticsConfig;
  /** Maximum displacement at the rim, CSS px. */
  refraction: number;
  /** Chromatic dispersion 0..1 (relative spread of R/B displacement). */
  dispersion: number;
  /** Tone transfer table (feFuncX tableValues) or null for identity. */
  tone: string | null;
  /** Gaussian blur inside the SVG graph (0 = none). Prefer CSS blur() before the url when possible. */
  blur: number;
  /** Magnification of the flat center (1 = none). Used by selection lenses. */
  zoom?: number;
  /** Offset of the shape inside the filter's user space (content-layer filters). */
  offsetX?: number;
  offsetY?: number;
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

function setAttrs(e: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) {
    const v = String(attrs[k]);
    if (e.getAttribute(k) !== v) e.setAttribute(k, v);
  }
}

export class GlassFilter {
  readonly id: string;
  readonly svg: SVGSVGElement;
  readonly filter: SVGFilterElement;
  private structure = "";
  private images = new Map<SliceKey, SVGFEImageElement>();
  private flood?: SVGFEFloodElement;
  private displacements: Array<{ el: SVGFEDisplacementMapElement; factor: number }> = [];
  private zoomImage?: SVGFEImageElement;
  private zoomMap?: SVGFEDisplacementMapElement;

  constructor(id: string) {
    this.id = id;
    this.svg = el("svg", { "aria-hidden": "true", focusable: "false", width: 0, height: 0 });
    this.filter = el("filter", {
      id,
      filterUnits: "userSpaceOnUse",
      primitiveUnits: "userSpaceOnUse",
      "color-interpolation-filters": "sRGB",
    });
    this.svg.append(this.filter);
  }

  /** Apply parameters, rebuilding the graph only when its structure changes. */
  update(p: FilterParams): void {
    const disperse = p.dispersion > 0.001 && p.refraction > 0;
    const slices = sliceLayout(p.metrics);
    // Zero-sized primitives disable the whole graph in Chromium, so the graph
    // only contains the slices this shape actually has (capsules have no
    // vertical edges, circles no edges at all).
    const keys = slices.map((s) => s.key);
    const zoom = (p.zoom ?? 1) > 1.001;
    const structure = `${disperse}|${p.tone ?? ""}|${p.blur > 0}|${keys.join("")}|${zoom}`;
    if (structure !== this.structure) this.build(p, disperse, keys);
    this.structure = structure;
    this.layout(p, slices);
  }

  private build(p: FilterParams, disperse: boolean, keys: SliceKey[]): void {
    const f = this.filter;
    f.replaceChildren();
    this.images.clear();
    this.displacements = [];
    this.zoomImage = undefined;
    this.zoomMap = undefined;

    this.flood = el("feFlood", { "flood-color": "#808080", "flood-opacity": 1, result: "n" });
    f.append(this.flood);
    for (const key of keys) {
      const img = el("feImage", { preserveAspectRatio: "none", result: `s${key}` });
      this.images.set(key, img);
      f.append(img);
    }
    const merge = el("feMerge", { result: "map" });
    merge.append(el("feMergeNode", { in: "n" }));
    for (const key of keys) merge.append(el("feMergeNode", { in: `s${key}` }));
    f.append(merge);

    let src = "SourceGraphic";
    if (p.blur > 0) {
      f.append(
        el("feGaussianBlur", {
          in: "SourceGraphic",
          stdDeviation: p.blur,
          edgeMode: "duplicate",
          result: "src",
        }),
      );
      src = "src";
    }
    if ((p.zoom ?? 1) > 1.001) {
      // Magnify with a linear field: one fixed gradient image, animated only through `scale`.
      this.zoomImage = el("feImage", {
        preserveAspectRatio: "none",
        href: zoomGradient(),
        result: "zmap",
      });
      this.zoomMap = el("feDisplacementMap", {
        in: src,
        in2: "zmap",
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: "zoomed",
      });
      f.append(this.zoomImage, this.zoomMap);
      src = "zoomed";
    }

    const disp = (result: string, factor: number) => {
      const d = el("feDisplacementMap", {
        in: src,
        in2: "map",
        xChannelSelector: "R",
        yChannelSelector: "G",
        result,
      });
      this.displacements.push({ el: d, factor });
      f.append(d);
    };

    if (disperse) {
      const spread = Math.min(0.5, p.dispersion * 0.25);
      disp("dr", 1 + spread);
      disp("dg", 1);
      disp("db", 1 - spread);
      const iso = (input: string, row: number, result: string) => {
        const m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
        m[row * 5 + row] = 1;
        f.append(el("feColorMatrix", { in: input, type: "matrix", values: m.join(" "), result }));
      };
      iso("dr", 0, "cr");
      iso("dg", 1, "cg");
      iso("db", 2, "cb");
      // Channels are disjoint, so screen (a + b − ab) is an exact sum - and,
      // unlike arithmetic composites, a blend mode stays on the GPU fast path.
      f.append(el("feBlend", { in: "cr", in2: "cg", mode: "screen", result: "crg" }));
      f.append(el("feBlend", { in: "crg", in2: "cb", mode: "screen", result: "d" }));
    } else {
      disp("d", 1);
    }

    if (p.tone) {
      const ct = el("feComponentTransfer", { in: "d", result: "out" });
      for (const c of ["R", "G", "B"] as const)
        ct.append(el(`feFunc${c}`, { type: "table", tableValues: p.tone }));
      f.append(ct);
    }
  }

  private layout(p: FilterParams, slices: Slice[]): void {
    const m = p.metrics;
    const ox = p.offsetX ?? 0;
    const oy = p.offsetY ?? 0;
    const pad = 0;
    setAttrs(this.filter, {
      x: ox - pad,
      y: oy - pad,
      width: m.width + pad * 2,
      height: m.height + pad * 2,
    });
    if (this.flood) setAttrs(this.flood, { x: ox, y: oy, width: m.width, height: m.height });

    const set = displacementSet(m, p.dpr, p.optics);
    for (const s of slices) {
      const img = this.images.get(s.key);
      const tile = set[s.key];
      if (!img || !tile) continue;
      if (img.getAttribute("href") !== tile.url) img.setAttribute("href", tile.url);
      setAttrs(img, { x: ox + s.x, y: oy + s.y, width: s.width, height: s.height });
    }
    if (this.zoomImage && this.zoomMap) {
      const size = Math.max(m.width, m.height);
      setAttrs(this.zoomImage, {
        x: ox + (m.width - size) / 2,
        y: oy + (m.height - size) / 2,
        width: size,
        height: size,
      });
      setAttrs(this.zoomMap, { scale: (size * (1 - 1 / Math.max(1, p.zoom ?? 1))).toFixed(3) });
    }
    // Map value 1.0 (byte 255) means +scale/2, so scale = 2 × max displacement.
    const scale = 2 * p.refraction;
    for (const d of this.displacements) setAttrs(d.el, { scale: (scale * d.factor).toFixed(3) });
  }

  destroy(): void {
    this.svg.remove();
  }
}
