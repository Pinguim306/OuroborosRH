"use client";

import Link from "next/link";
import { copy } from "@/lib/copy";
import { compact, usdFromEth } from "@/lib/format";
import { MOCK_TOKENS } from "@/lib/mock/data";
import { LIVE } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import { useEthPrice } from "@/lib/usePrice";
import { useHolderShare, totalFeesEth } from "@/lib/useFees";
import type { TokenMarket } from "@/lib/types";
import { StatTile } from "@/components/StatTile";
import { LoopDiagram } from "@/components/LoopDiagram";
import { LivePulse } from "@/components/LivePulse";

export default function HomePage() {
  const ethUsd = useEthPrice();
  const { tokens: liveTokens } = useLiveMarkets();
  const all: TokenMarket[] = LIVE ? liveTokens : MOCK_TOKENS;

  const holderShare = useHolderShare(all.some((t) => t.mode === "v3"));
  const stats = {
    liquidityLocked: all.reduce((s, t) => s + t.liquidityRh, 0),
    rewardsPaid: all.reduce((s, t) => s + totalFeesEth(t, holderShare), 0),
    tokens: all.length,
  };

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
        <div>
          <span className="chip border-venom-500/30 text-venom-400">{copy.hero.kicker}</span>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Every trade <span className="text-gradient">feeds the loop.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/55">{copy.hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/create" className="btn-primary text-base">
              {copy.hero.ctaPrimary} →
            </Link>
            <Link href="/discover" className="btn-ghost text-base">
              {copy.hero.ctaSecondary}
            </Link>
          </div>
        </div>
        <div className="animate-float">
          <LoopDiagram />
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Liquidity locked" value={usdFromEth(stats.liquidityLocked, ethUsd, 0)} accent />
        <StatTile label="Rewards streamed" value={usdFromEth(stats.rewardsPaid, ethUsd, 0)} />
        <StatTile label="Tokens launched" value={compact(stats.tokens, 0)} />
        <StatTile label="Explore" value="Discover →" sub="Browse every token" />
      </section>

      {/* Season points callout */}
      <Link
        href="/points"
        className="group mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-venom-500/25 bg-gradient-to-r from-venom-500/10 to-transparent px-5 py-4 transition hover:border-venom-500/50"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🐍</span>
          <div>
            <div className="text-sm font-bold text-white">
              Season 1 is live — every trade earns <span className="text-venom-400">Coil Points</span>
            </div>
            <div className="mt-0.5 text-xs text-white/45">
              Trade, launch, ape early. Scored 100% from on-chain activity.
            </div>
          </div>
        </div>
        <span className="text-sm font-semibold text-venom-400 transition group-hover:translate-x-0.5">
          View the board →
        </span>
      </Link>

      {/* Live feed + King of the Hill (renders only once there is activity) */}
      {LIVE && <LivePulse tokens={all} />}

      {/* How the loop works */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">{copy.loop.title}</h2>
          <p className="mt-3 text-white/50">{copy.loop.subtitle}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {copy.loop.steps.map((s, i) => (
            <div key={s.label} className="glass relative overflow-hidden p-5">
              <div className="absolute -right-3 -top-4 font-display text-7xl font-black text-white/[0.04]">
                {i + 1}
              </div>
              <div className="text-sm font-bold text-venom-400">{s.label}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Differentiator */}
      <section className="pb-16 md:pb-24">
        <div className="glass-strong overflow-hidden p-8 md:p-12">
          <h2 className="max-w-xl font-display text-3xl font-bold md:text-4xl">
            {copy.differentiator.title}
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {copy.differentiator.points.map((p) => (
              <div key={p.title}>
                <div className="mb-2 h-1 w-10 rounded-full bg-gradient-to-r from-venom-400 to-acid" />
                <h3 className="font-semibold text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{p.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/discover" className="btn-primary">
              Explore tokens →
            </Link>
            <Link href="/create" className="btn-ghost">
              Launch your own
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
