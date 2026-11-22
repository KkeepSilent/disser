import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-coral">404</p>
      <h1 className="mt-3 text-2xl font-bold">Страница не найдена</h1>
      <p className="mt-2 text-sm text-ink/65">Проверьте адрес или вернитесь в симулятор.</p>
      <Link className="mt-5 inline-flex h-10 items-center rounded-md bg-ink px-5 text-sm font-semibold text-white" href="/">
        На главную
      </Link>
    </main>
  );
}
