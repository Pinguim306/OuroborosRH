"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseEther, parseEventLogs } from "viem";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { copy } from "@/lib/copy";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { LIVE, CONTRACTS, launchpadAbi } from "@/lib/contracts";
import { ProgressBar } from "@/components/ProgressBar";

export default function CreatePage() {
  const { isConnected } = useAccount();
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    x: "",
    telegram: "",
    website: "",
  });
  const [status, setStatus] = useState<"idle" | "deploying" | "done">("idle");

  // Image upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageWarn, setImageWarn] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: creationFee } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "creationFee",
    query: { enabled: LIVE },
  });
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { data: receipt, isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Pull the freshly deployed token address out of the TokenLaunched event so we
  // can link the creator straight to its launchpad page.
  const newTokenAddress = useMemo(() => {
    if (!receipt) return undefined;
    try {
      const logs = parseEventLogs({
        abi: launchpadAbi,
        eventName: "TokenLaunched",
        logs: receipt.logs,
      });
      return (logs[0]?.args as { token?: string } | undefined)?.token;
    } catch {
      return undefined;
    }
  }, [receipt]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const busy = uploading || (LIVE ? isPending || confirming : status === "deploying");
  const done = LIVE ? isSuccess : status === "done";

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImageError(null);
    setImageWarn(null);
    setUploadError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/gif"].includes(f.type)) {
      setImageError("Use a .jpg, .png or .gif image.");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setImageError("Image must be under 4 MB.");
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new window.Image();
    img.onload = () => {
      if (img.width < 1000 || img.height < 1000) {
        setImageWarn(`Low resolution (${img.width}×${img.height}). Min. 1000×1000 recommended.`);
      } else if (img.width !== img.height) {
        setImageWarn("Not square — a 1:1 image is recommended.");
      }
    };
    img.src = url;
    setImageFile(f);
    setImagePreview(url);
  }

  async function deploy() {
    if (!form.name || !form.symbol) return;
    if (!LIVE) {
      setStatus("deploying");
      setTimeout(() => setStatus("done"), 1800);
      return;
    }

    let metadataURI = "";
    if (imageFile) {
      setUploading(true);
      setUploadError(null);
      try {
        const fd = new FormData();
        fd.append("file", imageFile);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) {
          setUploadError(j.error ?? "Image upload failed.");
          setUploading(false);
          return;
        }
        metadataURI = j.url;
      } catch {
        setUploadError("Image upload failed.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    writeContract({
      address: CONTRACTS.launchpad,
      abi: launchpadAbi,
      functionName: "createToken",
      args: [form.name, form.symbol, metadataURI],
      value: (creationFee as bigint | undefined) ?? parseEther("0.01"),
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{copy.create.title}</h1>
        <p className="mt-3 text-white/55">{copy.create.subtitle}</p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-[1fr_360px]">
        {/* Form */}
        <div className="glass p-6">
          <div className="grid gap-4">
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <Field label={copy.create.fields.name}>
                <input className="field" value={form.name} onChange={set("name")} placeholder="Snake Oil" />
              </Field>
              <Field label={copy.create.fields.symbol}>
                <input
                  className="field uppercase"
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase().slice(0, 8) }))}
                  placeholder="SSSS"
                />
              </Field>
            </div>

            <Field label={copy.create.fields.description}>
              <textarea
                className="field min-h-[90px] resize-y"
                value={form.description}
                onChange={set("description")}
                placeholder="What's the story? Why will it loop forever?"
              />
            </Field>

            {/* Image upload */}
            <div>
              <span className="label mb-1.5 block">Token image</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif"
                onChange={onFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center gap-4 rounded-xl border border-dashed border-white/15 bg-obsidian-900/60 p-4 text-left transition hover:border-venom-500/40"
              >
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-2xl">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    "🖼️"
                  )}
                </div>
                <div className="min-w-0 text-xs">
                  <div className="font-semibold text-white/80">
                    {imageFile ? imageFile.name : "Choose an image from your device"}
                  </div>
                  <div className="mt-0.5 text-white/40">Max 4 MB · .jpg, .png or .gif</div>
                  <div className="text-white/40">Min. 1000×1000px · 1:1 square recommended</div>
                </div>
              </button>
              {imageError && <p className="mt-1.5 text-[11px] text-red-400">{imageError}</p>}
              {imageWarn && <p className="mt-1.5 text-[11px] text-acid">⚠ {imageWarn}</p>}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label={copy.create.fields.x}>
                <input className="field" value={form.x} onChange={set("x")} placeholder="@handle" />
              </Field>
              <Field label={copy.create.fields.telegram}>
                <input className="field" value={form.telegram} onChange={set("telegram")} placeholder="t.me/…" />
              </Field>
              <Field label={copy.create.fields.website}>
                <input className="field" value={form.website} onChange={set("website")} placeholder="site.xyz" />
              </Field>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/5 bg-obsidian-900/50 p-4 text-xs text-white/50">
            <div className="mb-2 font-semibold text-white/70">Launch parameters</div>
            <ul className="grid grid-cols-2 gap-y-1">
              <li>Supply: <span className="text-white/70">1,000,000,000</span></li>
              <li>Trade fee: <span className="text-white/70">1.5%</span></li>
              <li>Graduation: <span className="text-white/70">4 {NATIVE_SYMBOL} raised</span></li>
              <li>Max buy: <span className="text-white/70">2% of supply</span></li>
              <li>Rewards: <span className="text-venom-400">to holders, no staking</span></li>
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-white/60">One-time creation fee</span>
              <span className="font-mono font-semibold text-acid">0.01 {NATIVE_SYMBOL}</span>
            </div>
          </div>

          {done ? (
            <div className="mt-6 rounded-xl border border-venom-500/30 bg-venom-500/10 p-4 text-center">
              <div className="text-2xl">🎉</div>
              <p className="mt-1 font-semibold text-venom-400">
                {form.name} (${form.symbol}) is live in the loop!
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {LIVE && newTokenAddress ? (
                  <Link href={`/token/${newTokenAddress}`} className="btn-primary inline-flex">
                    Open your token
                  </Link>
                ) : null}
                <Link href="/discover" className="btn-ghost inline-flex">
                  View on Discover
                </Link>
              </div>
              {LIVE && newTokenAddress && (
                <p className="mt-2 break-all font-mono text-[11px] text-white/40">
                  {newTokenAddress}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={deploy}
              disabled={!form.name || !form.symbol || busy || (LIVE && !isConnected)}
              className="btn-primary mt-6 w-full text-base"
            >
              {uploading ? "Uploading image…" : busy ? copy.create.submitting : copy.create.submit}
            </button>
          )}

          {busy && (
            <div className="mt-3">
              <ProgressBar value={uploading ? 0.3 : confirming ? 0.85 : 0.5} />
            </div>
          )}
          {LIVE && (uploadError || error) && (
            <p className="mt-3 text-center text-[11px] text-red-400">
              {uploadError ?? (error as { shortMessage?: string })?.shortMessage ?? "Transaction failed."}
            </p>
          )}
          {!isConnected && (
            <p className="mt-3 text-center text-[11px] text-white/30">
              {LIVE ? "Connect a wallet to deploy." : "Demo mode — this simulates the deploy transaction."}
            </p>
          )}
        </div>

        {/* Live preview */}
        <div className="md:sticky md:top-20 md:self-start">
          <div className="label mb-2">Live preview</div>
          <div className="glass p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-2xl">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  "🪙"
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-white">{form.name || "Your token"}</span>
                  <span className="chip !px-2 !py-0.5">{form.symbol || "TICK"}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-white/45">
                  {form.description || "Your description will appear here."}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar value={0} label="Bonding curve" />
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/35">
            The moment you launch, fees start compounding into liquidity and holder rewards — no extra
            setup.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
