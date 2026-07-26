import type { Config } from "tailwindcss";

/**
 * Coil's design tokens.
 *
 * Two rules keep this honest:
 *
 * 1. **Text colour comes from the `ink` ramp, never from `white/<alpha>`.** Four steps, and every
 *    one of them clears WCAG AA (4.5:1) on all three surfaces below — measured, not guessed. The
 *    ad-hoc `text-white/20…/90` sprawl this replaces had fourteen steps and put most secondary
 *    copy between 1.9:1 and 3.8:1, i.e. under the line.
 * 2. **`coil` is the brand, `spark` is its highlight, and up/down/warn are semantic.** They are not
 *    interchangeable: a warning is `warn`, a rising number is `up`, a brand accent is `coil`.
 *    Reaching for the cyan because it "looked nice there" is what made a validation warning cyan.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces, darkest first. 950 is the page; everything else stacks on top of it.
        obsidian: {
          950: "#05060d",
          900: "#0a0d18",
          850: "#0f1320",
          800: "#141a29",
          700: "#1c2436",
          600: "#26314a",
        },
        /**
         * Text ramp. `ink` is primary, and each step down is one level of emphasis — not one level
         * of "faded". Contrast on the card surface (#0f1320): 15.5 / 11.4 / 7.3 / 4.9 : 1.
         * `ink-4` is the floor; anything quieter than this is decoration and must not carry meaning.
         */
        ink: {
          DEFAULT: "#e7eafc",
          2: "#c3cae8",
          3: "#98a1c4",
          4: "#79829f",
        },
        /**
         * The brand violet — the "coil" energy. 500 is the fill (a dark label on top clears AA at
         * 4.9:1); 400 is the *text* weight, because 500 as text on a card is 4.5:1 and fails as
         * body copy.
         */
        coil: {
          300: "#cabfff",
          400: "#b7a6ff",
          500: "#8b5cff",
          600: "#6f3df5",
          700: "#5626cc",
        },
        /** Cyan highlight — the spark travelling down the coil. Pairs with `coil` in gradients. */
        spark: "#37e8ff",
        // Semantic. Green/red stay conventional for markets, but retuned into this palette: the
        // up-tone is a cyan-leaning mint so it reads as family with `spark` rather than as the
        // grass-green of the previous brand.
        up: "#2fe0a6",
        down: "#ff5f78",
        warn: "#f5b544",
      },
      fontFamily: {
        // Display carries the brand voice in headings. Body does the reading AND every figure —
        // see the note on numerals in globals.css. Mono is for hex, hashes and trade amounts.
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        coil: "0 0 0 1px rgba(139,92,255,0.22), 0 12px 44px -16px rgba(139,92,255,0.45)",
        glow: "0 0 24px -6px rgba(139,92,255,0.55)",
        lift: "0 16px 40px -24px rgba(0,0,0,0.9)",
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
        // The spark running the length of the coil — used by the loop diagram.
        // -100 is one full dash period against a `pathLength={100}` path, which is what makes the
        // loop seamless: end one iteration exactly where the next begins. A raw distance here
        // (it used to be -240) can only match a specific radius, and matched none of them.
        travel: { to: { strokeDashoffset: "-100" } },
      },
      animation: {
        "spin-slow": "spin-slow 24s linear infinite",
        "pulse-ring": "pulse-ring 3s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        travel: "travel 4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
