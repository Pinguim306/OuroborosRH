"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { copy } from "@/lib/copy";
import { compact, rh } from "@/lib/format";
import { mockRewardPositions } from "@/lib/mock/data";
import { StatTile } from "@/components/StatTile";

export default function RewardsPage() {
  const initial = useMemo(() => mockRewardPositions(), []);
  const [positions, setPositions] = useState(initial);
  const [flash, setFlash] = useState<string | null>(null);

  const totalClaimable = positions.reduce((s, p) => s + p.claimableRh, 0);

  function claimAll() {
    if (totalClaimable <= 0) return;
    setFlash(`Claimed ${rh(totalClaimable, 4)} across ${positions.length} positions`);
    setPositions((ps) => ps.map((p) => ({ ...p, claimableRh: 0 })));
    setTimeout(() => setFlash(null), 3000);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{copy.rewards.title}</h1>
          <p className="mt-2 max-w-xl text-white/55">{copy.rewards.subtitle}</p>
        </div>
        <button onClick={claimAll} disabled={totalClaimable <= 0} className="btn-primary text-base">
          {copy.rewards.claimAll} · {rh(totalClaimable, 3)}
        </button>
      </div>

      {flash && (
        <div className="mt-6 rounded-xl border border-venom-500/30 bg-venom-500/10 px-4 py-3 text-center text-sm font-medium text-venom-400">
          ✓ {flash}
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Total claimable" value={rh(totalClaimable, 4)} accent />
        <StatTile label="Tokens held" value={String(positions.length)} />
        <StatTile label="Staking required" value="None" sub="Rewards accrue automatically" />
      </div>

      {positions.length === 0 ? (
        <div className="glass mt-8 p-10 text-center text-white/50">{copy.rewards.empty}</div>
      ) : (
        <div className="mt-8 space-y-3">
          {positions.map((p) => (
            <div
              key={p.token.address}
              className="glass flex flex-wrap items-center gap-4 p-4 md:flex-nowrap"
            >
              <Link href={`/token/${p.token.address}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-obsidian-800 text-2xl">
                  {p.token.image}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{p.token.name}</div>
                  <div className="text-xs text-white/40">
                    {compact(p.balance, 0)} {p.token.symbol} held
                  </div>
                </div>
              </Link>

              <div className="text-center">
                <div className="label">Claimable</div>
                <div className="font-mono text-sm font-semibold text-venom-400">
                  {rh(p.claimableRh, 4)}
                </div>
              </div>

              <button
                onClick={() =>
                  setPositions((ps) =>
                    ps.map((x) =>
                      x.token.address === p.token.address ? { ...x, claimableRh: 0 } : x,
                    ),
                  )
                }
                disabled={p.claimableRh <= 0}
                className="btn-ghost"
              >
                Claim
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="glass mt-10 p-6 text-sm text-white/55">
        <h3 className="font-semibold text-white">How your rewards are calculated</h3>
        <p className="mt-2 leading-relaxed">
          Every trade sends <span className="text-venom-400">0.4% of its volume</span> into the
          token&apos;s reward pool. Your slice of each inflow is simply your{" "}
          <span className="text-venom-400">share of the supply</span> at that moment — credited
          on-chain by a dividend accumulator. <span className="text-white">No staking, no lock-ups:</span>{" "}
          rewards accrue to your wallet just for holding, and you claim them in {" "}
          {"RH"} whenever you connect. Hold longer and you&apos;re simply present for more inflows.
        </p>
      </div>
    </div>
  );
}
