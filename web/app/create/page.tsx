"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther, parseEventLogs } from "viem";
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
  const [devBuy, setDevBuy] = useState("");
  // Launch mode: bonding curve (graduates to V2) or straight into a Uniswap V3 pool.
  const [mode, setMode] = useState<"curve" | "v3">("curve");

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
  const { data: curveParams } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "params",
    query: { enabled: LIVE },
  });

  // Largest dev buy that still fits under the anti-whale cap (same 2% every buyer
  // gets). Computed from the launch params so it tracks whatever they're set to;
  // a small safety margin keeps integer rounding from tripping the on-chain cap.
  const maxDevBuyEth = useMemo(() => maxDevBuy(curveParams), [curveParams]);
  const devBuyNum = parseFloat(devBuy) || 0;
  // The 2% anti-whale cap only exists on the bonding curve — V3 pools have no hook
  // for it, so in V3 mode the dev buy is unclamped.
  const devBuyOverCap = mode === "curve" && maxDevBuyEth > 0 && devBuyNum > maxDevBuyEth;
  const clampedDevBuy =
    mode === "curve" && maxDevBuyEth > 0 ? Math.min(devBuyNum, maxDevBuyEth) : devBuyNum;
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
    const hasSocials = !!(form.website || form.x || form.telegram);
    if (imageFile || hasSocials || form.description) {
      setUploading(true);
      setUploadError(null);
      try {
        // 1. Upload the image (if any) to IPFS.
        let imageURI = "";
        if (imageFile) {
          const fd = new FormData();
          fd.append("file", imageFile);
          const r = await fetch("/api/upload", { method: "POST", body: fd });
          const j = await r.json();
          if (!r.ok) {
            setUploadError(j.error ?? "Image upload failed.");
            setUploading(false);
            return;
          }
          imageURI = j.url;
        }
        // 2. Pin the metadata JSON (image + socials) — this is the on-chain metadataURI,
        //    so the website/socials persist and render on the token page + externally.
        const mr = await fetch("/api/upload-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            symbol: form.symbol,
            description: form.description,
            image: imageURI,
            website: form.website,
            twitter: form.x,
            telegram: form.telegram,
          }),
        });
        const mj = await mr.json();
        if (!mr.ok) {
          // Fall back to the bare image URI so a metadata hiccup doesn't block launch.
          if (imageURI) metadataURI = imageURI;
          else {
            setUploadError(mj.error ?? "Metadata upload failed.");
            setUploading(false);
            return;
          }
        } else {
          metadataURI = mj.url;
        }
      } catch {
        setUploadError("Upload failed.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // Clamp the dev buy to the cap so a rounding overshoot can't revert the launch.
    const devBuyWei = clampedDevBuy > 0 ? parseEther(clampedDevBuy.toFixed(18)) : 0n;
    const fee = (creationFee as bigint | undefined) ?? parseEther("0.01");

    writeContract({
      address: CONTRACTS.launchpad,
      abi: launchpadAbi,
      functionName: mode === "v3" ? "createTokenV3" : "createToken",
      args: [form.name, form.symbol, metadataURI, devBuyWei],
      value: fee + devBuyWei,
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

            {/* Launch mode: bonding curve (classic) vs instant Uniswap V3 pool. */}
            <div>
              <span className="label mb-1.5 block">Launch mode</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      key: "curve",
                      title: "Bonding curve",
                      desc: "Classic launch. 2% anti-whale cap, holder rewards from trade fees, graduates to Uniswap V2 at 4 ETH.",
                    },
                    {
                      key: "v3",
                      title: "Instant V3 pool",
                      desc: "Launches straight into a Uniswap V3 pool. Tradable the second the tx confirms, DexScreener from trade one. No max-buy cap.",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMode(opt.key)}
                    className={`rounded-xl border p-3 text-left transition ${
                      mode === opt.key
                        ? "border-venom-500/60 bg-venom-500/10"
                        : "border-white/10 bg-obsidian-900/60 hover:border-white/25"
                    }`}
                  >
                    <div className={`text-sm font-semibold ${mode === opt.key ? "text-venom-400" : "text-white/80"}`}>
                      {opt.title}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/45">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Dev buy — the creator can buy their own launch first, capped at the
                same 2% anti-whale limit as everyone else. */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label">Dev buy ({NATIVE_SYMBOL}) · optional</span>
                {mode === "curve" && maxDevBuyEth > 0 && (
                  <button
                    type="button"
                    onClick={() => setDevBuy(maxDevBuyEth.toFixed(4))}
                    className="text-[11px] font-medium text-venom-400 hover:text-venom-300"
                  >
                    Max {maxDevBuyEth.toFixed(4)}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="field font-mono"
                  value={devBuy}
                  onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0.0"
                />
                <span className="chip shrink-0">{NATIVE_SYMBOL}</span>
              </div>
              <p className="mt-1.5 text-[11px] text-white/40">
                {mode === "curve"
                  ? "Buy your token in the same transaction, before anyone else. Limited to the 2% max-buy cap — larger amounts are clamped to the max."
                  : "Executed as the pool's very first swap, inside the launch transaction — impossible to front-run. No cap in V3 mode."}
              </p>
              {devBuyOverCap && (
                <p className="mt-1 text-[11px] text-acid">
                  ⚠ Above the 2% cap — will be clamped to {maxDevBuyEth.toFixed(4)} {NATIVE_SYMBOL}.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/5 bg-obsidian-900/50 p-4 text-xs text-white/50">
            <div className="mb-2 font-semibold text-white/70">Launch parameters</div>
            {mode === "curve" ? (
              <ul className="grid grid-cols-2 gap-y-1">
                <li>Supply: <span className="text-white/70">1,000,000,000</span></li>
                <li>Trade fee: <span className="text-white/70">1.5%</span></li>
                <li>Graduation: <span className="text-white/70">4 {NATIVE_SYMBOL} raised</span></li>
                <li>Max buy: <span className="text-white/70">2% of supply</span></li>
                <li>Rewards: <span className="text-venom-400">to holders, no staking</span></li>
              </ul>
            ) : (
              <ul className="grid grid-cols-2 gap-y-1">
                <li>Supply: <span className="text-white/70">1,000,000,000</span></li>
                <li>Pool fee: <span className="text-white/70">1% (Uniswap V3)</span></li>
                <li>Liquidity: <span className="text-white/70">locked forever</span></li>
                <li>Max buy: <span className="text-white/70">none</span></li>
                <li>Rewards: <span className="text-venom-400">from pool fees, no staking</span></li>
              </ul>
            )}
            <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-white/60">One-time creation fee</span>
                <span className="font-mono font-semibold text-acid">0.01 {NATIVE_SYMBOL}</span>
              </div>
              {devBuyNum > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Dev buy</span>
                    <span className="font-mono text-white/70">
                      {clampedDevBuy.toFixed(4)} {NATIVE_SYMBOL}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/5 pt-1">
                    <span className="text-white/70">Total</span>
                    <span className="font-mono font-semibold text-white">
                      {(0.01 + clampedDevBuy).toFixed(4)} {NATIVE_SYMBOL}
                    </span>
                  </div>
                </>
              )}
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
                <>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(newTokenAddress)}
                    title="Copy contract address"
                    className="mt-2 break-all font-mono text-[11px] text-white/50 underline decoration-dotted hover:text-white"
                  >
                    {newTokenAddress} ⧉
                  </button>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px]">
                    <a
                      href={`https://dexscreener.com/robinhood/${newTokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-venom-400 hover:underline"
                    >
                      DexScreener ↗
                    </a>
                    <a
                      href={`https://robinhoodchain.blockscout.com/token/${newTokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-venom-400 hover:underline"
                    >
                      Explorer ↗
                    </a>
                  </div>
                </>
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

/** Default launch params (mirrors the deploy script) — used for the demo preview
 *  before contracts are live. */
const DEMO_PARAMS = {
  totalSupply: 1_000_000_000,
  virtualNative: 1,
  feeBps: 150,
  maxBuyBps: 200,
};

/**
 * The largest dev buy (in native coin) whose tokens-out stays within the
 * anti-whale cap on a fresh curve. Solve getAmountOut(netIn, vNative, supply) =
 * maxBuyTokens for netIn, then gross up for the trade fee. Returns 0 when the cap
 * is disabled (maxBuyBps == 0), i.e. no computed ceiling.
 */
function maxDevBuy(params: readonly bigint[] | undefined): number {
  let supply = DEMO_PARAMS.totalSupply;
  let vNative = DEMO_PARAMS.virtualNative;
  let feeBps = DEMO_PARAMS.feeBps;
  let maxBuyBps = DEMO_PARAMS.maxBuyBps;
  if (params && params.length >= 7) {
    supply = Number(formatEther(params[0]));
    vNative = Number(formatEther(params[1]));
    feeBps = Number(params[2]) + Number(params[3]) + Number(params[4]);
    maxBuyBps = Number(params[6]);
  }
  if (maxBuyBps === 0 || supply <= 0) return 0;
  const maxTokens = (supply * maxBuyBps) / 10_000;
  const netIn = (maxTokens * vNative) / (supply - maxTokens);
  const gross = netIn / (1 - feeBps / 10_000);
  return gross * 0.99; // safety margin against on-chain rounding
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
