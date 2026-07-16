"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { copy } from "@/lib/copy";
import { COIL_TOKEN, isDeployed } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { useSearch } from "./SearchProvider";
import { WalletButton } from "./WalletButton";

/** The sticky top bar: mobile menu button, global coin search, the official $COIL contract
 *  address (click to copy), launch + wallet. Typing in the search jumps to the home grid. */
export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { query, setQuery } = useSearch();
  const pathname = usePathname();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  function onSearch(v: string) {
    setQuery(v);
    if (v && pathname !== "/") router.push("/");
  }

  function copyCA() {
    navigator.clipboard?.writeText(COIL_TOKEN);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-obsidian-950/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/70 hover:bg-white/5 lg:hidden"
        >
          <span className="text-xl leading-none">☰</span>
        </button>

        <div className="relative min-w-0 flex-1 lg:max-w-xl">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            🔍
          </span>
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search coins by name, ticker or address…"
            className="field !pl-9"
            spellCheck={false}
          />
        </div>

        {/* Official $COIL contract address — full on wide screens, shortened on medium. */}
        {isDeployed(COIL_TOKEN) && (
          <div className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-venom-500/25 bg-venom-500/5 px-3 py-2 text-xs md:flex">
            <Link
              href={`/token/${COIL_TOKEN}`}
              className="font-semibold text-venom-400 hover:underline"
            >
              Official CA:
            </Link>
            <button
              onClick={copyCA}
              title={`Copy contract address\n${COIL_TOKEN}`}
              className="font-mono text-white/70 transition hover:text-white"
            >
              {copied ? (
                <span className="text-venom-400">Copied ✓</span>
              ) : (
                <>
                  <span className="hidden 2xl:inline">{COIL_TOKEN}</span>
                  <span className="2xl:hidden">{shortAddr(COIL_TOKEN)}</span> ⧉
                </>
              )}
            </button>
          </div>
        )}

        <Link href="/create" className="btn-primary hidden shrink-0 sm:inline-flex">
          {copy.nav.create}
        </Link>
        <div className="shrink-0">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
