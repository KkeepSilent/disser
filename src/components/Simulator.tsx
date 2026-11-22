"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, LoaderCircle, PlayCircle } from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { scenarios } from "@/data/scenarios";
import { analyzeTrade } from "@/lib/mentor";
import { formatMoney } from "@/lib/format-money";
import type { Candle, MentorFeedback, Trade, TradeSide } from "@/lib/types";

type StoredTrade = {
  id: string;
  user_id: string;
  scenario_id: string;
  asset_symbol: string;
  side: TradeSide;
  entry_price: number | string;
  quantity: number | string;
  stop_loss: number | string | null;
  risk_percent: number | string;
  status: "open" | "closed" | "cancelled";
  exit_price: number | string | null;
  realized_pnl: number | string | null;
  created_at: string;
  closed_at: string | null;
};

type SimulatorProps = {
  userId: string;
  balance: number;
  onBalanceChange: (balance: number) => void;
  onFeedback: (feedback: MentorFeedback[]) => void;
};

export function Simulator({ userId, balance, onBalanceChange, onFeedback }: SimulatorProps) {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [quantity, setQuantity] = useState("");
  const [quantityEdited, setQuantityEdited] = useState(false);
  const [stopLoss, setStopLoss] = useState("");
  const [candles, setCandles] = useState(scenarios[0].candles);
  const [marketSource, setMarketSource] = useState<"binance" | "fallback">("fallback");
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string | null>(null);
  const [refreshingMarket, setRefreshingMarket] = useState(false);
  const [trades, setTrades] = useState<StoredTrade[]>([]);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [candleIndex, setCandleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [closingTradeIds, setClosingTradeIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const currentCandle = candles[Math.min(candleIndex, candles.length - 1)] ?? candles[0];
  const currentPrice = currentCandle.close;
  const hasSnapshot = !loading && Boolean(sessionId);
  const snapshotAt = candles.at(-1)?.closedAt;
  const snapshotIsStale = marketSource === "fallback" || !snapshotAt || Date.now() - Date.parse(snapshotAt) > 2 * 60 * 60 * 1000;
  const visibleCandles = candles.slice(0, Math.min(Math.max(candleIndex + 1, 2), candles.length));
  const parsedQuantity = Number(quantity);
  const notional = parsedQuantity * currentPrice;
  const parsedStop = stopLoss.trim() ? Number(stopLoss) : null;

  const visibleTrades = useMemo(
    () => trades.filter((trade) => trade.scenario_id === scenarioId),
    [trades, scenarioId]
  );
  const openTrades = visibleTrades.filter((trade) => trade.status === "open");
  const chartScale = getChartScale(visibleCandles, currentPrice, openTrades);
  const stopExamples = `Стоп Buy: ${formatQuote(currentPrice * 0.98)} (ниже входа) · стоп Sell: ${formatQuote(currentPrice * 1.02)} (выше входа)`;
  const chartCandles = useMemo(
    () => visibleCandles.map((candle) => ({ ...candle, range: [candle.low, candle.high] as [number, number] })),
    [visibleCandles]
  );
  const maxVolume = Math.max(1, ...chartCandles.map((candle) => candle.volume));
  const legendCandle = hoveredCandle ?? currentCandle;
  const candleChange = legendCandle.close - legendCandle.open;
  const candleChangePercent = legendCandle.open === 0 ? 0 : candleChange / legendCandle.open * 100;

  const quantityError = !quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity < 0.01
    ? "Размер позиции должен быть не меньше 0.01."
    : null;
  const fundsError = !quantityError && notional > balance
    ? `Недостаточно средств: нужно ${formatMoney(notional)}, доступно ${formatMoney(balance)}.`
    : null;
  const stopValueError = parsedStop !== null && (!Number.isFinite(parsedStop) || parsedStop <= 0)
    ? "Стоп-лосс должен быть положительным числом."
    : null;
  const buyStopError = parsedStop !== null && !stopValueError && parsedStop >= currentPrice
    ? "Для Buy стоп-лосс должен быть ниже цены входа."
    : null;
  const sellStopError = parsedStop !== null && !stopValueError && parsedStop <= currentPrice
    ? "Для Sell стоп-лосс должен быть выше цены входа."
    : null;
  const marketFinished = candleIndex >= candles.length - 1;
  const tradeDisabled = loading || pending || marketFinished || Boolean(quantityError || fundsError || !userId || !sessionId || stopValueError);
  const tradeReason = loading ? "Загружаем данные из базы…" :
    !hasSnapshot || pending ? null :
    marketFinished ? "Сценарий завершён." : quantityError ?? fundsError;

  async function refreshFromServer(signal: AbortSignal) {
    const tradeResponse = await fetch(`/api/trades?scenario_id=${encodeURIComponent(scenarioId)}`, { cache: "no-store", signal });
    const tradeResult = await tradeResponse.json();
    if (signal.aborted) return;
    if (!tradeResponse.ok) throw new Error(tradeResult.error ?? "Не удалось загрузить журнал сделок.");
    if (!tradeResult.session_id || !Array.isArray(tradeResult.candles) || tradeResult.candles.length === 0) {
      throw new Error("Сервер не вернул снимок свечей.");
    }
    setTrades((tradeResult.trades ?? []).map((trade: StoredTrade) => ({
      ...trade,
      entry_price: Number(trade.entry_price),
      quantity: Number(trade.quantity),
      stop_loss: trade.stop_loss === null ? null : Number(trade.stop_loss),
      risk_percent: Number(trade.risk_percent),
      exit_price: trade.exit_price === null ? null : Number(trade.exit_price),
      realized_pnl: trade.realized_pnl === null ? null : Number(trade.realized_pnl)
    })));
    setCandles(tradeResult.candles);
    setMarketSource(tradeResult.market_source === "binance" ? "binance" : "fallback");
    setSessionCreatedAt(tradeResult.session_created_at ?? null);
    setSessionId(String(tradeResult.session_id ?? ""));
    setCandleIndex(Math.min(
      Math.max(Number(tradeResult.candle_index) || 0, 0),
      tradeResult.candles.length - 1
    ));
    onBalanceChange(Number(tradeResult.balance));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void refreshFromServer(controller.signal)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить данные.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Refresh once when the authenticated user enters the simulator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scenarioId]);

  useEffect(() => {
    if (!hasSnapshot || quantityEdited || !Number.isFinite(currentPrice) || currentPrice <= 0) return;
    const decimals = scenario.asset === "BTC" ? 4 : scenario.asset === "ETH" ? 3 : 2;
    const scale = 10 ** decimals;
    setQuantity(String(Math.max(0.01, Math.floor((balance * 0.05 / currentPrice) * scale) / scale)));
  }, [balance, currentPrice, hasSnapshot, quantityEdited, scenario.asset]);

  async function openTrade(side: TradeSide) {
    if (tradeDisabled) return;
    if (side === "buy" && buyStopError) {
      setError(buyStopError);
      return;
    }
    if (side === "sell" && sellStopError) {
      setError(sellStopError);
      return;
    }

    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, scenario_id: scenarioId, side, quantity: parsedQuantity, stop_loss: parsedStop, expected_candle_index: candleIndex })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось открыть сделку.");
      const savedTrade: StoredTrade = {
        ...result.trade,
        entry_price: Number(result.trade.entry_price),
        quantity: Number(result.trade.quantity),
        stop_loss: result.trade.stop_loss === null ? null : Number(result.trade.stop_loss),
        risk_percent: Number(result.trade.risk_percent),
        exit_price: null,
        realized_pnl: null
      };
      setTrades((current) => [savedTrade, ...current]);
      onBalanceChange(Number(result.balance));
      const created: Trade = {
        id: String(result.trade.id),
        side,
        asset: scenario.asset,
        entryPrice: currentPrice,
        quantity: parsedQuantity,
        stopLoss: parsedStop ?? undefined,
        riskPercent: parsedStop === null
          ? (notional / balance) * 100
          : (Math.abs(currentPrice - parsedStop) * parsedQuantity / balance) * 100,
        createdAt: String(result.trade.created_at)
      };
      const previous = trades
        .filter((trade) => trade.scenario_id === scenarioId)
        .map(toMentorTrade);
      onFeedback(analyzeTrade(created, previous, balance));
      setNotice("Сделка сохранена, баланс обновлён.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось открыть сделку.");
    } finally {
      setPending(false);
    }
  }

  async function closeTrade(trade: StoredTrade) {
    if (pending || closingTradeIds.includes(trade.id)) return;
    setClosingTradeIds((current) => [...current, trade.id]);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/trades/${trade.id}/close`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось закрыть сделку.");
      setTrades((current) => current.map((item) => item.id === trade.id ? {
        ...item,
        status: "closed",
        exit_price: Number(result.trade.exit_price),
        realized_pnl: Number(result.trade.realized_pnl),
        closed_at: result.trade.closed_at
      } : item));
      onBalanceChange(Number(result.balance));
      setNotice("Позиция закрыта, результат зачислен на баланс.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось закрыть сделку.");
    } finally {
      setClosingTradeIds((current) => current.filter((id) => id !== trade.id));
    }
  }

  async function advanceCandle() {
    if (pending || loading || !sessionId || candleIndex >= candles.length - 1) return;
    setPending(true);
    setAdvancing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/simulations/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось продвинуть рынок.");
      setCandleIndex(Number(result.candle_index));
      const stoppedTrades = Array.isArray(result.stopped_trades) ? result.stopped_trades : [];
      const stoppedById = new Map<string, { trade_id: string; exit_price: number; realized_pnl: number; closed_at: string }>(stoppedTrades.map((trade: { trade_id: string; exit_price: number; realized_pnl: number; closed_at: string }) => [trade.trade_id, trade]));
      if (stoppedById.size > 0) {
        setTrades((current) => current.map((item) => {
          const stoppedTrade = stoppedById.get(item.id);
          return stoppedTrade ? { ...item, status: "closed", exit_price: stoppedTrade.exit_price, realized_pnl: stoppedTrade.realized_pnl, closed_at: stoppedTrade.closed_at } : item;
        }));
      }
      onBalanceChange(Number(result.balance));
      const stoppedCount = stoppedTrades.length;
      setNotice(stoppedCount > 0
        ? `Свеча ${result.candle.time}. По стоп-лоссу закрыто позиций: ${stoppedCount}.`
        : result.advanced ? `Рынок перешёл к свече ${result.candle.time}.` : "Сценарий завершён.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось продвинуть рынок.");
    } finally {
      setAdvancing(false);
      setPending(false);
    }
  }

  async function restartScenario(refreshMarket = false) {
    if (pending || !hasSnapshot || openTrades.length > 0 || closingTradeIds.length > 0) return;
    setPending(true);
    setRefreshingMarket(refreshMarket);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/simulations/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, refresh_market: refreshMarket })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось начать сценарий заново.");
      setSessionId(String(result.session_id));
      setCandleIndex(0);
      setHoveredCandle(null);
      setSessionCreatedAt(null);
      setStopLoss("");
      if (Array.isArray(result.candles) && result.candles.length > 0) setCandles(result.candles);
      setMarketSource(result.market_source === "binance" ? "binance" : "fallback");
      setNotice(refreshMarket
        ? "Котировки обновлены. Новый цикл начался с первой свечи."
        : "Начат новый цикл сценария. История предыдущего цикла сохранена.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось начать сценарий заново.");
    } finally {
      setRefreshingMarket(false);
      setPending(false);
    }
  }

  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-steel">Симулятор без платных API</p>
          <h2 className="text-xl font-bold">{scenario.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/68">{scenario.description} Фокус урока: {scenario.lessonFocus}</p>
        </div>
        <select
          aria-label="Сценарий"
          className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"
          disabled={pending || closingTradeIds.length > 0}
          onChange={(event) => {
            setLoading(true);
            setSessionId("");
            setCandleIndex(0);
            setHoveredCandle(null);
            setStopLoss("");
            setQuantity("");
            setQuantityEdited(false);
            setScenarioId(event.target.value);
            setError("");
            setNotice("");
          }}
          value={scenarioId}
        >
          {scenarios.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.asset}</option>)}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {hasSnapshot ? <div className="h-[350px] rounded-md border border-ink/10 bg-white p-3" role="img" aria-label={`Свечной график ${scenario.asset}. Текущая цена ${formatMoney(currentPrice)} на ${currentCandle.time}. Показаны объём и уровни открытых сделок.`}>
          <div className="mb-1 flex min-h-7 flex-wrap items-center gap-x-2 text-[10px] leading-4 sm:gap-x-3 sm:text-xs">
            <span className="font-semibold text-ink/60">{legendCandle.time}</span>
            <OhlcValue label="ОТКР" value={legendCandle.open} />
            <OhlcValue label="МАКС" value={legendCandle.high} />
            <OhlcValue label="МИН" value={legendCandle.low} />
            <OhlcValue label="ЗАКР" value={legendCandle.close} />
            <span className={`font-semibold ${candleChange >= 0 ? "text-[#0d9e6f]" : "text-[#e04b45]"}`}>
              {formatSigned(candleChange)} ({formatSigned(candleChangePercent, 2)}%)
            </span>
          </div>
          <div className="h-[calc(100%-32px)]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartCandles}
                margin={{ top: 20, right: 8, bottom: 8, left: 0 }}
                barCategoryGap="10%"
                onMouseMove={(state) => setHoveredCandle((state?.activePayload?.[0]?.payload as Candle | undefined) ?? null)}
                onMouseLeave={() => setHoveredCandle(null)}
              >
                <CartesianGrid stroke="#e5e0d5" strokeDasharray="3 3" />
                <XAxis
                  xAxisId="time"
                  dataKey="time"
                  interval={Math.max(0, Math.ceil(visibleCandles.length / 4) - 1)}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                />
                <XAxis xAxisId="volumeTime" dataKey="time" hide />
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  domain={chartScale.domain}
                  allowDataOverflow
                  ticks={chartScale.ticks}
                  tickFormatter={(value: number) => formatPrice(value, chartScale.decimals)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={76}
                />
                <YAxis yAxisId="volume" hide domain={[0, maxVolume * 4]} />
                <Tooltip
                  cursor={{ stroke: "#9aa4ae", strokeDasharray: "4 4" }}
                  content={(props) => <CandleTooltip active={props.active} candle={props.payload?.[0]?.payload as Candle | undefined} />}
                />
                <Bar yAxisId="price" xAxisId="time" dataKey="range" name="Свеча" shape={<CandleShape />} isAnimationActive={false} />
                <Bar yAxisId="volume" xAxisId="volumeTime" dataKey="volume" name="Объём" shape={<VolumeBar />} isAnimationActive={false} />
                <ReferenceLine xAxisId="time" yAxisId="price" y={currentPrice} stroke="#49627a" strokeDasharray="5 4" label={(props) => <CurrentPriceLabel {...props} price={currentPrice} time={currentCandle.time} />} />
                {openTrades.map((trade) => <ReferenceLine key={`entry-${trade.id}`} xAxisId="time" yAxisId="price" y={Number(trade.entry_price)} stroke="#7158a5" strokeDasharray="3 4" label={{ value: `Вход ${trade.side.toUpperCase()}`, position: "insideBottomLeft", fill: "#5b4787", fontSize: 10 }} />)}
                {chartScale.insideStops.map((price) => <ReferenceLine key={price} xAxisId="time" yAxisId="price" y={price} stroke="#a83b32" strokeDasharray="4 3" label={{ value: "Стоп", position: "insideTopLeft", fill: "#8a2f29", fontSize: 10 }} />)}
                {chartScale.edgeStops.map(({ direction, boundary, prices }) => (
                  <ReferenceLine
                    key={direction} xAxisId="time" yAxisId="price" y={boundary} stroke="#a83b32" strokeDasharray="4 3"
                    label={{
                      value: `${formatEdgeStop(direction, prices[0], currentPrice)}${prices.length > 1 ? ` · +${prices.length - 1}` : ""}`,
                      position: direction === "↓" ? "insideTopLeft" : "insideBottomLeft", fill: "#8a2f29", fontSize: 10
                    }}
                  />
                ))}
                {hoveredCandle && <ReferenceLine xAxisId="time" yAxisId="price" x={hoveredCandle.time} stroke="#9aa4ae" strokeDasharray="3 3" />}
                {hoveredCandle && <ReferenceLine xAxisId="time" yAxisId="price" y={hoveredCandle.close} stroke="#9aa4ae" strokeDasharray="3 3" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div> : (
          <div className="grid h-[350px] place-items-center rounded-md border border-ink/10 bg-white p-3 text-sm text-ink/75" role="status">
            {loading ? "Загружаем котировки…" : "Котировки недоступны"}
          </div>
        )}

        <div className="rounded-md border border-ink/10 bg-white p-4">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Metric label="Баланс" value={formatMoney(balance)} />
            <Metric label="Цена" value={hasSnapshot ? formatMoney(currentPrice) : "—"} />
          </div>
          <div className="mb-4 rounded-md bg-paper px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2"><span className="text-ink/65">Рыночное время</span><span className="font-semibold">{hasSnapshot ? `${currentCandle.time} · ${candleIndex + 1}/${candles.length}` : "—"}</span></div>
            {hasSnapshot && (candleIndex < candles.length - 1 ? (
              <button className="mt-2 h-9 w-full rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || loading || !sessionId} onClick={() => void advanceCandle()} type="button">
                {advancing ? "Рынок движется…" : "Следующая свеча"}
              </button>
            ) : openTrades.length > 0 ? (
              <p className="mt-2 text-xs leading-5 text-ink/70">Сценарий завершён. Закройте открытые позиции, чтобы начать новый цикл.</p>
            ) : (
              <button className="mt-2 h-9 w-full rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || loading || !sessionId} onClick={() => void restartScenario()} type="button">
                {pending ? "Обработка…" : "Начать сценарий заново"}
              </button>
            ))}
            {hasSnapshot && (
              <>
                <button className="mt-2 h-9 w-full rounded-md border border-ink/20 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || openTrades.length > 0 || closingTradeIds.length > 0} onClick={() => void restartScenario(true)} type="button">
                  {refreshingMarket ? "Обновляем данные…" : "Обновить данные"}
                </button>
                <p className="mt-2 text-xs leading-5 text-ink/75">
                  {openTrades.length > 0 ? "Закройте открытые позиции, чтобы обновить данные." : snapshotIsStale ? "Снимок можно обновить. Новый цикл начнётся с первой свечи." : "Обновление начнёт новый цикл с первой свечи."}
                </p>
              </>
            )}
          </div>
          <label className="mb-3 block text-sm font-medium">
            Размер позиции
            <input className="mt-1 h-10 w-full rounded-md border border-ink/10 px-3 disabled:bg-paper" disabled={loading || pending || marketFinished} min="0.01" onChange={(event) => { setQuantityEdited(true); setQuantity(event.target.value); }} step={scenario.asset === "BTC" ? "0.0001" : scenario.asset === "ETH" ? "0.001" : "0.01"} type="number" value={quantity} />
          </label>
          {(stopValueError || (parsedStop !== null && buyStopError && sellStopError)) && <p className="-mt-2 mb-3 text-xs text-coral">{stopValueError ?? "Уровень стоп-лосса должен находиться по правильную сторону цены для выбранной сделки."}</p>}
          {hasSnapshot && quantityError && <p className="-mt-2 mb-3 text-xs text-coral">{quantityError}</p>}
          {hasSnapshot && !quantityError && fundsError && <p className="-mt-2 mb-3 text-xs text-coral">{fundsError}</p>}
          <div className="mb-4">
            <label className="block text-sm font-medium">
              Stop-loss
              <input className="mt-1 h-10 w-full rounded-md border border-ink/10 px-3 disabled:bg-paper" aria-describedby="stop-loss-examples" disabled={loading || pending || marketFinished} onChange={(event) => setStopLoss(event.target.value)} placeholder="Уровень стоп-лосса" type="number" value={stopLoss} />
            </label>
            <p id="stop-loss-examples" className="mt-1 text-xs leading-5 text-ink/75">{hasSnapshot ? stopExamples : ""}</p>
          </div>
          {chartScale.edgeStops.some(({ prices }) => prices.length > 1) && (
            <ul aria-label="Стопы за пределами графика" className="mb-3 space-y-1 text-xs text-coral">
              {chartScale.edgeStops.flatMap(({ direction, prices }) => prices.map((price) =>
                <li key={price}>{formatEdgeStop(direction, price, currentPrice)}</li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <TradeButton disabled={tradeDisabled || Boolean(buyStopError)} loading={pending} label="Buy" side="buy" onClick={() => void openTrade("buy")} />
            <TradeButton disabled={tradeDisabled || Boolean(sellStopError)} loading={pending} label="Sell" side="sell" onClick={() => void openTrade("sell")} />
          </div>
          {hasSnapshot && (buyStopError || sellStopError) && !stopValueError && <div className="mt-2 space-y-1 text-xs text-coral">{buyStopError && <p>Buy: {buyStopError}</p>}{sellStopError && <p>Sell: {sellStopError}</p>}</div>}
          {hasSnapshot && <p className="mt-2 text-xs leading-5 text-ink/75">
            {marketSource === "binance" ? "Снимок Binance · 15 мин" : "Резервные учебные данные"}
            {snapshotAt ? ` · последняя свеча закрылась ${formatSnapshotDate(snapshotAt)}` :
              marketSource === "binance" && sessionCreatedAt ? ` · сессия создана ${formatSnapshotDate(sessionCreatedAt)}` : ""}
            {` · свечи ${candles[0].time}–${candles.at(-1)?.time}`}
          </p>}
          {tradeReason && <p className="mt-1 text-xs text-ink/60">{tradeReason}</p>}
          {error && <p aria-live="polite" className="mt-3 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
          {notice && <p aria-live="polite" className="mt-3 rounded-md bg-mint/20 px-3 py-2 text-sm">{notice}</p>}
        </div>
      </div>

      <div className="mt-5 rounded-md border border-ink/10 bg-white">
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <Activity className="text-steel" size={17} />
          <h3 className="font-semibold">Журнал сделок · {scenario.asset}</h3>
        </div>
        {loading ? <div className="px-4 py-5 text-sm text-ink/60">Загружаем журнал…</div> : visibleTrades.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-ink/60"><PlayCircle size={18} />Сделок в этом сценарии пока нет.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-paper/80 text-xs uppercase tracking-wide text-ink/55"><tr><th className="px-4 py-3">Сторона</th><th className="px-4 py-3">Вход / выход</th><th className="px-4 py-3">Кол-во</th><th className="px-4 py-3">Stop</th><th className="px-4 py-3">Риск</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Результат</th><th className="px-4 py-3">Действие</th></tr></thead>
              <tbody>{visibleTrades.map((trade) => <tr className="border-t border-ink/10" key={trade.id}>
                <td className="px-4 py-3 font-medium">{trade.side.toUpperCase()} · {trade.asset_symbol}</td>
                <td className="px-4 py-3">{formatMoney(Number(trade.entry_price))}{trade.exit_price === null ? "" : ` → ${formatMoney(Number(trade.exit_price))}`}</td>
                <td className="px-4 py-3">{Number(trade.quantity)}</td>
                <td className="px-4 py-3">{trade.stop_loss === null ? "нет" : formatMoney(Number(trade.stop_loss))}</td>
                <td className="px-4 py-3">{Number(trade.risk_percent).toFixed(2)}%</td>
                <td className="px-4 py-3">{trade.status === "open" ? "Открыта" : trade.status === "closed" ? "Закрыта" : "Отменена"}</td>
                <td className="px-4 py-3">{trade.realized_pnl === null ? "—" : `${Number(trade.realized_pnl) >= 0 ? "+" : ""}${formatMoney(Number(trade.realized_pnl))}`}</td>
                <td className="px-4 py-3">{trade.status === "open" && <button className="rounded-md bg-paper px-3 py-1.5 text-xs font-semibold disabled:opacity-60" disabled={pending || closingTradeIds.includes(trade.id)} onClick={() => void closeTrade(trade)} type="button">{closingTradeIds.includes(trade.id) ? "Обработка…" : "Закрыть"}</button>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function getChartScale(candles: Candle[], currentPrice: number, openTrades: StoredTrade[]) {
  const candlePrices = [currentPrice, ...candles.flatMap((candle) => [candle.low, candle.high])];
  const candleMin = Math.min(...candlePrices);
  const candleMax = Math.max(...candlePrices);
  const stopTolerance = currentPrice * 0.01;
  const stops = [...new Set(openTrades.map((trade) => Number(trade.stop_loss)))]
    .filter((price) => Number.isFinite(price) && price > 0);
  const nearbyStops = stops.filter((price) =>
    price >= candleMin - stopTolerance && price <= candleMax + stopTolerance
  );
  const entries = openTrades.map((trade) => Number(trade.entry_price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const dataMin = Math.min(candleMin, ...entries, ...nearbyStops);
  const dataMax = Math.max(candleMax, ...entries, ...nearbyStops);
  const padding = (dataMax - dataMin) * 0.08 || currentPrice * 0.002;
  const min = Math.max(0, dataMin - padding);
  const max = dataMax + padding;
  const rawStep = (max - min) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceMultiplier * magnitude;
  const firstTick = Math.ceil(min / step);
  const count = Math.floor(max / step) - firstTick + 1;
  const decimals = Math.min(12, Math.max(0, -Math.floor(Math.log10(step))));
  return {
    domain: [min, max] as [number, number],
    ticks: Array.from({ length: count }, (_, index) => Number(((firstTick + index) * step).toPrecision(12))),
    insideStops: stops.filter((price) => price >= min && price <= max),
    edgeStops: [
      { direction: "↓" as const, boundary: min, prices: stops.filter((price) => price < min).sort((a, b) => b - a) },
      { direction: "↑" as const, boundary: max, prices: stops.filter((price) => price > max).sort((a, b) => a - b) }
    ].filter(({ prices }) => prices.length > 0),
    decimals
  };
}

function formatQuote(value: number) {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const snapshotDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short"
});

function formatSnapshotDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? snapshotDateFormatter.format(timestamp) : "дата неизвестна";
}

function formatEdgeStop(direction: "↓" | "↑", price: number, currentPrice: number) {
  const distance = ((price - currentPrice) / currentPrice * 100).toLocaleString("ru-RU", {
    signDisplay: "exceptZero", minimumFractionDigits: 1, maximumFractionDigits: 1
  }).replace("-", "−");
  return `${direction} Стоп ${formatQuote(price)} (${distance} %)`;
}

function formatPrice(value: number, maximumFractionDigits: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits });
}

function formatSigned(value: number, maximumFractionDigits = 2) {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toLocaleString("ru-RU", { maximumFractionDigits })}`;
}

function OhlcValue({ label, value }: { label: string; value: number }) {
  return <span className="text-ink/70"><span className="text-ink/45">{label}</span> {formatPrice(value, 2)}</span>;
}

type CandleShapeData = Candle & { range: [number, number] };
type CandleShapeProps = { x?: number; y?: number; width?: number; height?: number; payload?: CandleShapeData };

function CandleShape({ x = 0, y = 0, width = 0, height = 0, payload }: CandleShapeProps) {
  if (!payload) return null;
  const { open, close, high, low, range } = payload;
  const [rangeLow, rangeHigh] = range;
  const span = rangeHigh - rangeLow || 1;
  const toPx = (value: number) => y + ((rangeHigh - value) / span) * height;
  const color = close >= open ? "#0d9e6f" : "#e04b45";
  const bodyTop = toPx(Math.max(open, close));
  const bodyBottom = toPx(Math.min(open, close));
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
  const center = x + width / 2;
  const bodyWidth = Math.max(width * 0.78, 1);

  return (
    <g className="candle-shape" data-direction={close >= open ? "up" : "down"}>
      <line x1={center} x2={center} y1={toPx(high)} y2={toPx(low)} stroke={color} strokeWidth={1.25} />
      <rect x={center - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
}

type VolumeBarProps = { x?: number; y?: number; width?: number; height?: number; payload?: Candle };

function VolumeBar({ x = 0, y = 0, width = 0, height = 0, payload }: VolumeBarProps) {
  if (!payload) return null;
  const barWidth = Math.max(width * 0.78, 1);
  return (
    <rect
      className="volume-bar"
      x={x + (width - barWidth) / 2}
      y={y}
      width={barWidth}
      height={Math.max(height, 1)}
      fill={payload.close >= payload.open ? "#0d9e6f" : "#e04b45"}
      fillOpacity={0.45}
    />
  );
}

type CurrentPriceLabelProps = {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  price: number;
  time: string;
};

function CurrentPriceLabel({ viewBox, price, time }: CurrentPriceLabelProps) {
  if (viewBox?.x === undefined || viewBox.y === undefined || viewBox.width === undefined) return null;
  const x = viewBox.x + viewBox.width + 3;
  const y = viewBox.y - 17;
  return (
    <g className="current-price-label" pointerEvents="none" transform={`translate(${x},${y})`}>
      <rect width={70} height={34} rx={3} fill="#49627a" />
      <text x={4} y={13} fill="#fff" fontSize={9} fontWeight={700}>{formatQuote(price)}</text>
      <text x={4} y={26} fill="#fff" fontSize={8}>{time}</text>
    </g>
  );
}

function toMentorTrade(trade: StoredTrade): Trade {
  return {
    id: trade.id,
    side: trade.side,
    asset: trade.asset_symbol,
    entryPrice: Number(trade.entry_price),
    quantity: Number(trade.quantity),
    stopLoss: trade.stop_loss === null ? undefined : Number(trade.stop_loss),
    riskPercent: Number(trade.risk_percent),
    createdAt: trade.created_at
  };
}

function TradeButton({ disabled, loading, label, side, onClick }: { disabled: boolean; loading: boolean; label: string; side: TradeSide; onClick: () => void }) {
  const isBuy = side === "buy";
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55 ${isBuy ? "bg-mint text-ink" : "bg-coral text-white"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {loading ? <LoaderCircle className="animate-spin" size={16} /> : isBuy ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
      {loading ? "Подождите" : label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-paper px-3 py-2"><p className="text-xs text-ink/55">{label}</p><p className="font-bold">{value}</p></div>;
}

function CandleTooltip({ active, candle }: { active?: boolean; candle?: Candle }) {
  if (!active || !candle) return null;
  const change = candle.close - candle.open;
  const changePercent = candle.open === 0 ? 0 : change / candle.open * 100;
  return (
    <div className="rounded-md border border-ink/15 bg-white p-3 text-xs shadow-lg" role="tooltip">
      <p className="mb-2 font-semibold">{candle.time}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt>Открытие</dt><dd className="text-right font-medium">{formatMoney(candle.open)}</dd>
        <dt>Максимум</dt><dd className="text-right font-medium">{formatMoney(candle.high)}</dd>
        <dt>Минимум</dt><dd className="text-right font-medium">{formatMoney(candle.low)}</dd>
        <dt>Закрытие</dt><dd className="text-right font-medium">{formatMoney(candle.close)}</dd>
        <dt>Объём</dt><dd className="text-right font-medium">{candle.volume.toLocaleString("ru-RU")}</dd>
        <dt>Изменение</dt><dd className={`text-right font-semibold ${change >= 0 ? "text-[#0d9e6f]" : "text-[#e04b45]"}`}>{formatSigned(change)} ({formatSigned(changePercent, 2)}%)</dd>
      </dl>
    </div>
  );
}
