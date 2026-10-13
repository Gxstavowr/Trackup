"use client";

import { useState } from "react";
import type { WorkoutPlanWithDays } from "@/lib/repository";
import { Drawer } from "@/components/ui/overlay";
import DayExerciseList from "@/app/portal/treino/day-preview";

/** "Ver como o aluno": usa o MESMO componente da tela Treino do portal (`DayExerciseList`) — o
 * texto da prescrição, os blocos de aquecimento/cardio, os grupos de superset/circuito, o
 * substituto e as observações saem idênticos ao que o aluno vê. Só leitura. */
export default function StudentPreview({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan: WorkoutPlanWithDays;
}) {
  const [activeId, setActiveId] = useState(plan.days[0]?.id ?? "");
  const day = plan.days.find((d) => d.id === activeId) ?? plan.days[0];

  return (
    <Drawer open={open} onClose={onClose} title="Como o aluno vê">
      <div className="flex flex-col gap-4">
        <div>
          <p className="t-kicker text-ink-faint">Prévia somente leitura</p>
          <h3 className="mt-1 break-words text-lg font-medium text-ink">{plan.name}</h3>
        </div>

        {plan.days.length === 0 ? (
          <p className="text-sm text-ink-muted">Este treino ainda não tem dias.</p>
        ) : (
          <>
            <div role="tablist" aria-label="Dias" className="flex gap-1.5 overflow-x-auto pb-1">
              {plan.days.map((d) => (
                <button
                  key={d.id}
                  role="tab"
                  type="button"
                  aria-selected={d.id === day?.id}
                  onClick={() => setActiveId(d.id)}
                  className={`min-h-11 shrink-0 rounded-md border px-3 text-sm font-semibold ${
                    d.id === day?.id ? "border-brand bg-brand-tint text-ink" : "border-line text-ink-muted"
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>

            {day && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="break-words font-display text-xl font-bold text-ink">{day.name}</p>
                  <p className="text-sm text-ink-muted">
                    {[
                      `${day.exercises.length} ${day.exercises.length === 1 ? "exercício" : "exercícios"}`,
                      day.duration_min != null && `cerca de ${day.duration_min} min`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {day.notes && <p className="mt-1 break-words text-xs text-ink-faint">{day.notes}</p>}
                </div>
                {day.exercises.length > 0 ? (
                  <DayExerciseList exercises={day.exercises} showHowTo />
                ) : (
                  <p className="text-sm text-ink-muted">Este dia ainda não tem exercícios.</p>
                )}
                <p className="text-xs text-ink-faint">
                  No treino, o aluno vê um exercício por vez com o alvo de cada série, pode trocar por um substituto
                  autorizado e o descanso configurado (o da série, se variar) inicia sozinho após cada série (em
                  superset/circuito, ao fim de cada rodada).
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
