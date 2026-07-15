import crypto from "node:crypto";
import { cookies } from "next/headers";

/** HMAC secret for signing the session cookie. Set AUTH_SECRET (any long random string) in the
 *  Vercel env. Without it, auth-gated features return 503. */
const SECRET = process.env.AUTH_SECRET || "";
export const authConfigured = SECRET.length >= 16;

export const SESSION_COOKIE = "coil_session";
export const NONCE_COOKIE = "coil_nonce";
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days (seconds)
export const cookieSecure = process.env.NODE_ENV === "production";

function hmac(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}
function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function decode<T>(s: string): T | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

/** Build the signed session cookie value `<payload>.<hmac>` binding a proven address. */
export function sessionCookieValue(address: string): string {
  const payload = encode({ a: address.toLowerCase(), e: Math.floor(Date.now() / 1000) + SESSION_TTL });
  return `${payload}.${hmac(payload)}`;
}

/** Verify a session cookie value and return the address, or null if missing/tampered/expired. */
export function readSession(value?: string): string | null {
  if (!authConfigured || !value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = hmac(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  const data = decode<{ a: string; e: number }>(payload);
  if (!data || data.e < Math.floor(Date.now() / 1000)) return null;
  return data.a;
}

/** The address of the currently signed-in wallet (from the request cookies), or null. */
export function currentAddress(): string | null {
  return readSession(cookies().get(SESSION_COOKIE)?.value);
}
