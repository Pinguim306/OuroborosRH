"use client";

import { useMemo } from "react";
import { usd } from "@/lib/format";

/**
 * Lightweight single-series marketcap chart (ETH marketcap values in, USD labels).
 * Pure SVG, on-brand venom-green line + area. No external chart lib.
 */
export function MarketcapChart({
  series,
  ethUsd,
  height = 180,
}: {
  series: number[];
  ethUsd: number;
  height?: number;
}) {
  const w = 640;
  const h = height;
  const pad = 6;

  const { line, area, min, max } = useMemo(() => {
    if (series.length < 2) return { line: "", area: "", min: 0, max: 0 };
    const lo = Math.min(...series);
    const hi = Math.max(...series);
    const span = hi - lo || 1;
    const stepX = (w - pad * 2) / (series.length - 1);
    const pts = series.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - lo) / span);
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
    return { line, area, min: lo, max: hi };
  }, [series, h]);

  const toUsd = (eth: number) => (ethUsd ? usd(eth * ethUsd) : `${eth.toFixed(3)} ETH`);

  if (series.length < 2) {
    return (
      <div className="grid h-44 place-items-center rounded-xl bg-obsidian-900/60 text-sm text-white/35">
        Not enough trades yet to chart.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-obsidian-900/60 p-3">
      <div className="mb-1 flex justify-between text-xs text-white/40">
        <span>Marketcap</span>
        <span className="font-mono text-white/60">{toUsd(series[series.length - 1])}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="mcapfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22e584" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22e584" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#mcapfill)" />
        <path d={line} fill="none" stroke="#22e584" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-white/30">
        <span>low {toUsd(min)}</span>
        <span>high {toUsd(max)}</span>
      </div>
    </div>
  );
}
