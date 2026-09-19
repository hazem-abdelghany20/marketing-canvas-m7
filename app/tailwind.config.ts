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
      // Motion from design/marketing-canvas.dc.html. tokens.css flattens every
      // animation under prefers-reduced-motion, so none of these need guarding.
      keyframes: {
        "mc-pop": { from: { opacity: "0", transform: "scale(.94)" }, to: { opacity: "1", transform: "scale(1)" } },
        "mc-rise": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "mc-flash": { "0%, 100%": { opacity: "1" }, "50%": { opacity: ".25" } },
        "mc-slide": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(250%)" } },
      },
      animation: {
        "mc-pop": "mc-pop .14s ease both",
        "mc-rise": "mc-rise .18s ease both",
        "mc-flash": "mc-flash .6s ease 2",
        "mc-pulse": "mc-flash 1.2s ease infinite",
        "mc-slide": "mc-slide 1.1s ease-in-out infinite",
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
