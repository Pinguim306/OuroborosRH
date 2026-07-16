import { NextRequest, NextResponse } from "next/server";
import { publicClient, normalizeAddress } from "@/lib/server/launchpad";
import {
  CONTRACTS,
  LIVE,
  launchpadAbi,
  COIL_LAUNCHPAD,
  LAUNCH_LIVE,
  coilLaunchpadV4Abi,
  isCoilToken,
} from "@/lib/contracts";

/**
 * Announce a freshly launched token in the project's Telegram channel. Called by
 * the create page right after the launch transaction confirms.
 *
 * Everything is re-verified on-chain (the token must exist on the launchpad and be
 * less than 15 minutes old), so the endpoint can't be abused to post arbitrary
 * content — the message is built entirely from on-chain data.
 *
 * Configure with:
 *   TELEGRAM_BOT_TOKEN — a bot created with @BotFather, added as admin of the channel
 *   TELEGRAM_CHAT_ID   — the channel id (e.g. @ouroboros_launches or -100…)
 * When either is unset the endpoint is a silent no-op, so the feature is opt-in.
 */

const MAX_AGE_SECONDS = 15 * 60;

// Best-effort duplicate suppression (per serverless instance).
const announced = new Map<string, number>();

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ouroborosrh.fun").replace(/\/$/, "");
const EXPLORER = "https://robinhoodchain.blockscout.com";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return NextResponse.json({ skipped: true });
  if (!LIVE) return NextResponse.json({ skipped: true });

  let token: ReturnType<typeof normalizeAddress> = null;
  try {
    const body = await req.json();
    token = normalizeAddress(body?.token);
  } catch {
    /* fall through to the 400 below */
  }
  if (!token) return NextResponse.json({ error: "invalid token address" }, { status: 400 });

  const key = token.toLowerCase();
  if (announced.has(key)) return NextResponse.json({ skipped: true });

  // Verify on-chain: the token must be registered on a launchpad (v4 hooks are recognizable from
  // their flag-encoded address; everything else is looked up on the primary v3/curve launchpad)
  // and freshly created. All announced content comes from the chain, not the request.
  try {
    let name: string;
    let symbol: string;
    let createdAt: bigint;
    let flavor: string;

    if (isCoilToken(token) && LAUNCH_LIVE) {
      const idx = (await publicClient.readContract({
        address: COIL_LAUNCHPAD,
        abi: coilLaunchpadV4Abi,
        functionName: "marketIndexByToken",
        args: [token],
      })) as bigint;
      if (idx === 0n) return NextResponse.json({ error: "unknown token" }, { status: 404 });
      const m = (await publicClient.readContract({
        address: COIL_LAUNCHPAD,
        abi: coilLaunchpadV4Abi,
        functionName: "markets",
        args: [idx - 1n],
      })) as readonly [string, string, boolean, string, string, string, bigint];
      name = m[3];
      symbol = m[4];
      createdAt = m[6];
      flavor = "⚡ Uniswap v4 pool";
    } else {
      const idx = (await publicClient.readContract({
        address: CONTRACTS.launchpad,
        abi: launchpadAbi,
        functionName: "marketIndexByToken",
        args: [token],
      })) as bigint;
      if (idx === 0n) return NextResponse.json({ error: "unknown token" }, { status: 404 });

      const market = (await publicClient.readContract({
        address: CONTRACTS.launchpad,
        abi: launchpadAbi,
        functionName: "markets",
        args: [idx - 1n],
      })) as readonly [string, string, string, string, string, string, bigint];
      name = market[3];
      symbol = market[4];
      createdAt = market[6];

      const isV3 = await publicClient
        .readContract({
          address: CONTRACTS.launchpad,
          abi: launchpadAbi,
          functionName: "isV3Token",
          args: [token],
        })
        .then(Boolean)
        .catch(() => false);
      flavor = isV3 ? "⚡ Instant V3 pool" : "📈 Bonding curve";
    }

    const age = Math.floor(Date.now() / 1000) - Number(createdAt);
    if (age < 0 || age > MAX_AGE_SECONDS) {
      return NextResponse.json({ error: "token too old to announce" }, { status: 400 });
    }

    const lines = [
      `🐍 <b>New launch on Coil</b>`,
      ``,
      `<b>${esc(name)}</b> ($${esc(symbol)}) — ${flavor}`,
      `CA: <code>${token}</code>`,
      ``,
      `<a href="${SITE_URL}/token/${token}">Trade on Coil</a>` +
        ` · <a href="${EXPLORER}/token/${token}">Explorer</a>`,
    ];

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: `telegram: ${detail.slice(0, 200)}` }, { status: 502 });
    }

    announced.set(key, Date.now());
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "announce failed" }, { status: 500 });
  }
}
