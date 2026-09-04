import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { initializeDatabase, sql } from "../../../../lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const wallet = String(body.wallet || "").trim();
    const adminWallet = process.env.ADMIN_WALLET;

    if (!adminWallet) {
      return NextResponse.json(
        { error: "admin wallet is not configured" },
        { status: 500 }
      );
    }

    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json(
        { error: "invalid Solana wallet" },
        { status: 400 }
      );
    }

    if (wallet !== adminWallet) {
      return NextResponse.json(
        { error: "this wallet is not authorized" },
        { status: 403 }
      );
    }

    await initializeDatabase();

    await sql`
      CREATE TABLE IF NOT EXISTS giveaway_admin_nonces (
        wallet TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const nonce = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const message = [
      "CMC community wheel admin draw",
      "",
      "sign this message to draw the giveaway winner.",
      "this action is final and can only be completed once.",
      "this does not send a transaction or authorize spending.",
      "",
      `wallet: ${wallet}`,
      `nonce: ${nonce}`,
      `expires: ${expiresAt.toISOString()}`,
    ].join("\n");

    await sql`
      INSERT INTO giveaway_admin_nonces (
        wallet,
        message,
        expires_at,
        used
      )
      VALUES (
        ${wallet},
        ${message},
        ${expiresAt.toISOString()},
        FALSE
      )
      ON CONFLICT (wallet)
      DO UPDATE SET
        message = EXCLUDED.message,
        expires_at = EXCLUDED.expires_at,
        used = FALSE,
        created_at = NOW()
    `;

    return NextResponse.json({ message });
  } catch (error) {
    console.error("draw nonce error", error);

    return NextResponse.json(
      { error: "could not create draw authorization" },
      { status: 500 }
    );
  }
}
