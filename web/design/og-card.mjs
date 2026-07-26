/**
 * Source for `public/og.png` — the Open Graph / X share card.
 *
 * Writes a self-contained HTML file, which is screenshotted at the canonical Open Graph size:
 *
 *   node design/og-card.mjs > /tmp/og.html
 *   npx playwright screenshot --viewport-size=1200,630 /tmp/og.html public/og.png
 *
 * Kept as a generator rather than a bare PNG so the card can be re-cut when the copy or the
 * palette moves. Colours must match `lib/palette.ts`.
 *
 * The artwork is a family of logarithmic spirals — one growth rate, each line rotated by a small
 * offset. Because a log spiral's radius collapses to zero at the eye, the lines converge to a
 * point there and fan apart as the radius grows, which is what produces the swept-plume shape.
 * Drawing it rather than shipping an illustration means it re-renders at any size and stays tied
 * to the brand ramp.
 */

const W = 2400;
const H = 1260;

// Eye of the spiral, right of centre.
const CX = 1820;
const CY = 448;
const B = 0.196; // growth rate: r = R0 * e^(B * theta)
const R0 = 3.6;
const LINES = 40;
const DPHI = 0.036; // angular offset between neighbouring lines
// Global rotation, chosen so the outermost strands sweep down and to the left out of frame.
const ROT = 1.62;
const TH_MAX = 31.5;
const STEP = 0.12; // radians per sampled point; coarse enough to keep the file small
const R_MAX = 830; // keeps the sweep clear of the wordmark on the left

function spiral(phi) {
  const pts = [];
  for (let th = 0; th <= TH_MAX; th += STEP) {
    const r = R0 * Math.exp(B * th);
    if (r > R_MAX) break;
    const a = th + phi + ROT;
    pts.push(`${(CX - r * Math.cos(a)).toFixed(1)},${(CY - r * Math.sin(a)).toFixed(1)}`);
  }
  return "M" + pts.join("L");
}

let plume = "";
for (let j = 0; j < LINES; j++) {
  const t = j / (LINES - 1);
  // Fade the outer lines of the fan so the bundle reads as volume instead of a grid.
  const op = (0.22 + 0.58 * Math.sin(Math.PI * Math.pow(t, 0.8))).toFixed(3);
  plume += `<path d="${spiral(j * DPHI)}" stroke="url(#plume)" stroke-width="1.15" fill="none" opacity="${op}" stroke-linecap="round"/>`;
}

process.stdout.write(`<!doctype html>
<html><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W / 2}px;height:${H / 2}px;overflow:hidden}
  .card{position:relative;width:${W / 2}px;height:${H / 2}px;background:#000;overflow:hidden;
    font-family:'Inter',system-ui,sans-serif}
  .glow{position:absolute;width:780px;height:780px;right:-100px;top:-180px;
    background:radial-gradient(circle,rgba(109,40,217,0.42) 0%,rgba(76,29,149,0.16) 40%,rgba(0,0,0,0) 68%)}
  svg.art{position:absolute;inset:0;width:100%;height:100%}
  .copy{position:absolute;left:76px;top:50%;transform:translateY(-50%)}
  h1{font-family:'Space Grotesk',system-ui,sans-serif;font-weight:700;font-size:118px;line-height:1;
    letter-spacing:-0.035em;color:#fff}
  p{margin-top:26px;font-size:19px;font-weight:500;letter-spacing:0.22em;color:#c3cae8;text-transform:uppercase}
  .url{position:absolute;left:78px;bottom:52px;font-size:16px;letter-spacing:0.06em;color:#79829f}
</style></head>
<body><div class="card">
  <div class="glow"></div>
  <svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="plume" x1="${CX - 900}" y1="${CY + 700}" x2="${CX + 320}" y2="${CY - 260}" gradientUnits="userSpaceOnUse">
        <stop stop-color="#6f3df5"/>
        <stop offset="0.45" stop-color="#8b5cff"/>
        <stop offset="0.78" stop-color="#b7a6ff"/>
        <stop offset="1" stop-color="#37e8ff"/>
      </linearGradient>
    </defs>
    ${plume}
  </svg>
  <div class="copy">
    <h1>Coil</h1>
    <p>Every trade winds the coil.</p>
  </div>
  <div class="url">coil.trading</div>
</div></body></html>
`);
