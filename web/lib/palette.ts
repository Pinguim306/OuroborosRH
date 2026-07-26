/**
 * The brand palette as raw hex, for the consumers Tailwind can't reach: inline SVG `stroke`/`fill`
 * and the canvas-based chart library.
 *
 * This file exists because those consumers were the exact places the previous rebrand missed — the
 * marketcap chart, the candles and the loop diagram all kept the old brand's green long after every
 * Tailwind class had moved on, because a hardcoded `#22e584` is invisible to a class-name search.
 * Anything that needs a colour outside a `className` imports it from here, so there is one place to
 * change and one place to check.
 *
 * Keep in sync with `tailwind.config.ts`.
 */
export const palette = {
  coil300: "#cabfff",
  coil400: "#b7a6ff",
  coil500: "#8b5cff",
  coil600: "#6f3df5",
  spark: "#37e8ff",
  /** Market semantics. Conventional green/red, retuned so the up-tone is family with `spark`. */
  up: "#2fe0a6",
  down: "#ff5f78",
  warn: "#f5b544",
  // Surfaces + text, mirroring the `obsidian` / `ink` ramps.
  canvas: "#05060d",
  surface: "#0f1320",
  surfaceRaised: "#141a29",
  ink: "#e7eafc",
  ink3: "#98a1c4",
  ink4: "#79829f",
} as const;
