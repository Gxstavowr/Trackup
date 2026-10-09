"use client";

import { useActionState, useState } from "react";
import { clampWaterMl, computeWaterProgress, WATER_QUICK_ADD_ML } from "@/lib/nutrition-session";
import { CARD } from "../portal-ui";
import { logWaterAction, type WaterLogActionState } from "./actions";

const initialState: WaterLogActionState = null;

/**
 * Meta de água do dia (item 21 — "mostrar meta de água quando acompanhada"). Só é montado
 * pela página quando o plano define `target_water_ml` (ver `page.tsx`) — sem meta, não faz
 * sentido "progresso". Botões rápidos só ajustam o valor NO CLIENTE; salvar é uma ação
 * explícita (evita disparar uma Server Action a cada toque em "+200ml").
 */
export default function WaterTracker({
  clientId,
  logDate,
  initialAmountMl,
  targetMl,
}: {
  clientId: string;
  logDate: string;
  initialAmountMl: number;
  targetMl: number;
}) {
  const [state, action, pending] = useActionState(logWaterAction, initialState);
  const [amount, setAmount] = useState(initialAmountMl);

  // Último valor confirmado pelo servidor: o da action bem-sucedida mais recente, ou o inicial
  // (carregado pela página) enquanto nada foi salvo ainda — sem estado extra/efeito pra isso.
  const lastSavedAmount = state?.success && state.amountMl != null ? state.amountMl : initialAmountMl;
  const dirty = amount !== lastSavedAmount;
  const progress = computeWaterProgress(amount, targetMl);
  const barPct = progress.pct != null ? Math.min(100, progress.pct) : 0;

  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-label uppercase tracking-widest text-ink-faint">Água</h2>
        <span className="text-sm text-ink-muted">
          {amount}ml / {targetMl}ml{progress.pct != null && ` · ${progress.pct}%`}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={targetMl}
        aria-valuenow={Math.min(amount, targetMl)}
        aria-label="Progresso da meta de água"
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${barPct}%` }} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {WATER_QUICK_ADD_ML.map((inc) => (
          <button
            key={inc}
            type="button"
            onClick={() => setAmount((a) => clampWaterMl(a + inc))}
            className="min-h-11 rounded-full border border-line px-3 text-sm text-ink hover:border-brand"
          >
            +{inc}ml
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAmount(0)}
          className="min-h-11 rounded-full border border-line px-3 text-sm text-ink-muted hover:border-line-strong"
        >
          Zerar
        </button>
      </div>

      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="logDate" value={logDate} />
        <input type="hidden" name="amountMl" value={amount} />
        <button
          type="submit"
          disabled={pending || !dirty}
          className="min-h-11 rounded-md bg-brand px-4 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Salvando…" : dirty ? "Salvar" : "Salvo ✓"}
        </button>
        {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}
      </form>
    </div>
  );
}
