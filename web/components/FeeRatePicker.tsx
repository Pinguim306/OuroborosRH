"use client";

/** A bps value as an exact percentage — two decimals, trailing zeros trimmed. */
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/**
 * The creator's one economic decision: how much every trade in their token pays.
 *
 * Deliberately just the rate — a slider, presets and the chosen number. It used to render the full
 * on-chain waterfall underneath (who gets what, live from `resolveFees`, with bars and captions),
 * and that was cut on request: three annotated rows under a slider read as homework, and the number
 * the creator actually decides on is the one at the top. The split still comes from the contract
 * where it is shown (the token page), never recomputed in the frontend.
 *
 * The rate is immutable once launched — it is baked into the hook's constructor arguments, which is
 * also why changing it re-mines the CREATE2 address.
 */
export function FeeRatePicker({
  bps,
  onChange,
  minBps,
  maxBps,
  disabled,
}: {
  bps: number;
  onChange: (bps: number) => void;
  minBps: number;
  maxBps: number;
  disabled?: boolean;
}) {
  // Presets bracket the range the curve is tuned for: the floor, the default, a middle and the cap.
  const presets = [minBps, 200, 300, maxBps].filter(
    (v, i, a) => v >= minBps && v <= maxBps && a.indexOf(v) === i,
  );

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label">Per-swap fee</span>
        <span className="tabular text-sm font-semibold text-ink">{pct(bps)}</span>
      </div>

      <div className="rounded-xl border border-white/10 bg-obsidian-900/60 p-4">
        <input
          type="range"
          min={minBps}
          max={maxBps}
          step={10}
          value={bps}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Per-swap fee percentage"
          className="w-full accent-coil-500"
        />
        {/* The presets start at the floor and end at the cap, so they double as the range's end
            labels — printing min and max again either side of them just says 1% twice. */}
        <div className="mt-2 flex justify-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p)}
              className={`tabular rounded-md px-2 py-0.5 text-[11px] transition ${
                bps === p
                  ? "bg-coil-500/20 text-coil-400"
                  : "text-ink-4 hover:bg-white/5 hover:text-ink-2"
              }`}
            >
              {pct(p)}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-4">
        Charged on both buys and sells, taken inside the swap so every router and aggregator
        respects it. Fixed forever the moment you launch.
      </p>
    </div>
  );
}
