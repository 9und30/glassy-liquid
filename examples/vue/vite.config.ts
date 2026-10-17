import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue({
      template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("glass-") } },
    }),
  ],
  server: { fs: { allow: ["../.."] } },
  optimizeDeps: { exclude: ["glassy-liquid"] },
});
