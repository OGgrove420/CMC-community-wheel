import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { initializeDatabase, sql } from "../../../../lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const wallet = String(body.wallet || "").trim();
    const message = String(body.message || "");
    const signatureValues = body.signature;
    const title = String(body.title || "").trim();
    const prize = String(body.prize || "").trim();
    const endsAtValue = String(body.endsAt || "").trim();
    const entriesOpen = body.entriesOpen === true;
    const adminWallet = process.env.ADMIN_WALLET;
        if (
      !message.startsWith(
        "CMC community wheel admin\n"
      ) ||
      message.startsWith(
        "CMC community wheel admin draw\n"
      )
    ) {
      return NextResponse.json(
        { error: "invalid settings authorization message" },
        { status: 400 }
      );
    }

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

    if (!title || title.length > 100) {
      return NextResponse.json(
        { error: "title must be between 1 and 100 characters" },
        { status: 400 }
      );
    }

    if (!prize || prize.length > 200) {
      return NextResponse.json(
        { error: "prize must be between 1 and 200 characters" },
        { status: 400 }
      );
    }

    const endsAt = new Date(endsAtValue);

    if (
      !endsAtValue ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "giveaway end time must be in the future" },
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

    if (nonce.used) {
      return NextResponse.json(
        { error: "admin verification request already used" },
        { status: 400 }
      );
    }

    if (new Date(nonce.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "admin verification request expired" },
        { status: 400 }
      );
    }

    if (nonce.message !== message) {
      return NextResponse.json(
        { error: "admin verification message does not match" },
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

    await sql`
      UPDATE giveaway_settings
      SET
        title = ${title},
        prize = ${prize},
        ends_at = ${endsAt.toISOString()},
        entries_open = ${entriesOpen},
        winner_entry_id = NULL,
        drawn_at = NULL,
        updated_at = NOW()
      WHERE id = 1
    `;

    const auditDetails = JSON.stringify({
      title,
      prize,
      endsAt: endsAt.toISOString(),
      entriesOpen,
    });

    await sql`
      INSERT INTO giveaway_audit (action, wallet, details)
      VALUES (
        'settings_updated',
        ${wallet},
        ${auditDetails}::jsonb
      )
    `;

    return NextResponse.json({
      success: true,
      title,
      prize,
      endsAt: endsAt.toISOString(),
      entriesOpen,
    });
  } catch (error) {
    console.error("admin settings error", error);

    return NextResponse.json(
      { error: "giveaway settings could not be updated" },
      { status: 500 }
    );
  }
}
