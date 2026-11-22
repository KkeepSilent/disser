"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-coral">TradeMind Education</p>
      <h1 className="mt-3 text-2xl font-bold">Не удалось загрузить страницу</h1>
      <p className="mt-2 text-sm text-ink/65">Попробуйте обновить экран. Если ошибка повторится, войдите в систему заново.</p>
      <button className="mt-5 h-10 rounded-md bg-ink px-5 text-sm font-semibold text-white" onClick={() => reset()} type="button">
        Попробовать снова
      </button>
    </main>
  );
}
