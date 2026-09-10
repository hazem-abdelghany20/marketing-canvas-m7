import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";

// No @vitejs/plugin-react: the dependency manifest is closed, and Vite's esbuild
// pipeline already transpiles TSX using the `jsx` setting in tsconfig.json.
// PostCSS is configured inline so Tailwind needs no config file of its own.
export default defineConfig({
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  server: {
    port: 5173,
  },
});
