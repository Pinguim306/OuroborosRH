"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { ANY_LIVE, coilContracts } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import { useMarketsActivity, useLaunchpadTotals } from "@/lib/useActivity";
import { useEthPrice } from "@/lib/usePrice";
import { compact, usdFromEth, timeAgo } from "@/lib/format";
import type { TokenMarket } from "@/lib/types";
import { TokenCard } from "@/components/TokenCard";
import { BurnTicker } from "@/components/BurnTicker";
import { TokenAvatar } from "@/components/TokenAvatar";
import { StatTile } from "@/components/StatTile";
import { useSearch } from "@/components/SearchProvider";
import { useSelectedChainId } from "@/lib/useSelectedChain";
import { chainConfig } from "@/lib/chain";
import { chainParam, marketKey } from "@/lib/chain";
import { ChainBadge } from "@/components/ChainBadge";
import { IconBolt, IconClock, IconCoins, IconFlame, IconPlus, IconSparkle, IconVolume } from "@/components/Icon";

type Mode = "trending" | "newest" | "highmcap" | "volume" | "oldest" | "lasttrade";

/** Sort tabs. Icons rather than emoji so the active tab can tint the glyph along with its label. */
const MODES: [Mode, string, (p: { size?: number }) => React.ReactElement][] = [
  ["trending", "Movers", IconFlame],
  ["newest", "New", IconSparkle],
  ["highmcap", "Market cap", IconCoins],
  ["volume", "Volume", IconVolume],
  ["oldest", "Oldest", IconClock],
  ["lasttrade", "Last trade", IconBolt],
];

type Enriched = TokenMarket & { _volumeTotal: number; _lastBlock: number };

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("trending");
  const [view, setView] = useState<"grid" | "table">("grid");
  const { query } = useSearch();
  // Listings are scoped to ONE chain: coins on different networks are different markets with
  // different liquidity and different gas currencies, so mixing them in one grid would compare
  // prices that aren't comparable. The network picker moves the whole page.
  const chainId = useSelectedChainId();
  const ethUsd = useEthPrice(chainId);

  const { tokens: liveTokens, isLoading } = useLiveMarkets(chainId);
  const chainLive = coilContracts(chainId).anyLive;
  // Memoised: a fresh array literal each render would re-run every downstream useMemo.
  const all: TokenMarket[] = useMemo(
    () => (chainLive ? liveTokens : ANY_LIVE ? [] : MOCK_TOKENS),
    [chainLive, liveTokens],
  );
  const stats = useMarketsActivity(all);
  const totals = useLaunchpadTotals(all, stats);

  const enriched: Enriched[] = useMemo(
    () =>
      all.map((t) => {
        const s = stats.get(marketKey(t));
        return {
          ...t,
          volume24hRh: ANY_LIVE ? (s?.volume24hEth ?? 0) : t.volume24hRh,
          _volumeTotal: ANY_LIVE ? (s?.volumeEth ?? 0) : t.volume24hRh,
          _lastBlock: ANY_LIVE ? (s?.lastBlock ?? 0) : t.createdAt,
        };
      }),
    [all, stats],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? enriched.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.symbol.toLowerCase().includes(q) ||
            t.address.toLowerCase().includes(q),
        )
      : enriched;
    const sorted = [...list];
    switch (mode) {
      case "trending":
        sorted.sort((a, b) => b.volume24hRh - a.volume24hRh || b.marketCapRh - a.marketCapRh);
        break;
      case "highmcap":
        sorted.sort((a, b) => b.marketCapRh - a.marketCapRh);
        break;
      case "volume":
        sorted.sort((a, b) => b._volumeTotal - a._volumeTotal);
        break;
      case "newest":
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        sorted.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "lasttrade":
        sorted.sort((a, b) => b._lastBlock - a._lastBlock);
        break;
    }
    return sorted;
  }, [enriched, query, mode]);

  // Featured row: top movers by volume then market cap, independent of the active tab/search.
  const trending = useMemo(
    () =>
      [...enriched]
        .sort((a, b) => b.volume24hRh - a.volume24hRh || b.marketCapRh - a.marketCapRh)
        .slice(0, 4),
    [enriched],
  );

  const demoTotals = {
    tokens: all.length,
    volume24hEth: all.reduce((s, t) => s + t.volume24hRh, 0),
    volumeEth: enriched.reduce((s, t) => s + t._volumeTotal, 0),
    highestAthEth: Math.max(0, ...all.map((t) => t.marketCapRh)),
    holders: all.reduce((s, t) => s + t.holders, 0),
  };
  const T = ANY_LIVE ? totals : demoTotals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
      {/* Trending now */}
      {trending.length > 0 && !query && (
        <section>
          <h2 className="font-display text-lg font-bold tracking-tight">Trending now</h2>
          <div className="mt-3 grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 md:grid-flow-row md:auto-cols-auto md:grid-cols-4 md:overflow-visible">
            {trending.map((t) => (
              <TrendingCard key={t.address} token={t} ethUsd={ethUsd} />
            ))}
          </div>
        </section>
      )}

      {/* Explore coins */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Explore coins</h2>
          <div className="flex rounded-xl bg-obsidian-900 p-1 text-xs font-semibold">
            {(["grid", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 capitalize transition ${
                  view === v ? "bg-coil-500 text-obsidian-950" : "text-ink-3 hover:text-white"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Sort coins">
          {MODES.map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                mode === key
                  ? "bg-coil-500/15 text-coil-400"
                  : "text-ink-3 hover:bg-white/5 hover:text-ink"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Tokens launched" value={compact(T.tokens, 0)} accent />
          <StatTile label="24h volume" value={usdFromEth(T.volume24hEth, ethUsd, 0)} />
          <StatTile label="Total volume" value={usdFromEth(T.volumeEth, ethUsd, 0)} />
          <StatTile label="Total holders" value={compact(T.holders, 0)} />
        </div>

        {/* Live $COIL buyback & burn (renders only when the burner is configured) */}
        <div className="mt-3">
          <BurnTicker />
        </div>

        {/* Content */}
        {ANY_LIVE && isLoading && filtered.length === 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Skeletons at the shape of the real cards: the grid keeps its height, so the page
                doesn't jump when markets land. A centred "Loading…" line did the opposite. */}
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="glass h-[214px] animate-pulse p-4">
                <div className="flex items-center gap-3">
                  <div className="h-24 w-24 shrink-0 rounded-xl bg-white/[0.04]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-white/[0.04]" />
                    <div className="h-4 w-12 rounded-full bg-white/[0.04]" />
                  </div>
                </div>
                <div className="mt-6 h-8 rounded bg-white/[0.03]" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty mt-6">
            {query ? (
              <>
                <p className="empty-title">No coins match “{query}”</p>
                <p className="empty-body">
                  Search matches a coin&apos;s name, ticker or contract address. Try a shorter term.
                </p>
              </>
            ) : !chainLive ? (
              // The picker lets you visit a chain Coil isn't deployed on — say so plainly instead
              // of showing an empty grid that reads as a loading failure.
              <>
                <p className="empty-title">Coil isn&apos;t live on {chainConfig(chainId).chain.name} yet</p>
                <p className="empty-body">
                  Every chain has its own pools and its own liquidity. Pick another network from the
                  switcher at the top to see the coins trading there.
                </p>
              </>
            ) : (
              <>
                <p className="empty-title">No coins on {chainConfig(chainId).chain.name} yet</p>
                <p className="empty-body">
                  One transaction puts a token into a live Uniswap v4 pool with its liquidity locked
                  forever. Nothing has launched on this network so far.
                </p>
                <Link href="/create" className="btn-primary mt-1">
                  <IconPlus size={15} /> Be the first to launch
                </Link>
              </>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t) => (
              <TokenCard key={t.address} token={t} ethUsd={ethUsd} />
            ))}
          </div>
        ) : (
          <CoinTable tokens={filtered} ethUsd={ethUsd} />
        )}

        {ANY_LIVE && (
          <p className="mt-6 text-center text-[11px] text-ink-4">
            Volume, holders &amp; last-trade read live from on-chain events.
          </p>
        )}
      </section>
    </div>
  );
}

/** A featured "trending" card: cover image with the market cap and name overlaid. */
function TrendingCard({ token, ethUsd }: { token: Enriched; ethUsd: number }) {
  return (
    <Link
      href={`/token/${token.address}${chainParam(token.chainId)}`}
      className="group relative block h-36 overflow-hidden rounded-2xl border border-white/10 transition hover:border-coil-500/40"
    >
      <TokenAvatar
        uri={token.image}
        symbol={token.symbol}
        className="absolute inset-0 grid place-items-center bg-obsidian-800 text-4xl"
        imgClassName="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      {/* Which network's liquidity this is — the grid is single-chain, but a trending row is the
          first thing a visitor reads and shouldn't be ambiguous about it. */}
      <div className="absolute right-2 top-2">
        <ChainBadge chainId={token.chainId} />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="tabular text-base font-bold text-white drop-shadow">
          {usdFromEth(token.marketCapRh, ethUsd, 0)}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold text-white/95">{token.name}</span>
          <span className="chip shrink-0 !border-white/20 !bg-black/40 !px-1.5 !py-0 text-[10px]">
            {token.symbol}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Compact table view of the coin list. */
function CoinTable({ tokens, ethUsd }: { tokens: Enriched[]; ethUsd: number }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-ink-4">
            <th className="py-2 pl-2 font-medium">Coin</th>
            <th className="py-2 font-medium">Market cap</th>
            <th className="py-2 font-medium">24h vol</th>
            <th className="py-2 font-medium">Holders</th>
            <th className="py-2 pr-2 font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.address} className="border-b border-white/5 transition hover:bg-white/5">
              <td className="py-2.5 pl-2">
                <Link href={`/token/${t.address}${chainParam(t.chainId)}`} className="flex items-center gap-3">
                  <TokenAvatar
                    uri={t.image}
                    symbol={t.symbol}
                    className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-obsidian-800 text-lg"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{t.name}</span>
                    <span className="block text-xs text-ink-4">{t.symbol}</span>
                  </span>
                </Link>
              </td>
              <td className="tabular py-2.5 font-semibold text-ink">{usdFromEth(t.marketCapRh, ethUsd, 0)}</td>
              <td className="tabular py-2.5 font-semibold text-coil-400">{usdFromEth(t.volume24hRh, ethUsd, 0)}</td>
              <td className="tabular py-2.5 text-ink-2">{compact(t.holders, 0)}</td>
              <td className="py-2.5 pr-2 text-ink-3">{t.createdAt ? timeAgo(t.createdAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
