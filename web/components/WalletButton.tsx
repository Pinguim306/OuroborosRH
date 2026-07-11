"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddr } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="btn-ghost group"
        title="Disconnect"
      >
        <span className="h-2 w-2 rounded-full bg-venom-400 shadow-glow" />
        <span className="font-mono text-xs">{shortAddr(address)}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      className="btn-primary"
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
