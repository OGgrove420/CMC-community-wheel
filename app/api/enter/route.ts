import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { initializeDatabase, sql } from "../../../lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const wallet = String(body.wallet || "").trim();
    const message = String(body.message || "");
    const signatureValues = body.signature;

    let publicKey: PublicKey;

    try {
      publicKey = new PublicKey(wallet);
    } catch {
      return NextResponse.json(
        { error: "invalid Solana wallet" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(signatureValues) ||
      signatureValues.length !== 64 ||
      !signatureValues.every(
        (value) =>
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 255
      )
    ) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 400 }
      );
    }

    await initializeDatabase();

    const settingsRows = await sql`
      SELECT
        entries_open,
        ends_at,
        giveaway_round
      FROM giveaway_settings
      WHERE id = 1
      LIMIT 1
    `;

    const settings = settingsRows[0];

    if (
      !settings ||
      !settings.entries_open ||
      !settings.ends_at ||
      new Date(settings.ends_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "giveaway entries are closed" },
        { status: 403 }
      );
    }

    const giveawayRound = Number(settings.giveaway_round);

    const nonceRows = await sql`
      SELECT message, expires_at, used
      FROM giveaway_nonces
      WHERE wallet = ${wallet}
      LIMIT 1
    `;

    const nonce = nonceRows[0];

    if (!nonce) {
      return NextResponse.json(
        { error: "verification request not found" },
        { status: 400 }
      );
    }

    if (
      nonce.used ||
      new Date(nonce.expires_at).getTime() <= Date.now() ||
      nonce.message !== message
    ) {
      return NextResponse.json(
        { error: "verification request is invalid" },
        { status: 400 }
      );
    }

    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      Uint8Array.from(signatureValues),
      publicKey.toBytes()
    );

    if (!verified) {
      return NextResponse.json(
        { error: "wallet signature could not be verified" },
        { status: 401 }
      );
    }

    const consumed = await sql`
      UPDATE giveaway_nonces
      SET used = TRUE
      WHERE wallet = ${wallet}
        AND used = FALSE
        AND expires_at > NOW()
      RETURNING wallet
    `;

    if (consumed.length !== 1) {
      return NextResponse.json(
        { error: "verification request is no longer valid" },
        { status: 409 }
      );
    }

    const storedSignature = JSON.stringify(signatureValues);

    const inserted = await sql`
      INSERT INTO giveaway_entries (
        wallet,
        signature,
        giveaway_round
      )
      SELECT
        ${wallet},
        ${storedSignature},
        giveaway_round
      FROM giveaway_settings
      WHERE id = 1
        AND giveaway_round = ${giveawayRound}
        AND entries_open = TRUE
        AND ends_at > NOW()
      ON CONFLICT (wallet, giveaway_round) DO NOTHING
      RETURNING wallet
    `;

    if (inserted.length === 0) {
      const existing = await sql`
        SELECT wallet
        FROM giveaway_entries
        WHERE wallet = ${wallet}
          AND giveaway_round = ${giveawayRound}
        LIMIT 1
      `;

      if (existing.length > 0) {
        return NextResponse.json({
          success: true,
          alreadyEntered: true,
          wallet,
          giveawayRound,
        });
      }

      return NextResponse.json(
        { error: "giveaway entries are closed" },
        { status: 403 }
      );
    }

    const auditDetails = JSON.stringify({
      wallet,
      giveawayRound,
    });

    await sql`
      INSERT INTO giveaway_audit (
        action,
        wallet,
        details
      )
      VALUES (
        'entry_created',
        ${wallet},
        ${auditDetails}::jsonb
      )
    `;

    return NextResponse.json({
      success: true,
      alreadyEntered: false,
      wallet,
      giveawayRound,
    });
  } catch (error) {
    console.error("giveaway entry error", error);

    return NextResponse.json(
      { error: "entry could not be completed" },
      { status: 500 }
    );
  }
}
