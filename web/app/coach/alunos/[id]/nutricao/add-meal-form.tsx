"use client";

import { useActionState, useRef, useState } from "react";
import { WEEKDAY_OPTIONS, type WeekDay } from "@/lib/nutrition-builder";
import { addMealAction, type NutricaoActionState } from "./actions";
import { Button } from "@/components/ui";
import { inputClass } from "@/components/ui/field";

const initialState: NutricaoActionState = null;

const PRESETS: { name: string; time: string }[] = [
  { name: "Café da manhã", time: "07:00" },
  { name: "Lanche da manhã", time: "10:00" },
  { name: "Almoço", time: "12:30" },
  { name: "Lanche da tarde", time: "16:00" },
  { name: "Pré-treino", time: "17:30" },
  { name: "Jantar", time: "19:30" },
  { name: "Ceia", time: "22:00" },
];

/** "Nova refeição": atalhos de refeições comuns preenchem nome e horário; dia padrão = o dia
 * selecionado no editor (ou "Todo dia"). */
export default function AddMealForm({
  clientId,
  planId,
  defaultDay,
}: {
  clientId: string;
  planId: string;
  defaultDay: WeekDay;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [time, setTime] = useState("");
  const [state, action, pending] = useActionState(async (prev: NutricaoActionState, fd: FormData) => {
    const result = await addMealAction(prev, fd);
    if (result?.success) {
      formRef.current?.reset();
      setName("");
      setTime("");
    }
    return result;
  }, initialState);

  if (!open) {
    return (
      <Button type="button" icon="plus" className="self-start" onClick={() => setOpen(true)}>
        Nova refeição
      </Button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong p-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={planId} />

      <div className="flex flex-wrap gap-1.5" aria-label="Atalhos de refeição">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => {
              setName(p.name);
              setTime(p.time);
            }}
            className="min-h-9 rounded-full border border-line px-3 text-xs text-ink-muted hover:border-brand hover:text-brand"
          >
            {p.name} · {p.time}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Nome da refeição</span>
          <input
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Café da manhã"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Horário</span>
          <input name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Dia da semana</span>
          <select name="day_of_week" key={defaultDay} defaultValue={String(defaultDay)} className={inputClass}>
            <option value="">Todo dia</option>
            {WEEKDAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observações para o aluno (opcional)</span>
        <textarea name="notes" rows={2} className={inputClass} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">{state.error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Criando…" : "Criar refeição"}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>
    </form>
  );
}
