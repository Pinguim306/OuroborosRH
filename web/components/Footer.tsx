import { copy } from "@/lib/copy";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-obsidian-950/60">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-display text-base font-bold">
              {copy.brand}
              <span className="text-venom-400">.</span>
            </span>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-white/40">
            {copy.footer.disclaimer}
          </p>
        </div>
        <p className="mt-8 text-xs text-white/25">
          © {new Date().getFullYear()} Ouroboros · Built on Robinhood Chain · Not affiliated with
          Robinhood Markets, Inc.
        </p>
      </div>
    </footer>
  );
}
