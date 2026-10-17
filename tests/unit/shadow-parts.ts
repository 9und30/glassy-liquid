/**
 * Shadow parts each custom element exposes, parsed from src/.
 * The theming table and the README API block both render this list, in the
 * order the parts are declared (markup first, then thumb, then the glass stack).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export function shadowParts(): Map<string, string[]> {
  const files = sourceFiles();
  auditConstructions(files);
  const classByName = new Map<string, ts.ClassDeclaration>();
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        if (classByName.has(name)) throw new Error(`duplicate class ${name}`);
        classByName.set(name, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  if (!exposesPart(classByName.get("GlassSurface"), "glass")) {
    throw new Error("GlassSurface no longer sets part glass");
  }
  if (!exposesPart(classByName.get("ThumbLens"), "thumb")) {
    throw new Error("ThumbLens no longer sets part thumb");
  }
  const thumb = classByName.get("ThumbLens");
  if (!thumb || !constructs(thumb, "GlassSurface", (arg) => isThisProp(arg, "el"))) {
    throw new Error("ThumbLens no longer mounts glass on its element");
  }
  const host = classByName.get("GlassElement");
  if (!host || !constructs(host, "GlassSurface", (arg) => arg.kind === ts.SyntaxKind.ThisKeyword)) {
    throw new Error("GlassElement no longer mounts a host surface");
  }

  const parts = new Map<string, string[]>();
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isIdentifier(node.expression) ||
        node.expression.text !== "define"
      ) {
        ts.forEachChild(node, visit);
        return;
      }
      const tag = node.arguments[0];
      const ctor = node.arguments[1];
      if (!tag || !ctor || !ts.isStringLiteral(tag)) throw new Error("unclassified define()");
      const chain = classChain(ctor, classByName);
      const names = new Set<string>();
      for (const item of chain) for (const part of literalParts(item)) names.add(part);
      if (hostGlass(chain)) names.add("glass");
      if (constructs(chain, "ThumbLens", (arg) => isThisProp(arg, "shadow"))) {
        names.add("thumb");
        names.add("glass");
      }
      if (
        constructs(chain, "GlassSurface", (arg) =>
          ["panel", "sheet", "lensEl"].some((prop) => isThisProp(arg, prop)),
        )
      ) {
        names.add("glass");
      }
      parts.set(tag.text, [...names]);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return parts;
}

function sourceFiles(): ts.SourceFile[] {
  const paths: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts")) paths.push(path);
    }
  };
  walk("src");
  return paths.map((path) =>
    ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  );
}

function auditConstructions(files: ts.SourceFile[]): void {
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const arg = node.arguments?.[0];
        if (node.expression.text === "GlassSurface") {
          const ok =
            !!arg &&
            (arg.kind === ts.SyntaxKind.ThisKeyword ||
              isThisProp(arg, "el") ||
              isThisProp(arg, "panel") ||
              isThisProp(arg, "sheet") ||
              isThisProp(arg, "lensEl") ||
              (ts.isIdentifier(arg) && arg.text === "element"));
          if (!ok)
            throw new Error(
              `unclassified GlassSurface in ${file.fileName}: ${node.getText().slice(0, 80)}`,
            );
        }
        if (node.expression.text === "ThumbLens") {
          if (!arg || !isThisProp(arg, "shadow")) {
            throw new Error(
              `unclassified ThumbLens in ${file.fileName}: ${node.getText().slice(0, 80)}`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
}

function classChain(
  ctor: ts.Expression,
  classByName: Map<string, ts.ClassDeclaration>,
): ts.ClassLikeDeclaration[] {
  const chain: ts.ClassLikeDeclaration[] = [];
  let current: ts.ClassLikeDeclaration | undefined;
  if (ts.isClassExpression(ctor)) current = ctor;
  else if (ts.isIdentifier(ctor)) current = classByName.get(ctor.text);
  else throw new Error("unclassified define() constructor");
  const seen = new Set<ts.ClassLikeDeclaration>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const parent = parentName(current);
    if (!parent || parent === "HTMLElement" || parent === "HTMLElementBase") break;
    const next = classByName.get(parent);
    if (!next) throw new Error(`missing parent class ${parent}`);
    current = next;
  }
  if (chain.length === 0) throw new Error("define() constructor did not resolve");
  return chain;
}

function parentName(node: ts.ClassLikeDeclaration): string | undefined {
  const clause = node.heritageClauses?.find((item) => item.token === ts.SyntaxKind.ExtendsKeyword);
  const type = clause?.types[0];
  if (!type) return undefined;
  if (ts.isIdentifier(type.expression)) return type.expression.text;
  throw new Error(`unclassified extends on ${node.name?.text ?? "anonymous class"}`);
}

function hostGlass(chain: ts.ClassLikeDeclaration[]): boolean {
  for (const node of chain) {
    for (const member of node.members) {
      if (
        !ts.isPropertyDeclaration(member) ||
        !ts.isIdentifier(member.name) ||
        member.name.text !== "hasGlass"
      ) {
        continue;
      }
      if (member.initializer?.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (member.initializer?.kind === ts.SyntaxKind.TrueKeyword) return true;
      throw new Error(`unclassified hasGlass on ${node.name?.text ?? "anonymous class"}`);
    }
  }
  return false;
}

function literalParts(node: ts.ClassLikeDeclaration): string[] {
  const parts: string[] = [];
  const visit = (current: ts.Node) => {
    if (current !== node && (ts.isClassDeclaration(current) || ts.isClassExpression(current)))
      return;
    const text = literalText(current);
    if (text) {
      for (const match of text.matchAll(/\bpart="([^"]+)"/g)) {
        for (const name of (match[1] ?? "").split(/\s+/)) if (name) parts.push(name);
      }
    }
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "setAttribute"
    ) {
      const attr = current.arguments[0];
      const value = current.arguments[1];
      if (
        attr &&
        ts.isStringLiteral(attr) &&
        attr.text === "part" &&
        value &&
        ts.isStringLiteral(value)
      ) {
        parts.push(value.text);
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return parts;
}

function exposesPart(node: ts.ClassDeclaration | undefined, part: string): boolean {
  return !!node && literalParts(node).includes(part);
}

function constructs(
  scope: ts.Node | ts.Node[],
  name: string,
  firstArg: (arg: ts.Expression) => boolean,
): boolean {
  const nodes = Array.isArray(scope) ? scope : [scope];
  for (const node of nodes) {
    let found = false;
    const visit = (current: ts.Node) => {
      if (current !== node && (ts.isClassDeclaration(current) || ts.isClassExpression(current)))
        return;
      if (
        ts.isNewExpression(current) &&
        ts.isIdentifier(current.expression) &&
        current.expression.text === name
      ) {
        const arg = current.arguments?.[0];
        if (arg && firstArg(arg)) found = true;
      }
      ts.forEachChild(current, visit);
    };
    visit(node);
    if (found) return true;
  }
  return false;
}

function isThisProp(expr: ts.Expression, prop: string): boolean {
  return (
    ts.isPropertyAccessExpression(expr) &&
    expr.expression.kind === ts.SyntaxKind.ThisKeyword &&
    ts.isIdentifier(expr.name) &&
    expr.name.text === prop
  );
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
    return node.text;
  return null;
}
