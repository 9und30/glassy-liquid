/**
 * Styles for the glass layers. The same rules are used in two places:
 * adopted into every component's shadow root, and injected once into the
 * document for surfaces created with `glass(element)` on light-DOM elements.
 *
 * Layer stack inside <gl-fx> (bottom → top):
 *   .s  drop shadow (kept separate, see below)
 *   .b  transmitted backdrop: refraction/blur filter, fill color
 *   .t  tint (colored glass)
 *   .r  specular rim light (9-slice border-image)
 *   .g  interactive illumination following the finger
 *
 * With reduced transparency the surface sets --gl-solid where the glass turns
 * opaque. Nothing shows through it then, so the backdrop filter is skipped.
 */
export const fxCss = /* css */ `
gl-fx{position:absolute;inset:0;z-index:-1;display:block;pointer-events:none;border-radius:inherit;}
gl-fx>*{position:absolute;inset:0;display:block;border-radius:inherit;box-sizing:border-box;}
/* Fading uses --gl-o on each layer: opacity on a parent would make it a backdrop root and empty the glass. */
gl-fx>.s,gl-fx>.b{opacity:var(--gl-o,1);}
gl-fx>.s{box-shadow:var(--gl-shadow,none);}
/* Never put box-shadow on the filtered layer: Chromium offsets backdrop-filter url() by the shadow's overflow. */
gl-fx>.b{background-color:var(--gl-fill,transparent);}
gl-fx>.b>canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;}
gl-fx>.t{background:var(--gl-tint,transparent);opacity:calc(var(--gl-tint-opacity,0) * var(--gl-o,1));mix-blend-mode:var(--gl-tint-blend,normal);}
gl-fx>.r{border-style:solid;border-color:transparent;opacity:calc(var(--gl-rim-o,1) * var(--gl-o,1));}
gl-fx>.g{overflow:hidden;opacity:calc(var(--gl-glow,0) * var(--gl-o,1));}
gl-fx>.g>i{position:absolute;left:0;top:0;width:var(--gl-glow-size,120px);height:var(--gl-glow-size,120px);border-radius:50%;
  translate:calc(var(--gl-glow-x,50%) - 50%) calc(var(--gl-glow-y,50%) - 50%);
  background:radial-gradient(closest-side,rgba(255,255,255,var(--gl-glow-core,.5)),rgba(255,255,255,calc(var(--gl-glow-core,.5)*.35)) 55%,rgba(255,255,255,0));}
gl-fx>svg{position:absolute;inset:auto;width:0;height:0;overflow:hidden;}
@media (prefers-reduced-transparency: reduce){gl-fx>.b{background-color:var(--gl-solid,var(--gl-fill,transparent));-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}gl-fx>.b>canvas{display:none;}}
@media (forced-colors: active){gl-fx>.b{background:Canvas;border:1px solid CanvasText;box-shadow:none;}gl-fx>.r,gl-fx>.g,gl-fx>.t{display:none;}}
`;

let documentStyle: HTMLStyleElement | undefined;
let sheet: CSSStyleSheet | undefined;

/** Constructable sheet shared by all shadow roots (falls back to <style>). */
export function adoptStyles(root: ShadowRoot, ...extra: string[]): void {
  const css = extra.join("\n");
  const canAdopt =
    "adoptedStyleSheets" in Document.prototype &&
    typeof CSSStyleSheet !== "undefined" &&
    "replaceSync" in CSSStyleSheet.prototype;
  if (canAdopt) {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(fxCss);
    }
    const sheets: CSSStyleSheet[] = [sheet];
    if (css) sheets.push(cachedSheet(css));
    root.adoptedStyleSheets = [
      ...sheets,
      ...root.adoptedStyleSheets.filter((s) => !sheets.includes(s)),
    ];
  } else {
    const style = document.createElement("style");
    style.textContent = fxCss + "\n" + css;
    root.prepend(style);
  }
}

const sheetCache = new Map<string, CSSStyleSheet>();
function cachedSheet(css: string): CSSStyleSheet {
  let s = sheetCache.get(css);
  if (!s) {
    s = new CSSStyleSheet();
    s.replaceSync(css);
    sheetCache.set(css, s);
  }
  return s;
}

/** Inject the layer styles into the document (for light-DOM surfaces). */
export function ensureDocumentStyles(): void {
  if (documentStyle || typeof document === "undefined") return;
  documentStyle = document.createElement("style");
  documentStyle.id = "glassy-liquid-fx";
  documentStyle.textContent = fxCss;
  document.head.append(documentStyle);
}
