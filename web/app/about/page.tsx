"use client";

import Link from "next/link";
import { copy } from "@/lib/copy";
import { LoopDiagram } from "@/components/LoopDiagram";
import { BurnTicker } from "@/components/BurnTicker";
import { IconBurn, IconGlobe } from "@/components/Icon";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-16">
        <div>
          <span className="chip border-coil-500/30 text-coil-400">{copy.hero.kicker}</span>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Every trade <span className="text-gradient">feeds the loop.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-3">{copy.hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/create" className="btn-primary text-base">
              {copy.hero.ctaPrimary} →
            </Link>
            <Link href="/" className="btn-ghost text-base">
              {copy.hero.ctaSecondary}
            </Link>
          </div>
        </div>
        <div className="animate-float">
          <LoopDiagram />
        </div>
      </section>

      {/* Multi-chain callout */}
      <Link
        href="/create"
        className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coil-500/25 bg-gradient-to-r from-coil-500/10 to-transparent px-5 py-4 transition hover:border-coil-500/50"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coil-500/10 text-coil-400">
            <IconGlobe size={18} />
          </span>
          <div>
            <div className="text-sm font-bold text-white">
              Coil is now <span className="text-coil-400">multi-chain</span>
            </div>
            <div className="mt-0.5 text-xs text-ink-3">
              The same locked-liquidity engine, on every chain we support. Pick your network when you launch.
            </div>
          </div>
        </div>
        <span className="text-sm font-semibold text-coil-400 transition group-hover:translate-x-0.5">
          Launch a coin →
        </span>
      </Link>

      {/* Buyback & burn */}
      <section className="pt-6">
        <div className="glass-strong overflow-hidden rounded-2xl border border-coil-500/25 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-coil-500/10 text-coil-400">
              <IconBurn size={22} />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold md:text-3xl">
                Every launch buys &amp; burns <span className="text-gradient">$COIL</span>
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-3 md:text-base">
                Coil is deflationary by design. A slice of every token&apos;s protocol fees is routed
                on-chain to buy <span className="font-semibold text-white">$COIL</span> on the open
                market and burn it — permanently removing it from supply. Every new launch and every
                trade on the platform feeds the burn: more volume, more $COIL gone forever.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <BurnTicker />
          </div>
        </div>
      </section>

      {/* How the loop works */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">{copy.loop.title}</h2>
          <p className="mt-3 text-ink-3">{copy.loop.subtitle}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {copy.loop.steps.map((s, i) => (
            <div key={s.label} className="glass relative overflow-hidden p-5">
              <div className="absolute -right-3 -top-4 font-display text-7xl font-black text-white/[0.04]">
                {i + 1}
              </div>
              <div className="text-sm font-bold text-coil-400">{s.label}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{s.text}</p>
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
                <div className="mb-2 h-1 w-10 rounded-full bg-gradient-to-r from-coil-400 to-spark" />
                <h3 className="font-semibold text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">{p.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="btn-primary">
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
