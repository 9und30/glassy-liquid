import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ["../.."] } },
  optimizeDeps: { exclude: ["glassy-liquid"] },
});
