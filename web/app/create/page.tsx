"use client";

import { useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
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
    image: "🐍",
    x: "",
    telegram: "",
    website: "",
  });
  const [status, setStatus] = useState<"idle" | "deploying" | "done">("idle");

  const { data: creationFee } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "creationFee",
    query: { enabled: LIVE },
  });
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live: real createToken tx (metadataURI carries the image). Demo: simulate.
  const busy = LIVE ? isPending || confirming : status === "deploying";
  const done = LIVE ? isSuccess : status === "done";

  function deploy() {
    if (!form.name || !form.symbol) return;
    if (LIVE) {
      writeContract({
        address: CONTRACTS.launchpad,
        abi: launchpadAbi,
        functionName: "createToken",
        args: [form.name, form.symbol, form.image],
        value: (creationFee as bigint | undefined) ?? parseEther("0.01"),
      });
      return;
    }
    setStatus("deploying");
    setTimeout(() => setStatus("done"), 1800);
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

            <Field label={copy.create.fields.image}>
              <input className="field" value={form.image} onChange={set("image")} placeholder="🐍 or https://…" />
            </Field>

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
              <li>Graduation: <span className="text-white/70">400 {NATIVE_SYMBOL} raised</span></li>
              <li>Rewards: <span className="text-venom-400">to holders, no staking</span></li>
            </ul>
            <p className="mt-2 text-white/40">
              Fees fund permanent liquidity and holder rewards automatically.
            </p>
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
              <Link href="/" className="btn-ghost mt-3 inline-flex">
                View the market
              </Link>
            </div>
          ) : (
            <button
              onClick={deploy}
              disabled={!form.name || !form.symbol || busy || (LIVE && !isConnected)}
              className="btn-primary mt-6 w-full text-base"
            >
              {busy ? copy.create.submitting : copy.create.submit}
            </button>
          )}

          {busy && (
            <div className="mt-3">
              <ProgressBar value={confirming ? 0.85 : 0.4} />
            </div>
          )}
          {LIVE && error && (
            <p className="mt-3 text-center text-[11px] text-red-400">
              {(error as { shortMessage?: string }).shortMessage ?? "Transaction failed."}
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
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-obsidian-800 text-2xl">
                {form.image?.startsWith("http") ? "🖼️" : form.image || "🐍"}
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
            <div className="mt-3 flex justify-between text-xs text-white/40">
              <span>👥 0 holders</span>
              <span>Fresh launch</span>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/35">
            The moment you launch, fees start compounding into liquidity and loyalty rewards — no
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
