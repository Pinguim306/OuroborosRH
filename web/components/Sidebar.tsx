"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";
import { Logo } from "./Logo";

type Item = { href: string; label: string; icon: string };

const NAV: Item[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/swap", label: "Swap", icon: "🔁" },
  { href: "/points", label: "Points", icon: "🎯" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/profile", label: "Profile", icon: "👤" },
  { href: "/rewards", label: copy.nav.rewards, icon: "💸" },
  { href: "/about", label: "About", icon: "✨" },
  { href: "/docs", label: "How it works", icon: "📖" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The left navigation rail. Rendered fixed on desktop and inside the mobile drawer. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <Link href="/" onClick={onNavigate} className="mb-3 flex items-center gap-2.5 px-2 py-1">
        <Logo size={30} className="animate-spin-slow" />
        <span className="font-display text-lg font-extrabold tracking-tight">{copy.brand}</span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-venom-500/15 text-venom-400"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-5 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/create"
        onClick={onNavigate}
        className="btn-primary mt-3 justify-center"
      >
        {copy.nav.create}
      </Link>

      <div className="mt-auto px-3 pt-4">
        <a
          href={`https://x.com/${copy.social.x}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-white/50 transition hover:bg-white/5 hover:text-white"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
          </svg>
          @{copy.social.x}
        </a>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-white/30">
          <Link href="/terms" onClick={onNavigate} className="hover:text-white/60">
            Terms
          </Link>
          <Link href="/docs" onClick={onNavigate} className="hover:text-white/60">
            Docs
          </Link>
        </div>
      </div>
    </div>
  );
}
