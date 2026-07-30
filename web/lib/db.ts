import { createPool, sql as defaultSql } from "@vercel/postgres";
import { CHAIN_ID } from "./chain";

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

/** Unparameterized SQL. Postgres rejects bind parameters in DDL, so a constant that has to live
 *  *inside* DDL (chain_id's default) can't go through `sql`. Compile-time constants only. */
const ddl = (text: string) => (pool ?? defaultSql).query(text);

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
      // Social handles — added after the table shipped, so backfill on existing installs.
      await sql`alter table profiles add column if not exists x text`;
      await sql`alter table profiles add column if not exists telegram text`;
      await sql`
        create table if not exists messages (
          id         bigserial primary key,
          token      text not null,
          address    text not null,
          body       text not null,
          created_at timestamptz not null default now()
        )
      `;
      // Chat rooms are keyed by (chain, token) — the same token address can exist on two chains,
      // and CREATE2 salt mining makes that more than theoretical. Added after the table shipped:
      // rows written before this column predate multi-chain, so the default backfills them (and any
      // insert from an old instance still mid-rollout) to the default chain.
      await ddl(// Rows that predate the chain_id column were all written when the site was Robinhood-only,
      // so the backfill default is CHAIN_ID — a fact about history, not about the current default.
      `alter table messages add column if not exists chain_id bigint not null default ${CHAIN_ID}`);
      await sql`create index if not exists messages_chain_token_id_idx on messages (chain_id, token, id desc)`;
      await sql`drop index if exists messages_token_id_idx`; // subsumed by the chain-first index
    })().catch((e) => {
      schemaReady = null; // let the next request retry
      throw e;
    });
  }
  return schemaReady;
}

export { sql };
