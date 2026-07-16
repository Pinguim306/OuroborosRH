import { NextResponse } from "next/server";
import { sql, dbConfigured, ensureSchema } from "@/lib/db";
import { authConfigured, currentAddress } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** Create or update the signed-in wallet's profile. */
export async function POST(req: Request) {
  if (!dbConfigured || !authConfigured) {
    return NextResponse.json({ error: "profiles not configured" }, { status: 503 });
  }
  const address = currentAddress();
  if (!address) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let payload: { username?: string; bio?: string; avatarUrl?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const username = (payload.username ?? "").trim();
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Username must be 3–20 letters, numbers or underscores." }, { status: 400 });
  }
  const bio = (payload.bio ?? "").toString().slice(0, 280);
  const avatarUrl = (payload.avatarUrl ?? "").toString().slice(0, 500);
  if (avatarUrl && !/^https?:\/\//.test(avatarUrl) && !avatarUrl.startsWith("ipfs://")) {
    return NextResponse.json({ error: "Invalid avatar URL." }, { status: 400 });
  }

  const lower = username.toLowerCase();
  try {
    await ensureSchema();
    const clash = await sql`
      select address from profiles where username_lower = ${lower} and address <> ${address} limit 1
    `;
    if (clash.rows.length > 0) {
      return NextResponse.json({ error: "That username is taken." }, { status: 409 });
    }

    await sql`
      insert into profiles (address, username, username_lower, bio, avatar_url)
      values (${address}, ${username}, ${lower}, ${bio}, ${avatarUrl})
      on conflict (address) do update
        set username = ${username}, username_lower = ${lower}, bio = ${bio},
            avatar_url = ${avatarUrl}, updated_at = now()
    `;
  } catch (e) {
    // Surface the real DB error instead of a silent 500 — makes a misconfig debuggable.
    return NextResponse.json(
      { error: `Database error: ${(e as Error).message ?? "write failed"}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, profile: { address, username, bio, avatar_url: avatarUrl } });
}
