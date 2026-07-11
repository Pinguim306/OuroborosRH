"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { TokenMarket } from "@/lib/types";
import { copy } from "@/lib/copy";
import { compact, rh } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { LIVE } from "@/lib/contracts";

/**
 * Holder rewards for a single token — NO STAKING. Fees accrue to every holder
 * automatically, proportional to balance; you connect your wallet and claim.
 * Simulated locally so the flow is demoable; wire to `token.claim()` /
 * `token.claimableRewardOf(address)` when deployed.
 */
export function RewardsPanel({ token }: { token: TokenMarket }) {
  const { isConnected } = useAccount();
  // Demo holding so the accrual is visible. Live, this reads the wallet balance.
  const [holding] = useState(() => (token.marketCapRh / token.priceRh) * 0.004);
  const [claimable, setClaimable] = useState(() => token.rewardsPoolRh * 0.004);
  const [flash, setFlash] = useState<string | null>(null);

  // Fees trickle in continuously while you hold — no action required.
  useEffect(() => {
    const id = setInterval(() => {
      setClaimable((c) => c + (token.aprPct / 100 / (365 * 24 * 3600)) * holding * token.priceRh * 600);
    }, 1000);
    return () => clearInterval(id);
  }, [holding, token.aprPct, token.priceRh]);

  function claim() {
    if (claimable <= 0) return;
    setFlash(`Claimed ${rh(claimable, 5)}`);
    setClaimable(0);
    setTimeout(() => setFlash(null), 2600);
  }

  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Holder rewards</h3>
        <span className="chip">APR ~{token.aprPct}%</span>
      </div>
      <p className="mt-1 text-xs text-white/45">
        Just hold {token.symbol} — fees accrue to your wallet in {NATIVE_SYMBOL} automatically. No
        staking, no lock-ups. Connect and claim anytime.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-obsidian-900/60 p-4">
          <div className="label">Your holdings</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-white">
            {compact(holding, 0)} {token.symbol}
          </div>
        </div>
        <div className="rounded-xl bg-obsidian-900/60 p-4">
          <div className="label">Pool paid out</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-white">
            {rh(token.rewardsPoolRh, 0)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-venom-500/20 bg-venom-500/5 p-4">
        <div>
          <div className="label">Claimable now</div>
          <div className="mt-0.5 font-mono text-lg font-bold text-venom-400">{rh(claimable, 5)}</div>
        </div>
        <button onClick={claim} disabled={claimable <= 0} className="btn-primary">
          {copy.token.claim}
        </button>
      </div>

      {flash && (
        <div className="mt-3 rounded-lg border border-venom-500/30 bg-venom-500/10 px-3 py-2 text-center text-xs font-medium text-venom-400">
          ✓ {flash}
        </div>
      )}

      {!isConnected && (
        <p className="mt-3 text-center text-[11px] text-white/30">
          {LIVE
            ? "Connect your wallet to see and claim your rewards."
            : "Demo mode — rewards accrue automatically to holders; connect + deploy to claim for real."}
        </p>
      )}
    </div>
  );
}
