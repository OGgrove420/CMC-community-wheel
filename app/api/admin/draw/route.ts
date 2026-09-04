import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { initializeDatabase, sql } from "../../../../lib/db";

export const runtime = "nodejs";

function selectWinnerIndex(entryCount: number) {
  const range = 4294967296;
  const limit = range - (range % entryCount);

  while (true) {
    const randomValue = randomBytes(4);
    const value = randomValue.readUInt32BE(0);

    if (value < limit) {
      return {
        index: value % entryCount,
        randomValue: randomValue.toString("hex"),
      };
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const wallet = String(body.wallet || "").trim();
    const message = String(body.message || "");
    const signatureValues = body.signature;
    const adminWallet = process.env.ADMIN_WALLET;

    if (!adminWallet) {
      return NextResponse.json(
        { error: "admin wallet is not configured" },
        { status: 500 }
      );
    }

    if (wallet !== adminWallet) {
      return NextResponse.json(
        { error: "this wallet is not authorized" },
        { status: 403 }
      );
    }

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

    const nonceRows = await sql`
      SELECT message, expires_at, used
      FROM giveaway_admin_nonces
      WHERE wallet = ${wallet}
      LIMIT 1
    `;

    const nonce = nonceRows[0];

    if (!nonce) {
      return NextResponse.json(
        { error: "admin verification request not found" },
        { status: 400 }
      );
    }

    if (
      nonce.used ||
      new Date(nonce.expires_at).getTime() <= Date.now() ||
      nonce.message !== message
    ) {
      return NextResponse.json(
        { error: "admin verification request is invalid" },
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
        { error: "admin signature could not be verified" },
        { status: 401 }
      );
    }

    const settingsRows = await sql`
      SELECT ends_at, winner_entry_id
      FROM giveaway_settings
      WHERE id = 1
      LIMIT 1
    `;

    const settings = settingsRows[0];

    if (!settings?.ends_at) {
      return NextResponse.json(
        { error: "giveaway end time is not set" },
        { status: 400 }
      );
    }

    if (settings.winner_entry_id) {
      return NextResponse.json(
        { error: "winner has already been drawn" },
        { status: 409 }
      );
    }

    if (new Date(settings.ends_at).getTime() > Date.now()) {
      return NextResponse.json(
        { error: "giveaway countdown is still running" },
        { status: 403 }
      );
    }

    const countRows = await sql`
      SELECT COUNT(*)::INTEGER AS count
      FROM giveaway_entries
    `;

    const entryCount = Number(countRows[0]?.count || 0);

    if (entryCount < 1) {
      return NextResponse.json(
        { error: "there are no giveaway entries" },
        { status: 400 }
      );
    }

    const selection = selectWinnerIndex(entryCount);
    const randomCommitment = createHash("sha256")
      .update(selection.randomValue)
      .digest("hex");

    const consumed = await sql`
      UPDATE giveaway_admin_nonces
      SET used = TRUE
      WHERE wallet = ${wallet}
        AND used = FALSE
        AND expires_at > NOW()
      RETURNING wallet
    `;

    if (consumed.length !== 1) {
      return NextResponse.json(
        { error: "admin verification request is no longer valid" },
        { status: 409 }
      );
    }

    const auditDetails = JSON.stringify({
      entryCount,
      winnerIndex: selection.index,
      randomValue: selection.randomValue,
      randomCommitment,
      algorithm:
        "256-bit rejection sampling modulo ordered entry count",
    });

    const drawRows = await sql`
      WITH chosen AS (
        SELECT id
        FROM giveaway_entries
        ORDER BY id ASC
        OFFSET ${selection.index}
        LIMIT 1
      ),
      updated AS (
        UPDATE giveaway_settings
        SET
          winner_entry_id = (SELECT id FROM chosen),
          drawn_at = NOW(),
          entries_open = FALSE,
          updated_at = NOW()
        WHERE id = 1
          AND winner_entry_id IS NULL
          AND ends_at IS NOT NULL
          AND ends_at <= NOW()
          AND EXISTS (SELECT 1 FROM chosen)
        RETURNING winner_entry_id, drawn_at
      ),
      audited AS (
        INSERT INTO giveaway_audit (
          action,
          wallet,
          details
        )
        SELECT
          'winner_drawn',
          ${wallet},
          ${auditDetails}::jsonb
        FROM updated
        RETURNING id
      )
      SELECT
        entries.id,
        entries.wallet,
        updated.drawn_at
      FROM updated
      JOIN giveaway_entries AS entries
        ON entries.id = updated.winner_entry_id
    `;

    if (drawRows.length !== 1) {
      return NextResponse.json(
        { error: "winner was already drawn" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      winnerWallet: drawRows[0].wallet,
      drawnAt: new Date(drawRows[0].drawn_at).toISOString(),
      entryCount,
      winnerIndex: selection.index,
      randomValue: selection.randomValue,
      randomCommitment,
    });
  } catch (error) {
    console.error("winner draw error", error);

    return NextResponse.json(
      { error: "winner could not be drawn" },
      { status: 500 }
    );
  }
}
