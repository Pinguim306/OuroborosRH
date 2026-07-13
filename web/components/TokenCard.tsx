"use client";

import Link from "next/link";
import type { TokenMarket } from "@/lib/types";
import { compact, usdFromEth, timeAgo } from "@/lib/format";
import { useTokenMeta } from "@/lib/useMeta";
import { ProgressBar } from "./ProgressBar";
import { TokenAvatar } from "./TokenAvatar";

export function TokenCard({ token, ethUsd = 0 }: { token: TokenMarket; ethUsd?: number }) {
  // Live tokens keep their description in the IPFS metadata JSON, not on-chain.
  const meta = useTokenMeta(token.image);
  const description = meta?.description || token.description;
  return (
    <Link
      href={`/token/${token.address}`}
      className="glass group block p-4 transition hover:border-venom-500/40 hover:shadow-venom"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar
          uri={token.image}
          symbol={token.symbol}
          className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-2xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-white">{token.name}</span>
            <span className="chip !px-2 !py-0.5">{token.symbol}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/45">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="label">Marketcap</div>
          <div className="mt-0.5 text-sm font-semibold text-white">
            {usdFromEth(token.marketCapRh, ethUsd, 0)}
          </div>
        </div>
        <div>
          <div className="label">24h Volume</div>
          <div className="mt-0.5 text-sm font-semibold text-venom-400">
            {usdFromEth(token.volume24hRh, ethUsd, 0)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {token.mode === "v3" ? (
          <div className="flex items-center justify-center gap-1.5 rounded-full bg-venom-500/10 py-1.5 text-xs font-semibold text-venom-400">
            ⚡ Live on Uniswap V3
          </div>
        ) : token.graduated ? (
          <div className="flex items-center justify-center gap-1.5 rounded-full bg-venom-500/10 py-1.5 text-xs font-semibold text-venom-400">
            ✦ Graduated to DEX
          </div>
        ) : (
          <ProgressBar value={token.graduationProgress} label="Bonding curve" />
        )}
      </div>

      <div className="mt-3 flex justify-between text-xs text-white/40">
        <span>{token.createdAt ? `⧗ ${timeAgo(token.createdAt)}` : "—"}</span>
        <span>
          {token.mode === "v3"
            ? "Instant V3 launch"
            : token.graduated
              ? "Graduated"
              : `${Math.round(token.graduationProgress * 100)}% to grad`}
        </span>
      </div>
    </Link>
  );
}
