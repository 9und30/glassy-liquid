/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  proseWrap: "preserve",
  endOfLine: "lf",
  plugins: ["prettier-plugin-svelte"],
  overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
};
