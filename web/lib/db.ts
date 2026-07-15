import { sql } from "@vercel/postgres";

/** True when a Vercel Postgres connection string is present. The profile + chat features degrade
 *  gracefully (read as empty, writes 503) until the store is provisioned and linked in Vercel. */
export const dbConfigured = !!(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING);

let schemaReady: Promise<void> | null = null;

/** Create the tables on first use (idempotent). Cached so it runs once per warm instance. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists profiles (
          address        text primary key,
          username       text,
          username_lower text unique,
          bio            text,
          avatar_url     text,
          created_at     timestamptz not null default now(),
          updated_at     timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists messages (
          id         bigserial primary key,
          token      text not null,
          address    text not null,
          body       text not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists messages_token_id_idx on messages (token, id desc)`;
    })().catch((e) => {
      schemaReady = null; // let the next request retry
      throw e;
    });
  }
  return schemaReady;
}

export { sql };
