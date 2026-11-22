import type { Lesson } from "@/lib/types";

export const lessons: Lesson[] = [
  {
    slug: "risk-basics",
    title: "Риск до доходности",
    description: "Почему новичку важнее ограничить убыток, чем угадать направление рынка.",
    duration: "8 мин",
    status: "ready"
  },
  {
    slug: "orders",
    title: "Market, limit и stop-loss",
    description: "Как разные типы ордеров помогают входить, выходить и защищать капитал.",
    duration: "10 мин",
    status: "ready"
  },
  {
    slug: "trend",
    title: "Тренд и боковик",
    description: "Как не путать импульс, коррекцию и хаотичное движение цены.",
    duration: "12 мин",
    status: "ready"
  },
  {
    slug: "discipline",
    title: "Дисциплина сделки",
    description: "План входа, стоп, размер позиции и журналирование решения.",
    duration: "9 мин",
    status: "ready"
  }
];
