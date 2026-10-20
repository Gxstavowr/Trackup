import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { StepStrip, type StripStep } from "@/components/viz/step-strip";
import type { CheckinCardState } from "@/lib/checkin-card-state";
import { CARD, ICONS } from "../portal-ui";

/**
 * Cartão de check-in da Home (item 29): visível a semana toda, com um estado por momento do ciclo
 * (ver `pickCheckinCardState`). Server Component, sem I/O: recebe o estado já decidido.
 * O ciclo "Check-in, Avaliação, Orientação" aparece como `StepStrip` nos estados em que não é a
 * ação principal, para o aluno saber onde está.
 */

const CHIPS = ["Peso e fotos", "Alimentação", "Treino", "Bem-estar"];

function LockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function cycleSteps(phase: "before" | "submitted" | "reviewed"): StripStep[] {
  const s = (key: string, label: string, state: StripStep["state"], hint?: string): StripStep => ({ key, label, state, hint });
  if (phase === "reviewed") return [s("c", "Check-in", "done"), s("a", "Avaliação", "done"), s("o", "Orientação", "done")];
  if (phase === "submitted") return [s("c", "Check-in", "done"), s("a", "Avaliação", "current", "coach"), s("o", "Orientação", "upcoming")];
  return [s("c", "Check-in", "current", "sex a dom"), s("a", "Avaliação", "upcoming"), s("o", "Orientação", "upcoming")];
}

function Shell({ label, children, tone = "default" }: { label: string; children: ReactNode; tone?: "default" | "ok" }) {
  return (
    <section
      aria-label={label}
      className={`flex flex-col gap-4 rounded-lg border p-5 ${tone === "ok" ? "border-success/30 bg-success-tint" : CARD}`}
    >
      {children}
    </section>
  );
}

export default function CheckinCard({ state }: { state: CheckinCardState }) {
  switch (state.kind) {
    case "open":
      return (
        <section
          aria-label="Check-in da semana — ação de agora"
          className="relative flex flex-col gap-4 overflow-hidden rounded-lg bg-brand p-5 text-on-accent"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-bold">
              {ICONS.checkin}
              Check-in aberto
            </span>
            <span className="rounded-full bg-on-accent px-2.5 py-1 text-xs font-bold text-brand">Fecha no {state.closesLabel}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="break-words font-display text-2xl font-extrabold leading-tight">
              Check-in da semana {state.weekNumber}
            </h2>
            <p className="break-words text-sm font-medium opacity-80">
              Responda até {state.closesLabel}. É por ele que seu coach ajusta o seu plano.
            </p>
          </div>
          <ol className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-4" aria-label="Etapas do check-in">
            {CHIPS.map((chip, i) => (
              <li
                key={chip}
                className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-on-accent/25 px-1.5 py-2 text-center text-xs font-semibold"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-on-accent/15 tabular-nums">{i + 1}</span>
                <span className="max-w-full truncate">{chip}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/portal/checkin"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-on-accent px-6 text-base font-semibold text-brand transition-opacity hover:opacity-90 active:translate-y-px"
          >
            Fazer check-in
            <Icon name="arrow-right" size={18} />
          </Link>
        </section>
      );

    case "before_open":
      return (
        <Shell label="Check-in da semana — ainda bloqueado">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-faint">
              <LockIcon />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="t-label text-ink-faint">Check-in · semana {state.weekNumber}</span>
              <h2 className="break-words font-display text-xl font-extrabold leading-tight text-ink">
                {state.reminder ? "Abre amanhã" : "Bloqueado até sexta-feira"}
              </h2>
              <p className="break-words text-sm text-ink-muted">
                {state.opensLabel}. Fica aberto de sexta a domingo; até lá, é só seguir o plano.
              </p>
            </div>
            <Badge tone={state.reminder ? "warning" : "neutral"}>{state.reminder ? "Amanhã" : "Fechado"}</Badge>
          </div>
          <StepStrip steps={cycleSteps("before")} label="Ciclo semanal do check-in" />
        </Shell>
      );

    case "submitted":
      return (
        <Shell label="Check-in enviado — aguardando avaliação" tone="ok">
          <Link href="/portal/checkin" className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-on-accent">
              <Icon name="check" size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="t-label text-success">Enviado · semana {state.weekNumber}</span>
              <span className="break-words font-display text-xl font-extrabold leading-tight text-ink">
                Aguardando a avaliação do coach
              </span>
              <span className="text-sm text-ink-muted">Você será avisado quando a orientação estiver pronta.</span>
            </span>
            <span className="mt-2 shrink-0 text-ink-faint">{ICONS.chevron}</span>
          </Link>
          <StepStrip steps={cycleSteps("submitted")} label="Ciclo semanal do check-in" />
        </Shell>
      );

    case "reviewed":
      return (
        <Shell label="Avaliação semanal concluída" tone="ok">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-on-accent">
              <Icon name="check" size={20} strokeWidth={2.5} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="t-label text-success">Ciclo concluído · semana {state.weekNumber}</span>
              <span className="break-words font-display text-xl font-extrabold leading-tight text-ink">
                Sua avaliação semanal está pronta
              </span>
              <span className="text-sm text-ink-muted">Seu coach avaliou o check-in e enviou a orientação.</span>
            </span>
          </div>
          <StepStrip steps={cycleSteps("reviewed")} label="Ciclo semanal do check-in" />
          <Link href="/portal/avaliacao" className={buttonClass({ variant: "primary", size: "lg", width: "full" })}>
            Ver avaliação semanal
            <Icon name="arrow-right" size={18} />
          </Link>
        </Shell>
      );

    case "locked":
      return (
        <MutedLink
          href="/portal/checkin"
          eyebrow="Check-in semanal"
          title="Bloqueado até o seu protocolo"
          detail="O check-in abre depois que seu coach publicar o protocolo."
          lock
        />
      );
    case "not_configured":
      return (
        <MutedLink
          href="/portal/checkin"
          eyebrow={`Check-in · semana ${state.weekNumber}`}
          title="Ainda não configurado"
          detail="Seu coach ainda não montou as perguntas do check-in."
        />
      );
    case "unavailable":
      return (
        <MutedLink
          href="/portal/checkin"
          eyebrow="Check-in semanal"
          title="Ainda não disponível"
          detail="Seu coach está finalizando o seu cadastro."
        />
      );
  }
}

function MutedLink({ href, eyebrow, title, detail, lock = false }: { href: string; eyebrow: string; title: string; detail: string; lock?: boolean }) {
  return (
    <Link href={href} className={`${CARD} flex min-h-16 items-center gap-3.5 px-4 py-4 transition-colors hover:border-line-strong`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-faint">
        {lock ? <LockIcon /> : ICONS.checkin}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-label text-ink-faint">{eyebrow}</span>
        <span className="break-words text-base font-semibold text-ink">{title}</span>
        <span className="break-words text-sm text-ink-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-ink-faint">{ICONS.chevron}</span>
    </Link>
  );
}
