"use client";

import Link from "next/link";
import type { TokenMarket } from "@/lib/types";
import { usdFromEth, timeAgo } from "@/lib/format";
import { normalizeSocial } from "@/lib/metadata";
import { useTokenMeta } from "@/lib/useMeta";
import { ProgressBar } from "./ProgressBar";
import { TokenAvatar } from "./TokenAvatar";

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
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
      className="pointer-events-auto grid h-6 w-6 place-items-center rounded-md border border-white/10 text-white/55 transition hover:border-venom-500/40 hover:text-venom-400"
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

  const badge =
    token.mode === "v3" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-venom-500/10 px-2 py-0.5 text-[10px] font-semibold text-venom-400">
        ⚡ Uniswap V3
      </span>
    ) : token.graduated ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-venom-500/10 px-2 py-0.5 text-[10px] font-semibold text-venom-400">
        ✦ Graduated
      </span>
    ) : (
      <span>{Math.round(token.graduationProgress * 100)}% to grad</span>
    );

  return (
    <div className="glass group relative p-4 transition hover:border-venom-500/40 hover:shadow-venom">
      {/* Whole-card link overlay; socials sit above it so they stay independently clickable. */}
      <Link
        href={`/token/${token.address}`}
        aria-label={token.name}
        className="absolute inset-0 z-0 rounded-2xl"
      />

      <div className="pointer-events-none relative z-10">
        <div className="flex items-center gap-3">
          <TokenAvatar
            uri={token.image}
            symbol={token.symbol}
            className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-4xl"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-white">{token.name}</div>
            <span className="chip mt-1 inline-flex !px-2 !py-0.5">{token.symbol}</span>
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

        {/* Bonding-curve tokens keep the progress bar; graduated / V3 use the compact badge below. */}
        {token.mode !== "v3" && !token.graduated && (
          <div className="mt-3">
            <ProgressBar value={token.graduationProgress} label="Bonding curve" />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-white/40">
          <div className="flex items-center gap-2">
            <span>{token.createdAt ? `⧗ ${timeAgo(token.createdAt)}` : "—"}</span>
            {hasSocials && (
              <span className="flex items-center gap-1">
                {twitter && (
                  <SocialIcon href={twitter} label="X">
                    <XIcon />
                  </SocialIcon>
                )}
                {website && (
                  <SocialIcon href={website} label="Website">
                    <GlobeIcon />
                  </SocialIcon>
                )}
              </span>
            )}
          </div>
          {badge}
        </div>
      </div>
    </div>
  );
}
