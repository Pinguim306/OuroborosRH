import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { sql, dbConfigured, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Never let the browser or CDN cache a profile read — otherwise an early empty result gets served
// stale after the profile is created.
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Public profile for an address (or null when none / DB not configured). */
export async function GET(_req: Request, { params }: { params: { address: string } }) {
  if (!dbConfigured || !isAddress(params.address)) {
    return NextResponse.json({ profile: null }, { headers: NO_STORE });
  }
  await ensureSchema();
  const address = params.address.toLowerCase();
  const { rows } = await sql`
    select address, username, bio, avatar_url, created_at
    from profiles where address = ${address} limit 1
  `;
  return NextResponse.json({ profile: rows[0] ?? null }, { headers: NO_STORE });
}
