"use client";

import Link from "next/link";
import { formatEther } from "viem";
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { tokenAbi } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { useLiveMarkets } from "@/lib/useMarkets";
import type { TokenMarket } from "@/lib/types";
import { copy } from "@/lib/copy";
import { compact, usdFromEth } from "@/lib/format";
import { useEthPrice } from "@/lib/usePrice";
import { StatTile } from "./StatTile";
import { TokenAvatar } from "./TokenAvatar";

const num = (x: unknown): number => Number(formatEther(typeof x === "bigint" ? x : 0n));

interface Position {
  token: TokenMarket;
  balance: number;
  claimableRh: number;
}

/** Live portfolio: the user's holdings + claimable fees across all launched tokens. */
export function LivePortfolio() {
  const { address, isConnected } = useAccount();
  const { tokens, isLoading } = useLiveMarkets();
  const ethUsd = useEthPrice();

  const contracts = tokens.flatMap((t) => [
    {
      address: t.address,
      abi: tokenAbi,
      functionName: "claimableRewardOf",
      args: [address ?? "0x0000000000000000000000000000000000000000"],
    } as const,
    {
      address: t.address,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [address ?? "0x0000000000000000000000000000000000000000"],
    } as const,
  ]);

  const q = useReadContracts({ contracts, query: { enabled: !!address && tokens.length > 0 } });

  const positions: Position[] = tokens
    .map((token, i) => ({
      token,
      claimableRh: num(q.data?.[i * 2]?.result),
      balance: num(q.data?.[i * 2 + 1]?.result),
    }))
    .filter((p) => p.balance > 0 || p.claimableRh > 0);

  const totalClaimable = positions.reduce((s, p) => s + p.claimableRh, 0);

  if (!isConnected) {
    return (
      <div className="glass mt-8 p-10 text-center text-white/50">
        Connect your wallet to see your holdings and claimable fees.
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Total claimable" value={usdFromEth(totalClaimable, ethUsd, 2)} accent />
        <StatTile label="Tokens held" value={String(positions.length)} />
        <StatTile label="Staking required" value="None" sub="Rewards accrue automatically" />
      </div>

      {isLoading || q.isLoading ? (
        <div className="glass mt-8 p-10 text-center text-white/50">Loading your positions…</div>
      ) : positions.length === 0 ? (
        <div className="glass mt-8 p-10 text-center text-white/50">{copy.rewards.empty}</div>
      ) : (
        <div className="mt-8 space-y-3">
          {positions.map((p) => (
            <PositionRow key={p.token.address} position={p} ethUsd={ethUsd} />
          ))}
        </div>
      )}
    </>
  );
}

function PositionRow({ position: p, ethUsd }: { position: Position; ethUsd: number }) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || confirming;

  return (
    <div className="glass flex flex-wrap items-center gap-4 p-4 md:flex-nowrap">
      <Link href={`/token/${p.token.address}`} className="flex min-w-0 flex-1 items-center gap-3">
        <TokenAvatar
          uri={p.token.image}
          symbol={p.token.symbol}
          className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-2xl"
        />
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{p.token.name}</div>
          <div className="text-xs text-white/40">
            {compact(p.balance, 0)} {p.token.symbol} held
          </div>
        </div>
      </Link>

      <div className="text-center">
        <div className="label">Claimable</div>
        <div className="font-mono text-sm font-semibold text-venom-400">
          {usdFromEth(p.claimableRh, ethUsd, 2)}
        </div>
      </div>

      <button
        onClick={() =>
          writeContract({ chainId: CHAIN_ID, address: p.token.address, abi: tokenAbi, functionName: "claim" })
        }
        disabled={p.claimableRh <= 0 || busy}
        className="btn-ghost"
      >
        {busy ? "…" : "Claim"}
      </button>
    </div>
  );
}
