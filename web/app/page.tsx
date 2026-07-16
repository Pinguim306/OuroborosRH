"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { LIVE } from "@/lib/contracts";
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

type Mode = "trending" | "newest" | "highmcap" | "volume" | "oldest" | "lasttrade";

const MODES: [Mode, string][] = [
  ["trending", "🔥 Movers"],
  ["newest", "✨ New"],
  ["highmcap", "💰 Market cap"],
  ["volume", "🔊 Volume"],
  ["oldest", "🕰️ Oldest"],
  ["lasttrade", "⚡ Last trade"],
];

type Enriched = TokenMarket & { _volumeTotal: number; _lastBlock: number };

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("trending");
  const [view, setView] = useState<"grid" | "table">("grid");
  const { query } = useSearch();
  const ethUsd = useEthPrice();

  const { tokens: liveTokens, isLoading } = useLiveMarkets();
  const all: TokenMarket[] = LIVE ? liveTokens : MOCK_TOKENS;
  const stats = useMarketsActivity(all);
  const totals = useLaunchpadTotals(all, stats);

  const enriched: Enriched[] = useMemo(
    () =>
      all.map((t) => {
        const s = stats.get(t.address.toLowerCase());
        return {
          ...t,
          volume24hRh: LIVE ? (s?.volume24hEth ?? 0) : t.volume24hRh,
          _volumeTotal: LIVE ? (s?.volumeEth ?? 0) : t.volume24hRh,
          _lastBlock: LIVE ? (s?.lastBlock ?? 0) : t.createdAt,
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
  const T = LIVE ? totals : demoTotals;

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
                  view === v ? "bg-venom-500 text-obsidian-950" : "text-white/50 hover:text-white"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {MODES.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                mode === key
                  ? "bg-venom-500/15 text-venom-400"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
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
        {LIVE && isLoading && filtered.length === 0 ? (
          <div className="glass mt-6 p-10 text-center text-white/50">Loading markets…</div>
        ) : filtered.length === 0 ? (
          <div className="glass mt-6 p-10 text-center text-white/50">
            {query ? "No coins match your search." : "No coins yet — "}
            {!query && (
              <Link href="/create" className="text-venom-400 hover:underline">
                be the first to launch →
              </Link>
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

        {LIVE && (
          <p className="mt-6 text-center text-[11px] text-white/25">
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
      href={`/token/${token.address}`}
      className="group relative block h-36 overflow-hidden rounded-2xl border border-white/10 transition hover:border-venom-500/40"
    >
      <TokenAvatar
        uri={token.image}
        symbol={token.symbol}
        className="absolute inset-0 grid place-items-center bg-obsidian-800 text-4xl"
        imgClassName="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="inline-flex rounded-md bg-black/50 px-1.5 py-0.5 text-sm font-bold text-white backdrop-blur-sm">
          {usdFromEth(token.marketCapRh, ethUsd, 0)}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="truncate font-semibold text-white">{token.name}</span>
          <span className="chip !border-white/20 !px-1.5 !py-0 text-[10px]">{token.symbol}</span>
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
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
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
                <Link href={`/token/${t.address}`} className="flex items-center gap-3">
                  <TokenAvatar
                    uri={t.image}
                    symbol={t.symbol}
                    className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-obsidian-800 text-lg"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{t.name}</span>
                    <span className="block text-xs text-white/40">{t.symbol}</span>
                  </span>
                </Link>
              </td>
              <td className="py-2.5 font-semibold text-white">{usdFromEth(t.marketCapRh, ethUsd, 0)}</td>
              <td className="py-2.5 font-semibold text-venom-400">{usdFromEth(t.volume24hRh, ethUsd, 0)}</td>
              <td className="py-2.5 text-white/70">{compact(t.holders, 0)}</td>
              <td className="py-2.5 pr-2 text-white/40">{t.createdAt ? timeAgo(t.createdAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
