import { NextResponse } from "next/server";
import { sql, dbConfigured, ensureSchema } from "@/lib/db";
import { authConfigured, currentAddress } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TOKEN_RE = /^0x[0-9a-fA-F]{40}$/;
const MAX_BODY = 500;
const RATE_MS = 3000; // one message per 3s per wallet
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Recent messages for a token's chat room. `?after=<id>` returns only newer ones (for polling). */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (!dbConfigured || !TOKEN_RE.test(params.token)) {
    return NextResponse.json({ messages: [] }, { headers: NO_STORE });
  }
  await ensureSchema();
  const token = params.token.toLowerCase();
  const after = Number(new URL(req.url).searchParams.get("after") ?? "0") || 0;
  const { rows } = await sql`
    select m.id, m.address, m.body, m.created_at, p.username, p.avatar_url
    from messages m
    left join profiles p on p.address = m.address
    where m.token = ${token} and m.id > ${after}
    order by m.id desc
    limit 50
  `;
  return NextResponse.json({ messages: rows.reverse() }, { headers: NO_STORE }); // oldest → newest
}

/** Post a message to a token's chat room (signed-in wallets only, rate-limited). */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!dbConfigured || !authConfigured) {
    return NextResponse.json({ error: "chat not configured" }, { status: 503 });
  }
  if (!TOKEN_RE.test(params.token)) return NextResponse.json({ error: "bad token" }, { status: 400 });
  const address = currentAddress();
  if (!address) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let payload: { body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const body = (payload.body ?? "").toString().trim();
  if (!body) return NextResponse.json({ error: "empty message" }, { status: 400 });
  if (body.length > MAX_BODY) return NextResponse.json({ error: "message too long" }, { status: 400 });

  await ensureSchema();
  const token = params.token.toLowerCase();

  const last = await sql`select created_at from messages where address = ${address} order by id desc limit 1`;
  if (last.rows[0]) {
    const dt = Date.now() - new Date(last.rows[0].created_at as string).getTime();
    if (dt < RATE_MS) return NextResponse.json({ error: "slow down a moment" }, { status: 429 });
  }

  const { rows } = await sql`
    insert into messages (token, address, body) values (${token}, ${address}, ${body})
    returning id, address, body, created_at
  `;
  const prof = await sql`select username, avatar_url from profiles where address = ${address} limit 1`;
  const message = {
    ...rows[0],
    username: prof.rows[0]?.username ?? null,
    avatar_url: prof.rows[0]?.avatar_url ?? null,
  };
  return NextResponse.json({ message });
}
