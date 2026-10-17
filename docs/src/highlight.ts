/** Tiny syntax highlighter for the docs snippets. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function highlightMarkup(code: string): string {
  let out = "";
  const re = /(<!--[\s\S]*?-->)|(<\/?)([\w-]+)([^>]*?)(\/?>)|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
    else if (m[3]) {
      const attrs = (m[4] ?? "").replace(/([\w:@.-]+)(=)?("[^"]*"|\{[^}]*\}|'[^']*')?/g, (_a, name: string, eq?: string, val?: string) => {
        let s = `<span class="tok-attr">${esc(name)}</span>`;
        if (eq) s += `<span class="tok-pun">=</span>`;
        if (val) s += `<span class="tok-str">${esc(val)}</span>`;
        return s;
      });
      out += `<span class="tok-pun">${esc(m[2]!)}</span><span class="tok-tag">${esc(m[3])}</span>${attrs}<span class="tok-pun">${esc(m[5]!)}</span>`;
    } else if (m[6]) out += esc(m[6]);
  }
  return out;
}

function highlightScript(code: string): string {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("[^"\n]*"|'[^'\n]*'|`[^`]*`)|\b(import|from|export|const|let|new|return|class|extends|static|function|await|async|if|else|default|this|true|false|null|undefined)\b|([{}()[\];,.=<>:+*/-])/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tok-key">${esc(m[3])}</span>`;
    else if (m[4]) out += `<span class="tok-pun">${esc(m[4])}</span>`;
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

export type Lang = "html" | "jsx" | "js" | "vue" | "svelte" | "sh" | "css";

export function highlight(code: string, lang: Lang): string {
  if (lang === "html" || lang === "vue" || lang === "svelte") return highlightMarkup(code);
  if (lang === "sh") return code.split("\n").map((l) => (l.startsWith("#") ? `<span class="tok-com">${esc(l)}</span>` : esc(l))).join("\n");
  if (lang === "jsx") {
    return code
      .split(/(<[A-Za-z/][^]*?>)/g)
      .map((part, i) => (i % 2 ? highlightMarkup(part) : highlightScript(part)))
      .join("");
  }
  return highlightScript(code);
}
