import { NextResponse } from "next/server";
import { initializeDatabase, sql } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initializeDatabase();

    const rows = await sql`
      SELECT
        settings.title,
        settings.prize,
        settings.ends_at,
        settings.drawn_at,
        entries.wallet AS winner_wallet,
        audit.details AS draw_details
      FROM giveaway_settings AS settings
      LEFT JOIN giveaway_entries AS entries
        ON entries.id = settings.winner_entry_id
      LEFT JOIN LATERAL (
        SELECT details
        FROM giveaway_audit
        WHERE action = 'winner_drawn'
        ORDER BY id DESC
        LIMIT 1
      ) AS audit ON TRUE
      WHERE settings.id = 1
      LIMIT 1
    `;

    const result = rows[0];

    if (!result) {
      return NextResponse.json(
        { error: "giveaway result not found" },
        { status: 404 }
      );
    }

    const details = result.winner_wallet
      ? result.draw_details
      : null;

    return NextResponse.json(
      {
        title: result.title,
        prize: result.prize,
        endsAt: result.ends_at
          ? new Date(result.ends_at).toISOString()
          : null,
        drawn: Boolean(result.winner_wallet),
        winnerWallet: result.winner_wallet || null,
        drawnAt: result.drawn_at
          ? new Date(result.drawn_at).toISOString()
          : null,
        audit: details
          ? {
              entryCount: Number(details.entryCount),
              winnerIndex: Number(details.winnerIndex),
              randomValue: String(details.randomValue),
              randomCommitment: String(
                details.randomCommitment
              ),
              algorithm: String(details.algorithm),
            }
          : null,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("giveaway result error", error);

    return NextResponse.json(
      { error: "could not load giveaway result" },
      { status: 500 }
    );
  }
}
