"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther, parseEventLogs } from "viem";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { copy } from "@/lib/copy";
import { chainConfig, dexscreenerPageUrl, explorerUrl } from "@/lib/chain";
import { useSelectedChainId } from "@/lib/useSelectedChain";
import { coilContracts, launchpadAbi, coilLaunchpadV4Abi } from "@/lib/contracts";
import { DEFAULT_TOTAL_FEE_BPS, useLaunchFee } from "@/lib/useLaunchFee";
import { ProgressBar } from "@/components/ProgressBar";
import { LaunchWidget } from "@/components/LaunchWidget";
import { FeeRatePicker } from "@/components/FeeRatePicker";
import { IconCrown, IconImage, IconRewards, IconWarning } from "@/components/Icon";
import { IconBolt, IconCoin, IconExternal } from "@/components/Icon";

export default function CreatePage() {
  const { isConnected } = useAccount();
  // Launches go to the network the picker is on; LaunchWidget resolves the same id for the write.
  const chainId = useSelectedChainId();
  const NATIVE_SYMBOL = chainConfig(chainId).nativeSymbol;
  // The launchpad is v4-only: every launch goes through the Uniswap-v4 CoilHook, so its native
  // per-swap fee always feeds the $COIL buy&burn. The legacy instant-V3 path is retired, but `mode`
  // stays a union type so the (now single-branch) conditionals below remain valid.
  const [mode] = useState<"v3" | "v4">("v4");
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
  // Rewards mode: Loop Rewards streams the fee share to all holders (classic);
  // Creator Rewards pays it to the creator's wallet. Fixed forever at launch.
  const [rewardsChoice, setRewards] = useState<"loop" | "creator">("loop");
  // Some chains offer only Creator Rewards. Deriving the effective value (rather than syncing
  // state on a chain change) means the picker can never leave a stale "loop" behind on a chain
  // that doesn't offer it — the launch would then be sent with the wrong immutable flag.
  const loopRewardsAvailable = chainConfig(chainId).loopRewards;
  const rewards = loopRewardsAvailable ? rewardsChoice : "creator";

  // Per-swap fee rate. Only launchpads at LAUNCHPAD_VERSION 4+ take one from the creator; older
  // ones carry a split fixed at deployment, so the control stays hidden there rather than
  // pretending to a choice the contract won't honour.
  const { configurable: feeConfigurable, minBps, maxBps } = useLaunchFee(chainId);
  const [feeChoice, setFeeChoice] = useState(DEFAULT_TOTAL_FEE_BPS);
  // Clamped rather than synced, for the same reason as `rewards` above: switching chains must never
  // leave a rate behind that the new chain's launchpad would reject at signing time.
  const totalFeeBps =
    feeConfigurable && minBps !== undefined && maxBps !== undefined
      ? Math.min(Math.max(feeChoice, minBps), maxBps)
      : undefined;

  // Image upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageWarn, setImageWarn] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Creation fees differ per network (e.g. 1 USDC on Arc vs 0.001 ETH on Robinhood Chain), so
  // these reads must follow the selected chain — LaunchWidget already sends the per-chain fee as
  // the transaction's `value`, and a display sourced from the default chain would quote a number
  // the user is not actually about to pay.
  const {
    launchpad: curveLaunchpad,
    coilLaunchpad: v4Launchpad,
    live: LIVE,
    launchLive: LAUNCH_LIVE,
  } = coilContracts(chainId);

  const { data: creationFee } = useReadContract({
    chainId,
    address: curveLaunchpad,
    abi: launchpadAbi,
    functionName: "creationFee",
    query: { enabled: LIVE },
  });
  // v1 launchpads don't have the rewards-mode flag (or this getter) — the read
  // fails there, the selector stays hidden and the 4-arg create signature is used.
  const { data: lpVersion } = useReadContract({
    chainId,
    address: curveLaunchpad,
    abi: launchpadAbi,
    functionName: "LAUNCHPAD_VERSION",
    query: { enabled: LIVE },
  });
  // v4 has its own rewards flag on every launch; V3 needs a v2+ launchpad.
  const supportsRewardsMode = mode === "v4" || !LIVE || (typeof lpVersion === "bigint" && lpVersion >= 2n);

  // v4 launchpad creation fee (separate contract from the V3 launchpad).
  const { data: creationFeeV4 } = useReadContract({
    chainId,
    address: v4Launchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "creationFee",
    query: { enabled: LAUNCH_LIVE },
  });

  const liveForMode = mode === "v4" ? LAUNCH_LIVE : LIVE;
  const activeFeeRaw = mode === "v4" ? creationFeeV4 : creationFee;
  // Live creation fee (owner-configurable on-chain; 0 = free, gas only).
  const feeEth = liveForMode
    ? activeFeeRaw !== undefined
      ? Number(formatEther(activeFeeRaw as bigint))
      : undefined
    : mode === "v4"
      ? 0
      : 0.01;

  const devBuyNum = parseFloat(devBuy) || 0;
  const devBuyWei = devBuyNum > 0 ? parseEther(devBuyNum.toFixed(18)) : 0n;
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

  // Null on chains DexScreener doesn't index, which hides the link there.
  const dexUrl = dexscreenerPageUrl(newTokenAddress, chainId);

  // Ping the Telegram announcement endpoint once the launch confirms. Fire-and-
  // forget: a failed announcement never affects the launch UX. The endpoint
  // re-verifies everything on-chain and no-ops when the bot isn't configured.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!LIVE || !isSuccess || !newTokenAddress || announcedRef.current) return;
    announcedRef.current = true;
    fetch("/api/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: newTokenAddress, chain: chainId }),
    }).catch(() => {});
    // `chainId` is in the deps so the announcement can't be sent with a stale network; the ref
    // guard is what keeps it firing exactly once.
  }, [isSuccess, newTokenAddress, chainId]);

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

  // Upload the image (if any) to IPFS and pin the metadata JSON (image + socials), returning the
  // on-chain metadataURI. Shared by both launch modes so v4 gets the same rich metadata as V3.
  // Returns "" when there's nothing to pin; throws with a message on failure.
  async function buildMetadataURI(): Promise<string> {
    const hasSocials = !!(form.website || form.x || form.telegram);
    if (!(imageFile || hasSocials || form.description)) return "";
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
        if (!r.ok) throw new Error(j.error ?? "Image upload failed.");
        imageURI = j.url;
      }
      // 2. Pin the metadata JSON (image + socials) — this is the on-chain metadataURI, so the
      //    website/socials persist and render on the token page + externally.
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
        if (imageURI) return imageURI;
        throw new Error(mj.error ?? "Metadata upload failed.");
      }
      return mj.url;
    } finally {
      setUploading(false);
    }
  }

  async function deploy() {
    if (!form.name || !form.symbol) return;
    if (!LIVE) {
      setStatus("deploying");
      setTimeout(() => setStatus("done"), 1800);
      return;
    }

    let metadataURI = "";
    try {
      metadataURI = await buildMetadataURI();
    } catch (e) {
      setUploadError((e as Error).message ?? "Upload failed.");
      return;
    }

    const fee = (creationFee as bigint | undefined) ?? parseEther("0.01"); // excess is refunded on-chain

    // Every launch goes straight into a Uniswap V3 pool. v2 launchpads take the
    // rewards-mode flag; v1 keeps the legacy 4-arg call.
    const args = supportsRewardsMode
      ? ([form.name, form.symbol, metadataURI, devBuyWei, rewards === "creator"] as const)
      : ([form.name, form.symbol, metadataURI, devBuyWei] as const);

    writeContract({
      chainId: chainId,
      address: curveLaunchpad,
      abi: launchpadAbi,
      functionName: "createTokenV3",
      args,
      value: fee + devBuyWei,
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{copy.create.title}</h1>
        <p className="mt-3 text-ink-3">{copy.create.subtitle}</p>
      </div>

      {/* The "nothing else" promise has to follow the actual fee, which is read on-chain and is
          owner-adjustable — so no number is written here. This line used to claim there was no
          creation fee at all, directly above a summary quoting one. */}
      <p className="mx-auto mt-4 max-w-lg text-center text-sm leading-relaxed text-ink-3">
        {feeEth
          ? `No presale, no team allocation — a ${feeEth} ${NATIVE_SYMBOL} creation fee plus network gas, and nothing else.`
          : "No presale, no team allocation, no creation fee — you pay network gas and nothing else."}
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_360px]">
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
                className="flex w-full items-center gap-4 rounded-xl border border-dashed border-white/15 bg-obsidian-900/60 p-4 text-left transition hover:border-coil-500/40"
              >
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-2xl">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    <IconImage size={26} className="text-ink-4" />
                  )}
                </div>
                <div className="min-w-0 text-xs">
                  <div className="font-semibold text-ink-2">
                    {imageFile ? imageFile.name : "Choose an image from your device"}
                  </div>
                  <div className="mt-0.5 text-ink-4">Max 4 MB · .jpg, .png or .gif</div>
                  <div className="text-ink-4">Min. 1000×1000px · 1:1 square recommended</div>
                </div>
              </button>
              {imageError && <p className="mt-1.5 text-[11px] text-down">{imageError}</p>}
              {imageWarn && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-warn">
                  <IconWarning size={12} /> {imageWarn}
                </p>
              )}
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

            {/* Rewards mode: who receives the fee stream — every holder (the loop)
                or the creator's wallet. Immutable once launched. */}
            {supportsRewardsMode && (
              <div>
                <span className="label mb-1.5 block">Rewards mode</span>
                {loopRewardsAvailable ? (
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          key: "loop",
                          title: "Loop Rewards",
                          Icon: IconRewards,
                          desc: "The per-swap fee's holder slice streams to every holder automatically — the classic Coil loop.",
                        },
                        {
                          key: "creator",
                          title: "Creator Rewards",
                          Icon: IconCrown,
                          desc: "The per-swap fee's holder slice is paid straight to your wallet instead.",
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setRewards(opt.key)}
                        className={`rounded-xl border p-3 text-left transition ${
                          rewards === opt.key
                            ? "border-coil-500/60 bg-coil-500/10"
                            : "border-white/10 bg-obsidian-900/60 hover:border-white/25"
                        }`}
                      >
                        <div
                          className={`flex items-center gap-1.5 text-sm font-semibold ${
                            rewards === opt.key ? "text-coil-400" : "text-ink-2"
                          }`}
                        >
                          <opt.Icon size={15} />
                          {opt.title}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Creator-Rewards-only chain: state it rather than showing a picker with one
                     disabled half, which reads as something being broken. */
                  <div className="rounded-xl border border-coil-500/40 bg-coil-500/10 p-3">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-coil-400">
                      <IconCrown size={15} />
                      Creator Rewards
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                      Every launch on {chainConfig(chainId).chain.name} pays the per-swap fee&apos;s
                      holder slice straight to your wallet. Fixed at launch, like everywhere else.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Per-swap fee — only on launchpads that let the creator set one. */}
            {mode === "v4" && totalFeeBps !== undefined && (
              <FeeRatePicker
                bps={totalFeeBps}
                onChange={setFeeChoice}
                minBps={minBps!}
                maxBps={maxBps!}
              />
            )}

            {/* Dev buy — V3: the pool's first swap inside the launch tx (front-run-proof).
                v4: a follow-up buy fired right after launch, through Coil Swap. */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label">Dev buy ({NATIVE_SYMBOL}) · optional</span>
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
              <p className="mt-1.5 text-[11px] text-ink-4">
                {mode === "v4"
                  ? "Bought for you in a second transaction right after launch, through Coil Swap."
                  : "Executed as the pool's very first swap, inside the launch transaction — impossible to front-run."}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/5 bg-obsidian-900/50 p-4 text-xs text-ink-3">
            <div className="mb-2 font-semibold text-ink-2">Launch parameters</div>
            <ul className="grid grid-cols-2 gap-y-1">
              <li>Supply: <span className="text-ink-2">1,000,000,000</span></li>
              {/* The pool's LP fee IS zero (POOL_FEE = 0 on the hook — no double charge), but
                  leading with "0% LP" made a creator parse protocol internals to find their own
                  number. The summary states just the fee they chose. */}
              <li>
                Swap fee:{" "}
                <span className="text-ink-2">
                  {mode !== "v4"
                    ? "1% (Uniswap V3)"
                    : totalFeeBps !== undefined
                      ? `${totalFeeBps / 100}% per swap`
                      : "per-swap, split on-chain"}
                </span>
              </li>
              <li>Liquidity: <span className="text-ink-2">locked forever</span></li>
              <li>
                Tradable:{" "}
                <span className="text-ink-2">
                  {mode === "v4" ? "instantly on Coil Swap" : "instantly, DexScreener from trade one"}
                </span>
              </li>
              <li>
                Rewards:{" "}
                <span className="text-coil-400">
                  {rewards === "creator" ? "pool fees to the creator" : "from pool fees, no staking"}
                </span>
              </li>
            </ul>
            <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-ink-3">One-time creation fee</span>
                <span className="tabular font-semibold text-ink">
                  {feeEth === undefined
                    ? "…"
                    : feeEth === 0
                      ? "Free — gas only"
                      : `${feeEth} ${NATIVE_SYMBOL}`}
                </span>
              </div>
              {devBuyNum > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-3">Dev buy</span>
                    <span className="font-mono text-ink-2">
                      {devBuyNum.toFixed(4)} {NATIVE_SYMBOL}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/5 pt-1">
                    <span className="text-ink-2">Total</span>
                    <span className="font-mono font-semibold text-white">
                      {((feeEth ?? 0) + devBuyNum).toFixed(4)} {NATIVE_SYMBOL}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {mode === "v4" ? (
            <LaunchWidget
              name={form.name}
              symbol={form.symbol}
              creatorRewards={rewards === "creator"}
              totalFeeBps={totalFeeBps}
              devBuyWei={devBuyWei}
              buildMetadataURI={buildMetadataURI}
            />
          ) : (
            <>
              {done ? (
                <div className="mt-6 rounded-xl border border-coil-500/30 bg-coil-500/10 p-4 text-center">
                  <p className="mt-1 font-semibold text-coil-400">
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
                        className="mt-2 break-all font-mono text-[11px] text-ink-3 underline decoration-dotted hover:text-white"
                      >
                        {newTokenAddress} ⧉
                      </button>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px]">
                        {dexUrl && (
                          <a
                            href={dexUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-coil-400 hover:underline"
                          >
                            DexScreener <IconExternal size={10} />
                          </a>
                        )}
                        <a
                          href={explorerUrl("token", newTokenAddress, chainId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-coil-400 hover:underline"
                        >
                          Explorer <IconExternal size={10} />
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
                <p className="mt-3 text-center text-[11px] text-down">
                  {uploadError ?? (error as { shortMessage?: string })?.shortMessage ?? "Transaction failed."}
                </p>
              )}
              {!isConnected && (
                <p className="mt-3 text-center text-[11px] text-ink-4">
                  {LIVE ? "Connect a wallet to deploy." : "Demo mode — this simulates the deploy transaction."}
                </p>
              )}
            </>
          )}
        </div>

        {/* Live preview — mirrors the token card on the home grid. */}
        <div className="md:sticky md:top-20 md:self-start">
          <div className="label mb-2">Live preview</div>
          <div className="glass p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-obsidian-800 text-4xl">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  <IconCoin size={30} className="text-ink-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-white">{form.name || "Your token"}</div>
                <span className="chip mt-1 inline-flex !px-2 !py-0.5">{form.symbol || "TICK"}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="label">Marketcap</div>
                <div className="mt-0.5 text-sm font-semibold text-white">—</div>
              </div>
              <div>
                <div className="label">24h Volume</div>
                <div className="mt-0.5 text-sm font-semibold text-coil-400">—</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-ink-4">
              <div className="flex items-center gap-2">
                <span>⧗ new</span>
                {(form.x || form.website) && (
                  <span className="flex items-center gap-1">
                    {form.x && (
                      <span className="grid h-6 w-6 place-items-center rounded-md border border-white/10 text-ink-3">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
                        </svg>
                      </span>
                    )}
                    {form.website && (
                      <span className="grid h-6 w-6 place-items-center rounded-md border border-white/10 text-ink-3">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <circle cx="12" cy="12" r="9" />
                          <path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
                        </svg>
                      </span>
                    )}
                  </span>
                )}
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-coil-500/10 px-2 py-0.5 text-[10px] font-semibold text-coil-400">
                <IconBolt size={11} /> Uniswap {mode === "v4" ? "v4" : "V3"}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-4">
            The moment you launch, the pool is live and its fees start feeding holder rewards — no
            extra setup.
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
