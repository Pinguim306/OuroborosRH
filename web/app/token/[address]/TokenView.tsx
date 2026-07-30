"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getToken, mockTrades, mockHolders } from "@/lib/mock/data";
import { compact, pct, usdFromEth, shortAddr, timeAgo, fullDateTime } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { LIVE, coilPoolId, isHiddenToken } from "@/lib/contracts";
import { useLiveToken, useLiveTokenV4 } from "@/lib/useMarkets";
import { useTokenActivity, useTokenHolders } from "@/lib/useActivity";
import { useEthPrice } from "@/lib/usePrice";
import type { Address } from "@/lib/types";
import { StatTile } from "@/components/StatTile";
import { ProgressBar } from "@/components/ProgressBar";
import { TradeWidget } from "@/components/TradeWidget";
import { ArcV3TradeWidget } from "@/components/ArcV3TradeWidget";
import { V4TradeWidget } from "@/components/V4TradeWidget";
import { RewardsPanel } from "@/components/RewardsPanel";
import { MarketcapChart } from "@/components/MarketcapChart";
import { CandleChart } from "@/components/CandleChart";
import { DexScreenerChart } from "@/components/DexScreenerChart";
import { chainConfig, dexscreenerEmbedUrl, explorerUrl, v3QuoteOf } from "@/lib/chain";
import { useSelectedChainId } from "@/lib/useSelectedChain";
import { ChainBadge } from "@/components/ChainBadge";
import { TokenAvatar } from "@/components/TokenAvatar";
import { HarvestFees } from "@/components/HarvestFees";
import { SocialLinks } from "@/components/SocialLinks";
import { TokenChat } from "@/components/TokenChat";
import { useTokenMeta } from "@/lib/useMeta";
import { useTotalFeesEth } from "@/lib/useFees";
import { useDexPair } from "@/lib/useDexPair";
import { ShareModal } from "@/components/ShareModal";
import { IconBolt, IconCopy, IconCrown, IconExternal, IconSearch, IconShare, IconSparkle } from "@/components/Icon";

/** Live trade ids are `${txHash}-${logIndex}`; mock ids aren't hashes. */
function txHashOf(id: string): string | null {
  const h = id.split("-")[0];
  return h.startsWith("0x") && h.length === 66 ? h : null;
}

export function TokenView() {
  const params = useParams();
  const address = Array.isArray(params.address) ? params.address[0] : params.address;
  const hidden = isHiddenToken(address); // internal/test tokens resolve to "not found" everywhere

  // `?chain=` on the URL is what identifies WHICH chain's token this page is (addresses collide
  // across chains by design — the hook flags are mined into them). It MUST feed the resolvers
  // below: each hook's chainId defaults to the default chain, so leaving it off asks the wrong
  // network's launchpad — an Arc token then 404s on its own page while the launches list (which
  // does pass the chain) happily shows it. The curve/V3 reader takes it too now that instant-V3
  // launchpads exist on more than one chain.
  const chainId = useSelectedChainId();
  const live = useLiveToken(hidden ? undefined : (address as Address | undefined), chainId);
  // v4 (CoilHook) tokens live in a different launchpad the v3 reader can't see — fall back to it.
  const liveV4 = useLiveTokenV4(hidden ? undefined : (address as Address | undefined), chainId);
  const token = hidden
    ? undefined
    : LIVE
      ? live.token ?? liveV4.token
      : address
        ? getToken(address)
        : undefined;
  const isV4 = token?.mode === "v4";
  const [shareOpen, setShareOpen] = useState(false);
  const ethUsd = useEthPrice(chainId);
  const activity = useTokenActivity(token);
  const holdersData = useTokenHolders(token);
  const meta = useTokenMeta(token?.image);
  const totalFeesEth = useTotalFeesEth(token);
  // v4 pools chart on DexScreener when it indexes them (by PoolId); on-chain candles otherwise.
  const v4PoolId = isV4 && token ? coilPoolId(token.address) : undefined;
  const dexHasV4 = useDexPair(v4PoolId);

  if (!hidden && LIVE && (live.isLoading || liveV4.isLoading) && !token) {
    return <div className="mx-auto max-w-md px-4 py-32 text-center text-ink-3">Loading token…</div>;
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-32">
        <div className="empty">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-coil-500/10 text-coil-400">
            <IconSearch size={22} />
          </span>
          <h1 className="empty-title !text-lg">Token not found</h1>
          <p className="empty-body">
            No market at this address on {chainConfig(chainId).chain.name}. It may live on another
            network, or it may not be indexed yet.
          </p>
          <Link href="/" className="btn-primary mt-1">
            Explore coins
          </Link>
        </div>
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
          className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-obsidian-800 text-5xl sm:h-32 sm:w-32 sm:text-6xl"
        />
        {/*
          `basis` + `flex-1` rather than `min-w-0`: this column has to be allowed to WRAP onto its
          own line, not to shrink. Letting it shrink squeezed the description to about ninety pixels
          on a phone — one or two words per line — because the avatar and the marketcap block are
          both fixed-width and took the row.
        */}
        <div className="min-w-[16rem] flex-1 basis-64">
          {/* Wraps: the badge row can carry four chips next to a long token name. */}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{token.name}</h1>
            <span className="chip">{token.symbol}</span>
            {/* A visitor can land here from a shared link with no other chain context. */}
            <ChainBadge chainId={token.chainId} className="!py-1" />
            {isV4 ? (
              <span className="chip border-coil-500/40 text-coil-400">
                <IconBolt size={12} /> v4
              </span>
            ) : token.mode === "v3" ? (
              <span className="chip border-coil-500/40 text-coil-400">
                <IconBolt size={12} /> V3
              </span>
            ) : token.graduated ? (
              <span className="chip border-coil-500/40 text-coil-400">
                <IconSparkle size={12} /> Graduated
              </span>
            ) : null}
            {token.creatorFees && (
              <span className="chip border-spark/40 text-spark" title="Trade fees pay the creator, not holders">
                <IconCrown size={12} /> Creator Rewards
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(token.address)}
            title={`Copy contract address\n${token.address}`}
            className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-4 underline decoration-dotted transition hover:text-ink"
          >
            {shortAddr(token.address)} <IconCopy size={12} />
          </button>
          <p className="mt-1 max-w-xl text-sm text-ink-3">
            {meta?.description || token.description}
          </p>
          <p className="mt-1 text-xs text-ink-4">
            {token.createdAt ? (
              <>Created {fullDateTime(token.createdAt)} · {timeAgo(token.createdAt)} · </>
            ) : null}
            by{" "}
            <Link
              href={`/u/${token.creator.toLowerCase()}`}
              className="font-mono text-coil-400/80 hover:text-coil-400 hover:underline"
              title="View the creator's profile"
            >
              {shortAddr(token.creator)}
            </Link>
          </p>
          <SocialLinks
            website={meta?.website}
            twitter={meta?.twitter}
            telegram={meta?.telegram}
            className="mt-2"
          />
        </div>
        {/* Left-aligned once it has wrapped onto its own line; right-aligned beside the title. */}
        <div className="w-full sm:w-auto sm:text-right">
          <div className="label">Marketcap</div>
          <div className="stat-value text-gradient !text-3xl">
            {usdFromEth(token.marketCapRh, ethUsd)}
          </div>
          <button
            onClick={() => setShareOpen(true)}
            className="btn-ghost mt-2 !px-3 !py-1.5 text-xs"
            title="Share this coin"
          >
            <IconShare size={13} /> Share
          </button>
        </div>
      </div>

      <ShareModal token={token} open={shareOpen} onClose={() => setShareOpen(false)} />

      {/*
        Three grid children, not two, so the buy box can sit between the chart and the tables.
        As a two-column stack the actions column came last in the DOM, which is right on desktop
        but put the Buy button ~2,600px down the page on a phone — below the chart, the curve, the
        trade table, the holder table and the chat. Splitting the market column in two lets the
        natural mobile order be chart → trade → detail, while `lg:row-span-2` keeps the actions
        column full-height (and sticky) on desktop exactly as before.
      */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Market data — headline numbers and the chart */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Marketcap is the header's hero number; repeating it here just spent a tile. */}
            <StatTile label="ATH" value={usdFromEth(athEth, ethUsd)} />
            <StatTile label="24h Volume" value={usdFromEth(vol24, ethUsd)} />
            <StatTile label="Rewards pool" value={usdFromEth(totalFeesEth, ethUsd)} />
            <StatTile label="Holders" value={compact(token.holders, 0)} />
          </div>

          {/* Chart: DexScreener when it indexes the market (V3/graduated pairs by address, v4
              pools by PoolId), else our on-chain candle/marketcap charts. */}
          {isV4 && dexHasV4 && v4PoolId ? (
            // v4 pools have no standalone contract — DexScreener indexes them by PoolId, so we
            // probe its API first and only embed when the pool is actually indexed.
            <DexScreenerChart pair={v4PoolId} />
          ) : (token.mode === "v3" || token.graduated) && dexscreenerEmbedUrl(token.pair, token.chainId) ? (
            // V3 launches chart on DexScreener from their very first trade; curve
            // tokens switch to it after graduating.
            <DexScreenerChart pair={token.pair} />
          ) : LIVE && activity.candles.length > 0 ? (
            <CandleChart candles={activity.candles} ethUsd={ethUsd} />
          ) : (
            <MarketcapChart series={series} ethUsd={ethUsd} />
          )}
        </div>

        {/* Actions — first thing after the chart on a phone, sticky sidebar on desktop */}
        <div className="space-y-6 lg:row-span-2 lg:sticky lg:top-20 lg:self-start">
          {isV4 ? (
            <>
              <V4TradeWidget token={token} ethUsd={ethUsd} />
              <RewardsPanel token={token} />
            </>
          ) : token.mode === "v3" && v3QuoteOf(token.chainId) ? (
            // Instant-V3 on a facade-quoted chain (Arc): ERC20 approve + ArcSwapRouter, no
            // wrap/unwrap legs — a different enough flow to deserve its own widget.
            <>
              <ArcV3TradeWidget token={token} />
              <RewardsPanel token={token} />
            </>
          ) : (
            <>
              <TradeWidget token={token} />
              <RewardsPanel token={token} />
            </>
          )}
        </div>

        {/* Detail — pool status, trades, holders, chat */}
        <div className="space-y-6">
          {/* Market status: v4 hook pool, V3 pool, graduated, or bonding-curve progress */}
          {isV4 ? (
            <div className="glass p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 className="font-semibold">Uniswap v4 pool</h3>
                <span className="text-xs text-ink-3">native per-swap fee · liquidity locked</span>
              </div>
              <div className="rounded-xl bg-coil-500/10 p-4 text-center text-sm text-coil-400">
                This token launched straight into a Uniswap v4 pool. Its liquidity is locked forever
                (the hook owns it and renounced ownership), and every swap pays a native fee split
                on-chain between holders, the protocol, and the $COIL buy&amp;burn — no harvest step.
              </div>
            </div>
          ) : token.mode === "v3" ? (
            <div className="glass p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 className="font-semibold">Uniswap V3 pool</h3>
                <span className="text-xs text-ink-3">1% pool fee · liquidity locked</span>
              </div>
              <div className="rounded-xl bg-coil-500/10 p-4 text-center text-sm text-coil-400">
                This token launched straight into a Uniswap V3 pool — no bonding curve. Its
                liquidity is locked forever; the pool&apos;s 1% swap fee is harvested for the
                protocol and streamed to holders.
              </div>
              <HarvestFees token={token} />
            </div>
          ) : (
            <div className="glass p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 className="font-semibold">Bonding curve</h3>
                <span className="text-xs text-ink-3">
                  Graduates at 4 {NATIVE_SYMBOL} raised · max buy 2%
                </span>
              </div>
              {token.graduated ? (
                <div className="rounded-xl bg-coil-500/10 p-4 text-center text-sm text-coil-400">
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
              <div className="px-5 py-8 text-center text-xs text-ink-4">
                {LIVE && activity.isLoading ? "Loading trades…" : "No trades yet. Be the first."}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-obsidian-850/90 text-left text-xs text-ink-4">
                    <tr>
                      <th className="px-5 py-2 font-medium">Type</th>
                      {/* The TOKEN'S chain's coin, not the legacy global (which is Robinhood's
                          ETH — wrong on a USDC-gas chain's trades table). */}
                      <th className="px-5 py-2 font-medium">
                        {chainConfig(token.chainId ?? chainId).nativeSymbol}
                      </th>
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
                          <td className={`px-5 py-2 font-semibold ${t.isBuy ? "text-up" : "text-down"}`}>
                            {tx ? (
                              <a
                                href={explorerUrl("tx", tx, token.chainId ?? chainId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                title="View transaction on the explorer"
                              >
                                {t.isBuy ? "Buy" : "Sell"} <IconExternal size={11} className="inline align-[-1px]" />
                              </a>
                            ) : t.isBuy ? (
                              "Buy"
                            ) : (
                              "Sell"
                            )}
                          </td>
                          <td className="px-5 py-2 font-mono text-ink-2">{compact(t.rhAmount, 3)}</td>
                          <td className="px-5 py-2 font-mono text-ink-2">{compact(t.tokenAmount, 0)}</td>
                          <td className="px-5 py-2 font-mono text-ink-4">
                            <Link
                              href={`/u/${t.trader.toLowerCase()}`}
                              className="hover:text-coil-400 hover:underline"
                            >
                              {shortAddr(t.trader)}
                            </Link>
                          </td>
                          <td className="px-5 py-2 text-right text-xs text-ink-4">
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
              <span className="text-xs text-ink-4">{holders.length} shown</span>
            </div>
            {holders.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-ink-4">
                {LIVE && holdersData.isLoading ? "Loading holders…" : "No holders yet."}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {holders.map((h, i) => (
                  <div key={h.address} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="w-5 text-ink-4">{i + 1}</span>
                    <Link
                      href={`/u/${h.address.toLowerCase()}`}
                      className="flex-1 font-mono text-ink-3 hover:text-coil-400 hover:underline"
                    >
                      {shortAddr(h.address)}
                    </Link>
                    <span className="w-24 text-right font-mono text-ink-3">
                      {compact(h.balance, 0)} {token.symbol}
                    </span>
                    <span className="w-16 text-right font-semibold text-coil-400">
                      {pct(h.sharePct / 100)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Community chat */}
          <TokenChat token={token.address} />
        </div>
      </div>
    </div>
  );
}
