"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { shortAddr } from "@/lib/format";
import { ipfsToHttp } from "@/lib/metadata";
import { useAuth } from "@/components/AuthProvider";

const EXPLORER = "https://robinhoodchain.blockscout.com";

type Profile = { address: string; username: string | null; bio: string | null; avatar_url: string | null };

export default function PublicProfilePage() {
  const params = useParams();
  const address = (Array.isArray(params.address) ? params.address[0] : params.address ?? "").toLowerCase();
  const { sessionAddress } = useAuth();
  const { address: connected } = useAccount();
  const isSelf = sessionAddress === address || connected?.toLowerCase() === address;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/profile/${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProfile(j.profile ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [address]);

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="glass p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-obsidian-800 text-3xl">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ipfsToHttp(profile.avatar_url)} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              "👤"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold">
              {profile?.username || (loaded ? "Unnamed trader" : "…")}
            </h1>
            <a
              href={`${EXPLORER}/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-white/40 hover:text-venom-400"
            >
              {shortAddr(address)} ↗
            </a>
          </div>
          {isSelf && (
            <Link href="/profile" className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">
              Edit
            </Link>
          )}
        </div>

        {profile?.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/60">{profile.bio}</p>}

        {loaded && !profile && (
          <p className="mt-4 text-sm text-white/40">
            This wallet hasn&apos;t set up a profile yet.
            {isSelf && (
              <>
                {" "}
                <Link href="/profile" className="text-venom-400 hover:underline">
                  Create yours →
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
