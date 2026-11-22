export type Candle = {
  time: string;
  closedAt?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Scenario = {
  id: string;
  title: string;
  asset: string;
  description: string;
  lessonFocus: string;
  candles: Candle[];
};

export type TradeSide = "buy" | "sell";

export type Trade = {
  id: string;
  side: TradeSide;
  asset: string;
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  riskPercent: number;
  createdAt: string;
};

export type MentorFeedback = {
  title: string;
  message: string;
  riskScore: number;
};

export type Lesson = {
  slug: string;
  title: string;
  description: string;
  duration: string;
  status: "ready" | "locked" | "done";
};
