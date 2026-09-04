import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

export const sql = neon(process.env.DATABASE_URL);

let initialized = false;

export async function initializeDatabase() {
  if (initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS giveaway_nonces (
      wallet TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      id BIGSERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      signature TEXT NOT NULL,
      giveaway_round BIGINT NOT NULL DEFAULT 1,
      entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE giveaway_entries
    ADD COLUMN IF NOT EXISTS giveaway_round BIGINT
    NOT NULL DEFAULT 1
  `;

  await sql`
    ALTER TABLE giveaway_entries
    DROP CONSTRAINT IF EXISTS giveaway_entries_wallet_key
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS
    giveaway_entries_wallet_round_key
    ON giveaway_entries (wallet, giveaway_round)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS giveaway_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      title TEXT NOT NULL DEFAULT 'CMC community wheel',
      prize TEXT NOT NULL DEFAULT 'tbd',
      ends_at TIMESTAMPTZ,
      entries_open BOOLEAN NOT NULL DEFAULT FALSE,
      giveaway_round BIGINT NOT NULL DEFAULT 1,
      winner_entry_id BIGINT REFERENCES giveaway_entries(id),
      drawn_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE giveaway_settings
    ADD COLUMN IF NOT EXISTS giveaway_round BIGINT
    NOT NULL DEFAULT 1
  `;

  await sql`
    INSERT INTO giveaway_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS giveaway_audit (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      wallet TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  initialized = true;
}
