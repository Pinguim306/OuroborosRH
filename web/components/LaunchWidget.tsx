"use client";

import { useState } from "react";
import { zeroAddress, type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { CHAIN_ID } from "@/lib/chain";
import { COIL_LAUNCHPAD, LAUNCH_LIVE, coilLaunchpadV4Abi } from "@/lib/contracts";
import { mineSalt } from "@/lib/mineSalt";
import { WalletButton } from "./WalletButton";

type Phase = "idle" | "mining" | "submitting" | "done" | "error";

/**
 * Browser launch flow for a v4 Coil token. The CoilHook must land on a flag-encoded address, so we
 * read the launchpad's `hookInitCodeHash`, mine the CREATE2 salt client-side, then call
 * `createTokenV4`. The mined address IS the token/pool/hook — shown as soon as it's found.
 */
export function LaunchWidget() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [creatorRewards, setCreatorRewards] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tried, setTried] = useState(0);
  const [tokenAddr, setTokenAddr] = useState<Address | null>(null);
  const [hash, setHash] = useState<Hex | undefined>();
  const [err, setErr] = useState<string | null>(null);

  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

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
      setErr((e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "Launch failed.");
    }
  }

  if (!LAUNCH_LIVE) {
    return (
      <div className="glass-strong p-6">
        <p className="text-sm text-white/70">
          The v4 launch factory isn&apos;t configured yet. Set{" "}
          <code className="text-venom-400">NEXT_PUBLIC_COIL_LAUNCHPAD</code> once it&apos;s deployed.
        </p>
      </div>
    );
  }

  const busy = phase === "mining" || phase === "submitting" || confirming;

  return (
    <div className="glass-strong space-y-4 p-6">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Token name</label>
          <input className="field mt-1" placeholder="My Coil" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Ticker</label>
          <input
            className="field mt-1"
            placeholder="COIL"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div>
        <label className="label">Metadata URI (optional)</label>
        <input
          className="field mt-1"
          placeholder="ipfs://… or an image URL"
          value={metadataURI}
          onChange={(e) => setMetadataURI(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" checked={creatorRewards} onChange={(e) => setCreatorRewards(e.target.checked)} />
        Creator Rewards — the holder fee share (0.30%) pays <span className="text-venom-400">you</span> instead of all
        holders.
      </label>

      {/* mining / status */}
      {phase === "mining" && (
        <div className="rounded-xl border border-white/5 bg-obsidian-900/60 p-3 text-sm text-white/60">
          Mining hook address… <span className="text-venom-400">{tried.toLocaleString()}</span> tried
        </div>
      )}
      {tokenAddr && (
        <div className="rounded-xl border border-venom-500/20 bg-obsidian-900/60 p-3 text-sm">
          <div className="label">Token address</div>
          <div className="mt-1 break-all font-mono text-venom-400">{tokenAddr}</div>
          {isSuccess && <div className="mt-1 text-xs text-white/50">Live ✓ — tradable on the Swap tab.</div>}
        </div>
      )}

      {!isConnected ? (
        <WalletButton />
      ) : (
        <button className="btn-primary w-full" disabled={busy} onClick={launch}>
          {phase === "mining"
            ? "Mining address…"
            : phase === "submitting" || confirming
              ? "Launching…"
              : "Launch token"}
        </button>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}
      <p className="text-center text-[11px] text-white/30">
        One transaction: deploys the token into a live v4 pool, seeds all liquidity, renounces ownership.
      </p>
    </div>
  );
}
