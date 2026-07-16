"use client";

import { useEffect, useState } from "react";
import type { TokenMarket } from "@/lib/types";
import { TokenAvatar } from "./TokenAvatar";

/**
 * "Share coin" modal: a small preview card plus copy-link and share-on-X actions,
 * so a token page can be spread without hunting for the URL.
 */
export function ShareModal({
  token,
  open,
  onClose,
}: {
  token: TokenMarket;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/token/${token.address}`
      : `https://coil.trading/token/${token.address}`;

  function copyLink() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tweet = `$${token.symbol} — ${token.name}, live on Coil 🐍`;
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(url)}`;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-obsidian-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold">Share coin</h3>
            <p className="mt-0.5 text-xs text-white/45">Copy the link or share straight to X</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Preview card */}
        <div className="mt-4 flex items-center gap-4 overflow-hidden rounded-xl border border-venom-500/20 bg-gradient-to-r from-venom-500/10 to-transparent p-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-venom-400">
              🐍 Coil
            </div>
            <div className="mt-1 truncate font-display text-2xl font-extrabold text-white">
              ${token.symbol}
            </div>
            <div className="truncate text-sm text-white/55">{token.name}</div>
          </div>
          <TokenAvatar
            uri={token.image}
            symbol={token.symbol}
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-3xl"
          />
        </div>

        <div className="mt-4 space-y-2">
          <button onClick={copyLink} className="btn-primary w-full justify-center">
            {copied ? "Copied ✓" : "⧉ Copy link"}
          </button>
          <a
            href={xHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost w-full justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="mr-2">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
            </svg>
            Share on X
          </a>
        </div>
      </div>
    </div>
  );
}
