import type { Config } from "tailwindcss";

/**
 * HERMES design system.
 *
 * Visual language: a deep-space field (#080C11) with cool graphite glass
 * surfaces, hairline separators, one mission-orange accent for action and fire
 * intelligence, and signal green reserved for healthy systems. Interface type
 * is Inter; measurements and coordinates are IBM Plex Mono.
 *
 * Fire severity colours are semantic data colours and are deliberately separate
 * from the interaction accent.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--hz-bg) / <alpha-value>)",
        panel: "rgb(var(--hz-surface) / <alpha-value>)",
        raised: "rgb(var(--hz-raised) / <alpha-value>)",
        ink: "rgb(var(--hz-ink) / <alpha-value>)",
        muted: "rgb(var(--hz-muted) / <alpha-value>)",
        faint: "rgb(var(--hz-faint) / <alpha-value>)",
        line: "rgb(var(--hz-line) / <alpha-value>)",
        accent: "rgb(var(--hz-accent) / <alpha-value>)",
        azure: "rgb(var(--hz-azure) / <alpha-value>)",
        cyan: "rgb(var(--hz-cyan) / <alpha-value>)",
        success: "rgb(var(--hz-success) / <alpha-value>)",
        // Semantic fire-activity scale (data only, never chrome).
        fire: {
          low: "#FFB45C",
          medium: "#F28A43",
          high: "#E65C50",
        },
        ok: "#72C98B",
        warn: "#FFB45C",
        danger: "#E65C50",
      },
      fontFamily: {
        display: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        display: ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        "3xs": ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.07em" }],
      },
      borderRadius: {
        control: "4px",
        tag: "3px",
        card: "6px",
        shell: "8px",
      },
      boxShadow: {
        glass:
          "0 24px 60px -30px rgb(0 0 0 / 0.9), inset 0 1px 0 0 rgb(255 255 255 / 0.045)",
        halo: "0 0 18px 0 rgb(242 138 67 / 0.18)",
        azure: "0 0 8px 0 rgb(111 168 255 / 0.35)",
        lift: "0 30px 80px -36px rgb(0 0 0 / 0.95), 0 0 0 1px rgb(232 237 242 / 0.08)",
      },
      backdropBlur: {
        glass: "18px",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        breathe: {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
        scan: {
          from: { transform: "translateY(-100%)" },
          to: { transform: "translateY(100%)" },
        },
        orbit: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms cubic-bezier(0.2, 1, 0.4, 1) both",
        breathe: "breathe 4s ease-in-out infinite",
        scan: "scan 7s linear infinite",
        orbit: "orbit 90s linear infinite",
      },
      transitionTimingFunction: {
        orbital: "cubic-bezier(0.2, 1, 0.4, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
