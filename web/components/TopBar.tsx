"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { copy } from "@/lib/copy";
import { useSearch } from "./SearchProvider";
import { WalletButton } from "./WalletButton";

/** The sticky top bar: mobile menu button, global coin search, launch + wallet. Typing in the
 *  search jumps to the home grid (where the query is applied). */
export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { query, setQuery } = useSearch();
  const pathname = usePathname();
  const router = useRouter();

  function onSearch(v: string) {
    setQuery(v);
    if (v && pathname !== "/") router.push("/");
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
