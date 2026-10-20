"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSaoPauloClock } from "@/lib/portal-today";
import {
  computeMealClock,
  headlineLabels,
  slotLabel,
  type ClockLogStatus,
  type ClockMeal,
  type MealClock,
  type MealSlot,
} from "@/lib/meal-clock";
import Icon from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/button";

/**
 * Relógio de refeições AO VIVO (V3 tarefa 10), compartilhado por Home e Nutrição. Um único
 * timer local por tela (provider) reavalia `computeMealClock` (`lib/meal-clock.ts`) a cada
 * 30 s, alinhado a :00/:30 do relógio — sem chamada ao servidor. Quando o aluno registra uma
 * refeição, a server action revalida a página e os `statuses` novos chegam por props.
 *
 * O primeiro render usa o instante do servidor (`initialNowMs`) para hidratar igual; logo em
 * seguida o cliente passa a usar o próprio relógio.
 */

const TICK_MS = 30_000;

type Ctx = MealClock | null;
const MealClockContext = createContext<Ctx>(null);

function useLiveNow(initialNowMs: number): number {
  const [nowMs, setNowMs] = useState(initialNowMs);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        const now = Date.now();
        setNowMs(now);
        schedule(TICK_MS - (now % TICK_MS) + 50);
      }, delay);
    };
    schedule(0);
    // Celular voltando do bloqueio: os timers podem ter ficado congelados.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return nowMs;
}

export function MealClockProvider({
  meals,
  statuses,
  initialNowMs,
  children,
}: {
  meals: ClockMeal[];
  statuses: Record<string, ClockLogStatus>;
  initialNowMs: number;
  children: ReactNode;
}) {
  const nowMs = useLiveNow(initialNowMs);
  const clock = useMemo(() => {
    const now = new Date(nowMs);
    const sp = getSaoPauloClock(now);
    return computeMealClock(meals, sp.weekday, sp.minutes + now.getUTCSeconds() / 60, statuses);
  }, [meals, statuses, nowMs]);
  return <MealClockContext.Provider value={clock}>{children}</MealClockContext.Provider>;
}

export function useMealClock(): Ctx {
  return useContext(MealClockContext);
}

/** Estado ao vivo de uma refeição de hoje (`null` fora do provider, p.ex. outro dia). */
export function useMealSlot(mealId: string): { slot: MealSlot; primary: boolean } | null {
  const clock = useContext(MealClockContext);
  const slot = clock?.slots[mealId];
  return clock && slot ? { slot, primary: clock.primaryId === mealId } : null;
}

const SLOT_TONE: Record<MealSlot["kind"], string> = {
  now: "bg-brand text-on-accent",
  upcoming: "border border-brand/40 text-brand",
  missed: "border border-line-strong text-ink-muted",
  registered: "bg-success-tint text-success",
  untimed: "border border-line text-ink-faint",
};

/** Selo de estado/contagem de uma refeição ("Em 40 min", "Agora", "Horário passou..."). */
export function MealSlotBadge({ slot, className = "" }: { slot: MealSlot; className?: string }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${SLOT_TONE[slot.kind]} ${className}`}
    >
      {slot.kind === "now" && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {slot.kind === "registered" && <Icon name="check" size={14} strokeWidth={2.5} />}
      {slotLabel(slot)}
    </span>
  );
}

export type NextMealDetail = { foods: number; kcal: string | null };

/** Linha de contexto: refeição anterior registrada ou com horário passado. */
function PreviousLine({ clock }: { clock: MealClock }) {
  const prev = clock.previous;
  if (!prev || (prev.slot.kind !== "missed" && prev.slot.kind !== "registered")) return null;
  return (
    <p className="flex items-start gap-1.5 break-words text-sm text-ink-muted">
      <span className={`mt-0.5 shrink-0 ${prev.slot.kind === "registered" ? "text-success" : "text-ink-faint"}`} aria-hidden>
        <Icon name={prev.slot.kind === "registered" ? "check" : "clock"} size={16} />
      </span>
      <span>
        <span className="font-semibold text-ink">{prev.meal.name}</span> ({prev.time}) · {slotLabel(prev.slot)}
      </span>
    </p>
  );
}

/**
 * Card "Próxima refeição" da Home: nome, horário, contagem e UMA ação (ver a refeição).
 * Sem horários no plano: estado neutro, sem inventar horário.
 */
export function NextMealCard({ details, href = "/portal/nutricao" }: { details: Record<string, NextMealDetail>; href?: string }) {
  const clock = useMealClock();
  if (!clock) return null;
  const h = clock.headline;
  const labels = headlineLabels(h);
  const meal = h.kind === "now" || h.kind === "upcoming" || h.kind === "later-day" ? h.meal : null;
  const detail = meal ? details[meal.id] : undefined;
  const isNow = h.kind === "now";

  const meta = [
    h.kind === "now" || h.kind === "upcoming" ? h.time : null,
    detail && detail.foods > 0 ? `${detail.foods} ${detail.foods === 1 ? "alimento" : "alimentos"}` : null,
    detail?.kcal ?? null,
  ].filter(Boolean);

  return (
    <section
      aria-label="Próxima refeição"
      aria-live="polite"
      className={`flex flex-col gap-3 rounded-lg border p-5 ${isNow ? "border-brand bg-brand-tint" : "card"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-2 ${isNow ? "text-brand" : "text-ink-muted"}`}>
          <Icon name="nutrition" size={20} />
          <span className="t-label">{labels.eyebrow}</span>
        </span>
        {labels.when && (
          <span
            className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-bold tabular-nums ${
              isNow ? "bg-brand text-on-accent" : h.kind === "upcoming" ? "bg-brand-tint text-brand" : "bg-surface-sunken text-ink"
            }`}
          >
            {labels.when}
          </span>
        )}
      </div>

      {meal ? (
        <div className="flex flex-col gap-1">
          <h3 className="break-words font-display text-2xl font-extrabold leading-tight text-ink">{meal.name}</h3>
          {meta.length > 0 && <p className="text-base text-ink-muted tabular-nums">{meta.join(" · ")}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-xl text-ink">
            {h.kind === "empty" ? "Seu plano ainda não tem refeições" : "Refeições sem horário definido"}
          </h3>
          <p className="text-sm text-ink-muted">
            {h.kind === "empty"
              ? "Assim que seu coach montar as refeições, elas aparecem aqui."
              : "Seu coach não definiu horários. Siga a ordem do plano ao longo do dia."}
          </p>
        </div>
      )}

      <PreviousLine clock={clock} />

      <Link href={clock.primaryId ? `${href}#refeicao-${clock.primaryId}` : href} className={buttonClass({ variant: isNow ? "primary" : "secondary", size: "lg", width: "full" })}>
        {isNow ? "Ver refeição agora" : "Ver plano alimentar"}
        <Icon name="arrow-right" size={18} />
      </Link>
    </section>
  );
}

/** Faixa compacta da Nutrição (hoje): destaque atual + atalho para o card da refeição. */
export function NextMealStrip() {
  const clock = useMealClock();
  if (!clock) return null;
  const h = clock.headline;
  if (h.kind === "empty") return null;
  const labels = headlineLabels(h);
  const meal = h.kind === "no-times" ? null : h.meal;
  const isNow = h.kind === "now";

  const body = (
    <>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${isNow ? "bg-brand text-on-accent" : "bg-brand-tint text-brand"}`}>
        <Icon name="clock" size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-label text-ink-faint">{labels.eyebrow}</span>
        {meal ? (
          <span className="break-words text-base font-semibold text-ink">
            {meal.name}
            {(h.kind === "now" || h.kind === "upcoming") && <span className="whitespace-nowrap text-ink-muted"> · {h.time}</span>}
          </span>
        ) : (
          <span className="text-sm text-ink-muted">Seu plano não tem horários definidos.</span>
        )}
      </span>
      {labels.when && (
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${isNow ? "bg-brand text-on-accent" : "text-brand"}`}
        >
          {labels.when}
        </span>
      )}
    </>
  );

  const cls = `flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3 ${isNow ? "border-brand bg-brand-tint" : "border-line bg-surface"}`;
  return meal && clock.primaryId === meal.id ? (
    <a href={`#refeicao-${meal.id}`} aria-live="polite" className={`${cls} transition-colors hover:border-brand`}>
      {body}
    </a>
  ) : (
    <div aria-live="polite" className={cls}>
      {body}
    </div>
  );
}
