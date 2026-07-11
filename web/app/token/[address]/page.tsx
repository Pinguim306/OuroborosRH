"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { getToken, mockTrades, mockHolders } from "@/lib/mock/data";
import { compact, rh, pct, shortAddr, timeAgo } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { StatTile } from "@/components/StatTile";
import { ProgressBar } from "@/components/ProgressBar";
import { TradeWidget } from "@/components/TradeWidget";
import { RewardsPanel } from "@/components/RewardsPanel";

export default function TokenPage() {
  const params = useParams();
  const address = Array.isArray(params.address) ? params.address[0] : params.address;
  const token = address ? getToken(address) : undefined;

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center">
        <div className="text-5xl">🕳️</div>
        <h1 className="mt-4 font-display text-2xl font-bold">Token not found</h1>
        <p className="mt-2 text-white/50">This market doesn&apos;t exist (or hasn&apos;t been indexed yet).</p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Back to the market
        </Link>
      </div>
    );
  }

  const trades = mockTrades(token);
  const holders = mockHolders(token);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-obsidian-800 text-4xl">
          {token.image}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{token.name}</h1>
            <span className="chip">{token.symbol}</span>
            {token.graduated && (
              <span className="chip border-venom-500/40 text-venom-400">✦ Graduated</span>
            )}
          </div>
          <p className="mt-1 max-w-xl text-sm text-white/50">{token.description}</p>
        </div>
        <div className="text-right">
          <div className="label">Price</div>
          <div className="stat-value text-gradient">{rh(token.priceRh, 6)}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: market data */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Market cap" value={rh(token.marketCapRh, 0)} />
            <StatTile label="Liquidity" value={rh(token.liquidityRh, 0)} accent />
            <StatTile label="Rewards pool" value={rh(token.rewardsPoolRh, 0)} />
            <StatTile label="Holders" value={compact(token.holders, 0)} />
          </div>

          {/* Bonding curve / graduation */}
          <div className="glass p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Bonding curve</h3>
              <span className="text-xs text-white/40">
                Graduates at 400 {NATIVE_SYMBOL} of real liquidity
              </span>
            </div>
            {token.graduated ? (
              <div className="rounded-xl bg-venom-500/10 p-4 text-center text-sm text-venom-400">
                This token filled its curve and graduated to a DEX. Liquidity is permanent and locked.
              </div>
            ) : (
              <ProgressBar value={token.graduationProgress} label="Progress to graduation" />
            )}
            <div className="mt-5 grid grid-cols-4 gap-3 text-center">
              <MiniStat label="→ Liquidity" value="0.6%" accent />
              <MiniStat label="→ Holders" value="0.4%" accent />
              <MiniStat label="→ Developer" value="0.5%" />
              <MiniStat label="Total fee" value="1.5%" />
            </div>
          </div>

          {/* Trades */}
          <div className="glass overflow-hidden">
            <div className="border-b border-white/5 px-5 py-3 text-sm font-semibold">Recent trades</div>
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
                  {trades.map((t) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className={`px-5 py-2 font-semibold ${t.isBuy ? "text-venom-400" : "text-red-400"}`}>
                        {t.isBuy ? "Buy" : "Sell"}
                      </td>
                      <td className="px-5 py-2 font-mono text-white/70">{compact(t.rhAmount, 3)}</td>
                      <td className="px-5 py-2 font-mono text-white/70">{compact(t.tokenAmount, 0)}</td>
                      <td className="px-5 py-2 font-mono text-white/40">{shortAddr(t.trader)}</td>
                      <td className="px-5 py-2 text-right text-xs text-white/40">{timeAgo(t.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Holders */}
          <div className="glass overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <span className="text-sm font-semibold">Top holders</span>
              <span className="text-xs text-white/40">Fees claimable (accrued, no staking)</span>
            </div>
            <div className="divide-y divide-white/5">
              {holders.map((h, i) => (
                <div key={h.address} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-5 text-white/30">{i + 1}</span>
                  <span className="flex-1 font-mono text-white/60">{shortAddr(h.address)}</span>
                  <span className="w-16 text-right text-white/50">{pct(h.sharePct / 100)}</span>
                  <span className="w-28 text-right font-mono font-semibold text-venom-400">
                    {rh(h.claimableRh, 3)}
                  </span>
                </div>
              ))}
            </div>
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

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-obsidian-900/60 p-3">
      <div className="label">{label}</div>
      <div className={`mt-0.5 font-semibold ${accent ? "text-venom-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
