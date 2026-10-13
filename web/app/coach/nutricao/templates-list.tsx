"use client";

import { formatNumber } from "@/lib/food-macros";
import { useActionState, useEffect, useState } from "react";
import type { Client, NutritionPlanWithMeals } from "@/lib/repository";
import { Button, Input, Modal, Select, labelClass } from "@/components/ui";
import {
  applyTemplateToClientAction,
  deleteTemplateAction,
  duplicateTemplateAction,
  type GlobalNutritionState,
} from "./actions";

const initial: GlobalNutritionState = null;
const DAYS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function itemCount(t: NutritionPlanWithMeals): number {
  return t.meals.reduce((n, m) => n + m.items.length, 0);
}

type Mode = { kind: "preview" | "duplicate" | "apply"; template: NutritionPlanWithMeals } | null;

/** Templates de dieta da conta: prévia (refeições/itens), duplicar, aplicar a um aluno, excluir. */
export default function TemplatesList({
  templates,
  clients,
}: {
  templates: NutritionPlanWithMeals[];
  clients: Pick<Client, "id" | "name">[];
}) {
  const [mode, setMode] = useState<Mode>(null);
  const close = () => setMode(null);

  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">
        Nenhum template de dieta ainda. Para criar um, abra o plano de um aluno e use &quot;Salvar como template&quot;.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Modelos de dieta da sua conta. Aplicar a um aluno cria um rascunho no plano dele.
      </p>
      <ul className="card overflow-hidden">
        {templates.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1 basis-48">
              <p className="break-words font-medium text-ink">{t.name}</p>
              <p className="text-xs text-ink-faint">
                {t.meals.length} {t.meals.length === 1 ? "refeição" : "refeições"} · {itemCount(t)}{" "}
                {itemCount(t) === 1 ? "item" : "itens"}
                {t.target_kcal != null && ` · meta ${formatNumber(t.target_kcal, 0)} kcal`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setMode({ kind: "preview", template: t })}>
                Ver
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setMode({ kind: "duplicate", template: t })}>
                Duplicar
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setMode({ kind: "apply", template: t })}>
                Aplicar a aluno
              </Button>
              <form action={deleteTemplateAction}>
                <input type="hidden" name="templateId" value={t.id} />
                <Button type="submit" variant="danger" size="sm">
                  Excluir
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={mode !== null}
        onClose={close}
        title={
          mode?.kind === "duplicate"
            ? "Duplicar template"
            : mode?.kind === "apply"
              ? "Aplicar a um aluno"
              : (mode?.template.name ?? "Template")
        }
      >
        {mode?.kind === "preview" && <Preview template={mode.template} />}
        {mode?.kind === "duplicate" && <DuplicateForm template={mode.template} onDone={close} />}
        {mode?.kind === "apply" && <ApplyForm template={mode.template} clients={clients} onDone={close} />}
      </Modal>
    </div>
  );
}

function Preview({ template }: { template: NutritionPlanWithMeals }) {
  if (template.meals.length === 0) return <p className="text-sm text-ink-muted">Este template não tem refeições.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {template.meals.map((meal) => (
        <li key={meal.id} className="rounded-lg border border-line bg-surface-sunken/40 p-3">
          <p className="font-medium text-ink">
            {meal.name}
            {meal.time && <span className="ml-2 text-xs text-ink-faint">{meal.time.slice(0, 5)}</span>}
            {meal.day_of_week != null && <span className="ml-2 text-xs text-ink-faint">{DAYS[meal.day_of_week]}</span>}
          </p>
          {meal.items.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Sem alimentos.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {meal.items.map((item) => (
                <li key={item.id} className="break-words text-ink-muted">
                  <span className="text-ink">{item.food?.name ?? "Alimento removido"}</span>
                  {item.qty ? ` — ${item.qty}` : ""}
                  {item.macros.kcal != null && ` · ${formatNumber(item.macros.kcal, 0)} kcal`}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function DuplicateForm({ template, onDone }: { template: NutritionPlanWithMeals; onDone: () => void }) {
  const [state, action, pending] = useActionState(duplicateTemplateAction, initial);
  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="templateId" value={template.id} />
      <label className={labelClass}>
        Nome da cópia
        <Input name="name" required defaultValue={`${template.name} (cópia)`} />
      </label>
      {state?.error && <p className="text-sm text-coral-text">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="tertiary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Duplicando…" : "Duplicar"}
        </Button>
      </div>
    </form>
  );
}

function ApplyForm({
  template,
  clients,
  onDone,
}: {
  template: NutritionPlanWithMeals;
  clients: Pick<Client, "id" | "name">[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(applyTemplateToClientAction, initial);
  if (state?.success) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink">Rascunho criado no plano do aluno. Ajuste e publique na aba Nutrição dele.</p>
        <div className="flex justify-end">
          <Button onClick={onDone}>Fechar</Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="templateId" value={template.id} />
      <label className={labelClass}>
        Aluno
        <Select name="clientId" required defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      {state?.error && <p className="text-sm text-coral-text">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="tertiary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Aplicando…" : "Criar rascunho"}
        </Button>
      </div>
    </form>
  );
}
