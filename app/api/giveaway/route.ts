import { NextResponse } from "next/server";
import { initializeDatabase, sql } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initializeDatabase();

    const settingsRows = await sql`
      SELECT
        title,
        prize,
        ends_at,
        entries_open,
        winner_entry_id,
        drawn_at,
        updated_at
      FROM giveaway_settings
      WHERE id = 1
      LIMIT 1
    `;

    const countRows = await sql`
SELECT COUNT(*)::INTEGER AS count
FROM giveaway_entries
WHERE giveaway_round = (
  SELECT giveaway_round
  FROM giveaway_settings
  WHERE id = 1
)
    `;

    const settings = settingsRows[0];

    if (!settings) {
      return NextResponse.json(
        { error: "giveaway settings not found" },
        { status: 404 }
      );
    }

    const now = Date.now();
    const endsAt = settings.ends_at
      ? new Date(settings.ends_at).toISOString()
      : null;
    const countdownFinished = endsAt
      ? new Date(endsAt).getTime() <= now
      : false;

    return NextResponse.json(
      {
        title: settings.title,
        prize: settings.prize,
        endsAt,
        entriesOpen:
          Boolean(settings.entries_open) && !countdownFinished,
        entryCount: Number(countRows[0]?.count || 0),
        winnerDrawn: Boolean(settings.winner_entry_id),
        drawnAt: settings.drawn_at
          ? new Date(settings.drawn_at).toISOString()
          : null,
        updatedAt: new Date(settings.updated_at).toISOString(),
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("giveaway status error", error);

    return NextResponse.json(
      { error: "could not load giveaway" },
      { status: 500 }
    );
  }
}
