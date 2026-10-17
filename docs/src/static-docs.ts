import { customSource } from "./custom-sample";
import { demos, glassProps } from "./demos";
import { playgroundSnippets } from "./playground-snippets";
import { escapeHtml, sampleSource } from "./samples";
import { demoMarkup, pickerMarkup, propsTable } from "./explorer-markup";
import { knobsMarkup } from "./playground-knobs";

function fillEmpty(html: string, open: RegExp, inner: string): string {
  const match = open.exec(html);
  if (!match) throw new Error(`missing ${open}`);
  const at = match.index + match[0].length;
  const close = html.indexOf("</", at);
  if (html.slice(at, close).trim()) return html;
  return html.slice(0, at) + inner + html.slice(close);
}

function fillPre(html: string, panel: string, source: string): string {
  const pattern = new RegExp(`(<pre\\b[^>]*data-panel="${panel}"[^>]*>)([\\s\\S]*?)(</pre>)`);
  const match = pattern.exec(html);
  if (!match) throw new Error(`missing pre panel ${panel}`);
  if (match[2]?.trim()) return html;
  return html.replace(pattern, `$1${escapeHtml(source)}$3`);
}

/** Put every framework sample into the components page so a fetch sees the code. */
export function injectComponentPage(html: string): string {
  const first = demos[0];
  if (!first) return html;
  let next = html;
  const visible: Array<[string, string]> = [
    ["html", sampleSource(first.html)],
    ["react", first.react],
    ["vue", first.vue],
    ["svelte", first.svelte],
  ];
  for (const [panel, source] of visible) next = fillPre(next, panel, source);
  // The first component, printed, so the explorer has its final layout before scripts run.
  next = fillEmpty(next, /<div\b[^>]*id="cx-picker"[^>]*>/, pickerMarkup(first.id));
  // Each step is idempotent: running the transform twice leaves the page alone.
  if (!/id="cx-demo"[^>]*data-id=/.test(next))
    next = next.replace(/(<div\b[^>]*id="cx-demo")([^>]*>)/, `$1 role="tabpanel" aria-labelledby="cx-tab-${first.id}" data-id="${first.id}"$2`);
  next = fillEmpty(next, /<div\b[^>]*id="cx-demo"[^>]*>/, demoMarkup(first));
  next = fillEmpty(next, /<p\b[^>]*id="cx-lede"[^>]*>/, first.lede);
  next = fillEmpty(next, /<div\b[^>]*id="cx-props"[^>]*>/, propsTable(first.props, first.events));
  if (!/id="cx-stage" style=/.test(next))
    next = next.replace(/(<glass-scene\b[^>]*id="cx-stage")/, `$1 style="min-height:${first.height ?? 300}px"`);
  const catalog = demos
    .map((demo) => {
      const blocks: Array<[string, string]> = [
        ["html", sampleSource(demo.html)],
        ["react", demo.react],
        ["vue", demo.vue],
        ["svelte", demo.svelte],
      ];
      const events = (demo.events ?? [])
        .map(([name, detail, framework]) => {
          const extra = framework ? ` ${framework}` : "";
          return `<li><code>${escapeHtml(name)}</code> ${escapeHtml(detail)}${escapeHtml(extra)}</li>`;
        })
        .join("");
      const eventBlock = events ? `<h3>${demo.title} events</h3>\n<ul>${events}</ul>` : "";
      const body = blocks
        .map(
          ([lang, source]) =>
            `<h3>${demo.title}, ${lang}</h3>\n<pre data-lang="${lang === "react" ? "jsx" : lang}">${escapeHtml(source)}</pre>`,
        )
        .join("\n");
      return `<article id="snippet-${demo.id}" data-snippet="${demo.id}">\n<h2>${demo.title}</h2>\n${body}\n${eventBlock}\n</article>`;
    })
    .join("\n");
  const block = `<section class="cx-static" id="all-snippets" hidden>\n<h2>All component snippets</h2>\n${catalog}\n</section>\n`;
  if (next.includes('id="all-snippets"')) return next;
  return next.replace("</main>", `${block}</main>`);
}

/** The "your own element" sample is filled at runtime; static HTML needs it too. */
export function injectGettingStarted(html: string): string {
  const pattern = /(<pre\b[^>]*id="custom-code"[^>]*>)([\s\S]*?)(<\/pre>)/;
  const match = pattern.exec(html);
  if (!match) throw new Error("missing pre custom-code");
  let next = match[2]?.trim() ? html : html.replace(pattern, `$1${escapeHtml(customSource)}$3`);
  const rows = glassProps
    .map(([a, t, d, n]) => `<tr><td><code>${a}</code></td><td>${t}</td><td>${d}</td><td>${n}</td></tr>`)
    .join("");
  next = next.replace(/(<table\b[^>]*id="glass-props"[\s\S]*?<tbody>)(\s*)(<\/tbody>)/, `$1${rows}$3`);
  return next;
}

/** Default playground snippets, including the slab size, before JavaScript runs. */
export function injectPlaygroundPage(html: string): string {
  const snip = playgroundSnippets();
  let next = html;
  const visible: Array<[string, string]> = [
    ["html", snip.html],
    ["react", snip.react],
    ["vue", snip.vue],
    ["svelte", snip.svelte],
  ];
  for (const [panel, source] of visible) next = fillPre(next, panel, source);
  return fillEmpty(next, /<div\b[^>]*id="knobs"[^>]*>/, knobsMarkup());
}
