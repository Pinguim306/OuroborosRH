"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { getToken, mockTrades, mockHolders } from "@/lib/mock/data";
import { compact, pct, usdFromEth, shortAddr, timeAgo, fullDateTime } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { LIVE } from "@/lib/contracts";
import { useLiveToken } from "@/lib/useMarkets";
import { useTokenActivity, useTokenHolders } from "@/lib/useActivity";
import { useEthPrice } from "@/lib/usePrice";
import type { Address } from "@/lib/types";
import { StatTile } from "@/components/StatTile";
import { ProgressBar } from "@/components/ProgressBar";
import { TradeWidget } from "@/components/TradeWidget";
import { RewardsPanel } from "@/components/RewardsPanel";
import { MarketcapChart } from "@/components/MarketcapChart";
import { CandleChart } from "@/components/CandleChart";
import { DexScreenerChart } from "@/components/DexScreenerChart";
import { dexscreenerEmbedUrl } from "@/lib/chain";
import { TokenAvatar } from "@/components/TokenAvatar";
import { HarvestFees } from "@/components/HarvestFees";
import { SocialLinks } from "@/components/SocialLinks";
import { useTokenMeta } from "@/lib/useMeta";

const EXPLORER = "https://robinhoodchain.blockscout.com";

/** Live trade ids are `${txHash}-${logIndex}`; mock ids aren't hashes. */
function txHashOf(id: string): string | null {
  const h = id.split("-")[0];
  return h.startsWith("0x") && h.length === 66 ? h : null;
}

export default function TokenPage() {
  const params = useParams();
  const address = Array.isArray(params.address) ? params.address[0] : params.address;
  const live = useLiveToken(address as Address | undefined);
  const token = LIVE ? live.token : address ? getToken(address) : undefined;

  const ethUsd = useEthPrice();
  const activity = useTokenActivity(token);
  const holdersData = useTokenHolders(token);
  const meta = useTokenMeta(token?.image);

  if (LIVE && live.isLoading && !token) {
    return <div className="mx-auto max-w-md px-4 py-32 text-center text-white/50">Loading token…</div>;
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center">
        <div className="text-5xl">🕳️</div>
        <h1 className="mt-4 font-display text-2xl font-bold">Token not found</h1>
        <p className="mt-2 text-white/50">This market doesn&apos;t exist (or hasn&apos;t been indexed yet).</p>
        <Link href="/discover" className="btn-primary mt-6 inline-flex">
          Back to Discover
        </Link>
      </div>
    );
  }

  const trades = LIVE ? activity.trades : mockTrades(token);
  const holders = LIVE ? holdersData.holders : mockHolders(token);
  const vol24 = LIVE ? activity.volume24hEth : token.volume24hRh;
  // Chart series (ETH marketcap over trades). Demo mode uses a synthetic curve.
  const series = LIVE
    ? activity.series
    : Array.from({ length: 40 }, (_, i) =>
        token.marketCapRh * (0.3 + 0.7 * (i / 39)) * (0.92 + 0.16 * Math.sin(i * 1.3)),
      );
  const athEth = LIVE ? activity.athMcapEth : Math.max(token.marketCapRh, ...series);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <TokenAvatar
          uri={token.image}
          symbol={token.symbol}
          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-obsidian-800 text-4xl"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{token.name}</h1>
            <span className="chip">{token.symbol}</span>
            {token.mode === "v3" ? (
              <span className="chip border-venom-500/40 text-venom-400">⚡ V3</span>
            ) : token.graduated ? (
              <span className="chip border-venom-500/40 text-venom-400">✦ Graduated</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-xl text-sm text-white/50">
            {meta?.description || token.description}
          </p>
          {token.createdAt ? (
            <p className="mt-1 text-xs text-white/35">
              Created {fullDateTime(token.createdAt)} · {timeAgo(token.createdAt)}
            </p>
          ) : null}
          <SocialLinks
            website={meta?.website}
            twitter={meta?.twitter}
            telegram={meta?.telegram}
            className="mt-2"
          />
        </div>
        <div className="text-right">
          <div className="label">Marketcap</div>
          <div className="stat-value text-gradient">{usdFromEth(token.marketCapRh, ethUsd)}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: market data */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Marketcap" value={usdFromEth(token.marketCapRh, ethUsd)} />
            <StatTile label="ATH" value={usdFromEth(athEth, ethUsd)} accent />
            <StatTile label="Rewards pool" value={usdFromEth(token.rewardsPoolRh, ethUsd)} />
            <StatTile label="24h Volume" value={usdFromEth(vol24, ethUsd)} />
          </div>

          {/* Chart: DexScreener once graduated (has a live DEX pair), else our
              on-chain marketcap chart for the bonding-curve phase. */}
          {(token.mode === "v3" || token.graduated) && dexscreenerEmbedUrl(token.pair) ? (
            // V3 launches chart on DexScreener from their very first trade; curve
            // tokens switch to it after graduating.
            <DexScreenerChart pair={token.pair} />
          ) : LIVE && activity.candles.length > 0 ? (
            <CandleChart candles={activity.candles} ethUsd={ethUsd} />
          ) : (
            <MarketcapChart series={series} ethUsd={ethUsd} />
          )}

          {/* Market status: V3 pool, graduated, or bonding-curve progress */}
          {token.mode === "v3" ? (
            <div className="glass p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Uniswap V3 pool</h3>
                <span className="text-xs text-white/40">1% pool fee · liquidity locked</span>
              </div>
              <div className="rounded-xl bg-venom-500/10 p-4 text-center text-sm text-venom-400">
                This token launched straight into a Uniswap V3 pool — no bonding curve. Its
                liquidity is locked forever; the pool&apos;s 1% swap fee is harvested for the
                protocol and streamed to holders.
              </div>
              <HarvestFees token={token} />
            </div>
          ) : (
            <div className="glass p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Bonding curve</h3>
                <span className="text-xs text-white/40">
                  Graduates at 4 {NATIVE_SYMBOL} raised · max buy 2%
                </span>
              </div>
              {token.graduated ? (
                <div className="rounded-xl bg-venom-500/10 p-4 text-center text-sm text-venom-400">
                  This token filled its curve and graduated to Uniswap V2. The migrated liquidity is
                  permanent — its LP tokens were burned — and trading now happens on the DEX pair.
                </div>
              ) : (
                <ProgressBar value={token.graduationProgress} label="Progress to graduation" />
              )}
            </div>
          )}

          {/* Trades */}
          <div className="glass overflow-hidden">
            <div className="border-b border-white/5 px-5 py-3 text-sm font-semibold">Recent trades</div>
            {trades.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-white/35">
                {LIVE && activity.isLoading ? "Loading trades…" : "No trades yet. Be the first."}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-obsidian-850/90 text-left text-xs text-white/40">
                    <tr>
                      <th className="px-5 py-2 font-medium">Type</th>
                      <th className="px-5 py-2 font-medium">{NATIVE_SYMBOL}</th>
                      <th className="px-5 py-2 font-medium">{token.symbol}</th>
                      <th className="px-5 py-2 font-medium">Trader</th>
                      <th className="px-5 py-2 text-right font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => {
                      const tx = txHashOf(t.id);
                      return (
                        <tr key={t.id} className="border-t border-white/5">
                          <td className={`px-5 py-2 font-semibold ${t.isBuy ? "text-venom-400" : "text-red-400"}`}>
                            {tx ? (
                              <a
                                href={`${EXPLORER}/tx/${tx}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                title="View transaction on the explorer"
                              >
                                {t.isBuy ? "Buy" : "Sell"} ↗
                              </a>
                            ) : t.isBuy ? (
                              "Buy"
                            ) : (
                              "Sell"
                            )}
                          </td>
                          <td className="px-5 py-2 font-mono text-white/70">{compact(t.rhAmount, 3)}</td>
                          <td className="px-5 py-2 font-mono text-white/70">{compact(t.tokenAmount, 0)}</td>
                          <td className="px-5 py-2 font-mono text-white/40">
                            <a
                              href={`${EXPLORER}/address/${t.trader}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-venom-400 hover:underline"
                            >
                              {shortAddr(t.trader)}
                            </a>
                          </td>
                          <td className="px-5 py-2 text-right text-xs text-white/40">
                            {t.time ? timeAgo(t.time) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Holders */}
          <div className="glass overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <span className="text-sm font-semibold">Top holders</span>
              <span className="text-xs text-white/40">{holders.length} shown</span>
            </div>
            {holders.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-white/35">
                {LIVE && holdersData.isLoading ? "Loading holders…" : "No holders yet."}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {holders.map((h, i) => (
                  <div key={h.address} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="w-5 text-white/30">{i + 1}</span>
                    <a
                      href={`${EXPLORER}/address/${h.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 font-mono text-white/60 hover:text-venom-400 hover:underline"
                    >
                      {shortAddr(h.address)}
                    </a>
                    <span className="w-24 text-right font-mono text-white/50">
                      {compact(h.balance, 0)} {token.symbol}
                    </span>
                    <span className="w-16 text-right font-semibold text-venom-400">
                      {pct(h.sharePct / 100)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <TradeWidget token={token} />
          <RewardsPanel token={token} />
        </div>
      </div>
    </div>
  );
}
