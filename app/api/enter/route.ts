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

    if (nonce.used) {
      return NextResponse.json(
        { error: "verification request already used" },
        { status: 400 }
      );
    }

    if (new Date(nonce.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "verification request expired" },
        { status: 400 }
      );
    }

    if (nonce.message !== message) {
      return NextResponse.json(
        { error: "verification message does not match" },
        { status: 400 }
      );
    }

    const signature = Uint8Array.from(signatureValues);
    const encodedMessage = new TextEncoder().encode(message);

    const verified = nacl.sign.detached.verify(
      encodedMessage,
      signature,
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

    const inserted = await sql`
      INSERT INTO giveaway_entries (wallet, signature)
      VALUES (${wallet}, ${JSON.stringify(signatureValues)})
      ON CONFLICT (wallet) DO NOTHING
      RETURNING wallet
    `;

    return NextResponse.json({
      success: true,
      alreadyEntered: inserted.length === 0,
      wallet,
    });
  } catch {
    return NextResponse.json(
      { error: "entry could not be completed" },
      { status: 500 }
    );
  }
}
