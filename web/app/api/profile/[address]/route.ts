import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { sql, dbConfigured, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public profile for an address (or null when none / DB not configured). */
export async function GET(_req: Request, { params }: { params: { address: string } }) {
  if (!dbConfigured || !isAddress(params.address)) return NextResponse.json({ profile: null });
  await ensureSchema();
  const address = params.address.toLowerCase();
  const { rows } = await sql`
    select address, username, bio, avatar_url, created_at
    from profiles where address = ${address} limit 1
  `;
  return NextResponse.json({ profile: rows[0] ?? null });
}
