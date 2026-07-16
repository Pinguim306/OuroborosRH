"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, zeroAddress, type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { CHAIN_ID, NATIVE_SYMBOL } from "@/lib/chain";
import {
  COIL_LAUNCHPAD,
  COIL_SWAP_ROUTER,
  LAUNCH_LIVE,
  SWAP_LIVE,
  coilLaunchpadV4Abi,
  coilPoolKey,
  coilSwapRouterAbi,
} from "@/lib/contracts";
import { mineSalt } from "@/lib/mineSalt";
import { WalletButton } from "./WalletButton";

type Phase = "idle" | "uploading" | "mining" | "submitting" | "done" | "error";

/**
 * The v4 launch engine, embedded in the /create screen's "Uniswap v4" mode. The name, symbol,
 * rewards choice and metadata (image + socials, pinned to IPFS) all come from the shared create
 * form via props, so a v4 launch carries the same rich metadata as a V3 one. This component owns
 * only the v4-specific mechanics: build the metadata URI, mine the CREATE2 salt so the CoilHook
 * lands on a flag-encoded address, then call `createTokenV4`. The mined address IS the
 * token/pool/hook — shown as soon as it's found.
 */
export function LaunchWidget({
  name,
  symbol,
  creatorRewards,
  devBuyWei,
  buildMetadataURI,
}: {
  name: string;
  symbol: string;
  creatorRewards: boolean;
  /** Optional dev buy (in wei). v4 can't buy atomically in the launch tx, so if set we fire a
   *  follow-up buy through the CoilSwapRouter once the launch confirms. */
  devBuyWei: bigint;
  /** Uploads image + pins metadata JSON, returning the on-chain metadataURI ("" if nothing to pin).
   *  Throws with a message on failure. Shared with the V3 flow. */
  buildMetadataURI: () => Promise<string>;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>("idle");
  const [tried, setTried] = useState(0);
  const [tokenAddr, setTokenAddr] = useState<Address | null>(null);
  const [hash, setHash] = useState<Hex | undefined>();
  const [err, setErr] = useState<string | null>(null);

  // Dev buy (v4): fired as a separate tx after the launch confirms.
  const [buyHash, setBuyHash] = useState<Hex | undefined>();
  const [buyNote, setBuyNote] = useState<string | null>(null);
  const buyStartedRef = useRef(false);

  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { isLoading: buyConfirming, isSuccess: buySuccess } = useWaitForTransactionReceipt({
    hash: buyHash,
  });

  // Ping the Telegram announcement endpoint once the launch confirms. Fire-and-forget — the
  // endpoint re-verifies everything on-chain and no-ops when the bot isn't configured.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!isSuccess || !tokenAddr || announcedRef.current) return;
    announcedRef.current = true;
    fetch("/api/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenAddr }),
    }).catch(() => {});
  }, [isSuccess, tokenAddr]);

  // Once the launch is mined, fire the optional dev buy as a second tx (v4 can't do it atomically).
  // The launch already succeeded, so a failed/declined dev buy is a soft note, never a hard error.
  useEffect(() => {
    if (!isSuccess || buyStartedRef.current) return;
    if (devBuyWei <= 0n || !tokenAddr || !address) return;
    buyStartedRef.current = true;
    if (!SWAP_LIVE) {
      setBuyNote("Dev buy skipped — swap router not configured. Buy manually on the Swap tab.");
      return;
    }
    (async () => {
      try {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
        const bh = await writeContractAsync({
          chainId: CHAIN_ID,
          address: COIL_SWAP_ROUTER,
          abi: coilSwapRouterAbi,
          functionName: "swapExactInSingle",
          args: [coilPoolKey(tokenAddr), true, devBuyWei, 0n, address, deadline],
          value: devBuyWei,
        });
        setBuyHash(bh);
      } catch (e) {
        setBuyNote(
          (e as { shortMessage?: string }).shortMessage ??
            "Dev buy didn't go through — you can still buy on the Swap tab.",
        );
      }
    })();
  }, [isSuccess, tokenAddr, address, devBuyWei, writeContractAsync]);

  async function launch() {
    if (!publicClient || !isConnected || !address) return;
    if (!name.trim() || !symbol.trim()) {
      setErr("Name and symbol are required.");
      return;
    }
    setErr(null);
    setTokenAddr(null);
    try {
      const creator = creatorRewards ? address : zeroAddress;

      // 0. Pin the metadata (image + socials) the same way the V3 flow does.
      setPhase("uploading");
      const metadataURI = await buildMetadataURI();

      // 1. Exact init-code hash for THIS launch (name/symbol/creator baked in).
      const initCodeHash = (await publicClient.readContract({
        address: COIL_LAUNCHPAD,
        abi: coilLaunchpadV4Abi,
        functionName: "hookInitCodeHash",
        args: [name, symbol, creator],
      })) as Hex;

      // 2. Mine the salt so the hook address carries the required flags.
      setPhase("mining");
      setTried(0);
      const { salt, address: mined } = await mineSalt(COIL_LAUNCHPAD, initCodeHash, setTried);
      setTokenAddr(mined);

      // 3. Fetch the creation fee and launch.
      const creationFee = (await publicClient.readContract({
        address: COIL_LAUNCHPAD,
        abi: coilLaunchpadV4Abi,
        functionName: "creationFee",
      })) as bigint;

      setPhase("submitting");
      const txHash = await writeContractAsync({
        chainId: CHAIN_ID,
        address: COIL_LAUNCHPAD,
        abi: coilLaunchpadV4Abi,
        functionName: "createTokenV4",
        args: [name, symbol, metadataURI, salt, creatorRewards],
        value: creationFee,
      });
      setHash(txHash);
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setErr(
        (e as { shortMessage?: string; message?: string }).shortMessage ??
          (e as Error).message ??
          "Launch failed.",
      );
    }
  }

  if (!LAUNCH_LIVE) {
    return (
      <div className="mt-6 rounded-xl border border-white/10 bg-obsidian-900/60 p-4 text-sm text-white/70">
        The v4 launch factory isn&apos;t configured yet. Set{" "}
        <code className="text-venom-400">NEXT_PUBLIC_COIL_LAUNCHPAD</code> once it&apos;s deployed.
      </div>
    );
  }

  const busy = phase === "uploading" || phase === "mining" || phase === "submitting" || confirming;
  const label =
    phase === "uploading"
      ? "Uploading…"
      : phase === "mining"
        ? "Mining address…"
        : phase === "submitting" || confirming
          ? "Launching…"
          : "Launch token";

  return (
    <div className="mt-6 space-y-4">
      {phase === "mining" && (
        <div className="rounded-xl border border-white/5 bg-obsidian-900/60 p-3 text-sm text-white/60">
          Mining hook address… <span className="text-venom-400">{tried.toLocaleString()}</span> tried
        </div>
      )}
      {tokenAddr && (
        <div className="rounded-xl border border-venom-500/20 bg-obsidian-900/60 p-3 text-sm">
          <div className="label">Token address</div>
          <div className="mt-1 break-all font-mono text-venom-400">{tokenAddr}</div>
          {isSuccess && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                <Link href={`/token/${tokenAddr}`} className="text-venom-400 hover:underline">
                  Open your token ↗
                </Link>
                <a
                  href={`https://robinhoodchain.blockscout.com/token/${tokenAddr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-venom-400 hover:underline"
                >
                  Explorer ↗
                </a>
              </div>
              <div className="mt-1 text-xs text-white/50">Live ✓ — tradable on the Swap tab.</div>
              {devBuyWei > 0n && (
                <div className="mt-2 border-t border-white/5 pt-2 text-xs">
                  {buySuccess ? (
                    <span className="text-venom-400">
                      Dev buy done ✓ — bought {formatEther(devBuyWei)} {NATIVE_SYMBOL} of ${symbol}.
                    </span>
                  ) : buyConfirming || buyHash ? (
                    <span className="text-white/50">
                      Confirming your {formatEther(devBuyWei)} {NATIVE_SYMBOL} dev buy…
                    </span>
                  ) : buyNote ? (
                    <span className="text-amber-400">{buyNote}</span>
                  ) : (
                    <span className="text-white/50">Approve the dev buy in your wallet…</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!isConnected ? (
        <WalletButton />
      ) : (
        <button
          className="btn-primary w-full text-base"
          disabled={busy || !name.trim() || !symbol.trim()}
          onClick={launch}
        >
          {label}
        </button>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}
      <p className="text-center text-[11px] text-white/30">
        {devBuyWei > 0n
          ? "Two transactions: deploy the token into a live v4 pool (liquidity locked, ownership renounced), then your dev buy through Coil Swap."
          : "One transaction: deploys the token into a live v4 pool, seeds all liquidity, renounces ownership."}
      </p>
    </div>
  );
}
