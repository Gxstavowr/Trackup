"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Exercise } from "@/lib/repository";
import { distinctFilterOptions, filterExercises } from "@/lib/workout-builder";
import { Drawer } from "@/components/ui/overlay";
import Icon from "@/components/ui/icon";
import { Input } from "@/components/ui/field";
import { addExerciseToDayAction } from "./actions";
import { toFormData, useSave } from "./workout-ui";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Seletor de exercícios da biblioteca da conta: busca por nome + filtro por grupo muscular
 * (chips). "Adicionar" grava na hora com uma prescrição inicial (3 × 10, 60 s) e mantém o
 * painel aberto pra montar vários de uma vez; o ajuste fino é no card do exercício.
 */
export default function ExercisePicker({
  open,
  onClose,
  clientId,
  dayId,
  dayName,
  exercises,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  dayId: string;
  dayName: string;
  exercises: Exercise[];
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [added, setAdded] = useState<Record<string, number>>({});
  const { run } = useSave();

  const groups = useMemo(() => distinctFilterOptions(exercises).muscleGroups, [exercises]);
  const list = useMemo(
    () => filterExercises(exercises, { search: q, muscleGroup: group || null }),
    [exercises, q, group]
  );

  async function add(ex: Exercise) {
    const result = await run(() =>
      addExerciseToDayAction(
        null,
        toFormData({
          clientId,
          dayId,
          exerciseId: ex.id,
          ...(ex.category.toLowerCase() === "cardio" || ex.muscle_group === "Cardio"
            ? { block_type: "cardio", duration_sec: 600 }
            : { block_type: "normal", sets: 3, reps: 10, rest_sec: 60 }),
        })
      )
    );
    if (result?.success) setAdded((prev) => ({ ...prev, [ex.id]: (prev[ex.id] ?? 0) + 1 }));
  }

  return (
    <Drawer open={open} onClose={onClose} title={`Adicionar a ${dayName}`}>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar exercício…"
            aria-label="Buscar exercício"
            className="pl-10"
          />
        </div>

        {groups.length > 0 && (
          <div className="-mx-1 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por grupo muscular">
            {["", ...groups].map((g) => (
              <button
                key={g || "all"}
                type="button"
                onClick={() => setGroup(g)}
                aria-pressed={group === g}
                className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${
                  group === g
                    ? "border-brand bg-brand-tint text-brand"
                    : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                {g || "Todos"}
              </button>
            ))}
          </div>
        )}

        {exercises.length === 0 ? (
          <p className="text-sm text-ink-muted">
            A biblioteca desta conta está vazia.{" "}
            <Link href="/coach/treinos" className="font-semibold text-brand hover:underline">
              Cadastre exercícios em Treinos
            </Link>
            .
          </p>
        ) : list.length === 0 ? (
          <EmptyState compact icon="search" title="Nenhum exercício encontrado" text="Tente outro termo ou limpe os filtros." />
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {list.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{ex.name}</p>
                  <p className="break-words text-xs text-ink-faint">
                    {[ex.muscle_group, ex.equipment].filter(Boolean).join(" · ") || ex.category}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => add(ex)}
                  aria-label={`Adicionar ${ex.name}`}
                  className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0 gap-1.5" })}
                >
                  {added[ex.id] ? (
                    <>
                      <Icon name="check" size={16} /> {added[ex.id]}×
                    </>
                  ) : (
                    <>
                      <Icon name="plus" size={16} /> Adicionar
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-ink-faint">
          Não achou? Crie ou importe exercícios na{" "}
          <Link href="/coach/treinos" className="font-semibold text-brand hover:underline">
            biblioteca de Treinos
          </Link>
          .
        </p>
      </div>
    </Drawer>
  );
}
