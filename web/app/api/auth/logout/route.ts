import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Clear the session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
