"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { timeAgo, usdFromEth, compact } from "@/lib/format";
import { ipfsToHttp, normalizeSocial } from "@/lib/metadata";
import { LIVE, tokenAbi } from "@/lib/contracts";
import { useLiveMarkets } from "@/lib/useMarkets";
import { useWalletActivity } from "@/lib/useWalletActivity";
import { usePnL } from "@/lib/usePnL";
import { useEthPrice } from "@/lib/usePrice";
import type { Address } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { SocialLinks } from "@/components/SocialLinks";
import { StatTile } from "@/components/StatTile";
import { TokenCard } from "@/components/TokenCard";
import { TokenAvatar } from "@/components/TokenAvatar";

const EXPLORER = "https://robinhoodchain.blockscout.com";

type Profile = {
  address: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  x: string | null;
  telegram: string | null;
};

const num = (x: unknown): number => Number(formatEther(typeof x === "bigint" ? x : 0n));

export default function PublicProfilePage() {
  const params = useParams();
  const address = (Array.isArray(params.address) ? params.address[0] : params.address ?? "").toLowerCase();
  const { sessionAddress } = useAuth();
  const { address: connected } = useAccount();
  const isSelf = sessionAddress === address || connected?.toLowerCase() === address;
  const ethUsd = useEthPrice();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/profile/${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProfile(j.profile ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [address]);

  // On-chain footprint: volume + trades across every token, PnL, and dev tokens.
  const { tokens } = useLiveMarkets();
  const wallet = (address || undefined) as Address | undefined;
  const activity = useWalletActivity(tokens, wallet);
  const pnl = usePnL(tokens, wallet);

  const balancesQ = useReadContracts({
    contracts: tokens.map(
      (t) =>
        ({
          address: t.address,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [wallet ?? "0x0000000000000000000000000000000000000000"],
        }) as const,
    ),
    query: { enabled: LIVE && !!wallet && tokens.length > 0 },
  });

  // Trading PnL = current bag value + everything cashed out − everything paid in.
  const pnlEth = useMemo(() => {
    let total = 0;
    tokens.forEach((t, i) => {
      const bal = num(balancesQ.data?.[i]?.result);
      const c = pnl.get(t.address.toLowerCase());
      total += bal * t.priceRh + (c ? c.receivedEth - c.investedEth : 0);
    });
    return total;
  }, [tokens, balancesQ.data, pnl]);

  const devTokens = useMemo(
    () => tokens.filter((t) => t.creator.toLowerCase() === address),
    [tokens, address],
  );

  function copyAddr() {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Profile card */}
      <div className="glass p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-obsidian-800 text-3xl">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ipfsToHttp(profile.avatar_url)} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              "👤"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold">
              {profile?.username || (loaded ? "Unnamed trader" : "…")}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={copyAddr}
                title="Copy address"
                className="break-all text-left font-mono text-xs text-white/45 hover:text-white"
              >
                {copied ? <span className="text-venom-400">Copied ✓</span> : <>{address} ⧉</>}
              </button>
              <a
                href={`${EXPLORER}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-white/35 hover:text-venom-400"
              >
                Explorer ↗
              </a>
            </div>
          </div>
          {isSelf && (
            <Link href="/profile" className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">
              Edit
            </Link>
          )}
        </div>

        {profile?.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/60">{profile.bio}</p>}

        {profile && (profile.x || profile.telegram) && (
          <SocialLinks
            twitter={normalizeSocial("twitter", profile.x ?? undefined)}
            telegram={normalizeSocial("telegram", profile.telegram ?? undefined)}
            className="mt-4"
          />
        )}

        {loaded && !profile && (
          <p className="mt-4 text-sm text-white/40">
            This wallet hasn&apos;t set up a profile yet.
            {isSelf && (
              <>
                {" "}
                <Link href="/profile" className="text-venom-400 hover:underline">
                  Create yours →
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {/* On-chain stats */}
      {LIVE && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Trade volume"
            value={activity.isLoading ? "…" : usdFromEth(activity.volumeEth, ethUsd, 0)}
            accent
          />
          <StatTile
            label="Trading PnL"
            value={
              activity.isLoading
                ? "…"
                : `${pnlEth >= 0 ? "+" : "−"}${usdFromEth(Math.abs(pnlEth), ethUsd, 0)}`
            }
          />
          <StatTile label="Trades" value={activity.isLoading ? "…" : compact(activity.tradeCount, 0)} />
          <StatTile label="Tokens created" value={compact(devTokens.length, 0)} />
        </div>
      )}

      {/* Last trades */}
      {LIVE && (
        <div className="glass mt-6 overflow-hidden">
          <div className="border-b border-white/5 px-5 py-3 text-sm font-semibold">Last trades</div>
          {activity.isLoading ? (
            <div className="px-5 py-8 text-center text-xs text-white/35">Reading the chain…</div>
          ) : activity.trades.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-white/35">No trades yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {activity.trades.map((t) => (
                <Link
                  key={t.id}
                  href={`/token/${t.token.address}`}
                  className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/[0.03]"
                >
                  <span className={`w-10 shrink-0 font-semibold ${t.isBuy ? "text-venom-400" : "text-red-400"}`}>
                    {t.isBuy ? "Buy" : "Sell"}
                  </span>
                  <TokenAvatar
                    uri={t.token.image}
                    symbol={t.token.symbol}
                    className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-obsidian-800 text-sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-white/70">
                    {t.token.name} <span className="text-white/35">({t.token.symbol})</span>
                  </span>
                  <span className="shrink-0 font-mono text-white/70">
                    {usdFromEth(t.ethAmount, ethUsd, 2)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-white/35">
                    {t.time ? timeAgo(t.time) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dev tokens */}
      {LIVE && devTokens.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold">
            Dev tokens <span className="text-sm font-normal text-white/40">launched by this wallet</span>
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devTokens.map((t) => (
              <TokenCard key={t.address} token={t} ethUsd={ethUsd} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
