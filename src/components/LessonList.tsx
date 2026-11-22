import { BookOpen, CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { lessons } from "@/data/lessons";

export function LessonList() {
  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Учебный маршрут</h2>
          <p className="text-sm text-ink/65">Короткие модули для первого MVP.</p>
        </div>
        <BookOpen className="text-steel" size={22} />
      </div>
      <div className="space-y-3">
        {lessons.map((lesson, index) => (
          <article
            className="rounded-md border border-ink/10 bg-white p-4"
            key={lesson.slug}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-steel">
                  Модуль {index + 1} · {lesson.duration}
                </p>
                <h3 className="mt-1 font-semibold">{lesson.title}</h3>
              </div>
              {lesson.status === "locked" ? (
                <Lock size={18} className="text-ink/35" />
              ) : lesson.status === "done" ? (
                <CheckCircle2 size={18} className="text-mint" aria-label="Завершено" />
              ) : (
                <PlayCircle size={18} className="text-steel" aria-label="Доступно" />
              )}
            </div>
            <p className="text-sm leading-6 text-ink/70">{lesson.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
