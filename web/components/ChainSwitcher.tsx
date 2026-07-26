"use client";

import { useEffect, useRef, useState } from "react";
import { SUPPORTED_CHAINS, chainConfig, type SupportedChainId } from "@/lib/chain";
import { coilContracts } from "@/lib/contracts";
import { useSelectedChainId, useSetSelectedChain } from "@/lib/useSelectedChain";

/**
 * Network picker. The selected chain lives in the `?chain=` URL param (see useSelectedChainId), so
 * switching is a navigation — every chain-aware read re-runs, and the resulting URL is shareable
 * and lands other people on the same network.
 *
 * Every chain stays selectable, including ones with no Coil deployment yet — the menu labels that
 * state and the page shows an empty state. Disabling them would strand anyone whose current chain
 * reads as undeployed (a missing env var is enough), with no way to switch back.
 */
export function ChainSwitcher() {
  const selected = useSelectedChainId();
  const setChain = useSetSelectedChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: SupportedChainId) {
    setOpen(false);
    setChain(id);
  }

  const cur = chainConfig(selected);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Network: ${cur.chain.name}`}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-ink-2 transition hover:border-coil-500/40 hover:text-white"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: cur.accent }}
        />
        <span className="hidden sm:inline">{cur.shortName}</span>
        <span aria-hidden className="text-[10px] text-ink-4">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-obsidian-900 p-1 shadow-2xl"
        >
          {SUPPORTED_CHAINS.map((c) => {
            const cfg = chainConfig(c.id);
            const deployed = coilContracts(c.id).anyLive;
            const active = c.id === selected;
            return (
              <button
                key={c.id}
                role="option"
                aria-selected={active}
                onClick={() => pick(c.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  active ? "bg-white/10 text-white" : "text-ink-2 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: cfg.accent }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{cfg.chain.name}</span>
                  <span className="block text-[11px] text-ink-4">
                    {deployed ? `Gas in ${cfg.nativeSymbol}` : "Not launched here yet"}
                  </span>
                </span>
                {active && <span className="text-xs text-coil-400">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
