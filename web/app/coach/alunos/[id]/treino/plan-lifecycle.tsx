"use client";

import { useActionState, useState } from "react";
import type { WorkoutPlanWithDays } from "@/lib/repository";
import { createDraftAction, discardDraftAction, publishDraftAction, type TreinoActionState } from "./actions";

const initialState: TreinoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/**
 * Empty state + formulário "Criar rascunho" — em branco, a partir do plano PUBLICADO (nova
 * versão editável) ou a partir de um TEMPLATE da conta (item 18: rascunho + templates).
 */
export function CreateDraftForm({
  clientId,
  published,
  templates,
  defaultName,
}: {
  clientId: string;
  published: WorkoutPlanWithDays | null;
  templates: WorkoutPlanWithDays[];
  defaultName: string;
}) {
  const [state, action, pending] = useActionState(createDraftAction, initialState);
  const [source, setSource] = useState("blank");

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-line p-4">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm text-ink-muted">
        {published ? "Crie um novo rascunho para editar o treino." : "Este aluno ainda não tem um treino."}
      </p>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Começar</span>
        <select name="source" value={source} onChange={(e) => setSource(e.target.value)} className={INPUT}>
          <option value="blank">Em branco</option>
          {published && <option value={`plan:${published.id}`}>A partir do treino publicado (nova versão)</option>}
          {templates.map((t) => (
            <option key={t.id} value={`template:${t.id}`}>
              A partir do template &quot;{t.name}&quot;
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Nome do plano</span>
        <input name="name" type="text" defaultValue={defaultName} className={INPUT} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Criando…" : "Criar rascunho"}
      </button>
    </form>
  );
}

export function PublishDraftButton({ clientId, planId }: { clientId: string; planId: string }) {
  const [state, action, pending] = useActionState(publishDraftAction, initialState);

  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={planId} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Publicando…" : "Publicar treino"}
      </button>
      {state?.error && <p className="text-sm text-coral-text">{state.error}</p>}
    </form>
  );
}

export function DiscardDraftButton({ clientId, planId }: { clientId: string; planId: string }) {
  const [state, action, pending] = useActionState(discardDraftAction, initialState);
  const [confirming, setConfirming] = useState(false);

  // Sem `useEffect` pra "fechar a confirmação" no sucesso: descartar de verdade faz o
  // rascunho sumir (`revalidatePath`) e este componente inteiro deixa de ser renderizado
  // pelo pai — não há estado local pra resetar. Se falhar, `confirming` já é `true` e o erro
  // aparece no lugar certo, sem re-render extra.

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink-muted hover:border-line-strong hover:text-ink"
      >
        Descartar rascunho
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={planId} />
      <div className="flex items-center gap-2">
        <span className="text-sm text-ink-muted">Descartar mesmo?</span>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md border border-late text-late-text px-3 text-sm disabled:opacity-60"
        >
          {pending ? "Descartando…" : "Confirmar"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="min-h-11 rounded-md border border-line px-3 text-sm text-ink-muted">
          Cancelar
        </button>
      </div>
      {state?.error && <p className="text-sm text-coral-text">{state.error}</p>}
    </form>
  );
}
