import Link from "next/link";
import { copy } from "@/lib/copy";
import { Logo } from "./Logo";

// Set NEXT_PUBLIC_X_URL in Vercel (e.g. https://x.com/yourhandle) to show the button.
const X_URL = process.env.NEXT_PUBLIC_X_URL;

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-obsidian-950/60">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-display text-base font-bold">
              {copy.brand}
              <span className="text-venom-400">.</span>
            </span>
          </div>

          {/* Docs & Terms on the left, X on the right. */}
          <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
            <nav className="flex items-center gap-5 text-sm">
              <Link
                href="/docs"
                className="text-white/55 transition hover:text-venom-400"
              >
                {copy.footer.docs}
              </Link>
              <Link
                href="/terms"
                className="text-white/55 transition hover:text-venom-400"
              >
                {copy.footer.terms}
              </Link>
            </nav>
            {X_URL && (
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/70 transition hover:border-venom-500/40 hover:text-venom-400"
              >
                <XIcon />
              </a>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/5 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/25">
            © {new Date().getFullYear()} Coil · Built on Robinhood Chain · Not affiliated with
            Robinhood Markets, Inc.
          </p>
          <p className="max-w-md text-xs leading-relaxed text-white/40">{copy.footer.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
