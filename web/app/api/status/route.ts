import { NextResponse } from "next/server";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { authConfigured, currentAddress } from "@/lib/authServer";

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

  const params = new URL(req.url).searchParams;

  // ?me=1 — with the session cookie, show what's actually stored vs. the session address, to catch
  // a write-key / read-key mismatch. Reveals the exact stored address (casing) and recent keys.
  if (params.get("me") === "1") {
    const me = currentAddress();
    const info: {
      sessionAddress: string | null;
      totalProfiles: number | null;
      exactMatch: boolean | null;
      caseInsensitiveMatch: boolean | null;
      storedAddress: string | null;
      recentAddresses: string[];
    } = {
      sessionAddress: me,
      totalProfiles: null,
      exactMatch: null,
      caseInsensitiveMatch: null,
      storedAddress: null,
      recentAddresses: [],
    };
    if (dbReachable) {
      try {
        const cnt = await sql`select count(*)::int as c from profiles`;
        info.totalProfiles = (cnt.rows[0] as { c: number }).c;
        if (me) {
          const ex = await sql`select address from profiles where address = ${me} limit 1`;
          info.exactMatch = ex.rows.length > 0;
          const ci = await sql`select address from profiles where lower(address) = ${me} limit 1`;
          info.caseInsensitiveMatch = ci.rows.length > 0;
          info.storedAddress = (ci.rows[0] as { address?: string } | undefined)?.address ?? null;
          const recent = await sql`select address from profiles order by updated_at desc limit 5`;
          info.recentAddresses = recent.rows.map((r) => (r as { address: string }).address);
        }
      } catch (e) {
        return NextResponse.json({ ...base, me: { ...info, error: (e as Error).message } });
      }
    }
    return NextResponse.json({ ...base, me: info });
  }

  if (params.get("selftest") !== "1" || !dbReachable) {
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
