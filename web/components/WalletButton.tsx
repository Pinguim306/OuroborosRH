"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { shortAddr } from "@/lib/format";
import { chainConfig } from "@/lib/chain";
import { useSelectedChainId } from "@/lib/useSelectedChain";
import { IconExternal, IconWallet, IconWarning } from "@/components/Icon";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  // The chain the UI is pointed at (default chain unless the URL says otherwise) — writes are
  // pinned to it, so that's what the wallet has to be on.
  const selectedChainId = useSelectedChainId();
  const selectedChain = chainConfig(selectedChainId).chain;
  const wrongChain = isConnected && chainId !== selectedChainId;
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Viewport position for the account menu (portaled to <body> — see below).
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  // Close the account menu on outside click (button AND portaled menu).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggleMenu() {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (isConnected) setPicker(false);
  }, [isConnected]);

  // Prefer EIP-6963-discovered wallets (each has a unique id like "io.metamask").
  // Fall back to the generic "injected" connector only when nothing was discovered.
  const options = useMemo(() => {
    const discovered = connectors.filter((c) => c.id !== "injected");
    return discovered.length > 0 ? discovered : connectors;
  }, [connectors]);

  // Popular wallets we always surface: when the extension isn't installed (so
  // EIP-6963 can't discover it), show it with an install link instead.
  const SUGGESTED = useMemo(
    () =>
      [
        { name: "Rabby", match: "rabby", url: "https://rabby.io/" },
        { name: "MetaMask", match: "metamask", url: "https://metamask.io/download/" },
        { name: "Trust Wallet", match: "trust", url: "https://trustwallet.com/download" },
      ] as const,
    [],
  );
  const missing = useMemo(
    () =>
      SUGGESTED.filter(
        (s) => !connectors.some((c) => (c.name + c.id).toLowerCase().includes(s.match)),
      ),
    [SUGGESTED, connectors],
  );

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

        {/* Portal to <body>: the nav header's backdrop-blur creates a containing
            block for position:fixed, which pinned the modal to the header (top of
            the page, clipped). Rendering outside it centers on the real viewport. */}
        {picker && typeof document !== "undefined" && createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setPicker(false)}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-obsidian-850 shadow-coil"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <h3 className="font-display text-base font-bold">Connect a wallet</h3>
                <button
                  onClick={() => setPicker(false)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-ink-4 transition hover:bg-white/5 hover:text-white"
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
                        <IconWallet size={18} className="text-ink-3" />
                      )}
                    </span>
                    <span className="flex-1 text-sm font-medium text-white">
                      {c.name === "Injected" ? "Browser wallet" : c.name}
                    </span>
                    {pendingId === c.uid && isPending && (
                      <span className="text-xs text-ink-4">Connecting…</span>
                    )}
                  </button>
                ))}
              </div>

              {missing.length > 0 && (
                <div className="border-t border-white/5 p-2">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                    Not installed
                  </div>
                  {missing.map((s) => (
                    <a
                      key={s.name}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-obsidian-800">
                        <IconWallet size={18} className="text-ink-4" />
                      </span>
                      <span className="flex-1 text-sm font-medium text-ink-2">{s.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-coil-400">Install <IconExternal size={11} /></span>
                    </a>
                  ))}
                </div>
              )}

              <div className="border-t border-white/5 px-5 py-3">
                {error ? (
                  <p className="text-xs text-down">
                    {(error as { shortMessage?: string }).shortMessage ?? "Connection failed."}
                  </p>
                ) : (
                  <p className="text-xs text-ink-4">
                    After installing a wallet, reload the page to see it here.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      {/* Wallet is on another network — every tx is pinned to the selected chain, so
          surface it and offer a one-click switch (wagmi adds the chain if missing). */}
      {wrongChain && (
        <button
          onClick={() => switchChain({ chainId: selectedChainId })}
          disabled={switching}
          className="flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-semibold text-warn transition hover:bg-warn/20 disabled:opacity-50"
        >
          <IconWarning size={13} />
          {switching ? "Switching…" : `Switch to ${selectedChain.name}`}
        </button>
      )}
      <button onClick={toggleMenu} className="btn-ghost">
        <span className="h-2 w-2 rounded-full bg-coil-400 shadow-glow" />
        <span className="font-mono text-xs">{shortAddr(address)}</span>
        <span className={`text-ink-4 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Portal to <body>: the nav header's backdrop-blur creates a containing
          block that clipped/misplaced the menu (same bug the connect modal had),
          so it is rendered outside the header at the button's viewport position. */}
      {open && menuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ top: menuPos.top, right: menuPos.right }}
          className="fixed z-[60] w-52 overflow-hidden rounded-xl border border-white/10 bg-obsidian-850 shadow-coil"
        >
          <div className="border-b border-white/5 px-4 py-3">
            <div className="label">Connected</div>
            <div className="mt-0.5 font-mono text-xs text-ink-2">{shortAddr(address)}</div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink-2 transition hover:bg-white/5"
          >
            {copied ? "✓ Copied" : "Copy address"}
          </button>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink-2 transition hover:bg-white/5"
          >
            My profile
          </Link>
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-down transition hover:bg-down/10"
          >
            Disconnect
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
