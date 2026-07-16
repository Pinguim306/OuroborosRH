import { NextResponse } from "next/server";
import { sql, dbConfigured, ensureSchema } from "@/lib/db";
import { authConfigured, currentAddress } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const HANDLE_RE = /^[a-zA-Z0-9_]{1,32}$/;

/** Strip @, URL prefixes and trailing slashes from a social handle, keeping just the username. */
function handle(v?: string): string {
  return (v ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|t\.me|telegram\.me)\//i, "")
    .replace(/\/+$/, "")
    .slice(0, 32);
}

/** Create or update the signed-in wallet's profile. */
export async function POST(req: Request) {
  if (!dbConfigured || !authConfigured) {
    return NextResponse.json({ error: "profiles not configured" }, { status: 503 });
  }
  const address = currentAddress();
  if (!address) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let payload: { username?: string; bio?: string; avatarUrl?: string; x?: string; telegram?: string };
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
  const x = handle(payload.x);
  const telegram = handle(payload.telegram);
  if (x && !HANDLE_RE.test(x)) {
    return NextResponse.json({ error: "Invalid X handle." }, { status: 400 });
  }
  if (telegram && !HANDLE_RE.test(telegram)) {
    return NextResponse.json({ error: "Invalid Telegram handle." }, { status: 400 });
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
      insert into profiles (address, username, username_lower, bio, avatar_url, x, telegram)
      values (${address}, ${username}, ${lower}, ${bio}, ${avatarUrl}, ${x}, ${telegram})
      on conflict (address) do update
        set username = ${username}, username_lower = ${lower}, bio = ${bio},
            avatar_url = ${avatarUrl}, x = ${x}, telegram = ${telegram}, updated_at = now()
    `;
  } catch (e) {
    // Surface the real DB error instead of a silent 500 — makes a misconfig debuggable.
    return NextResponse.json(
      { error: `Database error: ${(e as Error).message ?? "write failed"}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    profile: { address, username, bio, avatar_url: avatarUrl, x, telegram },
  });
}
