import type { WorkoutExerciseWithDetails } from "@/lib/repository";
import { formatPrescription } from "@/lib/workout-format";
import { formatSetTargets } from "@/lib/workout-prescription";
import { blockTypeLabel, groupDayExercises, groupKindLabel } from "@/lib/workout-builder";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

/**
 * Lista dos exercícios de um dia ANTES de iniciar o treino (V2 tarefa 20): nome, resumo da
 * prescrição ("4 × 8–10 · 60 kg · RIR 2 · descanso 90 s · cadência 3-0-1-0"), aquecimento/cardio,
 * agrupamento em superset/circuito, observação do coach e substituto autorizado. Só leitura,
 * sem hooks — também é a base da prévia "Como o aluno vê" do coach (`treino/student-preview.tsx`),
 * que liga `showHowTo` para exibir a instrução/vídeo que o aluno abre durante a sessão.
 */
export default function DayExerciseList({
  exercises,
  showHowTo = false,
}: {
  exercises: WorkoutExerciseWithDetails[];
  showHowTo?: boolean;
}) {
  const blocks = groupDayExercises(exercises);

  return (
    <ol className="flex flex-col gap-2">
      {blocks.map((block, i) =>
        block.kind === "single" ? (
          <li key={block.item.id}>
            <ExerciseLine we={block.item} showHowTo={showHowTo} />
          </li>
        ) : (
          <li key={`${block.groupKey}-${i}`} className="rounded-md border border-brand/30 bg-brand-tint/40 p-2.5">
            <Badge tone="accent" className="mb-2">
              {groupKindLabel(block.groupKind)} {block.groupKey}
            </Badge>
            <ol className="flex flex-col gap-2">
              {block.items.map((we) => (
                <li key={we.id}>
                  <ExerciseLine we={we} showHowTo={showHowTo} />
                </li>
              ))}
            </ol>
          </li>
        )
      )}
    </ol>
  );
}

function ExerciseLine({ we, showHowTo }: { we: WorkoutExerciseWithDetails; showHowTo: boolean }) {
  const prescription = formatPrescription(we).join(" · ");
  const perSet = formatSetTargets(we);
  return (
    <div className="min-w-0 rounded-md bg-surface-sunken/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="break-words text-sm font-medium text-ink">{we.exercise.name}</span>
        {we.block_type !== "normal" && <Badge tone="warning">{blockTypeLabel(we.block_type)}</Badge>}
      </div>
      {prescription && <p className="text-xs tabular-nums text-ink-muted">{prescription}</p>}
      {perSet.length > 0 && <p className="break-words text-xs tabular-nums text-ink-muted">{perSet.join(" · ")}</p>}
      {we.substitutes.length > 0 && (
        <p className="break-words text-xs text-ink-faint">
          {we.substitutes.length === 1 ? "Substituto" : "Substitutos"}: {we.substitutes.map((s) => s.name).join(", ")}
        </p>
      )}
      {we.notes && <p className="break-words text-xs text-ink-faint">{we.notes}</p>}
      {showHowTo && (we.exercise.instruction || we.exercise.video_url) && (
        <details className="mt-1 text-xs">
          <summary className="flex min-h-8 cursor-pointer list-none items-center text-ink-muted marker:hidden">
            Como fazer{we.exercise.video_url ? " · vídeo" : ""}
          </summary>
          {we.exercise.instruction && (
            <p className="whitespace-pre-line break-words text-ink-muted">{we.exercise.instruction}</p>
          )}
          {we.exercise.video_url && (
            <a
              href={we.exercise.video_url}
              target="_blank"
              rel="noreferrer noopener"
              className={`${buttonClass({ variant: "secondary", size: "sm" })} mt-2`}
            >
              Ver vídeo do exercício
            </a>
          )}
        </details>
      )}
    </div>
  );
}
