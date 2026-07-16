"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { shortAddr } from "@/lib/format";
import { ipfsToHttp } from "@/lib/metadata";
import { useAuth } from "@/components/AuthProvider";
import { WalletButton } from "@/components/WalletButton";

export default function ProfilePage() {
  const { isConnected } = useAccount();
  const { sessionAddress, signIn, signingIn, error: authError } = useAuth();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the signed-in wallet's existing profile.
  useEffect(() => {
    if (!sessionAddress) {
      setLoaded(false);
      return;
    }
    fetch(`/api/profile/${sessionAddress}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.profile) {
          setUsername(j.profile.username ?? "");
          setBio(j.profile.bio ?? "");
          setAvatarUrl(j.profile.avatar_url ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [sessionAddress]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(f.type)) {
      setMsg({ ok: false, text: "Use a .jpg, .png, .gif or .webp image." });
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setMsg({ ok: false, text: "Image must be under 4 MB." });
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload failed.");
      setAvatarUrl(j.url);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message ?? "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, bio, avatarUrl }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't save.");
      // Read it straight back to confirm it actually persisted (catches a misconfigured DB that
      // accepts writes but doesn't retain them, instead of a false "saved").
      const check = await fetch(`/api/profile/${sessionAddress}`, { cache: "no-store" }).then((x) => x.json());
      if (check?.profile?.username) {
        setMsg({ ok: true, text: "Profile saved." });
      } else {
        setMsg({ ok: false, text: "Saved, but it didn't read back — the database may not be connected. Check /api/status." });
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message ?? "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight">Your profile</h1>
      <p className="mt-2 text-sm text-white/50">
        A public profile linked to your wallet — a name and avatar that show up on your trades and in
        token chats.
      </p>

      <div className="glass mt-6 p-6">
        {!isConnected ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-white/60">Connect a wallet to set up your profile.</p>
            <WalletButton />
          </div>
        ) : !sessionAddress ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-white/60">Sign a message to prove this wallet is yours.</p>
            <button className="btn-primary" disabled={signingIn} onClick={() => signIn()}>
              {signingIn ? "Check your wallet…" : "Sign in"}
            </button>
            {authError && <p className="text-[11px] text-red-400">{authError}</p>}
          </div>
        ) : !loaded ? (
          <p className="py-6 text-center text-sm text-white/40">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-obsidian-800 text-2xl">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ipfsToHttp(avatarUrl)} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  "👤"
                )}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={onFile}
                  className="hidden"
                />
                <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : avatarUrl ? "Change avatar" : "Upload avatar"}
                </button>
                <p className="mt-1 font-mono text-[11px] text-white/35">{shortAddr(sessionAddress)}</p>
              </div>
            </div>

            <div>
              <label className="label mb-1.5 block">Username</label>
              <input
                className="field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="satoshi"
                maxLength={20}
              />
              <p className="mt-1 text-[11px] text-white/35">3–20 letters, numbers or underscores.</p>
            </div>

            <div>
              <label className="label mb-1.5 block">Bio</label>
              <textarea
                className="field min-h-[80px] resize-y"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 280))}
                placeholder="gm. degen since block zero."
              />
              <p className="mt-1 text-right text-[11px] text-white/35">{bio.length}/280</p>
            </div>

            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save profile"}
              </button>
              <Link href={`/u/${sessionAddress}`} className="btn-ghost">
                View public profile
              </Link>
            </div>
            {msg && (
              <p className={`text-xs ${msg.ok ? "text-venom-400" : "text-red-400"}`}>{msg.text}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
