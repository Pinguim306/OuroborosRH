import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyMessage, isAddress } from "viem";
import { buildSignInMessage } from "@/lib/siwe";
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL,
  authConfigured,
  cookieSecure,
  sessionCookieValue,
} from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify the signed sign-in message against the issued nonce and open a session. */
export async function POST(req: Request) {
  if (!authConfigured) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  let payload: { address?: string; issuedAt?: string; signature?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { address, issuedAt, signature } = payload;
  if (!address || !isAddress(address) || !issuedAt || !signature) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const nonce = cookies().get(NONCE_COOKIE)?.value;
  if (!nonce) return NextResponse.json({ error: "nonce expired — try again" }, { status: 400 });

  const t = Date.parse(issuedAt);
  if (Number.isNaN(t) || Math.abs(Date.now() - t) > 10 * 60 * 1000) {
    return NextResponse.json({ error: "stale request" }, { status: 400 });
  }

  const message = buildSignInMessage({ address, nonce, issuedAt });
  let ok = false;
  try {
    ok = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
  } catch {
    ok = false;
  }
  if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const res = NextResponse.json({ address: address.toLowerCase() });
  res.cookies.set(SESSION_COOKIE, sessionCookieValue(address), {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
  res.cookies.set(NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
