import type { Config } from "tailwindcss";

/**
 * Tailwind reads the design tokens; it never restates them. Every colour here
 * points at a custom property defined in src/styles/tokens.css, so both themes
 * flow through the utilities for free.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        panel: "var(--bg-panel)",
        rail: "var(--bg-rail)",
        elevated: "var(--bg-elevated)",

        primary: "var(--fg-primary)",
        muted: "var(--fg-muted)",
        inverse: "var(--fg-inverse)",

        subtle: "var(--border-subtle)",
        strong: "var(--border-strong)",
        "edge-serves": "var(--edge-serves)",
        "edge-relates": "var(--edge-relates)",

        "node-goal": "var(--node-goal)",
        "node-strategy": "var(--node-strategy)",
        "node-campaign": "var(--node-campaign)",
        "node-content": "var(--node-content)",
        "node-asset": "var(--node-asset)",
        "node-note": "var(--node-note)",

        accent: "var(--accent)",
        danger: "var(--danger)",
        warn: "var(--warn)",
        ok: "var(--ok)",

        focus: "var(--focus-ring)",
        "grid-dot": "var(--grid-dot)",
      },
      borderColor: {
        DEFAULT: "var(--border-subtle)",
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
      },
      outlineColor: {
        focus: "var(--focus-ring)",
      },
      fontFamily: {
        sans: ["Instrument Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
