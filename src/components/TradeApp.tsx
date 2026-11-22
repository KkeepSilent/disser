"use client";

import { useState } from "react";
import { ChartNoAxesCombined, Database, GraduationCap, ShieldCheck } from "lucide-react";
import { LessonList } from "@/components/LessonList";
import { MentorPanel } from "@/components/MentorPanel";
import { Simulator } from "@/components/Simulator";
import { UserManagement } from "@/components/UserManagement";
import { formatMoney } from "@/lib/format-money";
import type { AppUser } from "@/lib/server/auth";
import type { MentorFeedback } from "@/lib/types";

export function TradeApp({ user }: { user: AppUser }) {
  const [balance, setBalance] = useState(user.balance);
  const [feedback, setFeedback] = useState<MentorFeedback[]>([]);
  const [demoVersion, setDemoVersion] = useState(0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col justify-between gap-4 rounded-lg border border-ink/10 bg-white/72 px-5 py-4 shadow-panel md:flex-row md:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-coral">Pre-seed MVP · free-first stack</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">TradeMind Education</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md bg-paper px-3 py-2 text-sm font-semibold">
            Демо-режим · {user.username} · {formatMoney(balance)}
          </span>
        </div>
      </header>
      <UserManagement
        currentUserId={user.id}
        onSelfBalanceChange={setBalance}
        onDemoReset={(nextBalance) => {
          setBalance(nextBalance);
          setFeedback([]);
          setDemoVersion((version) => version + 1);
        }}
      />

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Feature icon={<ChartNoAxesCombined size={21} />} title="Симулятор" text="Сделки и баланс сохраняются в базе." />
        <Feature icon={<Database size={21} />} title="Supabase" text="Доступ к данным идёт через сервер." />
        <Feature icon={<ShieldCheck size={21} />} title="Рыночные данные" text="Сценарии используют снимки свечей Binance." />
        <Feature icon={<GraduationCap size={21} />} title="Наставник" text="Правила риска без платного ИИ." />
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <LessonList />
          <MentorPanel feedback={feedback} />
        </div>
        <Simulator
          key={demoVersion}
          balance={balance}
          onBalanceChange={setBalance}
          onFeedback={(next) => setFeedback((current) => [...next, ...current].slice(0, 12))}
          userId={user.id}
        />
      </div>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-paper text-steel">{icon}</div>
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-ink/65">{text}</p>
    </article>
  );
}
