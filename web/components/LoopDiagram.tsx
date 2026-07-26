import { copy } from "@/lib/copy";
import { palette } from "@/lib/palette";
import { IconLock, IconRewards, IconSplit, IconSwap } from "./Icon";

/**
 * The four-stage flywheel, as the page's one piece of brand art.
 *
 * It used to be an ouroboros: a green dashed ring, emoji at the cardinal points, and a comment
 * explaining the snake. The protocol is called Coil now, so the ring became a coil — and the
 * motion carries the meaning: a cyan spark runs the loop continuously, because "every trade winds
 * the coil" is the claim this diagram exists to make. The emoji nodes became the app's own icons,
 * so they inherit colour and stroke weight from the palette instead of from the reader's OS.
 */
const NODES = [
  { angle: -90, Icon: IconSwap, key: "Trade" },
  { angle: 0, Icon: IconSplit, key: "Fees → Split" },
  { angle: 90, Icon: IconRewards, key: "Rewards" },
  { angle: 180, Icon: IconLock, key: "Locked liquidity" },
] as const;

function polar(angleDeg: number, r: number, cx: number, cy: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function LoopDiagram() {
  const cx = 160;
  const cy = 160;
  const r = 110;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm">
      <svg viewBox="0 0 320 320" className="h-full w-full" role="img" aria-label={copy.loop.title}>
        <defs>
          <linearGradient id="coil-ring" x1="0" y1="0" x2="320" y2="320" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.coil600} />
            <stop offset="0.55" stopColor={palette.coil400} />
            <stop offset="1" stopColor={palette.spark} />
          </linearGradient>
          <radialGradient id="coil-core" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={palette.coil500} stopOpacity="0.22" />
            <stop offset="1" stopColor={palette.coil500} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft core glow, so the centre reads as lit rather than as a hole. */}
        <circle cx={cx} cy={cy} r={r - 18} fill="url(#coil-core)" />

        {/* The loop itself. */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#coil-ring)" strokeWidth="2" opacity="0.35" />
        <circle cx={cx} cy={cy} r={r - 30} fill="none" stroke={palette.coil400} strokeWidth="1" opacity="0.1" />

        {/* The spark: one short arc chasing the ring forever. `travel` shifts the dash offset, so
            nothing actually rotates and the nodes stay upright. Hidden under reduced-motion. */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={palette.spark}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`60 ${circumference - 60}`}
          className="animate-travel motion-reduce:hidden"
          style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
        />

        {NODES.map(({ angle, Icon, key }) => {
          const p = polar(angle, r, cx, cy);
          return (
            <g key={key}>
              <circle cx={p.x} cy={p.y} r="26" fill={palette.surface} />
              <circle cx={p.x} cy={p.y} r="26" fill="none" stroke={palette.coil500} strokeWidth="1.5" opacity="0.5" />
              <g transform={`translate(${p.x - 11} ${p.y - 11})`} color={palette.coil300}>
                <Icon size={22} />
              </g>
            </g>
          );
        })}

        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="13" letterSpacing="3" fill={palette.ink4}>
          THE
        </text>
        <text x={cx} y={cy + 17} textAnchor="middle" fontSize="17" fontWeight="800" fill={palette.coil300}>
          LOOP
        </text>
      </svg>

      {/* labels under the diagram */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] text-ink-3">
        {copy.loop.steps.map((s) => (
          <div key={s.label} className="chip w-full justify-center">
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
