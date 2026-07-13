import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain } from "@/lib/chain";
import { publicClient, normalizeAddress } from "@/lib/server/launchpad";
import { LAUNCHPADS, LIVE, launchpadAbi, feeLockerAbi } from "@/lib/contracts";
import type { Address } from "@/lib/types";

/**
 * Automatic fee harvesting. The FeeLocker's collect() is permissionless and its
 * split is enforced on-chain, so this keeper can only ever pay gas — it cannot
 * redirect funds. The frontend pings this endpoint after V3 trades and on token
 * page views; when a position's pending ETH fees reach the threshold, the keeper
 * cranks the harvest and the holder share streams out automatically.
 *
 * Configure with:
 *   KEEPER_PRIVATE_KEY    — a fresh wallet holding a little ETH for gas ONLY
 *                           (never the protocol/owner key)
 *   HARVEST_THRESHOLD_ETH — pending ETH-side fees that trigger a harvest
 *                           (default 0.002)
 * Unset KEEPER_PRIVATE_KEY disables the keeper; the site then keeps showing the
 * manual Harvest button.
 */

const THRESHOLD_ETH = (() => {
  const raw = process.env.HARVEST_THRESHOLD_ETH ?? "0.002";
  try {
    return parseEther(raw);
  } catch {
    return parseEther("0.002");
  }
})();

// Hard spend guards, so the keeper can never bleed out:
//  - a harvest must move at least PROFIT_MULTIPLE× its own gas cost;
//  - one attempt per token per COOLDOWN;
//  - at most MAX_PER_HOUR harvests across all tokens.
// Quotes/simulations are free RPC reads — gas is only ever spent on a harvest
// that passes every guard, and each one sends 60% of the moved ETH to the
// protocol wallet (≈40× the gas), so the system is self-funding by construction.
const PROFIT_MULTIPLE = 20n;
const COOLDOWN_MS = 5 * 60_000;
const MAX_PER_HOUR = 20;

const lastAttempt = new Map<string, number>(); // token (lowercase) → ms timestamp
let hourWindowStart = 0;
let hourCount = 0;

function underHourlyCap(): boolean {
  const now = Date.now();
  if (now - hourWindowStart > 3_600_000) {
    hourWindowStart = now;
    hourCount = 0;
  }
  return hourCount < MAX_PER_HOUR;
}

function keeper() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x")) return undefined;
  try {
    const account = privateKeyToAccount(pk as `0x${string}`);
    return createWalletClient({
      account,
      chain: robinhoodChain,
      transport: http(process.env.RH_RPC_URL || robinhoodChain.rpcUrls.default.http[0]),
    });
  } catch {
    return undefined;
  }
}

const enabled = () => LIVE && !!process.env.KEEPER_PRIVATE_KEY;

/** The frontend asks whether auto-harvest is on (to hide the manual button). */
export async function GET() {
  return NextResponse.json({
    enabled: enabled(),
    thresholdEth: Number(formatEther(THRESHOLD_ETH)),
  });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ skipped: "keeper not configured" });

  let token: Address | null = null;
  try {
    const body = await req.json();
    token = normalizeAddress(body?.token);
  } catch {
    /* fall through */
  }
  if (!token) return NextResponse.json({ error: "invalid token address" }, { status: 400 });

  const key = token.toLowerCase();
  const now = Date.now();
  if (now - (lastAttempt.get(key) ?? 0) < COOLDOWN_MS) {
    return NextResponse.json({ skipped: "cooldown" });
  }
  if (!underHourlyCap()) {
    return NextResponse.json({ skipped: "hourly cap reached" });
  }
  lastAttempt.set(key, now);

  try {
    // Find the launchpad that created this token (legacy tokens live on older
    // launchpads whose FeeLocker holds their position).
    let launchpad: Address | undefined;
    for (const lp of LAUNCHPADS) {
      const idx = (await publicClient
        .readContract({
          address: lp,
          abi: launchpadAbi,
          functionName: "marketIndexByToken",
          args: [token],
        })
        .catch(() => 0n)) as bigint;
      if (idx > 0n) {
        launchpad = lp;
        break;
      }
    }
    if (!launchpad) return NextResponse.json({ error: "unknown token" }, { status: 404 });

    const isV3 = await publicClient
      .readContract({ address: launchpad, abi: launchpadAbi, functionName: "isV3Token", args: [token] })
      .then(Boolean)
      .catch(() => false);
    if (!isV3) return NextResponse.json({ skipped: "not a V3 token" });

    const locker = (await publicClient.readContract({
      address: launchpad,
      abi: launchpadAbi,
      functionName: "feeLocker",
    })) as Address;

    const locked = await publicClient.getContractEvents({
      address: locker,
      abi: feeLockerAbi,
      eventName: "PositionLocked",
      args: { token },
      fromBlock: 0n,
      toBlock: "latest",
    });
    const positionId = (locked[0]?.args as { tokenId?: bigint } | undefined)?.tokenId;
    if (positionId === undefined) return NextResponse.json({ skipped: "no locked position" });

    // Quote the pending fees by simulating collect() — nothing executes.
    const { result, request } = await publicClient.simulateContract({
      address: locker,
      abi: feeLockerAbi,
      functionName: "collect",
      args: [positionId],
      account: keeper()!.account,
    });
    const [ethSide] = result as readonly [bigint, bigint];
    if (ethSide < THRESHOLD_ETH) {
      return NextResponse.json({
        skipped: "below threshold",
        pendingEth: formatEther(ethSide),
        thresholdEth: formatEther(THRESHOLD_ETH),
      });
    }

    // Never spend gas that isn't dwarfed by the value it moves.
    const [gas, gasPrice] = await Promise.all([
      publicClient.estimateContractGas(request),
      publicClient.getGasPrice(),
    ]);
    const gasCost = gas * gasPrice;
    if (ethSide < gasCost * PROFIT_MULTIPLE) {
      return NextResponse.json({
        skipped: "gas too high vs pending fees",
        pendingEth: formatEther(ethSide),
        gasCostEth: formatEther(gasCost),
      });
    }

    hourCount += 1;
    const hash = await keeper()!.writeContract(request);
    return NextResponse.json({ harvested: true, tx: hash, ethSide: formatEther(ethSide) });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 160) : "harvest failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
