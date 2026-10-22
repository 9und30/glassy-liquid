import { transform } from "esbuild";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { sep } from "node:path";

const templateText = (text) => text.replace(/\\|`|\$\{/g, (match) => `\\${match}`);

function shader(source) {
  if (/^\s*#|\bstruct\b|\b(?:uniform|attribute|varying)\b[^;]*,/m.test(source)) return source;
  const clean = source.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, " ");
  const words = new Set(clean.match(/[A-Za-z_]\w*/g));
  const interfaces = new Set(
    [
      ...clean.matchAll(
        /\b(?:uniform|attribute|varying)\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+([A-Za-z_]\w*)/g,
      ),
    ].map((match) => match[1]),
  );
  const names = new Map();
  for (const match of clean.matchAll(
    /\b(?:void|float|int|vec[234]|mat[234]|bool)\s+([A-Za-z_]\w*)/g,
  )) {
    const name = match[1];
    if (name.length < 2 || name === "main" || interfaces.has(name)) continue;
    if (names.has(name)) continue;
    const next = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((letter) => !words.has(letter));
    if (!next) break;
    words.add(next);
    names.set(name, next);
  }
  const renamed = clean.replace(/[A-Za-z_]\w*/g, (word, index) =>
    /\.\s*$/.test(clean.slice(0, index)) ? word : (names.get(word) ?? word),
  );
  const tokens =
    renamed.match(
      /(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|\+\+|--|<=|>=|==|!=|&&|\|\||[+\-*/]=|[^\s]/g,
    ) ?? [];
  return tokens.reduce((out, token, index) => {
    const previous = tokens[index - 1] ?? "";
    const space =
      (previous !== "." && token !== "." && /[\w.]$/.test(previous) && /^[\w.]/.test(token)) ||
      /^(?:\+\+|--|<=|>=|==|!=|&&|\|\||[+*/-]=|\/[/*])$/.test(previous.slice(-1) + token[0]);
    return out + (space ? " " : "") + token;
  }, "");
}

/** Compact only explicitly marked styles and shaders, keeping interpolation code intact. */
export async function minifyTemplates(source, filename) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const nodes = [];
  function visit(node) {
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const marker = source.slice(node.getFullStart(), node.getStart(file));
      if (/\/\* (?:css|glsl) \*\//.test(marker)) {
        nodes.push({ node, css: marker.includes("/* css */") });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  const edits = [];
  for (const { node, css } of nodes) {
    const spans = ts.isTemplateExpression(node) ? node.templateSpans : [];
    if (!css && spans.length)
      throw new Error(`Interpolated shaders are not supported in ${filename}`);
    let text = spans.length ? node.head.text : node.text;
    spans.forEach((span, i) => {
      text += `__GLASS_SLOT_${i}__` + span.literal.text;
    });
    const compact = css
      ? (
          await transform(text, {
            loader: "css",
            minify: true,
            target: "es2020",
            legalComments: "none",
          })
        ).code.trim()
      : shader(text);
    let cursor = 0;
    const parts = [];
    spans.forEach((span, i) => {
      const marker = `__GLASS_SLOT_${i}__`;
      const index = compact.indexOf(marker, cursor);
      if (index < 0 || compact.indexOf(marker, index + marker.length) >= 0)
        throw new Error(`Changed CSS interpolation in ${filename}`);
      parts.push(
        templateText(compact.slice(cursor, index)),
        "${" + span.expression.getText(file) + "}",
      );
      cursor = index + marker.length;
    });
    parts.push(templateText(compact.slice(cursor)));
    edits.push({ start: node.getStart(file), end: node.end, text: "`" + parts.join("") + "`" });
  }
  for (const edit of edits.reverse())
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

export function minifyTemplatesPlugin(sourceRoot) {
  return {
    name: "minify-templates",
    setup(builder) {
      builder.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
        if (!path.startsWith(sourceRoot + sep)) return;
        return {
          contents: await minifyTemplates(await readFile(path, "utf8"), path),
          loader: "ts",
        };
      });
    },
  };
}
