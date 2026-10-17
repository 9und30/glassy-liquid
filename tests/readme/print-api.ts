/**
 * Rewrite the README API block, and the props JSDoc in src/bindings/specs.ts,
 * from the doc entries in tests/unit/readme-api.ts.
 * Run: npx vite-node tests/readme/print-api.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { API_END, API_START, renderApiReference } from "../unit/readme-api";
import { renderSpecsJsDoc } from "../unit/specs-jsdoc";

const readmePath = new URL("../../README.md", import.meta.url);
const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(API_START);
const end = readme.indexOf(API_END);
if (start < 0 || end < 0 || end < start) throw new Error("README is missing api markers");
const next = `${readme.slice(0, start + API_START.length)}\n${renderApiReference()}${readme.slice(end)}`;
writeFileSync(readmePath, next);
console.log("updated README API reference");

const specsPath = new URL("../../src/bindings/specs.ts", import.meta.url);
writeFileSync(specsPath, renderSpecsJsDoc(readFileSync(specsPath, "utf8")));
console.log("updated props JSDoc in src/bindings/specs.ts");
