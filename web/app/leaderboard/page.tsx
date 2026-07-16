"use client";

import Link from "next/link";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { LIVE } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import { useGlobalActivity } from "@/lib/useGlobalActivity";
import { useEthPrice } from "@/lib/usePrice";
import { usdFromEth, shortAddr, compact } from "@/lib/format";
import type { TokenMarket } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];
const rank = (i: number) => MEDALS[i] ?? `${i + 1}`;

/**
 * Launchpad leaderboards, straight from on-chain events: the biggest traders by
 * lifetime volume and the creators whose tokens moved the most.
 */
export default function LeaderboardPage() {
  const ethUsd = useEthPrice();
  const { tokens: liveTokens, isLoading: marketsLoading } = useLiveMarkets();
  const all: TokenMarket[] = LIVE ? liveTokens : MOCK_TOKENS;
  const { traders, creators, isLoading } = useGlobalActivity(all);

  const loading = LIVE && (marketsLoading || isLoading) && traders.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Leaderboard</h1>
      <p className="mt-2 text-white/55">
        The loop&apos;s heaviest hitters — every number read live from on-chain events.
      </p>

      {loading ? (
        <div className="glass mt-8 p-10 text-center text-white/50">Reading the chain…</div>
      ) : traders.length === 0 && creators.length === 0 ? (
        <div className="glass mt-8 p-10 text-center text-white/50">
          No trades yet — the board fills up as soon as the loop starts turning.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Top traders */}
          <div className="glass overflow-hidden">
            <div className="border-b border-white/5 px-5 py-4">
              <h2 className="font-display text-lg font-bold">🔊 Top traders</h2>
              <p className="mt-0.5 text-xs text-white/40">By lifetime volume across every token</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {traders.map((t, i) => (
                <Link
                  key={t.address}
                  href={`/u/${t.address.toLowerCase()}`}
                  className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/[0.03]"
                >
                  <span className="w-8 shrink-0 text-base">{rank(i)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-white/70">
                    {shortAddr(t.address)}
                  </span>
                  <span className="shrink-0 text-xs text-white/35">{compact(t.trades, 0)} trades</span>
                  <span className="w-24 shrink-0 text-right font-mono font-semibold text-venom-400">
                    {usdFromEth(t.volumeEth, ethUsd, 0)}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Top creators */}
          <div className="glass overflow-hidden">
            <div className="border-b border-white/5 px-5 py-4">
              <h2 className="font-display text-lg font-bold">🐍 Top creators</h2>
              <p className="mt-0.5 text-xs text-white/40">
                By combined volume of every token they launched
              </p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {creators.map((c, i) => (
                <Link
                  key={c.address}
                  href={`/u/${c.address.toLowerCase()}`}
                  className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/[0.03]"
                >
                  <span className="w-8 shrink-0 text-base">{rank(i)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-white/70">
                    {shortAddr(c.address)}
                  </span>
                  <span className="shrink-0 text-xs text-white/35">
                    {c.tokens} {c.tokens === 1 ? "token" : "tokens"}
                  </span>
                  <span className="w-24 shrink-0 text-right font-mono font-semibold text-venom-400">
                    {usdFromEth(c.volumeEth, ethUsd, 0)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {LIVE && (
        <p className="mt-6 text-center text-[11px] text-white/25">
          Volume aggregates bonding-curve trades, V3 pool swaps, and v4 pool swaps.
        </p>
      )}
    </div>
  );
}
