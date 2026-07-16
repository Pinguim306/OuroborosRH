import { createPool, sql as defaultSql } from "@vercel/postgres";

/** First available Postgres connection string. `@vercel/postgres`'s default `sql` only reads
 *  `POSTGRES_URL`, but Vercel's Postgres (now Neon-backed) integrations often inject the URL under a
 *  different name — so accept the common ones. */
const CONNECTION_STRING =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  "";

/** True when a Postgres connection string is present. The profile + chat features degrade
 *  gracefully (read as empty, writes 503) until the store is provisioned and linked in Vercel. */
export const dbConfigured = !!CONNECTION_STRING;

/** Use the default `sql` when POSTGRES_URL is set (zero-config, pooled); otherwise build an explicit
 *  pool from whatever connection string we found so a differently-named env var still works. */
const pool = CONNECTION_STRING && !process.env.POSTGRES_URL ? createPool({ connectionString: CONNECTION_STRING }) : null;
const sql = pool ? pool.sql.bind(pool) : defaultSql;

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
