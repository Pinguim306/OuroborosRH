import { NextResponse } from "next/server";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { authConfigured } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Config/health check for the profile + chat backend. Returns booleans only (no secrets), so you
 * can hit /api/status on the exact deployment to see what's wired up. `dbReachable` actually pings
 * the database; `dbError` carries the message when the connection fails.
 */
export async function GET() {
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
  return NextResponse.json({
    auth: authConfigured, // AUTH_SECRET set (>=16 chars)
    db: dbConfigured, // a Postgres connection string is present
    dbReachable, // the database actually responded
    dbError,
    ready: authConfigured && dbReachable,
  });
}
