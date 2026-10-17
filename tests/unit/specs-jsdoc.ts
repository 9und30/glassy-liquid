/**
 * Renders the JSDoc on the public props interfaces in `src/bindings/specs.ts`
 * from the same entries as the README API reference, so editor hovers in
 * React, Vue, and Svelte show the documented text and default.
 * `npx vite-node tests/readme/print-api.ts` writes it, and
 * `readme-api.test.ts` fails when the source drifts from this output.
 */
import ts from "typescript";
import { componentNames, type ComponentName } from "../../src/bindings/specs";
import { fieldDoc } from "./readme-api";

/** Which components use each props interface, read from the `specs` table. */
function interfaceUsers(file: ts.SourceFile): Map<string, ComponentName[]> {
  const helpers = new Map<string, string>();
  const users = new Map<string, ComponentName[]>();
  const typeOf = (call: ts.CallExpression): string | undefined => {
    if (!ts.isIdentifier(call.expression)) return undefined;
    if (call.expression.text === "spec") return call.typeArguments?.[0]?.getText(file);
    return helpers.get(call.expression.text);
  };
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (ts.isArrowFunction(init) && ts.isCallExpression(init.body)) {
        const type = typeOf(init.body);
        if (type) helpers.set(node.name.text, type);
      }
      if (node.name.text === "specs") {
        const table = ts.isAsExpression(init) ? init.expression : init;
        if (!ts.isObjectLiteralExpression(table)) throw new Error("specs is not an object literal");
        for (const entry of table.properties) {
          if (!ts.isPropertyAssignment(entry) || !ts.isCallExpression(entry.initializer)) continue;
          const name = entry.name.getText(file) as ComponentName;
          const type = typeOf(entry.initializer);
          if (!type) throw new Error(`cannot read the props type of ${name}`);
          users.set(type, [...(users.get(type) ?? []), name]);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const listed = [...users.values()].flat().sort();
  if (listed.join() !== [...componentNames].sort().join())
    throw new Error(`specs table parse found [${listed.join(", ")}]`);
  return users;
}

function comment(description: string, def: string): string {
  if (def === "none") return `/** ${description} */`;
  return `/**\n   * ${description}\n   * @defaultValue ${def}\n   */`;
}

/** `source` with every public props member documented. Throws on an undocumented member. */
export function renderSpecsJsDoc(source: string): string {
  const file = ts.createSourceFile("specs.ts", source, ts.ScriptTarget.Latest, true);
  const users = interfaceUsers(file);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const statement of file.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue;
    const name = statement.name.text;
    if (name !== "GlassAttributes" && !name.endsWith("Props")) continue;
    const components: Array<ComponentName | undefined> =
      name === "GlassAttributes" ? [undefined] : (users.get(name) ?? []);
    if (!components.length) throw new Error(`${name} is not used by any component`);
    for (const member of statement.members) {
      if (!ts.isPropertySignature(member)) continue;
      const prop = member.name.getText(file);
      const doc = components.map((c) => fieldDoc(c, prop)).find(Boolean);
      if (!doc) throw new Error(`${name}.${prop} has no entry in tests/unit/readme-api.ts`);
      const ranges = ts.getLeadingCommentRanges(source, member.getFullStart()) ?? [];
      const jsdoc = ranges.filter((range) => source.startsWith("/**", range.pos));
      const start = jsdoc[0]?.pos ?? member.getStart(file);
      edits.push({
        start,
        end: member.getStart(file),
        text: `${comment(doc.description, doc.def)}\n  `,
      });
    }
  }
  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}
