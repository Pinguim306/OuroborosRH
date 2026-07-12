"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { LIVE } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import { useMarketsActivity } from "@/lib/useActivity";
import { useEthPrice } from "@/lib/usePrice";
import type { TokenMarket } from "@/lib/types";
import { TokenCard } from "@/components/TokenCard";

type Sort = "volume" | "newest" | "oldest" | "lasttrade";

const SORTS: [Sort, string][] = [
  ["volume", "🔊 Volume"],
  ["newest", "✨ Newest"],
  ["oldest", "🕰️ Oldest"],
  ["lasttrade", "⚡ Last Trade"],
];

export default function DiscoverPage() {
  const [sort, setSort] = useState<Sort>("volume");
  const [q, setQ] = useState("");
  const ethUsd = useEthPrice();

  const { tokens: liveTokens, isLoading } = useLiveMarkets();
  const all: TokenMarket[] = LIVE ? liveTokens : MOCK_TOKENS;
  const stats = useMarketsActivity(all);

  const enriched = useMemo(
    () =>
      all.map((t) => {
        const s = stats.get(t.address.toLowerCase());
        return {
          ...t,
          volume24hRh: LIVE ? (s?.volumeEth ?? 0) : t.volume24hRh,
          _lastTrade: LIVE ? (s?.lastTradeTime ?? 0) : t.createdAt,
        };
      }),
    [all, stats],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? enriched.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            t.symbol.toLowerCase().includes(query) ||
            t.address.toLowerCase().includes(query),
        )
      : enriched;
    const sorted = [...list];
    if (sort === "volume") sorted.sort((a, b) => b.volume24hRh - a.volume24hRh);
    else if (sort === "newest") sorted.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === "oldest") sorted.sort((a, b) => a.createdAt - b.createdAt);
    else sorted.sort((a, b) => b._lastTrade - a._lastTrade);
    return sorted;
  }, [enriched, q, sort]);

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

      {/* Search + sort */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, ticker or contract address"
            className="field !pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-obsidian-900 p-1">
          {SORTS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                sort === key ? "bg-venom-500 text-obsidian-950" : "text-white/50 hover:text-white"
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
          Volume &amp; last-trade ordering read live from on-chain events.
        </p>
      )}
    </div>
  );
}
