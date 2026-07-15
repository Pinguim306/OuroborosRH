"use client";

import { useAccount } from "wagmi";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { LIVE } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import {
  usePoints,
  SEASON,
  PTS_PER_ETH_VOLUME,
  PTS_PER_LAUNCH,
  PTS_PER_ETH_CREATOR,
  PTS_EARLY_APE,
  EARLY_APE_SLOTS,
  MIN_TRADERS,
  type WalletPoints,
} from "@/lib/usePoints";
import { compact, shortAddr } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import type { TokenMarket } from "@/lib/types";

const EXPLORER = "https://robinhoodchain.blockscout.com";
const MEDALS = ["🥇", "🥈", "🥉"];

const fmt = (n: number) => compact(Math.round(n), 0);

const RULES = [
  {
    icon: "🔄",
    title: "Trade",
    pts: `${fmt(PTS_PER_ETH_VOLUME)} pts / ETH`,
    desc: "Every ETH of buy or sell volume across every Coil token.",
  },
  {
    icon: "🚀",
    title: "Launch",
    pts: `${fmt(PTS_PER_LAUNCH)} pts / token`,
    desc: "Every token you launch — launches are free, you only pay gas.",
  },
  {
    icon: "🛠️",
    title: "Build volume",
    pts: `${fmt(PTS_PER_ETH_CREATOR)} pts / ETH`,
    desc: "Every ETH of volume that tokens you created generate.",
  },
  {
    icon: "🦍",
    title: "Ape early",
    pts: `${fmt(PTS_EARLY_APE)} pts / token`,
    desc: `Be one of the first ${EARLY_APE_SLOTS} buyers of any token.`,
  },
];

export default function PointsPage() {
  const { address } = useAccount();
  const { tokens: liveTokens, isLoading: marketsLoading } = useLiveMarkets();
  const all: TokenMarket[] = LIVE ? liveTokens : MOCK_TOKENS;
  const { board, totalPoints, isLoading } = usePoints(all);

  const loading = LIVE && (marketsLoading || isLoading) && board.length === 0;
  const meIdx = address ? board.findIndex((w) => w.address.toLowerCase() === address.toLowerCase()) : -1;
  const me = meIdx >= 0 ? board[meIdx] : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="chip border-venom-500/30 text-venom-400">Season {SEASON} · live</span>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">
            Coil <span className="text-gradient">Points</span>
          </h1>
          <p className="mt-2 max-w-2xl text-white/55">
            Every trade, launch and early ape on Coil earns points. The score is computed
            purely from on-chain events — no signups, no snapshots, nothing to opt into. Just use
            the loop.
          </p>
        </div>
      </div>

      {/* How to earn */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {RULES.map((r) => (
          <div key={r.title} className="glass p-4">
            <div className="text-2xl">{r.icon}</div>
            <div className="mt-2 text-sm font-bold text-white">{r.title}</div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-venom-400">{r.pts}</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">{r.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-white/35">
        Anti-wash rule: volume only counts on tokens at least {MIN_TRADERS} distinct wallets have
        traded. Season {SEASON} counts all history since genesis.
      </p>

      {/* Your score */}
      {LIVE && address && me && (
        <div className="glass-strong mt-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="label">Your score</div>
              <div className="font-display text-3xl font-extrabold text-venom-400">
                {fmt(me.total)} <span className="text-base font-semibold text-white/40">pts</span>
              </div>
              <div className="mt-0.5 text-xs text-white/45">
                Rank #{meIdx + 1} of {board.length}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-3">
              <Breakdown label="Trading" value={me.trading} />
              <Breakdown label="Launches" value={me.launching} />
              <Breakdown label="Creator volume" value={me.creatorVolume} />
              <Breakdown label="Early ape" value={me.earlyApe} />
            </div>
          </div>
        </div>
      )}
      {LIVE && address && !me && !loading && (
        <div className="glass mt-8 p-5 text-sm text-white/50">
          Your wallet has no points yet — one trade is all it takes to get on the board.
        </div>
      )}

      {/* Season totals */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Points distributed" value={fmt(totalPoints)} accent />
        <StatTile label="Wallets on the board" value={String(board.length)} />
        <StatTile label="Season" value={`S${SEASON}`} sub="all history counts" />
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="glass mt-8 p-10 text-center text-white/50">Reading the chain…</div>
      ) : board.length === 0 ? (
        <div className="glass mt-8 p-10 text-center text-white/50">
          No points yet — the season starts with the first trade.
        </div>
      ) : (
        <div className="glass mt-8 overflow-hidden">
          <div className="border-b border-white/5 px-5 py-4">
            <h2 className="font-display text-lg font-bold">Season {SEASON} board</h2>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {board.slice(0, 25).map((w, i) => (
              <Row key={w.address} w={w} i={i} isMe={address?.toLowerCase() === w.address.toLowerCase()} />
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-white/25">
        Points are a reputation metric computed from public on-chain activity. They carry no
        guaranteed monetary value, yield, or future entitlement of any kind.
      </p>
    </div>
  );
}

function Breakdown({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/40">{label}</span>
      <span className="font-mono font-semibold text-white/75">{fmt(value)}</span>
    </div>
  );
}

function Row({ w, i, isMe }: { w: WalletPoints; i: number; isMe: boolean }) {
  return (
    <a
      href={`${EXPLORER}/address/${w.address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/[0.03] ${
        isMe ? "bg-venom-500/[0.06]" : ""
      }`}
    >
      <span className="w-8 shrink-0 text-base">{MEDALS[i] ?? i + 1}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-white/70">
        {shortAddr(w.address)}
        {isMe && <span className="ml-2 text-[10px] font-bold uppercase text-venom-400">you</span>}
      </span>
      <span className="hidden shrink-0 text-xs text-white/35 sm:inline">
        {w.volumeEth.toFixed(2)} ETH traded
      </span>
      <span className="w-24 shrink-0 text-right font-mono font-semibold text-venom-400">
        {fmt(w.total)}
      </span>
    </a>
  );
}
