import type { Highlight, SessionSummary } from "@/lib/workout-session";
import { formatDuration } from "@/lib/workout-session";
import { buttonClass } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { CARD } from "../portal-ui";

/** Resumo ao finalizar o treino (V2 tarefa 20): séries, volume (Σ carga × reps), duração e,
 * quando há histórico anterior, destaques de carga/volume vs. a última vez. */
export default function SessionSummaryScreen({
  dayName,
  summary,
  studentNote,
  highlights,
}: {
  dayName: string;
  summary: SessionSummary;
  studentNote: string | null;
  highlights: Highlight[];
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="tk-pop flex size-12 items-center justify-center rounded-full bg-success-tint text-success">
          <Icon name="check" size={26} strokeWidth={2.5} />
        </span>
        <span className="t-label text-success">Treino concluído</span>
        <h1 className="font-display text-3xl font-bold text-ink">{dayName}</h1>
      </div>

      <div className={`${CARD} grid grid-cols-2 gap-x-4 gap-y-5 p-5`}>
        <Stat label="Séries" value={`${summary.setsDone}/${summary.setsTotal}`} accent />
        <Stat
          label="Volume"
          value={summary.totalVolume > 0 ? `${Math.round(summary.totalVolume).toLocaleString("pt-BR")} kg` : "—"}
          accent
        />
        <Stat label="Duração" value={formatDuration(summary.durationSec)} />
        <Stat label="Exercícios" value={`${summary.exercisesDone}/${summary.exercisesTotal}`} />
      </div>

      {highlights.length > 0 && (
        <div className={`${CARD} flex flex-col gap-2 p-4`}>
          <p className="t-label text-brand">Destaques</p>
          <ul className="flex flex-col gap-2">
            {highlights.map((h) => (
              <li key={h.name} className="text-sm">
                <span className="font-medium text-ink">{h.name}</span>
                <span className="block text-ink-muted">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {studentNote && (
        <div className={`${CARD} p-4`}>
          <p className="t-label text-ink-faint">Sua nota</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{studentNote}</p>
        </div>
      )}

      {/* <a> de propósito: navegação completa, para a lista de dias já abrir sem a sessão. */}
      <a href="/portal/treino" className={buttonClass({ variant: "primary", size: "lg", width: "full" })}>
        Voltar ao treino
      </a>
    </section>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="t-label text-ink-faint">{label}</span>
      <span className={`font-display text-3xl font-bold tabular-nums ${accent ? "text-brand" : "text-ink"}`}>{value}</span>
    </div>
  );
}
