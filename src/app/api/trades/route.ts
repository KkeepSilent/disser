import { NextRequest, NextResponse } from "next/server";
import { scenarios } from "@/data/scenarios";
import { errorResponse, requireUser, unauthorized } from "@/lib/server/auth";
import { getMarketCandles, parseCandleSnapshot } from "@/lib/server/market-data";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Candle } from "@/lib/types";

type Session = { id: string; current_candle_index: number; candles: unknown; market_source: "binance" | "fallback"; created_at: string };
const SESSION_COLUMNS = "id, current_candle_index, candles, market_source, created_at";

async function getActiveSession(userId: string, scenarioId: string) {
  return getSupabaseAdmin()
    .from("simulation_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .eq("scenario_id", scenarioId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Session>();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorized();

    const scenarioId = request.nextUrl.searchParams.get("scenario_id");
    let session: Session | null = null;
    let candles: Candle[] | null = null;
    let marketSource: "binance" | "fallback" = "fallback";
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (scenarioId && !scenario) return NextResponse.json({ error: "Сценарий не найден." }, { status: 400 });
    let tradesQuery = getSupabaseAdmin()
      .from("trades")
      .select("id, user_id, scenario_id, asset_symbol, side, entry_price, quantity, stop_loss, risk_percent, status, exit_price, realized_pnl, created_at, closed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (scenario) tradesQuery = tradesQuery.eq("scenario_id", scenario.id);
    if (user.demo_reset_at) tradesQuery = tradesQuery.gt("created_at", user.demo_reset_at);
    const [{ data, error }, activeSession] = await Promise.all([
      tradesQuery, scenario ? getActiveSession(user.id, scenario.id) : null
    ]);
    if (error) throw error;

    if (scenario && activeSession) {
      if (activeSession.error) throw activeSession.error;
      session = activeSession.data;
      if (!session) {
        const market = await getMarketCandles(scenario);
        const { data: created, error: createError } = await getSupabaseAdmin()
          .from("simulation_sessions")
          .insert({
            user_id: user.id,
            scenario_id: scenario.id,
            starting_balance: user.balance,
            current_balance: user.balance,
            current_candle_index: 0,
            candles: market.candles,
            market_source: market.source,
            status: "active"
          })
          .select(SESSION_COLUMNS)
          .single<Session>();
        if (createError?.code === "23505") {
          const { data: concurrent, error: retryError } = await getActiveSession(user.id, scenario.id);
          if (retryError) throw retryError;
          session = concurrent;
        } else {
          if (createError) throw createError;
          session = created;
        }
      }

      if (!session) throw new Error("Не удалось создать сессию симулятора.");
      candles = parseCandleSnapshot(session.candles, scenario.candles);
      marketSource = session.market_source ?? "fallback";
      if (!session.candles) {
        const { error: snapshotError } = await getSupabaseAdmin()
          .from("simulation_sessions")
          .update({ candles })
          .eq("id", session.id)
          .is("candles", null);
        if (snapshotError) throw snapshotError;
      }
    }

    return NextResponse.json({
      trades: data ?? [],
      session_id: session?.id ?? null,
      candle_index: session?.current_candle_index ?? 0,
      candles,
      market_source: marketSource,
      snapshot_at: candles?.at(-1)?.closedAt ?? null,
      session_created_at: session?.created_at ?? null,
      balance: user.balance
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorized();

    const body = await request.json();
    const scenarioId = typeof body.scenario_id === "string" ? body.scenario_id : "";
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    const scenario = scenarios.find((item) => item.id === scenarioId);
    const side = body.side === "buy" || body.side === "sell" ? body.side : null;
    const quantity = Number(body.quantity);
    const expectedCandleIndex = Number(body.expected_candle_index);
    const stopRaw = body.stop_loss;
    const stopLoss = stopRaw === null || stopRaw === undefined || stopRaw === "" ? null : Number(stopRaw);

    if (!scenario || !side) {
      return NextResponse.json({ error: "Выберите корректный сценарий и сторону сделки." }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > 1_000_000_000) {
      return NextResponse.json({ error: "Размер позиции должен быть не меньше 0.01." }, { status: 400 });
    }
    if (!Number.isInteger(expectedCandleIndex) || expectedCandleIndex < 0) {
      return NextResponse.json({ error: "Обновите страницу: не удалось определить текущую свечу." }, { status: 409 });
    }
    if (stopLoss !== null && (!Number.isFinite(stopLoss) || stopLoss <= 0)) {
      return NextResponse.json({ error: "Стоп-лосс должен быть положительным числом." }, { status: 400 });
    }

    const { data: session, error: sessionError } = await getSupabaseAdmin()
      .from("simulation_sessions")
      .select("id, current_candle_index, candles")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("scenario_id", scenario.id)
      .eq("status", "active")
      .maybeSingle<Session>();
    if (sessionError) throw sessionError;
    if (!session) return NextResponse.json({ error: "Симуляция не найдена. Обновите страницу." }, { status: 409 });

    const candles = parseCandleSnapshot(session.candles, scenario.candles);
    if (Number(session.current_candle_index) !== expectedCandleIndex) {
      return NextResponse.json({ error: "Цена уже изменилась. Обновите экран перед открытием сделки." }, { status: 409 });
    }
    if (expectedCandleIndex >= candles.length) {
      return NextResponse.json({ error: "Сценарий завершён." }, { status: 409 });
    }
    const entryPrice = candles[expectedCandleIndex]?.close;
    if (!entryPrice || (stopLoss !== null && ((side === "buy" && stopLoss >= entryPrice) || (side === "sell" && stopLoss <= entryPrice)))) {
      return NextResponse.json({ error: side === "buy" ? "Для Buy стоп-лосс должен быть ниже цены входа." : "Для Sell стоп-лосс должен быть выше цены входа." }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin().rpc("place_trade", {
      p_user_id: user.id,
      p_session_id: sessionId,
      p_scenario_id: scenario.id,
      p_asset: scenario.asset,
      p_side: side,
      p_entry: entryPrice,
      p_quantity: quantity,
      p_stop: stopLoss,
      p_candle_index: expectedCandleIndex
    });
    if (error) {
      const message = error.message ?? "Не удалось открыть сделку.";
      const insufficient = message.toLowerCase().includes("insufficient");
      const stale = message.includes("price changed");
      return NextResponse.json({ error: message }, { status: insufficient || stale ? 409 : 400 });
    }

    const { data: account, error: accountError } = await getSupabaseAdmin()
      .from("app_users")
      .select("balance")
      .eq("id", user.id)
      .single();
    if (accountError) throw accountError;

    return NextResponse.json({ trade: data, entry_price: entryPrice, quantity, side, balance: Number(account.balance) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
