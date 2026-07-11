import Link from "next/link";
import type { TokenMarket } from "@/lib/types";
import { compact, rh } from "@/lib/format";
import { ProgressBar } from "./ProgressBar";

export function TokenCard({ token }: { token: TokenMarket }) {
  return (
    <Link
      href={`/token/${token.address}`}
      className="glass group block p-4 transition hover:border-venom-500/40 hover:shadow-venom"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-obsidian-800 text-2xl">
          {token.image}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-white">{token.name}</span>
            <span className="chip !px-2 !py-0.5">{token.symbol}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/45">
            {token.description}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="label">MCap</div>
          <div className="mt-0.5 text-sm font-semibold text-white">{rh(token.marketCapRh, 0)}</div>
        </div>
        <div>
          <div className="label">Liquidity</div>
          <div className="mt-0.5 text-sm font-semibold text-venom-400">{rh(token.liquidityRh, 0)}</div>
        </div>
        <div>
          <div className="label">APR</div>
          <div className="mt-0.5 text-sm font-semibold text-acid">{token.aprPct}%</div>
        </div>
      </div>

      <div className="mt-4">
        {token.graduated ? (
          <div className="flex items-center justify-center gap-1.5 rounded-full bg-venom-500/10 py-1.5 text-xs font-semibold text-venom-400">
            ✦ Graduated to DEX
          </div>
        ) : (
          <ProgressBar value={token.graduationProgress} label="Bonding curve" />
        )}
      </div>

      <div className="mt-3 flex justify-between text-xs text-white/40">
        <span>👥 {compact(token.holders, 0)} holders</span>
        <span>Vol {rh(token.volume24hRh, 0)}</span>
      </div>
    </Link>
  );
}
