import "server-only";
import type { Candle, Scenario } from "@/lib/types";

const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT"
};

const cache = new Map<string, { expiresAt: number; candles: Candle[] }>();
const CACHE_TTL_MS = 60_000;

export async function getMarketCandles(scenario: Scenario): Promise<{ candles: Candle[]; source: "binance" | "fallback" }> {
  const cached = cache.get(scenario.id);
  if (cached && cached.expiresAt > Date.now()) return { candles: cached.candles, source: "binance" };

  const symbol = BINANCE_SYMBOLS[scenario.asset];
  if (!symbol) return { candles: scenario.candles, source: "fallback" };

  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=9`,
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5_000) }
    );
    if (!response.ok) throw new Error(`Binance returned ${response.status}`);

    const rows = await response.json() as unknown[][];
    const now = Date.now();
    const candles = rows
      .filter((row) => Number(row[6]) < now)
      .slice(-8)
      .map((row): Candle => ({
        closedAt: new Date(Number(row[6])).toISOString(),
        time: new Date(Number(row[0])).toLocaleTimeString("ru-RU", {
          timeZone: "Europe/Warsaw",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23"
        }),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
      }));

    if (candles.length !== 8 || candles.some((candle) =>
      ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
      || candle.low <= 0 || candle.high < candle.low
    )) throw new Error("Binance returned invalid candle data");

    cache.set(scenario.id, { candles, expiresAt: now + CACHE_TTL_MS });
    return { candles, source: "binance" };
  } catch {
    return { candles: scenario.candles, source: "fallback" };
  }
}

export function parseCandleSnapshot(value: unknown, fallback: Candle[]): Candle[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const candles = value as Candle[];
  return candles.every((candle) => typeof candle.time === "string"
    && [candle.open, candle.high, candle.low, candle.close, candle.volume].every((price) => Number.isFinite(Number(price))))
    ? candles.map((candle) => ({ ...candle, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume) }))
    : fallback;
}
