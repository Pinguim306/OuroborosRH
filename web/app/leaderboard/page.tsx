"use client";

import Link from "next/link";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { ANY_LIVE } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import { useGlobalActivity } from "@/lib/useGlobalActivity";
import { useEthPrice } from "@/lib/usePrice";
import { usdFromEth, shortAddr, compact } from "@/lib/format";
import type { TokenMarket } from "@/lib/types";
import { IconSparkle, IconTrophy, IconVolume } from "@/components/Icon";

/**
 * Rank chip. The top three used to be 🥇🥈🥉, which drew three different medals depending on the
 * reader's OS and sat on a baseline of their own; this keeps the podium legible as tinted numbers
 * that line up with every other row.
 */
function Rank({ i }: { i: number }) {
  const podium = [
    "border-warn/40 bg-warn/10 text-warn",
    "border-ink-3/40 bg-ink-3/10 text-ink-2",
    "border-coil-400/40 bg-coil-400/10 text-coil-400",
  ][i];
  return (
    <span
      className={`tabular grid h-6 w-6 shrink-0 place-items-center rounded-lg border text-[11px] font-bold ${
        podium ?? "border-transparent text-ink-4"
      }`}
    >
      {i + 1}
    </span>
  );
}

/**
 * Launchpad leaderboards, straight from on-chain events: the biggest traders by
 * lifetime volume and the creators whose tokens moved the most.
 */
export default function LeaderboardPage() {
  const ethUsd = useEthPrice();
  const { tokens: liveTokens, isLoading: marketsLoading } = useLiveMarkets();
  const all: TokenMarket[] = ANY_LIVE ? liveTokens : MOCK_TOKENS;
  const { traders, creators, isLoading } = useGlobalActivity(all);

  const loading = ANY_LIVE && (marketsLoading || isLoading) && traders.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Leaderboard</h1>
      <p className="mt-2 text-ink-3">
        The loop&apos;s heaviest hitters — every number read live from on-chain events.
      </p>

      {loading ? (
        <div className="empty mt-8">
          <p className="empty-title">Reading the chain</p>
          <p className="empty-body">
            Aggregating every trade and launch from on-chain events. This takes a moment.
          </p>
        </div>
      ) : traders.length === 0 && creators.length === 0 ? (
        <div className="empty mt-8">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-coil-500/10 text-coil-400">
            <IconTrophy size={22} />
          </span>
          <p className="empty-title">No trades yet</p>
          <p className="empty-body">
            The board ranks traders by lifetime volume and creators by the volume their coins do. It
            fills in as soon as the loop starts turning.
          </p>
          <Link href="/" className="btn-primary mt-1">
            Explore coins
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Top traders */}
          <div className="glass overflow-hidden">
            <div className="border-b border-white/5 px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <IconVolume size={16} className="text-coil-400" /> Top traders
              </h2>
              <p className="mt-0.5 text-xs text-ink-4">By lifetime volume across every token</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {traders.map((t, i) => (
                <Link
                  key={t.address}
                  href={`/u/${t.address.toLowerCase()}`}
                  className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/[0.03]"
                >
                  <Rank i={i} />
                  <span className="min-w-0 flex-1 truncate font-mono text-ink-2">
                    {shortAddr(t.address)}
                  </span>
                  <span className="tabular shrink-0 text-xs text-ink-3">{compact(t.trades, 0)} trades</span>
                  <span className="tabular w-24 shrink-0 text-right font-semibold text-coil-400">
                    {usdFromEth(t.volumeEth, ethUsd, 0)}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Top creators */}
          <div className="glass overflow-hidden">
            <div className="border-b border-white/5 px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <IconSparkle size={16} className="text-coil-400" /> Top creators
              </h2>
              <p className="mt-0.5 text-xs text-ink-4">
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
                  <Rank i={i} />
                  <span className="min-w-0 flex-1 truncate font-mono text-ink-2">
                    {shortAddr(c.address)}
                  </span>
                  <span className="shrink-0 text-xs text-ink-4">
                    {c.tokens} {c.tokens === 1 ? "token" : "tokens"}
                  </span>
                  <span className="tabular w-24 shrink-0 text-right font-semibold text-coil-400">
                    {usdFromEth(c.volumeEth, ethUsd, 0)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {ANY_LIVE && (
        <p className="mt-6 text-center text-[11px] text-ink-4">
          Volume aggregates bonding-curve trades, V3 pool swaps, and v4 pool swaps.
        </p>
      )}
    </div>
  );
}
