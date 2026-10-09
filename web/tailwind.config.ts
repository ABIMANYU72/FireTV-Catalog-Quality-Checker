import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        border: "var(--border)",
        card: "var(--bg-card)",
        "accent-purple": "var(--accent-purple)",
        "accent-blue": "var(--accent-blue)",
        "accent-cyan": "var(--accent-cyan)",
        "accent-emerald": "var(--accent-emerald)",
        "accent-amber": "var(--accent-amber)",
        "accent-rose": "var(--accent-rose)",
        ring: "#6366f1",
        input: "#1f2331",
        primary: {
          DEFAULT: "#6366f1",
          foreground: "#f0f4ff",
        },
        secondary: {
          DEFAULT: "#111318",
          foreground: "#f0f4ff",
        },
        destructive: {
          DEFAULT: "#f43f5e",
          foreground: "#f0f4ff",
        },
        muted: {
          DEFAULT: "#1a1d24",
          foreground: "#4a5568",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
