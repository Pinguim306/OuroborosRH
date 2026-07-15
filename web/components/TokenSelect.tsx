"use client";

import { useMemo, useState } from "react";
import { isAddress } from "viem";
import type { Address } from "@/lib/types";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { isCoilToken, isHiddenToken, type CoilMarket } from "@/lib/contracts";

/** null address = native ETH. */
export type TokenChoice = { address: Address | null; symbol: string; name?: string };

export const ETH_CHOICE: TokenChoice = { address: null, symbol: NATIVE_SYMBOL, name: "Ether" };

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function Row({
  symbol,
  name,
  addr,
  v4,
  onClick,
}: {
  symbol: string;
  name?: string;
  addr?: string;
  v4?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-venom-500/15 text-sm font-bold text-venom-400">
        {symbol.slice(0, 3).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold text-white">
          {symbol}
          {v4 && <span className="chip !py-0.5 text-[10px]">v4</span>}
        </span>
        {(name || addr) && (
          <span className="block truncate text-xs text-white/40">{name ?? (addr ? shortAddr(addr) : "")}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Uniswap-style token picker modal. Lists native ETH + the Coil tokens launched by the factory,
 * with a search box that also accepts any pasted address (import — trade any token that has a v3
 * pool on the chain).
 */
export function TokenSelect({
  markets,
  onSelect,
  onClose,
}: {
  markets: readonly CoilMarket[];
  onSelect: (t: TokenChoice) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!s) return markets;
    return markets.filter(
      (m) =>
        m.symbol.toLowerCase().includes(s) ||
        m.name.toLowerCase().includes(s) ||
        m.token.toLowerCase().includes(s),
    );
  }, [s, markets]);

  const pastedRaw = isAddress(q.trim()) ? (q.trim() as Address) : null;
  const pasted = pastedRaw && !isHiddenToken(pastedRaw) ? pastedRaw : null; // never surface hidden tokens
  const pastedListed = pasted && markets.some((m) => m.token.toLowerCase() === pasted.toLowerCase());
  const showEth = !s || NATIVE_SYMBOL.toLowerCase().includes(s) || "ether".includes(s);

  function pick(t: TokenChoice) {
    onSelect(t);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="glass-strong w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Select a token</h3>
          <button onClick={onClose} className="text-xl leading-none text-white/40 hover:text-white">
            ×
          </button>
        </div>

        <input
          autoFocus
          className="field font-mono"
          placeholder="Search name / symbol or paste 0x…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          spellCheck={false}
        />

        <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto">
          {showEth && <Row symbol={NATIVE_SYMBOL} name="Ether" onClick={() => pick(ETH_CHOICE)} />}

          {filtered.map((m) => (
            <Row
              key={m.token}
              symbol={m.symbol}
              name={m.name}
              addr={m.token}
              v4={isCoilToken(m.token)}
              onClick={() => pick({ address: m.token, symbol: m.symbol, name: m.name })}
            />
          ))}

          {pasted && !pastedListed && (
            <Row
              symbol="Import"
              name={shortAddr(pasted)}
              addr={pasted}
              onClick={() => pick({ address: pasted, symbol: shortAddr(pasted) })}
            />
          )}

          {filtered.length === 0 && !showEth && !pasted && (
            <p className="py-6 text-center text-sm text-white/40">No match. Paste a token address to import.</p>
          )}
        </div>
      </div>
    </div>
  );
}
