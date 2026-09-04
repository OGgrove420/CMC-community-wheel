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
      wallet TEXT NOT NULL UNIQUE,
      signature TEXT NOT NULL,
      entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  initialized = true;
