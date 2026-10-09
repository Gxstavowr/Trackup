import Link from "next/link";
import type { SessionSummary } from "@/lib/workout-session";
import { formatDuration } from "@/lib/workout-session";
import { BUTTON_PRIMARY, CARD } from "../portal-ui";

/** Resumo ao finalizar o treino (item 19) — o que foi feito, sem gráfico novo (a evolução do
 * exercício ao longo do tempo já é alimentada pelos logs por série; aqui é só o retrato desta
 * sessão). */
export default function SessionSummaryScreen({
  dayName,
  summary,
  studentNote,
}: {
  dayName: string;
  summary: SessionSummary;
  studentNote: string | null;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-label uppercase tracking-widest text-ok">Treino concluído</span>
        <h2 className="font-display text-2xl text-ink">{dayName}</h2>
      </div>

      <div className={`${CARD} grid grid-cols-2 gap-4 p-5 sm:grid-cols-4`}>
        <Stat label="Exercícios" value={`${summary.exercisesDone}/${summary.exercisesTotal}`} />
        <Stat label="Séries" value={`${summary.setsDone}/${summary.setsTotal}`} />
        <Stat label="Duração" value={formatDuration(summary.durationSec)} />
        <Stat
          label="Volume"
          value={summary.totalVolume > 0 ? `${Math.round(summary.totalVolume).toLocaleString("pt-BR")}kg` : "—"}
        />
      </div>

      {studentNote && (
        <div className={`${CARD} p-4`}>
          <p className="font-mono text-label uppercase tracking-widest text-ink-faint">Sua nota</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{studentNote}</p>
        </div>
      )}

      <Link href="/portal/treino" className={BUTTON_PRIMARY}>
        Voltar ao treino
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-label uppercase tracking-widest text-ink-faint">{label}</span>
      <span className="font-display text-xl text-ink">{value}</span>
    </div>
  );
}
