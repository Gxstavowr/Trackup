"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { WorkoutPlanWithDays } from "@/lib/repository";
import { Badge, Button, ButtonLink, Drawer, EmptyState, Field, Input, Modal, Select } from "@/components/ui";
import { duplicateTemplateAction, type TreinosActionState } from "./actions";
import { formatSetTargets } from "@/lib/workout-prescription";
import { formatPrescription } from "@/lib/workout-format";

type StudentOption = { id: string; name: string };

function exerciseCount(plan: WorkoutPlanWithDays): number {
  return plan.days.reduce((n, d) => n + d.exercises.length, 0);
}

/** Biblioteca de templates (programas reutilizáveis) da conta: ver, duplicar, aplicar a aluno. */
export default function TemplatesView({
  templates,
  students,
}: {
  templates: WorkoutPlanWithDays[];
  students: StudentOption[];
}) {
  const [viewId, setViewId] = useState<string | null>(null);
  const [dupId, setDupId] = useState<string | null>(null);
  const view = templates.find((t) => t.id === viewId) ?? null;
  const dup = templates.find((t) => t.id === dupId) ?? null;

  if (templates.length === 0) {
    return (
      <EmptyState
        icon="workout"
        title="Nenhum template salvo ainda"
        text="Monte o treino de um aluno e use “Salvar como template” no perfil dele. Os templates aparecem aqui para reuso com qualquer aluno."
        action={
          <ButtonLink href="/coach/alunos" variant="secondary" iconAfter="arrow-right">
            Ir para Alunos
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="t-helper">
        Templates são modelos reutilizáveis. Ao aplicar a um aluno, uma cópia vira rascunho no perfil dele — o template
        não muda.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <li key={t.id} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-ink">{t.name}</span>
              {t.description && <span className="line-clamp-2 text-sm text-ink-muted">{t.description}</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="accent">
                {t.days.length} {t.days.length === 1 ? "dia" : "dias"}
              </Badge>
              <Badge>
                {exerciseCount(t)} {exerciseCount(t) === 1 ? "exercício" : "exercícios"}
              </Badge>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setViewId(t.id)}>
                Ver
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => setDupId(t.id)}>
                Duplicar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Drawer open={!!view} onClose={() => setViewId(null)} title={view?.name ?? "Template"}>
        {view && (
          <TemplatePreview
            plan={view}
            students={students}
            onDuplicate={() => {
              setViewId(null);
              setDupId(view.id);
            }}
          />
        )}
      </Drawer>

      <Modal open={!!dup} onClose={() => setDupId(null)} title="Duplicar template">
        {dup && <DuplicateForm key={dup.id} template={dup} onDone={() => setDupId(null)} />}
      </Modal>
    </div>
  );
}

function TemplatePreview({
  plan,
  students,
  onDuplicate,
}: {
  plan: WorkoutPlanWithDays;
  students: StudentOption[];
  onDuplicate: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  return (
    <div className="flex flex-col gap-5">
      <p className="t-helper">Pré-visualização somente leitura do modelo.</p>
      {plan.description && <p className="text-sm text-ink-muted">{plan.description}</p>}
      {plan.days.length === 0 ? (
        <p className="text-sm text-ink-muted">Este template ainda não tem dias.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {plan.days.map((day) => (
            <li key={day.id} className="flex flex-col gap-2">
              <h3 className="flex flex-wrap items-baseline gap-2 font-semibold text-ink">
                {day.name}
                {day.duration_min != null && <span className="t-helper">{day.duration_min} min</span>}
              </h3>
              {day.exercises.length === 0 ? (
                <p className="text-sm text-ink-muted">Sem exercícios.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {day.exercises.map((we) => (
                    <li key={we.id} className="flex flex-col gap-0.5 px-3 py-2">
                      <span className="text-sm text-ink">{we.exercise.name}</span>
                      <span className="t-helper">{formatPrescription(we).join(" · ") || "Sem prescrição"}</span>
                      {formatSetTargets(we).length > 0 && (
                        <span className="t-helper tabular-nums">{formatSetTargets(we).join(" · ")}</span>
                      )}
                      {we.substitutes.length > 0 && (
                        <span className="t-helper">
                          {we.substitutes.length === 1 ? "Substituto" : "Substitutos"}: {we.substitutes.map((s) => s.name).join(", ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="t-label">Aplicar a um aluno</h3>
        {students.length === 0 ? (
          <p className="text-sm text-ink-muted">Cadastre um aluno para aplicar este template.</p>
        ) : (
          <>
            <Select aria-label="Aluno" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Escolha um aluno…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {studentId ? (
              <Link
                href={`/coach/alunos/${studentId}/treino`}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand hover:underline"
              >
                Abrir o treino do aluno e aplicar o template
              </Link>
            ) : (
              <p className="t-helper">A aplicação e a edição do treino do aluno acontecem no perfil dele.</p>
            )}
          </>
        )}
        <Button variant="secondary" onClick={onDuplicate}>
          Duplicar template
        </Button>
      </div>
    </div>
  );
}

function DuplicateForm({ template, onDone }: { template: WorkoutPlanWithDays; onDone: () => void }) {
  const [state, action, pending] = useActionState<TreinosActionState, FormData>(duplicateTemplateAction, null);
  useEffect(() => {
    if (state?.success) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="templateId" value={template.id} />
      <Field label="Nome da cópia">
        <Input name="name" required maxLength={120} defaultValue={`${template.name} (cópia)`} />
      </Field>
      {state?.error && (
        <p className="rounded-md border border-danger/40 bg-danger-tint px-3 py-2 text-sm text-danger-text">{state.error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Duplicando…" : "Duplicar"}
        </Button>
        <Button variant="tertiary" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
