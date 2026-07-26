import { NextResponse } from "next/server";
import { CHAINS, DEFAULT_CHAIN_ID, type SupportedChainId } from "@/lib/chain";

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

/**
 * Which chain a request targets.
 *
 * The parameter is OPTIONAL and defaults to the default chain, which is what every v1 client sent
 * before Coil was multi-chain — so existing bots keep working byte-for-byte without knowing this
 * exists. An UNKNOWN id is rejected rather than silently defaulted: a bot asking for a chain this
 * deployment doesn't serve has a bug, and quietly answering with another chain's prices is the
 * worst possible response to it.
 *
 * Throws with a client-facing message; routes turn that into a 400.
 */
export function parseChain(raw: unknown): SupportedChainId {
  if (raw == null || raw === "") return DEFAULT_CHAIN_ID;
  const id = Number(raw);
  if (!Number.isInteger(id) || !CHAINS[id]) {
    throw new Error(
      `unknown chain "${String(raw)}" — supported: ${Object.keys(CHAINS).join(", ")}`,
    );
  }
  return id as SupportedChainId;
}

/** `?chain=<id>` on a GET. */
export function chainFromQuery(req: Request): SupportedChainId {
  return parseChain(new URL(req.url).searchParams.get("chain"));
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
