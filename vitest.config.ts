import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({
  plugins: [svelte({ compilerOptions: { css: "injected" } })],
  resolve: { conditions: ["browser"] },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
