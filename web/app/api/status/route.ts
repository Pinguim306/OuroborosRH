import { NextResponse } from "next/server";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { authConfigured } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Config/health check for the profile + chat backend. Returns booleans only (no secrets), so you
 * can hit /api/status on the exact deployment to see what's wired up. `dbReachable` actually pings
 * the database; `dbError` carries the message when the connection fails.
 *
 * Add `?selftest=1` to run a real write→read→delete round-trip on the `profiles` table (using a
 * scratch address), which proves whether writes actually persist and are immediately readable — the
 * exact thing the profile save depends on.
 */
export async function GET(req: Request) {
  let dbReachable = false;
  let dbError: string | null = null;
  if (dbConfigured) {
    try {
      await ensureSchema();
      await sql`select 1`;
      dbReachable = true;
    } catch (e) {
      dbError = (e as Error).message ?? "unknown error";
    }
  }

  const base = {
    auth: authConfigured, // AUTH_SECRET set (>=16 chars)
    db: dbConfigured, // a Postgres connection string is present
    dbReachable, // the database actually responded
    dbError,
    ready: authConfigured && dbReachable,
  };

  if (new URL(req.url).searchParams.get("selftest") !== "1" || !dbReachable) {
    return NextResponse.json(base);
  }

  // Write → read → delete on a scratch profile row, mirroring the real save exactly.
  const addr = "0x00000000000000000000000000000000cced7e57"; // scratch key ('coil test')
  const uname = `selftest_${Date.now().toString(36)}`;
  const selftest: {
    wrote: boolean;
    readBack: boolean;
    rowCountAfterInsert: number | null;
    error: string | null;
  } = { wrote: false, readBack: false, rowCountAfterInsert: null, error: null };
  try {
    const ins = await sql`
      insert into profiles (address, username, username_lower)
      values (${addr}, ${uname}, ${uname})
      on conflict (address) do update set username = ${uname}, username_lower = ${uname}, updated_at = now()
    `;
    selftest.wrote = true;
    selftest.rowCountAfterInsert = ins.rowCount ?? null;
    const back = await sql`select username from profiles where address = ${addr} limit 1`;
    selftest.readBack = back.rows[0]?.username === uname;
    await sql`delete from profiles where address = ${addr}`;
  } catch (e) {
    selftest.error = (e as Error).message ?? "selftest failed";
  }

  return NextResponse.json({ ...base, selftest });
}
