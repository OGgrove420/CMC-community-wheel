import { NextResponse } from "next/server";
import { initializeDatabase, sql } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initializeDatabase();

    const resultRows = await sql`
      SELECT
        settings.title,
        settings.prize,
        settings.ends_at,
        settings.drawn_at,
        entries.wallet AS winner_wallet
      FROM giveaway_settings AS settings
      LEFT JOIN giveaway_entries AS entries
        ON entries.id = settings.winner_entry_id
      WHERE settings.id = 1
      LIMIT 1
    `;

    const result = resultRows[0];

    if (!result) {
      return NextResponse.json(
        { error: "giveaway not found" },
        { status: 404 }
      );
    }

    if (!result.winner_wallet || !result.drawn_at) {
      return NextResponse.json(
        {
          title: result.title,
          prize: result.prize,
          endsAt: result.ends_at
            ? new Date(result.ends_at).toISOString()
            : null,
          winnerDrawn: false,
        },
        {
          headers: {
            "cache-control": "no-store",
          },
        }
      );
    }

    const auditRows = await sql`
      SELECT details, created_at
      FROM giveaway_audit
      WHERE action = 'winner_drawn'
      ORDER BY id DESC
      LIMIT 1
    `;

    const audit = auditRows[0];
    const details = audit?.details || {};

    return NextResponse.json(
      {
        title: result.title,
        prize: result.prize,
        endsAt: result.ends_at
          ? new Date(result.ends_at).toISOString()
          : null,
        winnerDrawn: true,
        winnerWallet: result.winner_wallet,
        drawnAt: new Date(result.drawn_at).toISOString(),
        draw: {
          entryCount: details.entryCount ?? null,
          winnerIndex: details.winnerIndex ?? null,
          randomValue: details.randomValue ?? null,
          randomCommitment: details.randomCommitment ?? null,
          algorithm: details.algorithm ?? null,
        },
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("public results error", error);

    return NextResponse.json(
      { error: "could not load giveaway result" },
      { status: 500 }
    );
  }
}
