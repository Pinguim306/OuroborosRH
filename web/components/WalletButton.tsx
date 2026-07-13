"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";
import { shortAddr } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close the account menu on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (isConnected) setPicker(false);
  }, [isConnected]);

  // Prefer EIP-6963-discovered wallets (each has a unique id like "io.metamask").
  // Fall back to the generic "injected" connector only when nothing was discovered.
  const options = useMemo(() => {
    const discovered = connectors.filter((c) => c.id !== "injected");
    return discovered.length > 0 ? discovered : connectors;
  }, [connectors]);

  function pick(connector: Connector) {
    setPendingId(connector.uid);
    connect({ connector });
  }

  if (!isConnected || !address) {
    return (
      <>
        <button onClick={() => setPicker(true)} disabled={isPending} className="btn-primary">
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>

        {picker && (
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setPicker(false)}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-obsidian-850 shadow-venom"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <h3 className="font-display text-base font-bold">Connect a wallet</h3>
                <button
                  onClick={() => setPicker(false)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-white/40 transition hover:bg-white/5 hover:text-white"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-2">
                {options.map((c) => (
                  <button
                    key={c.uid}
                    onClick={() => pick(c)}
                    disabled={isPending}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/5 disabled:opacity-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-obsidian-800">
                      {c.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.icon} alt="" className="h-6 w-6" />
                      ) : (
                        <span className="text-lg">👛</span>
                      )}
                    </span>
                    <span className="flex-1 text-sm font-medium text-white">
                      {c.name === "Injected" ? "Browser wallet" : c.name}
                    </span>
                    {pendingId === c.uid && isPending && (
                      <span className="text-xs text-white/40">Connecting…</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="border-t border-white/5 px-5 py-3">
                {error ? (
                  <p className="text-xs text-red-400">
                    {(error as { shortMessage?: string }).shortMessage ?? "Connection failed."}
                  </p>
                ) : (
                  <p className="text-xs text-white/35">
                    Don&apos;t see your wallet? Install its browser extension, then reload.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </>
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
