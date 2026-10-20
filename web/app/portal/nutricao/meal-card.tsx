"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import type { FoodEquivalenceWithFoods, MealItemWithFood, MealWithItems } from "@/lib/repository";
import { formatNumber, macrosSummaryText, sumKnownMacros } from "@/lib/food-macros";
import { formatItemKcal, itemKcal, KCAL_MISSING_LABEL, mealKcal, missingKcalNote } from "@/lib/meal-kcal";
import { mealStatusLabel, type MealLogStatus } from "@/lib/nutrition-session";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/overlay";
import Icon from "@/components/ui/icon";
import MealLogForm from "./meal-log-form";
import { logMealAction } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MealSlotBadge, useMealSlot } from "../meal-clock";

function statusTone(status: MealLogStatus | null): BadgeTone {
  if (status === "done") return "success";
  if (status === "partial") return "warning";
  if (status === "skipped") return "danger";
  return "neutral";
}

/** Linha do item na lista principal: "150 g · Arroz branco cozido". */
export function itemLine(item: MealItemWithFood): string {
  const name = item.food?.name ?? "Alimento removido";
  return item.qty ? `${item.qty} · ${name}` : name;
}

/**
 * Uma refeição do dia na tela do aluno (V3 tarefa 11). Leitura primeiro: horário grande, nome,
 * total de kcal da refeição e, por alimento, quantidade · nome · kcal (sem precisar abrir nada).
 * Macros completos, observações e substituições ficam sob demanda ("Macros e substituições").
 * kcal ausente aparece como "kcal não informada" e o total vira "parcial" — nunca 0 inventado
 * (`lib/meal-kcal.ts`). Estado/contagem ao vivo vem do relógio compartilhado
 * (`useMealSlot`, `app/portal/meal-clock.tsx`). O registro de consumo é opcional e secundário
 * ("Registrar consumo" abre uma gaveta, com dificuldade/foto/observação). Atalho de um toque: "Marcar como feita" grava o
 * MESMO registro que a gaveta criaria sem detalhes (`logMealAction`, status `done`) — estado
 * otimista na hora, e o relógio compartilhado reage quando a revalidação traz os `statuses`
 * novos (mesmo caminho do salvar da gaveta). Sem "desfazer": a camada de ações não tem como
 * apagar um registro; corrigir é pela gaveta ("Editar registro"). `readOnly` = dia que não é
 * hoje: só consulta.
 */
export default function NutritionMealCard({
  clientId,
  logDate,
  meal,
  readOnly,
  equivalencesByFoodId,
  formProps,
}: {
  clientId: string;
  logDate: string;
  meal: MealWithItems;
  readOnly: boolean;
  equivalencesByFoodId: Map<string, FoodEquivalenceWithFoods[]>;
  formProps: {
    initialStatus: MealLogStatus | null;
    initialDifficulty: number | null;
    initialNote: string;
    initialStoragePath: string | null;
    initialPhotoUrl: string | null;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const live = useMealSlot(meal.id);
  const [quickPending, startQuick] = useTransition();
  const [quickError, setQuickError] = useState<string | null>(null);
  // Status exibido: o do servidor, ou "done" otimista enquanto o atalho grava/revalida.
  const [status, setOptimisticStatus] = useOptimistic<MealLogStatus | null, MealLogStatus>(
    formProps.initialStatus,
    (_current, next) => next
  );

  function markDone() {
    if (quickPending || status != null) return; // evita duplo envio / sobrescrever registro detalhado
    setQuickError(null);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("mealId", meal.id);
    fd.set("mealName", meal.name);
    fd.set("logDate", logDate);
    fd.set("status", "done");
    startQuick(async () => {
      setOptimisticStatus("done");
      try {
        const result = await logMealAction(null, fd);
        if (result?.error) setQuickError(result.error);
      } catch {
        setQuickError("Sem conexão — tente de novo.");
      }
    });
  }

  const items = meal.items.slice().sort((a, b) => a.sort_order - b.sort_order);
  const kcal = mealKcal({ items });
  const missingNote = missingKcalNote(kcal);
  const totals = sumKnownMacros(items);
  const macroChips = [
    totals.protein_g != null && { label: `Proteína ${formatNumber(totals.protein_g)} g`, tone: "text-info" },
    totals.carbs_g != null && { label: `Carbo ${formatNumber(totals.carbs_g)} g`, tone: "text-warning" },
    totals.fat_g != null && { label: `Gordura ${formatNumber(totals.fat_g)} g`, tone: "text-success" },
  ].filter(Boolean) as { label: string; tone: string }[];

  const hasDetails =
    macroChips.length > 0 ||
    items.some(
      (i) =>
        i.substitutions.length > 0 ||
        i.notes ||
        macrosSummaryText(i.macros) ||
        (i.food_id && equivalencesByFoodId.get(i.food_id)?.length)
    );

  const logged = status != null;
  const done = status === "done";
  // Animações só na TRANSIÇÃO para "feita" (marcar agora), nunca ao carregar a página já com ela feita.
  const [wasDone, setWasDone] = useState(done);
  const [justDone, setJustDone] = useState(false);
  if (done !== wasDone) {
    setWasDone(done);
    if (done) setJustDone(true);
  }
  // Enquanto o otimista não chega do servidor, o relógio ainda não sabe do registro: mostra o
  // selo de status em vez do slot ("Agora"/"Em X min") pra não contradizer o check.
  const slot = status !== formProps.initialStatus ? null : (live?.slot ?? null);
  const highlight = !logged && (slot?.kind === "now" || !!live?.primary);
  const surface = done
    ? "border-success/60 bg-success-tint"
    : highlight
      ? "border-brand bg-brand-tint"
      : "border-line bg-surface";
  const time = meal.time ? meal.time.slice(0, 5) : null;

  const logSummary = [
    formProps.initialDifficulty != null ? `Dificuldade ${formProps.initialDifficulty}/5` : null,
    formProps.initialPhotoUrl ? "com foto" : null,
  ].filter(Boolean);

  return (
    <li
      id={`refeicao-${meal.id}`}
      className={`flex scroll-mt-24 flex-col gap-3 rounded-[var(--radius-lg,1rem)] border p-4 transition-colors duration-300 motion-reduce:transition-none ${surface} ${justDone ? "tk-success" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex w-[4.25rem] shrink-0 flex-col items-start">
          {done ? (
            <span className={`${justDone ? "tk-pop " : ""}flex size-10 items-center justify-center rounded-full bg-success text-on-accent`} aria-hidden>
              <Icon name="check" size={22} strokeWidth={2.5} />
            </span>
          ) : (
            <span
              className={`font-display text-2xl font-extrabold leading-none tabular-nums ${highlight ? "text-brand" : "text-ink"}`}
            >
              {time ?? "—"}
            </span>
          )}
          {done && time && <span className="mt-1 text-xs tabular-nums text-ink-muted">{time}</span>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="break-words font-display text-lg leading-tight text-ink">{meal.name}</h3>
          {items.length > 0 && (
            <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
              {kcal.kcal != null ? (
                <span className="text-base font-semibold text-brand">{formatNumber(kcal.kcal, 0)} kcal</span>
              ) : (
                <span className="text-sm text-ink-faint">{KCAL_MISSING_LABEL}</span>
              )}
              {kcal.partial && missingNote && (
                <span className="text-xs font-medium text-ink-faint">parcial · {missingNote}</span>
              )}
            </p>
          )}
          {slot ? (
            <span className="mt-0.5">
              <MealSlotBadge slot={slot} />
            </span>
          ) : (
            logged && (
              <span className="mt-0.5">
                <Badge tone={statusTone(status)} dot>
                  {mealStatusLabel(status)}
                </Badge>
              </span>
            )
          )}
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line/60 border-t border-line/70">
          {items.map((item) => {
            const k = itemKcal(item);
            return (
              <li key={item.id} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 break-words text-ink">
                  {item.qty && (
                    <>
                      <span className="font-semibold">{item.qty}</span>
                      <span className="text-ink-faint"> · </span>
                    </>
                  )}
                  {item.food?.name ?? "Alimento removido"}
                </span>
                <span
                  className={`shrink-0 text-right tabular-nums ${k == null ? "text-xs text-ink-faint" : "font-semibold text-ink"}`}
                >
                  {formatItemKcal(k)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact icon="nutrition" title="Sem alimentos definidos ainda" text="Seu coach ainda não detalhou esta refeição." />
      )}

      {meal.notes && (
        <p className="break-words rounded-md bg-info-tint px-3 py-2 text-sm text-ink">
          <span className="font-semibold text-info">Do seu coach: </span>
          {meal.notes}
        </p>
      )}

      {expanded && hasDetails && (
        <div className="flex flex-col gap-2">
          {macroChips.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 rounded-md bg-surface-sunken/60 px-3 py-2 text-sm font-semibold">
              <span className="font-medium text-ink-muted">Total da refeição:</span>
              {macroChips.map((c) => (
                <span key={c.label} className={c.tone}>
                  {c.label}
                </span>
              ))}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <MealItemDetail
                key={item.id}
                item={item}
                equivalences={item.food_id ? equivalencesByFoodId.get(item.food_id) : undefined}
              />
            ))}
          </ul>
        </div>
      )}

      {logged && (formProps.initialNote || logSummary.length > 0) && (
        <p className="break-words text-xs text-ink-muted">
          {logSummary.join(" · ")}
          {formProps.initialNote && `${logSummary.length ? " · " : ""}“${formProps.initialNote}”`}
        </p>
      )}

      {!readOnly && !logged && (
        <button
          type="button"
          onClick={markDone}
          disabled={quickPending}
          aria-label={`Marcar ${meal.name} como feita`}
          className={buttonClass({ variant: "primary", size: "lg", width: "full" })}
        >
          <Icon name="check" size={20} strokeWidth={2.5} />
          Marcar como feita
        </button>
      )}
      <p aria-live="polite" className={quickError ? "text-xs text-coral-text" : "sr-only"}>
        {quickError ?? (quickPending && done ? `${meal.name} marcada como feita.` : "")}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasDetails ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-ink-muted hover:text-ink"
          >
            {expanded ? "Ocultar detalhes" : "Macros e substituições"}
            <span className={expanded ? "rotate-180" : ""}>
              <Icon name="chevron-down" size={18} />
            </span>
          </button>
        ) : (
          <span />
        )}

        {!readOnly && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors ${
              logged ? "border-line-strong text-ink-muted hover:text-ink" : "border-line-strong text-ink hover:border-brand"
            }`}
          >
            {logged ? "Editar registro" : "Registrar consumo"}
          </button>
        )}
      </div>

      {!readOnly && (
        <Drawer open={sheetOpen} onClose={closeSheet} title={`Registrar · ${meal.name}`}>
          <MealLogForm
            clientId={clientId}
            logDate={logDate}
            mealId={meal.id}
            mealName={meal.name}
            initialStatus={formProps.initialStatus}
            initialDifficulty={formProps.initialDifficulty}
            initialNote={formProps.initialNote}
            initialStoragePath={formProps.initialStoragePath}
            initialPhotoUrl={formProps.initialPhotoUrl}
            onSaved={closeSheet}
          />
        </Drawer>
      )}
    </li>
  );
}

function MealItemDetail({
  item,
  equivalences,
}: {
  item: MealItemWithFood;
  equivalences: FoodEquivalenceWithFoods[] | undefined;
}) {
  const macrosLabel = macrosSummaryText(item.macros);
  const hasSwaps = item.substitutions.length > 0 || (equivalences && equivalences.length > 0);
  if (!macrosLabel && !item.notes && !hasSwaps) return null;

  return (
    <li className="rounded-md border border-line bg-surface-sunken/60 p-3 text-sm">
      <p className="break-words font-medium text-ink">{itemLine(item)}</p>
      {macrosLabel && <p className="text-xs text-ink-faint">{macrosLabel}</p>}
      {item.notes && <p className="break-words text-xs text-ink-muted">{item.notes}</p>}

      {hasSwaps && (
        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          <span className="t-label text-info">Pode substituir por</span>
          {item.substitutions.map((sub) => (
            <p key={sub.id} className="break-words text-xs text-ink-muted">
              {sub.alternative_qty ? `${sub.alternative_qty} · ` : ""}
              {sub.alternative_food?.name ?? sub.alternative_label ?? "Alternativa"}
              {sub.note ? ` (${sub.note})` : ""}
            </p>
          ))}
          {equivalences?.map((eq) => (
            <p key={eq.id} className="break-words text-xs text-ink-muted">
              Equivale a {eq.equivalent_food?.name ?? "outro alimento"}
              {eq.factor != null && eq.factor !== 1 ? ` (fator ${formatNumber(eq.factor, 2)})` : ""}
              {eq.note ? ` — ${eq.note}` : ""}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}
