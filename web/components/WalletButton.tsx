"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddr } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!isConnected || !address) {
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

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost">
        <span className="h-2 w-2 rounded-full bg-venom-400 shadow-glow" />
        <span className="font-mono text-xs">{shortAddr(address)}</span>
        <span className={`text-white/40 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-obsidian-850 shadow-venom">
          <div className="border-b border-white/5 px-4 py-3">
            <div className="label">Connected</div>
            <div className="mt-0.5 font-mono text-xs text-white/70">{shortAddr(address)}</div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-white/70 transition hover:bg-white/5"
          >
            {copied ? "✓ Copied" : "Copy address"}
          </button>
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
