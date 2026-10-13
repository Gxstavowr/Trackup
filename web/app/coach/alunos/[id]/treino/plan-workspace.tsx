"use client";

import { useState } from "react";
import type { Exercise, WorkoutPlanWithDays } from "@/lib/repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { DiscardDraftButton, PublishDraftButton } from "./plan-lifecycle";
import PlanEditor from "./plan-editor";
import StudentPreview from "./student-preview";
import { SaveAsTemplateForm } from "./templates-panel";
import { SaveChip, SaveStatusProvider } from "./workout-ui";

/**
 * Cabeçalho + editor do plano. `mode="draft"`: editável, cada alteração é gravada no rascunho
 * na hora (chip salvando/salvo/erro) e o aluno só vê ao publicar. `mode="published"`: leitura
 * da versão que o aluno vê agora.
 */
export default function PlanWorkspace({
  clientId,
  plan,
  exercises,
  mode,
  hasPublished,
}: {
  clientId: string;
  plan: WorkoutPlanWithDays;
  exercises: Exercise[];
  mode: "draft" | "published";
  hasPublished: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const isDraft = mode === "draft";
  const exerciseCount = plan.days.reduce((n, d) => n + d.exercises.length, 0);

  return (
    <SaveStatusProvider>
      <div
        className={`flex flex-col gap-5 rounded-lg border p-4 sm:p-5 ${
          isDraft ? "border-brand/40 bg-brand-tint/10" : "border-line bg-surface"
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="t-subtitle break-words">{plan.name}</h2>
              {isDraft ? (
                <Badge tone="warning" dot>
                  Rascunho
                </Badge>
              ) : (
                <Badge tone="success" dot>
                  Publicado
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {plan.days.length} {plan.days.length === 1 ? "dia" : "dias"} · {exerciseCount}{" "}
              {exerciseCount === 1 ? "exercício" : "exercícios"}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {isDraft
                ? hasPublished
                  ? "Edição em rascunho — o aluno continua vendo a versão publicada até você publicar."
                  : "Edição em rascunho — o aluno ainda não vê este treino. Publique quando estiver pronto."
                : "Esta é a versão que o aluno vê agora. Para alterar, crie um rascunho."}
            </p>
            <div className="mt-1.5">
              <SaveChip draft={isDraft} />
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPreviewing(true)}>
              Ver como aluno
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSavingTemplate(true)}>
              Salvar como template
            </Button>
            {isDraft && (
              <>
                <DiscardDraftButton clientId={clientId} planId={plan.id} />
                <PublishDraftButton clientId={clientId} planId={plan.id} />
              </>
            )}
          </div>
        </div>

        <PlanEditor clientId={clientId} plan={plan} exercises={exercises} editable={isDraft} />
      </div>

      {previewing && <StudentPreview open onClose={() => setPreviewing(false)} plan={plan} />}
      {savingTemplate && (
        <Modal open onClose={() => setSavingTemplate(false)} title="Salvar como template">
          <SaveAsTemplateForm clientId={clientId} planId={plan.id} defaultLabel={plan.name} />
        </Modal>
      )}
    </SaveStatusProvider>
  );
}
