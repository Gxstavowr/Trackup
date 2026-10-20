"use client";

import { useActionState, useEffect, useRef } from "react";
import type { WorkoutPlanWithDays } from "@/lib/repository";
import { buttonClass } from "@/components/ui/button";
import {
  applyTemplateAction,
  deleteTemplateAction,
  saveAsTemplateAction,
  type TreinoActionState,
} from "./actions";
import { EmptyState } from "@/components/ui/empty-state";

const initialState: TreinoActionState = null;

/**
 * Templates de treino da conta (item 18): salvar o plano atual como template, aplicar um
 * template a este aluno (cria um rascunho — falha com mensagem clara se já existir um) e
 * excluir template. Lista fechada (nenhum) some — não ocupa espaço à toa.
 */
export default function TemplatesPanel({
  clientId,
  templates,
  savableFrom,
}: {
  clientId: string;
  templates: WorkoutPlanWithDays[];
  savableFrom: { planId: string; label: string } | null;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="t-subtitle text-ink">Templates de treino {templates.length > 0 && `(${templates.length})`}</h2>

      {templates.length === 0 ? (
        <EmptyState compact icon="workout" title="Nenhum template salvo ainda" text="Salve um plano deste aluno como template para reaproveitar em outros." />
      ) : (
        <ul className="overflow-hidden card">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div>
                <span className="font-medium text-ink">{template.name}</span>
                <span className="ml-2 text-xs text-ink-faint">
                  {template.days.length} {template.days.length === 1 ? "dia" : "dias"}
                </span>
              </div>
              <div className="flex gap-2">
                <ApplyTemplateForm clientId={clientId} templateId={template.id} />
                <DeleteTemplateForm clientId={clientId} templateId={template.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {savableFrom && <SaveAsTemplateForm clientId={clientId} planId={savableFrom.planId} defaultLabel={savableFrom.label} />}
    </section>
  );
}

export function SaveAsTemplateForm({
  clientId,
  planId,
  defaultLabel,
}: {
  clientId: string;
  planId: string;
  defaultLabel: string;
}) {
  const [state, action, pending] = useActionState(saveAsTemplateAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-line p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={planId} />
      <label className="flex flex-1 flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Salvar &quot;{defaultLabel}&quot; como template</span>
        <input
          name="name"
          type="text"
          required
          placeholder="Nome do template"
          className="w-full min-h-11 rounded-md border border-line-control bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
        />
      </label>
      {state?.error && <p role="alert" className="w-full text-sm text-coral-text">{state.error}</p>}
      {state?.success && (
        <p role="status" className="tk-fade w-full text-sm text-success">
          Template salvo. Ele já aparece na lista de templates.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={buttonClass({ variant: "secondary" })}
      >
        {pending ? "Salvando…" : "Salvar como template"}
      </button>
    </form>
  );
}

function ApplyTemplateForm({ clientId, templateId }: { clientId: string; templateId: string }) {
  const [state, action, pending] = useActionState(applyTemplateAction, initialState);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="templateId" value={templateId} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass({ variant: "secondary" })}
      >
        {pending ? "Aplicando…" : "Aplicar (criar rascunho)"}
      </button>
      {state?.error && <p className="max-w-[220px] text-right text-xs text-coral-text">{state.error}</p>}
    </form>
  );
}

function DeleteTemplateForm({ clientId, templateId }: { clientId: string; templateId: string }) {
  return (
    <form
      action={async (formData) => {
        await deleteTemplateAction(formData);
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="templateId" value={templateId} />
      <button type="submit" className={buttonClass({ variant: "danger" })}>
        Excluir
      </button>
    </form>
  );
}
