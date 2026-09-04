import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { initializeDatabase, sql } from "../../../..//lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const wallet = String(body.wallet || "").trim();

    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json(
        { error: "invalid Solana wallet" },
        { status: 400 }
      );
    }

    const nonce = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const message = [
      "CMC community wheel",
      "",
      "sign this message to enter the giveaway.",
      "this does not send a transaction or authorize spending.",
      "",
      `wallet: ${wallet}`,
      `nonce: ${nonce}`,
      `expires: ${expiresAt.toISOString()}`,
    ].join("\n");

    await initializeDatabase();

    await sql`
      INSERT INTO giveaway_nonces (
        wallet,
        nonce,
        message,
        expires_at,
        used
      )
      VALUES (
        ${wallet},
        ${nonce},
        ${message},
        ${expiresAt.toISOString()},
        FALSE
      )
      ON CONFLICT (wallet)
      DO UPDATE SET
        nonce = EXCLUDED.nonce,
        message = EXCLUDED.message,
        expires_at = EXCLUDED.expires_at,
        used = FALSE,
        created_at = NOW()
    `;

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json(
      { error: "could not create verification request" },
      { status: 500 }
    );
  }
}

before committing, correct this import line:

import { initializeDatabase, sql } from "../../../..//lib/db";

to:

import { initializeDatabase, sql } from "../../../../lib/db";
