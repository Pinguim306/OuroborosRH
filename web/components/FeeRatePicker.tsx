"use client";

import { useEffect, useState } from "react";
import { IconBurn, IconCrown, IconRewards, IconSplit } from "@/components/Icon";
import { useFeeSplit } from "@/lib/useLaunchFee";

/**
 * A bps value as an exact percentage — two decimals, trailing zeros trimmed.
 *
 * Exact, not rounded, because these rows have to ADD UP. A 3% fee splits 105/156/39 bps, and at one
 * decimal that renders as 1.1 + 1.6 + 0.4 = 3.1% — a creator reading a breakdown that overshoots
 * the rate they just picked has every reason to distrust the whole screen. Two decimals is the
 * natural precision of a basis point, so nothing is ever lost.
 */
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/**
 * The creator's one economic decision: how much every trade in their token pays.
 *
 * The rate is chosen here but the SPLIT is never computed here — it comes back from the launchpad's
 * `resolveFees`. That matters because the protocol's share slides against the rate (a big share of
 * a small fee, a smaller share of a large one) and the curve behind it is owner-tunable on-chain.
 * A local copy of that maths would look right for exactly as long as nobody retuned it, and then
 * quietly show creators a split they were not going to get.
 *
 * The rate is immutable once launched — it is baked into the hook's constructor arguments, which is
 * also why changing it here re-mines the address. Hence the emphasis on showing the real numbers
 * before signing rather than after.
 */
export function FeeRatePicker({
  bps,
  onChange,
  minBps,
  maxBps,
  creatorRewards,
  chainId,
  disabled,
}: {
  bps: number;
  onChange: (bps: number) => void;
  minBps: number;
  maxBps: number;
  /** Decides who the holder slice is labelled for — the creator's wallet or every holder. */
  creatorRewards: boolean;
  chainId: number;
  disabled?: boolean;
}) {
  // Dragging the slider fires a read per tick otherwise. The preview lags the handle by a moment;
  // the handle itself stays live, so the control never feels sticky.
  const [previewBps, setPreviewBps] = useState(bps);
  useEffect(() => {
    const t = setTimeout(() => setPreviewBps(bps), 200);
    return () => clearTimeout(t);
  }, [bps]);

  const split = useFeeSplit(previewBps, !disabled, chainId);
  const settled = split && previewBps === bps;

  // Presets bracket the range the curve is tuned for: the floor, the default, a middle and the cap.
  const presets = [minBps, 200, 300, maxBps].filter(
    (v, i, a) => v >= minBps && v <= maxBps && a.indexOf(v) === i,
  );

  const rows = [
    {
      key: "holder",
      label: creatorRewards ? "Your wallet" : "Every holder",
      hint: creatorRewards
        ? "Paid straight to you on every trade, forever."
        : "Streamed to holders on every trade — no staking, no claim.",
      Icon: creatorRewards ? IconCrown : IconRewards,
      bps: split?.holderBps,
      tone: "text-up",
      bar: "bg-up",
    },
    {
      key: "protocol",
      label: "Coil protocol",
      hint: "The platform's cut. Falls as a share of the fee the higher you set the rate.",
      Icon: IconSplit,
      bps: split?.protocolBps,
      tone: "text-coil-400",
      bar: "bg-coil-500",
    },
    {
      key: "burn",
      label: "$COIL buy & burn",
      hint: "Buys $COIL on the open market and burns it.",
      Icon: IconBurn,
      bps: split?.burnBps,
      tone: "text-spark",
      bar: "bg-spark",
    },
    // A chain with no $COIL to buy runs this bucket at zero. Showing an empty row there would read
    // as something failing to load, so it is dropped instead.
  ].filter((r) => r.bps === undefined || r.bps > 0);

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

        <div className="mt-4 space-y-2.5 border-t border-white/5 pt-3">
          {rows.map((r) => {
            // Widths are shares OF THE FEE, not of the trade — a 1% fee and a 5% fee should draw
            // the same full bar, because what this row answers is "who gets it", not "how much".
            const share = r.bps !== undefined && bps > 0 ? r.bps / bps : 0;
            return (
              <div key={r.key}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-ink-2">
                    <r.Icon size={13} className={r.tone} />
                    {r.label}
                  </span>
                  <span className={`tabular font-semibold ${settled ? r.tone : "text-ink-4"}`}>
                    {r.bps === undefined ? "…" : `${pct(r.bps)} of every trade`}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${r.bar} ${
                      settled ? "opacity-100" : "opacity-40"
                    }`}
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-4">{r.hint}</p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-4">
        Charged on both buys and sells, taken inside the swap so every router and aggregator
        respects it. Fixed forever the moment you launch.
      </p>
    </div>
  );
}
