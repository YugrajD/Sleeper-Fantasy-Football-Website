import { getPlayoffForecast } from "@/lib/playoff-forecast";

export async function GET() {
  try {
    return Response.json(await getPlayoffForecast(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Playoff forecast failed", error);
    return Response.json({ error: "The playoff forecast is temporarily unavailable." }, { status: 503 });
  }
}
