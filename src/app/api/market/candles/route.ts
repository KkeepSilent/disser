import { NextRequest, NextResponse } from "next/server";
import { scenarios } from "@/data/scenarios";
import { getMarketCandles } from "@/lib/server/market-data";
import { errorResponse } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    const scenarioId = request.nextUrl.searchParams.get("scenario_id");
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (!scenario) return NextResponse.json({ error: "Сценарий не найден." }, { status: 400 });

    const result = await getMarketCandles(scenario);
    return NextResponse.json({ candles: result.candles, source: result.source, as_of: result.candles.at(-1)?.closedAt ?? null }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
