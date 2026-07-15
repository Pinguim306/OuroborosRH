"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { shortAddr, timeAgo } from "@/lib/format";
import { useAuth } from "./AuthProvider";
import { WalletButton } from "./WalletButton";

type Msg = {
  id: number;
  address: string;
  body: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

const POLL_MS = 5000;
const MAX_LEN = 500;

function Avatar({ msg }: { msg: Msg }) {
  const label = (msg.username || msg.address).slice(msg.username ? 0 : 2, msg.username ? 2 : 4).toUpperCase();
  if (msg.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={msg.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-venom-500/20 text-[10px] font-bold text-venom-300">
      {label}
    </span>
  );
}

/** Per-token comment thread. Reads/writes /api/chat/[token]; posting needs a signed-in wallet. */
export function TokenChat({ token }: { token: string }) {
  const { isConnected } = useAccount();
  const { sessionAddress, signIn, signingIn } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false); // feature not configured server-side
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Poll for new messages.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(`/api/chat/${token}?after=${lastIdRef.current}`);
        if (!r.ok) return;
        const j = await r.json();
        const fresh: Msg[] = j.messages ?? [];
        if (!alive || fresh.length === 0) return;
        lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((m) => m.id));
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...fresh.filter((m) => !seen.has(m.id))];
          return merged.slice(-300);
        });
      } catch {
        /* ignore transient errors */
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  // Keep pinned to the newest message.
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const r = await fetch(`/api/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const j = await r.json();
      if (r.status === 503) {
        setDisabled(true);
        setNotice("Chat isn't enabled yet.");
        return;
      }
      if (!r.ok) {
        setNotice(j.error ?? "Couldn't send.");
        return;
      }
      const m: Msg = j.message;
      lastIdRef.current = Math.max(lastIdRef.current, m.id);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText("");
    } catch {
      setNotice("Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="glass flex max-h-[520px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <span className="text-sm font-semibold">Chat</span>
        <span className="text-xs text-white/40">{messages.length > 0 ? `${messages.length} messages` : "Token thread"}</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/35">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5">
              <Avatar msg={m} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Link
                    href={`/u/${m.address}`}
                    className="truncate text-xs font-semibold text-white/80 hover:text-venom-400"
                  >
                    {m.username || shortAddr(m.address)}
                  </Link>
                  <span className="shrink-0 text-[10px] text-white/30">
                    {timeAgo(Math.floor(new Date(m.created_at).getTime() / 1000))}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-white/70">{m.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-white/5 p-3">
        {disabled ? (
          <p className="px-1 text-center text-xs text-white/40">Chat isn&apos;t enabled yet.</p>
        ) : !isConnected ? (
          <div className="flex justify-center">
            <WalletButton />
          </div>
        ) : !sessionAddress ? (
          <button className="btn-primary w-full" disabled={signingIn} onClick={() => signIn()}>
            {signingIn ? "Check your wallet…" : "Sign in to chat"}
          </button>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Say something…"
              className="field max-h-28 min-h-[42px] flex-1 resize-none"
            />
            <button className="btn-primary shrink-0" disabled={sending || !text.trim()} onClick={send}>
              {sending ? "…" : "Send"}
            </button>
          </div>
        )}
        {notice && <p className="mt-2 px-1 text-center text-[11px] text-amber-400">{notice}</p>}
      </div>
    </div>
  );
}
