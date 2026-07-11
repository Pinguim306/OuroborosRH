import { copy } from "@/lib/copy";

const NODES = [
  { angle: -90, emoji: "💱", key: "Trade" },
  { angle: 0, emoji: "🌊", key: "Fees → Liquidity" },
  { angle: 90, emoji: "🎁", key: "Rewards" },
  { angle: 180, emoji: "💎", key: "Holders" },
];

function polar(angleDeg: number, r: number, cx: number, cy: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function LoopDiagram() {
  const cx = 160;
  const cy = 160;
  const r = 110;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm">
      <svg viewBox="0 0 320 320" className="h-full w-full">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="320" y2="320">
            <stop stopColor="#7dffb2" />
            <stop offset="0.5" stopColor="#22e584" />
            <stop offset="1" stopColor="#c8ff4d" />
          </linearGradient>
        </defs>

        {/* rotating ring = the ouroboros */}
        <g className="origin-center animate-spin-slow" style={{ transformBox: "fill-box" }}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="url(#ring)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="12 10"
            opacity="0.55"
          />
        </g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#ring)" strokeWidth="1.5" opacity="0.25" />

        {/* directional arrowheads implied by moving dashes */}
        <circle cx={cx} cy={cy} r={r - 30} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

        {NODES.map((n) => {
          const p = polar(n.angle, r, cx, cy);
          return (
            <g key={n.key}>
              <circle cx={p.x} cy={p.y} r="26" fill="#0f141d" stroke="rgba(34,229,132,0.4)" strokeWidth="1.5" />
              <text x={p.x} y={p.y + 7} textAnchor="middle" fontSize="20">
                {n.emoji}
              </text>
            </g>
          );
        })}

        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-white font-bold" fontSize="15">
          THE
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#22e584" fontSize="15" fontWeight="800">
          LOOP
        </text>
      </svg>

      {/* labels under the diagram */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] text-white/50">
        {copy.loop.steps.map((s) => (
          <div key={s.label} className="chip w-full justify-center">
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
