"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";

const links = [
  { href: "/discover", label: "Discover" },
  { href: "/points", label: "Points" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rewards", label: copy.nav.rewards },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-obsidian-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} className="animate-spin-slow" />
          <span className="font-display text-lg font-extrabold tracking-tight">
            {copy.brand}
            <span className="text-venom-400">.</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "text-venom-400" : "text-white/60 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/create" className="btn-primary hidden sm:inline-flex">
            {copy.nav.create}
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
