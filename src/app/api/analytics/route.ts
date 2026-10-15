import { NextResponse } from "next/server";
import { getLeagueAnalytics } from "@/lib/analytics";

export async function GET() {
  try {
    return NextResponse.json(await getLeagueAnalytics(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Sleeper analytics are temporarily unavailable." }, { status: 503 });
  }
}
