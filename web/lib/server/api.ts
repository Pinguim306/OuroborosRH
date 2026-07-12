import { NextResponse } from "next/server";

/**
 * Shared helpers for the public trade API (`/api/v1/*`).
 *
 * Auth: if `LAUNCHPAD_API_KEY` is set, requests must present it via
 * `Authorization: Bearer <key>` or an `x-api-key` header. If it is unset, the API
 * is open (handy for local/demo). Set the key in production before pointing bots
 * at it.
 */

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...(data as object) }, init);
}

export function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** Returns a 401 response when auth is required and missing/invalid; else null. */
export function checkAuth(req: Request): NextResponse | null {
  const required = process.env.LAUNCHPAD_API_KEY;
  if (!required) return null; // auth disabled
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const key = bearer || req.headers.get("x-api-key") || undefined;
  if (key !== required) return fail(401, "unauthorized — provide a valid API key");
  return null;
}

/** Parse a decimal or hex string into a non-negative bigint, or throw. */
export function parseBig(value: unknown, field: string): bigint {
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing or invalid "${field}"`);
  }
  let v: bigint;
  try {
    v = BigInt(value);
  } catch {
    throw new Error(`"${field}" must be an integer (wei) string`);
  }
  if (v < 0n) throw new Error(`"${field}" must be non-negative`);
  return v;
}
