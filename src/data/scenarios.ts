import type { Scenario } from "@/lib/types";

export const scenarios: Scenario[] = [
  {
    id: "uptrend-basics",
    title: "Растущий рынок",
    asset: "BTC",
    description: "Учебный сценарий с плавным трендом и несколькими откатами.",
    lessonFocus: "Не входить импульсивно после сильной свечи.",
    candles: [
      { time: "09:00", open: 42100, high: 42380, low: 41990, close: 42240, volume: 820 },
      { time: "09:15", open: 42240, high: 42620, low: 42180, close: 42580, volume: 940 },
      { time: "09:30", open: 42580, high: 42740, low: 42340, close: 42420, volume: 760 },
      { time: "09:45", open: 42420, high: 42920, low: 42390, close: 42880, volume: 1100 },
      { time: "10:00", open: 42880, high: 43160, low: 42750, close: 43090, volume: 990 },
      { time: "10:15", open: 43090, high: 43210, low: 42820, close: 42940, volume: 730 },
      { time: "10:30", open: 42940, high: 43540, low: 42860, close: 43480, volume: 1280 },
      { time: "10:45", open: 43480, high: 43820, low: 43330, close: 43760, volume: 1190 }
    ]
  },
  {
    id: "false-breakout",
    title: "Ложный пробой",
    asset: "SOL",
    description: "Цена пробивает уровень, но быстро возвращается обратно.",
    lessonFocus: "Проверять риск до входа и не догонять пробой.",
    candles: [
      { time: "11:00", open: 118.4, high: 119.2, low: 117.8, close: 118.9, volume: 610 },
      { time: "11:15", open: 118.9, high: 119.6, low: 118.1, close: 119.3, volume: 640 },
      { time: "11:30", open: 119.3, high: 124.8, low: 119.0, close: 123.9, volume: 1420 },
      { time: "11:45", open: 123.9, high: 124.2, low: 117.2, close: 118.0, volume: 1850 },
      { time: "12:00", open: 118.0, high: 118.6, low: 115.8, close: 116.4, volume: 1330 },
      { time: "12:15", open: 116.4, high: 117.3, low: 114.9, close: 115.6, volume: 1050 },
      { time: "12:30", open: 115.6, high: 116.8, low: 114.8, close: 116.2, volume: 880 },
      { time: "12:45", open: 116.2, high: 117.0, low: 115.4, close: 116.7, volume: 720 }
    ]
  },
  {
    id: "panic-selloff",
    title: "Паническая распродажа",
    asset: "ETH",
    description: "Высокая волатильность и серия резких красных свечей.",
    lessonFocus: "Не увеличивать риск из желания быстро отыграться.",
    candles: [
      { time: "14:00", open: 3120, high: 3136, low: 3095, close: 3108, volume: 900 },
      { time: "14:15", open: 3108, high: 3112, low: 3038, close: 3048, volume: 1520 },
      { time: "14:30", open: 3048, high: 3064, low: 2988, close: 3004, volume: 1700 },
      { time: "14:45", open: 3004, high: 3028, low: 2920, close: 2942, volume: 2120 },
      { time: "15:00", open: 2942, high: 2998, low: 2916, close: 2980, volume: 1600 },
      { time: "15:15", open: 2980, high: 3008, low: 2944, close: 2962, volume: 1210 },
      { time: "15:30", open: 2962, high: 3018, low: 2956, close: 3006, volume: 980 },
      { time: "15:45", open: 3006, high: 3030, low: 2984, close: 3014, volume: 840 }
    ]
  }
];
