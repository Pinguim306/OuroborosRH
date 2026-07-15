import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { NONCE_COOKIE, authConfigured, cookieSecure } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issue a single-use nonce for the sign-in message and stash it in an httpOnly cookie. */
export async function GET() {
  if (!authConfigured) return NextResponse.json({ error: "auth not configured" }, { status: 503 });
  const nonce = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.json({ nonce });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
