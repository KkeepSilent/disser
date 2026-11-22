import { NextResponse } from "next/server";
import { scenarios } from "@/data/scenarios";
import { errorResponse, requireUser, unauthorized } from "@/lib/server/auth";
import { parseCandleSnapshot } from "@/lib/server/market-data";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return unauthorized();
    const { id } = await context.params;

    const { data: existing, error: lookupError } = await getSupabaseAdmin()
      .from("trades")
      .select("id, scenario_id, session_id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ error: "Сделка не найдена." }, { status: 404 });
    if (existing.status !== "open") return NextResponse.json({ error: "Сделка уже закрыта." }, { status: 409 });

    const scenario = scenarios.find((item) => item.id === existing.scenario_id);
    const { data: session, error: sessionError } = await getSupabaseAdmin()
      .from("simulation_sessions")
      .select("current_candle_index, candles")
      .eq("id", existing.session_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    const candles = scenario ? parseCandleSnapshot(session?.candles, scenario.candles) : [];
    const candleIndex = Math.min(Math.max(Number(session?.current_candle_index) || 0, 0), candles.length - 1);
    const exitPrice = candles[candleIndex]?.close;
    if (!exitPrice) return NextResponse.json({ error: "Сценарий сделки больше недоступен." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().rpc("close_trade", {
      p_user_id: user.id,
      p_trade_id: id,
      p_exit: exitPrice
    });
    if (error) {
      const message = error.message ?? "Не удалось закрыть сделку.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const { data: account, error: accountError } = await getSupabaseAdmin()
      .from("app_users")
      .select("balance")
      .eq("id", user.id)
      .single();
    if (accountError) throw accountError;

    return NextResponse.json({ trade: data, balance: Number(account.balance) });
  } catch (error) {
    return errorResponse(error);
  }
}
