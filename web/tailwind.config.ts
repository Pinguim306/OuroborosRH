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
        // Coil palette: deep obsidian + electric-violet (the "coil" energy) + cyan spark.
        // NOTE: the color KEYS (`venom`, `acid`) are kept for stability — hundreds of class
        // references depend on them — but their VALUES are Coil's electric violet / cyan.
        obsidian: {
          950: "#05060d",
          900: "#0a0d18",
          850: "#0f1320",
          800: "#141a29",
          700: "#1c2436",
        },
        venom: {
          400: "#b7a6ff",
          500: "#8b5cff",
          600: "#6f3df5",
          700: "#5626cc",
        },
        acid: "#37e8ff",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        venom: "0 0 0 1px rgba(139,92,255,0.25), 0 8px 40px -12px rgba(139,92,255,0.35)",
        glow: "0 0 24px -4px rgba(139,92,255,0.5)",
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
