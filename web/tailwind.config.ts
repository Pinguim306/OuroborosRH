import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ouroboros palette: deep obsidian + venom green + acid highlight.
        obsidian: {
          950: "#05070a",
          900: "#0a0e14",
          850: "#0f141d",
          800: "#141b26",
          700: "#1c2634",
        },
        venom: {
          400: "#7dffb2",
          500: "#22e584",
          600: "#12c26a",
          700: "#0a8f4d",
        },
        acid: "#c8ff4d",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        venom: "0 0 0 1px rgba(34,229,132,0.25), 0 8px 40px -12px rgba(34,229,132,0.35)",
        glow: "0 0 24px -4px rgba(34,229,132,0.5)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
      },
      keyframes: {
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "pulse-ring": {
          "0%,100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        dash: { to: { strokeDashoffset: "0" } },
      },
      animation: {
        "spin-slow": "spin-slow 24s linear infinite",
        "pulse-ring": "pulse-ring 3s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
