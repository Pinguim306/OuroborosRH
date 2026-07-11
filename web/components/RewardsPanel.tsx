"use client";

import { useEffect, useState } from "react";
import type { TokenMarket } from "@/lib/types";
import { copy } from "@/lib/copy";
import { compact, rh } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/chain";

/**
 * The rewards side of the loop for a single token. Simulated locally: staking
 * starts a loyalty ramp (1.0x -> 3.0x over 90 days) and claimable fees tick up so
 * the mechanic is legible. Wire to `rewards.stake/withdraw/claim` when deployed.
 */
export function RewardsPanel({ token }: { token: TokenMarket }) {
  const [staked, setStaked] = useState(0);
  const [amount, setAmount] = useState("");
  const [claimable, setClaimable] = useState(0);
  const [loyaltyDays, setLoyaltyDays] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const multiplier = 1 + Math.min(2, (loyaltyDays / 90) * 2);

  // Fees trickle in while staked, scaled by boosted weight.
  useEffect(() => {
    if (staked <= 0) return;
    const id = setInterval(() => {
      setClaimable((c) => c + (token.aprPct / 100 / (365 * 24 * 3600)) * staked * token.priceRh * multiplier * 400);
    }, 1000);
    return () => clearInterval(id);
  }, [staked, multiplier, token.aprPct, token.priceRh]);

  function stake() {
    const n = parseFloat(amount) || 0;
    if (n <= 0) return;
    setStaked((s) => s + n);
    if (staked === 0) setLoyaltyDays(0.01);
    setAmount("");
    toast(`Staked ${compact(n, 2)} ${token.symbol}`);
  }
  function unstake() {
    if (staked <= 0) return;
    setStaked(0);
    setLoyaltyDays(0); // withdrawing resets the loyalty streak
    toast("Unstaked — loyalty streak reset");
  }
  function claim() {
    if (claimable <= 0) return;
    toast(`Claimed ${rh(claimable, 4)}`);
    setClaimable(0);
  }
  function toast(m: string) {
    setFlash(m);
    setTimeout(() => setFlash(null), 2600);
  }

  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Loyalty rewards</h3>
        <span className="chip">APR ~{token.aprPct}%</span>
      </div>
      <p className="mt-1 text-xs text-white/45">
        Stake {token.symbol} to earn a share of trading fees in {NATIVE_SYMBOL}, weighted by amount ×
        time.
      </p>

      {/* Loyalty multiplier meter */}
      <div className="mt-4 rounded-xl bg-obsidian-900/60 p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="label">Your loyalty multiplier</div>
            <div className="stat-value text-gradient">{multiplier.toFixed(2)}×</div>
          </div>
          <div className="text-right text-xs text-white/40">
            <div>{loyaltyDays > 0 ? `${loyaltyDays.toFixed(0)} / 90 days` : "not staking"}</div>
            <div>max 3.00×</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-venom-600 via-venom-400 to-acid transition-all"
            style={{ width: `${Math.min(100, (loyaltyDays / 90) * 100)}%` }}
          />
        </div>
        {staked > 0 && (
          <button
            onClick={() => setLoyaltyDays((d) => Math.min(90, d + 30))}
            className="mt-3 w-full rounded-lg border border-white/10 py-1.5 text-[11px] text-white/40 hover:border-venom-500/40 hover:text-white"
          >
            ⏩ Simulate +30 days of holding
          </button>
        )}
      </div>

      {/* Stake box */}
      <div className="mt-4">
        <label className="label">Stake {token.symbol}</label>
        <div className="mt-1.5 flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
            inputMode="decimal"
            className="field font-mono"
          />
          <button onClick={stake} className="btn-primary shrink-0">
            {copy.token.stake}
          </button>
        </div>
        <div className="mt-2 flex justify-between text-xs text-white/40">
          <span>Staked</span>
          <span className="font-mono">
            {compact(staked, 2)} {token.symbol}
          </span>
        </div>
      </div>

      {/* Claimable */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-venom-500/20 bg-venom-500/5 p-4">
        <div>
          <div className="label">Claimable fees</div>
          <div className="mt-0.5 font-mono text-lg font-bold text-venom-400">{rh(claimable, 5)}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={claim} disabled={claimable <= 0} className="btn-primary">
            {copy.token.claim}
          </button>
        </div>
      </div>
      {staked > 0 && (
        <button onClick={unstake} className="btn-ghost mt-2 w-full">
          {copy.token.unstake} & reset loyalty
        </button>
      )}

      {flash && (
        <div className="mt-3 rounded-lg border border-venom-500/30 bg-venom-500/10 px-3 py-2 text-center text-xs font-medium text-venom-400">
          ✓ {flash}
        </div>
      )}
    </div>
  );
}
