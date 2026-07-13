"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { LIVE } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import { useMarketsActivity, useLaunchpadTotals } from "@/lib/useActivity";
import { useEthPrice } from "@/lib/usePrice";
import { compact, usdFromEth } from "@/lib/format";
import type { TokenMarket } from "@/lib/types";
import { TokenCard } from "@/components/TokenCard";
import { StatTile } from "@/components/StatTile";

type Mode = "trending" | "highmcap" | "volume" | "newest" | "oldest" | "lasttrade";

const MODES: [Mode, string][] = [
  ["trending", "🔥 Trending"],
  ["highmcap", "💰 Top MCap"],
  ["volume", "🔊 Volume"],
  ["newest", "✨ Newest"],
  ["oldest", "🕰️ Oldest"],
  ["lasttrade", "⚡ Last Trade"],
];

export default function DiscoverPage() {
  const [mode, setMode] = useState<Mode>("trending");
  const [q, setQ] = useState("");
  const ethUsd = useEthPrice();

  const { tokens: liveTokens, isLoading } = useLiveMarkets();
  const all: TokenMarket[] = LIVE ? liveTokens : MOCK_TOKENS;
  const stats = useMarketsActivity(all);
  const totals = useLaunchpadTotals(all, stats);

  const enriched = useMemo(
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
    const query = q.trim().toLowerCase();
    let list = query
      ? enriched.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            t.symbol.toLowerCase().includes(query) ||
            t.address.toLowerCase().includes(query),
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
  }, [enriched, q, mode]);

  // Demo totals when not live.
  const demoTotals = {
    tokens: all.length,
    volume24hEth: all.reduce((s, t) => s + t.volume24hRh, 0),
    highestAthEth: Math.max(0, ...all.map((t) => t.marketCapRh)),
    holders: all.reduce((s, t) => s + t.holders, 0),
  };
  const T = LIVE ? totals : demoTotals;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Discover</h1>
          <p className="mt-2 text-white/55">Every token in the loop. Search, sort, ape responsibly.</p>
        </div>
        <Link href="/create" className="btn-primary">
          + Launch a token
        </Link>
      </div>

      {/* Launchpad totals */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Tokens launched" value={compact(T.tokens, 0)} accent />
        <StatTile label="24h volume" value={usdFromEth(T.volume24hEth, ethUsd, 0)} />
        <StatTile label="Biggest ATH" value={usdFromEth(T.highestAthEth, ethUsd, 0)} />
        <StatTile label="Total holders" value={compact(T.holders, 0)} />
      </div>

      {/* Search + sort */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 lg:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, ticker or contract address"
            className="field !pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-obsidian-900 p-1">
          {MODES.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                mode === key ? "bg-venom-500 text-obsidian-950" : "text-white/50 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {LIVE && isLoading && filtered.length === 0 ? (
        <div className="glass mt-8 p-10 text-center text-white/50">Loading markets…</div>
      ) : filtered.length === 0 ? (
        <div className="glass mt-8 p-10 text-center text-white/50">
          {q ? "No tokens match your search." : "No tokens yet — "}
          {!q && (
            <Link href="/create" className="text-venom-400 hover:underline">
              be the first to launch →
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TokenCard key={t.address} token={t} ethUsd={ethUsd} />
          ))}
        </div>
      )}

      {LIVE && (
        <p className="mt-6 text-center text-[11px] text-white/25">
          Volume, holders &amp; last-trade read live from on-chain events.
        </p>
      )}
    </div>
  );
}
