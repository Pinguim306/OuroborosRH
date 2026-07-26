"use client";

import Link from "next/link";
import type { TokenMarket } from "@/lib/types";
import { usdFromEth, timeAgo } from "@/lib/format";
import { normalizeSocial } from "@/lib/metadata";
import { useTokenMeta } from "@/lib/useMeta";
import { ProgressBar } from "./ProgressBar";
import { TokenAvatar } from "./TokenAvatar";
import { ChainBadge } from "./ChainBadge";
import { IconBolt, IconClock, IconGlobe, IconSparkle } from "./Icon";
import { chainParam } from "@/lib/chain";

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

function SocialIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className="pointer-events-auto grid h-6 w-6 place-items-center rounded-md border border-white/10 text-ink-3 transition hover:border-coil-500/40 hover:text-coil-400"
    >
      {children}
    </a>
  );
}

export function TokenCard({ token, ethUsd = 0 }: { token: TokenMarket; ethUsd?: number }) {
  // Live tokens keep their socials in the IPFS metadata JSON, not on-chain.
  const meta = useTokenMeta(token.image);
  // Prefer the resolved IPFS metadata (live tokens); fall back to any on-chain/demo socials.
  const twitter = meta?.twitter ?? normalizeSocial("twitter", token.socials?.x);
  const website = meta?.website ?? normalizeSocial("website", token.socials?.website);
  const hasSocials = !!(twitter || website);

  // Bonding-curve coins show a progress bar, which already states the percentage — so the badge
  // slot stays empty for them instead of printing "95%" a second line below "95%".
  const onCurve = token.mode !== "v3" && token.mode !== "v4" && !token.graduated;

  const badge =
    token.mode === "v4" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-coil-500/10 px-2 py-0.5 text-[10px] font-semibold text-coil-400">
        <IconBolt size={11} /> Uniswap v4
      </span>
    ) : token.mode === "v3" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-coil-500/10 px-2 py-0.5 text-[10px] font-semibold text-coil-400">
        <IconBolt size={11} /> Uniswap V3
      </span>
    ) : token.graduated ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-coil-500/10 px-2 py-0.5 text-[10px] font-semibold text-coil-400">
        <IconSparkle size={11} /> Graduated
      </span>
    ) : null;

  return (
    <div className="glass lift group relative p-4 hover:border-coil-500/40 hover:shadow-coil">
      {/* Whole-card link overlay; socials sit above it so they stay independently clickable. */}
      <Link
        href={`/token/${token.address}${chainParam(token.chainId)}`}
        aria-label={token.name}
        className="absolute inset-0 z-0 rounded-2xl"
      />

      <div className="pointer-events-none relative z-10">
        <div className="flex items-start gap-3">
          <TokenAvatar
            uri={token.image}
            symbol={token.symbol}
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-3xl"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-ink">{token.name}</div>
            {/* Ticker and network read together: on a multi-chain launchpad the same ticker can
                exist on more than one network, and they are different markets. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="chip !px-2 !py-0.5">{token.symbol}</span>
              <ChainBadge chainId={token.chainId} />
            </div>
            {badge && <div className="mt-1.5">{badge}</div>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="label">Marketcap</div>
            <div className="tabular mt-0.5 text-sm font-semibold text-ink">
              {usdFromEth(token.marketCapRh, ethUsd, 0)}
            </div>
          </div>
          <div>
            <div className="label">24h Volume</div>
            <div className="tabular mt-0.5 text-sm font-semibold text-coil-400">
              {usdFromEth(token.volume24hRh, ethUsd, 0)}
            </div>
          </div>
        </div>

        {onCurve && (
          <div className="mt-3">
            <ProgressBar value={token.graduationProgress} label="Bonding curve" />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1">
            <IconClock size={12} />
            {token.createdAt ? timeAgo(token.createdAt) : "—"}
          </span>
          {hasSocials && (
            <span className="flex items-center gap-1">
              {twitter && (
                <SocialIcon href={twitter} label="X">
                  <XIcon />
                </SocialIcon>
              )}
              {website && (
                <SocialIcon href={website} label="Website">
                  <IconGlobe size={13} />
                </SocialIcon>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
