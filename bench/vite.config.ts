import { defineConfig } from "vite";
import { resolve } from "node:path";

const competitor = resolve(__dirname, "competitor/node_modules/@glass-sdk/liquid-glass/dist");

export default defineConfig({
  root: resolve(__dirname, "pages"),
  resolve: {
    alias: [
      { find: /^glassy-liquid\/elements$/, replacement: resolve(__dirname, "../src/elements.ts") },
      { find: /^glassy-liquid$/, replacement: resolve(__dirname, "../src/index.ts") },
      { find: /^@glass-sdk\/liquid-glass\/dom$/, replacement: `${competitor}/dom.js` },
      { find: /^@glass-sdk\/liquid-glass\/styles\.css$/, replacement: `${competitor}/styles.css` },
    ],
  },
  server: { port: 5200, strictPort: true, fs: { allow: [resolve(__dirname, "..")] } },
  optimizeDeps: { include: [] },
});
