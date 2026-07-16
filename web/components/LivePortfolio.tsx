"use client";

import { useEffect } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { coilHookAbi, tokenAbi } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { useLiveMarkets } from "@/lib/useMarkets";
import { usePnL, type TokenPnl } from "@/lib/usePnL";
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

  // Pending-rewards getter differs by mode: v3/curve dividend tokens expose `claimableRewardOf`
  // (ETH only); v4 hooks expose `pendingOf` (ETH + token side). `claim()` is the same on both.
  const contracts = tokens.flatMap((t) => [
    t.mode === "v4"
      ? ({
          address: t.address,
          abi: coilHookAbi,
          functionName: "pendingOf",
          args: [address ?? "0x0000000000000000000000000000000000000000"],
        } as const)
      : ({
          address: t.address,
          abi: tokenAbi,
          functionName: "claimableRewardOf",
          args: [address ?? "0x0000000000000000000000000000000000000000"],
        } as const),
    {
      address: t.address,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [address ?? "0x0000000000000000000000000000000000000000"],
    } as const,
  ]);

  const q = useReadContracts({ contracts, query: { enabled: !!address && tokens.length > 0 } });

  const positions: Position[] = tokens
    .map((token, i) => {
      const raw = q.data?.[i * 2]?.result;
      // v4 pendingOf → [owedETH, owedTOKEN]; value the token side at spot so one number covers both.
      const claimableRh =
        token.mode === "v4"
          ? (() => {
              const pair = raw as readonly [bigint, bigint] | undefined;
              return num(pair?.[0]) + num(pair?.[1]) * token.priceRh;
            })()
          : num(raw);
      return {
        token,
        claimableRh,
        balance: num(q.data?.[i * 2 + 1]?.result),
      };
    })
    .filter((p) => p.balance > 0 || p.claimableRh > 0);

  // Trading PnL (cost basis from on-chain events) for the held tokens only.
  const pnl = usePnL(
    positions.map((p) => p.token),
    address,
  );

  // Creator Rewards earnings: v4 tokens this wallet launched in creator mode accrue the holder
  // fee slice to a creator bucket inside the hook — swept to the creator by a permissionless
  // sweepCreator() ("Collect"; whoever cranks it, the money always goes to the creator).
  const myCreatorTokens = tokens.filter(
    (t) =>
      t.mode === "v4" &&
      t.creatorFees &&
      !!address &&
      t.creator.toLowerCase() === address.toLowerCase(),
  );
  const creatorQ = useReadContracts({
    contracts: myCreatorTokens.flatMap(
      (t) =>
        [
          { address: t.address, abi: coilHookAbi, functionName: "creatorAccruedETH" },
          { address: t.address, abi: coilHookAbi, functionName: "creatorAccruedTOKEN" },
        ] as const,
    ),
    query: { enabled: !!address && myCreatorTokens.length > 0, refetchInterval: 30_000 },
  });
  const creatorRows = myCreatorTokens.map((t, i) => ({
    token: t,
    accruedEth: num(creatorQ.data?.[i * 2]?.result),
    accruedTok: num(creatorQ.data?.[i * 2 + 1]?.result),
  }));

  const totalClaimable = positions.reduce((s, p) => s + p.claimableRh, 0);
  const totalValue = positions.reduce((s, p) => s + p.balance * p.token.priceRh, 0);
  const totalNetPnl = positions.reduce((s, p) => {
    const c = pnl.get(p.token.address.toLowerCase());
    if (!c) return s;
    return s + p.balance * p.token.priceRh + c.receivedEth - c.investedEth;
  }, 0);

  if (!isConnected) {
    return (
      <div className="glass mt-8 p-10 text-center text-white/50">
        Connect your wallet to see your holdings and claimable fees.
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total claimable" value={usdFromEth(totalClaimable, ethUsd, 2)} accent />
        <StatTile label="Portfolio value" value={usdFromEth(totalValue, ethUsd, 2)} />
        <StatTile
          label="Trading PnL"
          value={`${totalNetPnl >= 0 ? "+" : "−"}${usdFromEth(Math.abs(totalNetPnl), ethUsd, 2)}`}
          sub={totalNetPnl >= 0 ? "in profit" : "underwater"}
        />
        <StatTile label="Tokens held" value={String(positions.length)} />
      </div>

      {isLoading || q.isLoading ? (
        <div className="glass mt-8 p-10 text-center text-white/50">Loading your positions…</div>
      ) : positions.length === 0 ? (
        <div className="glass mt-8 p-10 text-center text-white/50">{copy.rewards.empty}</div>
      ) : (
        <div className="mt-8 space-y-3">
          {positions.map((p) => (
            <PositionRow
              key={p.token.address}
              position={p}
              ethUsd={ethUsd}
              pnl={pnl.get(p.token.address.toLowerCase())}
            />
          ))}
        </div>
      )}

      {creatorRows.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-lg font-bold">👑 Creator earnings</h2>
          <p className="mt-1 text-xs text-white/45">
            Your Creator Rewards tokens pay the holder fee slice straight to your wallet.
            &ldquo;Collect&rdquo; pushes anything accrued — it always pays the creator, whoever
            clicks it.
          </p>
          <div className="mt-4 space-y-3">
            {creatorRows.map((r) => (
              <CreatorRow key={r.token.address} row={r} ethUsd={ethUsd} onCollected={() => creatorQ.refetch()} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CreatorRow({
  row,
  ethUsd,
  onCollected,
}: {
  row: { token: TokenMarket; accruedEth: number; accruedTok: number };
  ethUsd: number;
  onCollected: () => void;
}) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || confirming;

  useEffect(() => {
    if (isSuccess) onCollected();
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalEth = row.accruedEth + row.accruedTok * row.token.priceRh;

  return (
    <div className="glass flex flex-wrap items-center gap-4 p-4 md:flex-nowrap">
      <Link href={`/token/${row.token.address}`} className="flex min-w-0 flex-1 items-center gap-3">
        <TokenAvatar
          uri={row.token.image}
          symbol={row.token.symbol}
          className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-2xl"
        />
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{row.token.name}</div>
          <div className="text-xs text-acid">👑 Creator Rewards</div>
        </div>
      </Link>

      <div className="text-center">
        <div className="label">Accrued</div>
        <div className="font-mono text-sm font-semibold text-venom-400">
          {usdFromEth(totalEth, ethUsd, 2)}
        </div>
      </div>

      <button
        onClick={() =>
          writeContract({
            chainId: CHAIN_ID,
            address: row.token.address,
            abi: coilHookAbi,
            functionName: "sweepCreator",
          })
        }
        disabled={totalEth <= 0 || busy}
        className="btn-ghost"
      >
        {busy ? "…" : isSuccess ? "✓ Collected" : "Collect"}
      </button>
    </div>
  );
}

function PositionRow({
  position: p,
  ethUsd,
  pnl,
}: {
  position: Position;
  ethUsd: number;
  pnl?: TokenPnl;
}) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || confirming;

  const valueEth = p.balance * p.token.priceRh;
  // Trading PnL: what the bag is worth now + everything cashed out − everything
  // paid in. Claimed holder rewards aren't part of it.
  const netEth = pnl ? valueEth + pnl.receivedEth - pnl.investedEth : undefined;

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
        <div className="label">Value</div>
        <div className="font-mono text-sm font-semibold text-white/80">
          {usdFromEth(valueEth, ethUsd, 2)}
        </div>
      </div>

      {netEth !== undefined && (
        <div className="text-center">
          <div className="label">PnL</div>
          <div
            className={`font-mono text-sm font-semibold ${netEth >= 0 ? "text-venom-400" : "text-red-400"}`}
          >
            {netEth >= 0 ? "+" : "−"}
            {usdFromEth(Math.abs(netEth), ethUsd, 2)}
          </div>
        </div>
      )}

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
