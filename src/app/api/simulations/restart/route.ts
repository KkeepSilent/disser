import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser, unauthorized } from "@/lib/server/auth";
import { getMarketCandles } from "@/lib/server/market-data";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { scenarios } from "@/data/scenarios";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorized();
    const body = await request.json();
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) return NextResponse.json({ error: "Не найдена сессия симулятора." }, { status: 400 });

    const { data: oldSession, error: sessionError } = await getSupabaseAdmin()
      .from("simulation_sessions")
      .select("scenario_id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ scenario_id: string }>();
    if (sessionError) throw sessionError;
    const scenario = scenarios.find((item) => item.id === oldSession?.scenario_id);
    if (!scenario) return NextResponse.json({ error: "Сценарий сессии не найден." }, { status: 404 });
    const { candles, source } = await getMarketCandles(scenario);
    if (body.refresh_market === true && source !== "binance") {
      return NextResponse.json({ error: "Binance сейчас недоступен. Текущий снимок сохранён. Попробуйте позже." }, { status: 503 });
    }

    const { data, error } = await getSupabaseAdmin().rpc("restart_simulation_session", {
      p_user_id: user.id,
      p_session_id: sessionId,
      p_candles: candles,
      p_market_source: source
    });
    if (error) {
      const message = error.message ?? "Не удалось начать сценарий заново.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ session_id: data?.[0]?.new_session_id, candle_index: 0, candles, market_source: source });
  } catch (error) {
    return errorResponse(error);
  }
}
