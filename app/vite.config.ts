import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

// PostCSS is configured inline so Tailwind needs no config file of its own.
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  server: {
    port: 5173,
  },
  test: {
    // Playwright owns e2e/; vitest would otherwise collect its *.spec.ts files.
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["src/test/setup.ts"],
    // A test may wait on several 5s queries (see src/test/setup.ts); give it room for them.
    testTimeout: 15_000,
  },
});
