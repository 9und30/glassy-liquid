/**
 * Markup for the components explorer. The build prints the first component
 * with it so the page has its final layout before any script runs; the
 * explorer uses the same functions when you pick another one.
 */
import { demos, type Demo } from "./demos";
import { sampleSource } from "./samples";

const short: Record<string, string> = {
  segmented: "Segmented",
  toolbar: "Toolbar",
  search: "Search",
  "scroll-edge": "Scroll edge",
  "tab-bar": "Tab bar",
};

export function pickerMarkup(selected = demos[0]?.id): string {
  return demos
    .map((d, i) => {
      const on = d.id === selected;
      return `<button class="picker__chip" type="button" role="tab" id="cx-tab-${d.id}" data-id="${d.id}" aria-controls="cx-demo" aria-selected="${on}" tabindex="${on ? 0 : -1}">${String(i + 1).padStart(2, "0")}  ${short[d.id] ?? d.title}</button>`;
    })
    .join("");
}

/** The live preview: the sample with real icons. */
export const demoMarkup = (d: Demo) => `<div class="center">${sampleSource(d.html)}</div>`;

export function propsTable(rows: Demo["props"], events: Demo["events"]): string {
  let out = "";
  if (rows?.length) {
    out += `<div class="table-scroll" tabindex="0" aria-label="Attributes"><table class="props"><thead><tr><th>Attribute</th><th>Type</th><th>Default</th><th>Notes</th></tr></thead><tbody>${rows
      .map(([a, t, d, n]) => `<tr><td><code>${a}</code></td><td>${t}</td><td>${d}</td><td>${n}</td></tr>`)
      .join("")}</tbody></table></div>`;
  }
  if (events?.length) {
    const frameworks = events.some((row) => row[2]);
    const head = frameworks ? "<th>React, Vue, Svelte</th>" : "";
    out += `<div class="table-scroll" tabindex="0" aria-label="Events"><table class="props"><thead><tr><th>Event</th><th>Details</th>${head}</tr></thead><tbody>${events
      .map(([e, n, fw]) => `<tr><td><code>${e}</code></td><td>${n}</td>${frameworks ? `<td>${fw ?? ""}</td>` : ""}</tr>`)
      .join("")}</tbody></table></div>`;
  }
  return out;
}
