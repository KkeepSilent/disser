import { Brain, ShieldAlert } from "lucide-react";
import type { MentorFeedback } from "@/lib/types";

type MentorPanelProps = {
  feedback: MentorFeedback[];
};

export function MentorPanel({ feedback }: MentorPanelProps) {
  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Rule-based наставник</h2>
          <p className="text-sm text-ink/65">Бесплатная экспертная логика вместо платного LLM.</p>
        </div>
        <Brain className="text-coral" size={23} />
      </div>

      {feedback.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink/20 p-4 text-sm leading-6 text-ink/65">
          Открой учебную сделку, и наставник оценит риск, стоп-лосс и дисциплину.
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.map((item, index) => (
            <article className="rounded-md border border-ink/10 bg-white p-4" key={`${item.title}-${index}`}>
              <div className="mb-2 flex items-center gap-2">
                <ShieldAlert size={17} className="text-coral" />
                <h3 className="font-semibold">{item.title}</h3>
              </div>
              <p className="text-sm leading-6 text-ink/70">{item.message}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label={`Оценка риска: ${item.riskScore} из 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(item.riskScore, 100))}>
                <div
                  className="h-full rounded-full bg-coral"
                  style={{ width: `${Math.max(0, Math.min(item.riskScore, 100))}%` }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
