"use client";

import Link from "next/link";
import type { TokenMarket } from "@/lib/types";
import { useGlobalActivity } from "@/lib/useGlobalActivity";
import { useEthPrice } from "@/lib/usePrice";
import { usdFromEth, shortAddr, timeAgo } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";

/**
 * Home-page "live" section: King of the Hill (hottest token of the last hour)
 * next to a launchpad-wide feed of the most recent trades. Renders nothing until
 * there is real on-chain activity to show.
 */
export function LivePulse({ tokens }: { tokens: TokenMarket[] }) {
  const ethUsd = useEthPrice();
  const { trades, hot } = useGlobalActivity(tokens);

  if (!hot && trades.length === 0) return null;

  return (
    <section className="py-14">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-venom-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-venom-400" />
        </span>
        <h2 className="font-display text-2xl font-bold">Live from the loop</h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[380px_1fr]">
        {/* King of the Hill */}
        {hot && (
          <Link
            href={`/token/${hot.token.address}`}
            className="glass-strong group relative overflow-hidden p-5 transition hover:border-venom-500/40"
          >
            <div className="absolute -right-4 -top-6 font-display text-8xl font-black text-white/[0.04]">
              👑
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-acid">
              King of the Hill · hottest last hour
            </div>
            <div className="mt-3 flex items-center gap-3">
              <TokenAvatar
                uri={hot.token.image}
                symbol={hot.token.symbol}
                className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-2xl"
              />
              <div className="min-w-0">
                <div className="truncate font-semibold text-white group-hover:text-venom-400">
                  {hot.token.name} <span className="text-white/40">${hot.token.symbol}</span>
                </div>
                <div className="mt-0.5 text-xs text-white/45">
                  Marketcap {usdFromEth(hot.token.marketCapRh, ethUsd, 0)}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-obsidian-900/60 p-3">
              <span className="text-xs text-white/50">1h volume</span>
              <span className="font-mono text-sm font-bold text-venom-400">
                {usdFromEth(hot.vol1hEth, ethUsd, 0)}
              </span>
            </div>
          </Link>
        )}

        {/* Global trade feed */}
        {trades.length > 0 && (
          <div className="glass overflow-hidden">
            <div className="max-h-[290px] divide-y divide-white/[0.04] overflow-y-auto">
              {trades.map((t) => (
                <Link
                  key={t.id}
                  href={`/token/${t.token.address}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs transition hover:bg-white/[0.03]"
                >
                  <span
                    className={`w-10 shrink-0 font-bold ${t.isBuy ? "text-venom-400" : "text-red-400"}`}
                  >
                    {t.isBuy ? "BUY" : "SELL"}
                  </span>
                  <span className="w-20 shrink-0 font-mono text-white/80">
                    {usdFromEth(t.ethAmount, ethUsd, 2)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-white/70">
                    ${t.token.symbol}
                  </span>
                  <span className="hidden shrink-0 font-mono text-white/30 sm:inline">
                    {shortAddr(t.trader)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-white/30">{timeAgo(t.time)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
