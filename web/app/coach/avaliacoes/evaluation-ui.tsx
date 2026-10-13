import Link from "next/link";
import type { ReactNode } from "react";
import type { EvaluationRow, EvaluationState } from "@/lib/evaluations";
import { getSaoPauloClock } from "@/lib/portal-today";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import Icon, { type IconName } from "@/components/ui/icon";
import { SITUATION_META, getSituation, isOverdue } from "@/lib/evaluation-situation";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Peças de UI compartilhadas entre `/coach` (panorama da semana + ações prioritárias), `/coach/avaliacoes` (lista
 * completa) e a página de avaliação do aluno — uma fonte só pro vocabulário de status e pros
 * botões de ação, pra os três lugares nunca divergirem.
 *
 * Vocabulário: estados do CICLO de avaliação (nunca status financeiro — pagamento é outro eixo).
 */


export const STATE_META: Record<
  EvaluationState,
  { label: string; tone: BadgeTone; action: string }
> = {
  pending: { label: "Avaliação pendente", tone: "accent", action: "Abrir avaliação" },
  in_progress: { label: "Em avaliação", tone: "accent", action: "Continuar avaliação" },
  draft: { label: "Orientação em rascunho", tone: "warning", action: "Finalizar avaliação" },
  awaiting_checkin: {
    label: "Aguardando check-in",
    tone: "neutral",
    action: "Cobrar check-in",
  },
  done: { label: "Ciclo concluído", tone: "success", action: "Ver acompanhamento" },
};

/** Botões da fila de avaliações — vêm do design system (`components/ui/button`); largura total no celular. */
export const BUTTON_PRIMARY = buttonClass({ variant: "primary", width: "mobile" });
export const BUTTON_OUTLINE = buttonClass({ variant: "secondary", width: "mobile" });
export const BUTTON_GHOST = buttonClass({ variant: "secondary", width: "mobile" });
export const BUTTON_DISABLED = buttonClass({
  variant: "secondary",
  width: "mobile",
  className: "cursor-not-allowed border-line! text-ink-faint! opacity-70 hover:border-line! hover:text-ink-faint!",
});

export function StateBadge({ state }: { state: EvaluationState }) {
  const meta = STATE_META[state];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

/** Timestamp -> dd/mm (fuso do Brasil, pra o servidor em UTC não deslocar o dia). */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Coluna `date` (sem hora/fuso) -> dd/mm, em UTC pra não deslocar um dia. */
export function formatDateOnlyShort(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Telefone -> dígitos pro `wa.me` (com DDI). Sem DDI (10–11 dígitos = DDD + número) assume
 * Brasil (55). Devolve `null` se não der pra formar um número plausível — a UI então mostra o
 * botão desabilitado em vez de um link quebrado.
 */
export function whatsappDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

/**
 * Texto do "Cobrar check-in" pelo dia da semana (item 28 do TODO — WhatsApp complementar):
 * o ciclo de check-in é sexta-a-domingo, quinta é o dia de aviso, segunda-a-quarta bloqueado
 * (mesma decisão do item 24/25, `checkinWindow` em `lib/portal-today.ts`). `late` já vem
 * calculado (`EvaluationRow.late` / `StudentEntry.tracking.late`) — quando atrasado, a
 * mensagem é sempre a de cobrança de atraso, não importa o dia. NÃO cria estado novo: só troca
 * o TEXTO do mesmo botão que já existe, pro dia/situação certos.
 */
export function checkinNudgeMessage(
  firstName: string,
  weekNumber: number,
  late: boolean,
  now: Date = new Date()
): string {
  if (late) {
    return (
      `Oi, ${firstName}! Reparei que o check-in da semana ${weekNumber} ainda não chegou — o prazo ` +
      `(até domingo) já passou. Consegue enviar assim que der? Preciso dele para preparar sua orientação.`
    );
  }
  const { weekday } = getSaoPauloClock(now); // 0 domingo ... 6 sábado
  switch (weekday) {
    case 4: // quinta: aviso de abertura amanhã
      return (
        `Oi, ${firstName}! Só um aviso: o check-in da semana ${weekNumber} abre amanhã (sexta) e ` +
        `fica disponível até domingo. Fico no aguardo!`
      );
    case 5: // sexta: check-in disponível
      return (
        `Oi, ${firstName}! O check-in da semana ${weekNumber} já está disponível no Trackly, dá pra ` +
        `preencher até domingo. Qualquer dúvida me chama!`
      );
    case 6: // sábado: lembrete
      return (
        `Oi, ${firstName}! Lembrete rápido: o check-in da semana ${weekNumber} está aberto até amanhã ` +
        `(domingo). Não esquece de preencher!`
      );
    case 0: // domingo: última chamada
      return (
        `Oi, ${firstName}! Hoje é o último dia para enviar o check-in da semana ${weekNumber} — fecha ` +
        `à meia-noite. Não deixa para depois!`
      );
    default: // segunda a quarta, ainda sem atraso registrado — mensagem contextual padrão
      return `Oi, ${firstName}! Passando para lembrar do seu check-in da semana ${weekNumber} no Trackly. Leva poucos minutos e me ajuda a preparar a sua orientação.`;
  }
}

/**
 * "Cobrar check-in": abre o WhatsApp com a mensagem pronta quando o aluno tem telefone
 * (`clients.phone`); sem telefone (ou inválido) vira um botão DESABILITADO com a explicação
 * ao lado — nunca um link que não leva a lugar nenhum. `late` (opcional, default `false`)
 * ajusta o TEXTO da mensagem ao dia da semana / situação (ver `checkinNudgeMessage`).
 */
export function ChargeCheckinButton({
  client,
  weekNumber,
  late = false,
  className = BUTTON_OUTLINE,
}: {
  client: EvaluationRow["client"];
  weekNumber: number;
  late?: boolean;
  className?: string;
}) {
  const digits = whatsappDigits(client.phone);
  const firstName = client.name.trim().split(/\s+/)[0] ?? client.name;

  if (!digits) {
    const reason = client.phone
      ? "O telefone cadastrado parece inválido."
      : "Este aluno não tem telefone cadastrado.";
    return (
      <div className="flex flex-col gap-1.5 sm:items-end">
        <button type="button" disabled aria-describedby={`no-phone-${client.id}`} className={BUTTON_DISABLED}>
          <Icon name="checkin" size={18} className="shrink-0" />
          Cobrar check-in
        </button>
        <p id={`no-phone-${client.id}`} className="text-xs text-ink-faint sm:text-right">
          {reason} Sem telefone não dá para abrir o WhatsApp.
        </p>
      </div>
    );
  }

  const message = checkinNudgeMessage(firstName, weekNumber, late);
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <Icon name="checkin" size={18} className="shrink-0" />
      Cobrar check-in
      <span className="sr-only"> de {client.name} pelo WhatsApp (abre em nova aba)</span>
    </a>
  );
}

/**
 * "Avisar orientação" (item 28 do TODO): depois que o coach envia a orientação da semana, um
 * ponto de apoio pra avisar o aluno pelo WhatsApp que ela já está disponível no Trackly. Mesmo
 * padrão de `ChargeCheckinButton` (telefone ausente/inválido -> botão desabilitado com
 * explicação); nunca envia nada sozinho, só abre o `wa.me` com o texto pronto.
 */
export function OrientationReadyButton({
  client,
  weekNumber,
  className = BUTTON_GHOST,
}: {
  client: EvaluationRow["client"];
  weekNumber: number;
  className?: string;
}) {
  const digits = whatsappDigits(client.phone);
  const firstName = client.name.trim().split(/\s+/)[0] ?? client.name;

  if (!digits) {
    const reason = client.phone
      ? "O telefone cadastrado parece inválido."
      : "Este aluno não tem telefone cadastrado.";
    return (
      <div className="flex flex-col gap-1.5 sm:items-end">
        <button
          type="button"
          disabled
          aria-describedby={`no-phone-orientation-${client.id}`}
          className={BUTTON_DISABLED}
        >
          <Icon name="message" size={18} className="shrink-0" />
          Avisar orientação
        </button>
        <p id={`no-phone-orientation-${client.id}`} className="text-xs text-ink-faint sm:text-right">
          {reason} Sem telefone não dá para abrir o WhatsApp.
        </p>
      </div>
    );
  }

  const message = `Oi, ${firstName}! Sua orientação da semana ${weekNumber} já está disponível no Trackly. Dá uma olhada quando puder!`;
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <Icon name="message" size={18} className="shrink-0" />
      Avisar orientação
      <span className="sr-only"> — {client.name} pelo WhatsApp (abre em nova aba)</span>
    </a>
  );
}

/**
 * "Falar no WhatsApp": contato geral, sem mensagem pronta e sem pressão (tertiary). Só aparece
 * quando o aluno tem telefone válido — a falta de telefone já é explicada pelas ações de cobrança.
 */
export function ContactWhatsappButton({
  client,
  className = buttonClass({ variant: "tertiary", width: "mobile" }),
}: {
  client: EvaluationRow["client"];
  className?: string;
}) {
  const digits = whatsappDigits(client.phone);
  if (!digits) return null;
  return (
    <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className={className}>
      <Icon name="message" size={18} className="shrink-0" />
      Falar no WhatsApp
      <span className="sr-only"> com {client.name} (abre em nova aba)</span>
    </a>
  );
}

/** Uma linha curta de contexto: o que aconteceu / o que falta (sem repetir o nome do estado). */
function rowDetail(row: EvaluationRow, overdue: boolean): string {
  const week = `Semana ${row.weekNumber}`;
  const prev = overdue ? " · semana anterior" : "";
  switch (row.state) {
    case "pending":
      return `${week} · enviado${row.submittedAt ? ` em ${formatShortDate(row.submittedAt)}` : ""}${prev}`;
    case "in_progress":
      return `${week} · aberta${row.reviewOpenedAt ? ` em ${formatShortDate(row.reviewOpenedAt)}` : ""}${prev}`;
    case "draft":
      return `${week} · rascunho salvo, falta enviar ao aluno${prev}`;
    case "awaiting_checkin":
      return row.late
        ? `${week} · o prazo era ${formatDateOnlyShort(row.periodEnd)}`
        : `${week} · enviar até ${formatDateOnlyShort(row.periodEnd)}`;
    case "done":
      return `${week} · orientação enviada${row.reviewedAt ? ` em ${formatShortDate(row.reviewedAt)}` : ""}`;
  }
}

/** Link da avaliação do aluno — a mesma rota serve os estados pendente/andamento/rascunho/concluído. */
export function evaluationHref(clientId: string): string {
  return `/coach/alunos/${clientId}/avaliacao`;
}

/**
 * Uma linha por aluno: nome + situação (texto sempre) + contexto curto + UM botão pra situação.
 * `emphasis` pinta o botão de ação como primário (amarelo) — usado só na próxima da fila;
 * as demais usam botão secundário pra o acento não competir em toda linha.
 */
export function EvaluationListItem({
  row,
  today,
  emphasis = false,
}: {
  row: EvaluationRow;
  today: string;
  emphasis?: boolean;
}) {
  const situation = getSituation(row);
  const meta = SITUATION_META[situation];
  const overdue = isOverdue(row, today);
  const late = situation === "checkin_late";
  return (
    <li
      className={`flex flex-col gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
        emphasis ? "bg-brand-tint/40" : ""
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link
            href={`/coach/alunos/${row.client.id}`}
            className="-my-3 max-w-full truncate py-3 font-medium text-ink hover:text-brand"
          >
            {row.client.name}
          </Link>
          <Badge tone={meta.tone} dot>
            {meta.label}
          </Badge>
          {overdue && <Badge tone="danger">Semana anterior</Badge>}
        </div>
        <p className={`t-helper ${late ? "!text-late-text" : ""}`}>{rowDetail(row, overdue)}</p>
      </div>

      <div className="sm:shrink-0">
        {situation === "checkin_late" || situation === "checkin_waiting" ? (
          <ChargeCheckinButton client={row.client} weekNumber={row.weekNumber} late={late} />
        ) : (
          <Link
            href={evaluationHref(row.client.id)}
            className={buttonClass({
              variant: emphasis ? "primary" : "secondary",
              width: "mobile",
            })}
          >
            {meta.action}
            <span className="sr-only"> — {row.client.name}</span>
          </Link>
        )}
      </div>
    </li>
  );
}

/** Cabeçalho de grupo: título + contagem tabular + descrição curta opcional + ação opcional à direita. */
export function EvaluationGroup({
  title,
  count,
  description,
  action,
  tone = "default",
  children,
}: {
  title: string;
  count: number;
  description?: string;
  action?: ReactNode;
  tone?: "default" | "work";
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <h2 className="t-subtitle flex items-center gap-2.5 text-ink">
            {title}
            <span
              className={`inline-flex min-w-7 items-center justify-center rounded-full px-2 py-1 text-xs font-bold leading-none tabular-nums ${
                tone === "work" && count > 0 ? "bg-brand text-on-accent" : "bg-surface-raised text-ink-muted"
              }`}
            >
              {count}
            </span>
          </h2>
          {description && <p className="t-helper">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Lista de linhas. Na primeira linha da fila de trabalho (`highlightFirst`) o botão é primário. */
export function RowsList({
  rows,
  today,
  highlightFirst = false,
  work = false,
}: {
  rows: EvaluationRow[];
  today: string;
  highlightFirst?: boolean;
  /** Fila de trabalho: borda de acento para destacá-la das demais listas. */
  work?: boolean;
}) {
  return (
    <ul className={`overflow-hidden card ${work ? "!border-brand/40" : ""}`}>
      {rows.map((row, i) => (
        <EvaluationListItem key={row.client.id} row={row} today={today} emphasis={highlightFirst && i === 0} />
      ))}
    </ul>
  );
}

/** Estado vazio de um grupo — explica o que fazer, nunca só "nada aqui". */
export function GroupEmpty({ title, text, icon = "check-circle" }: { title: string; text: string; icon?: IconName }) {
  return <EmptyState compact icon={icon} title={title} text={text} />;
}

/**
 * Indicador de progresso da semana: anel (concluídos / total) + valor. O texto "x/y" está sempre
 * presente — o anel é só reforço visual.
 */
export function WeekProgressRing({ done, total }: { done: number; total: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  return (
    <div
      className="relative size-28 shrink-0 sm:size-32"
      role="img"
      aria-label={`${done} de ${total} ciclos concluídos esta semana`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-line-strong" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className="stroke-brand"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[1.75rem] font-extrabold leading-none tabular-nums text-ink sm:text-3xl">
          {done}
          <span className="text-ink-faint">/{total}</span>
        </span>
        <span className="t-label mt-1 text-ink-muted">concluídos</span>
      </div>
    </div>
  );
}

/** Valor do resumo: número .t-value (tabular) + rótulo; mesma altura e alinhamento em todos. */
export function SummaryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "accent" | "danger";
}) {
  const color =
    value === 0
      ? "text-ink-faint"
      : tone === "accent"
        ? "text-brand"
        : tone === "danger"
          ? "text-danger-text"
          : "text-ink";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={`t-value !text-[2rem] sm:!text-[2.5rem] ${color}`}>{value}</span>
      <span className="t-label text-ink-muted">{label}</span>
    </div>
  );
}

/**
 * Métrica de progresso "x de y" com barra — resumo semanal do hub (`/coach`). O texto "x/y" está
 * sempre presente; a barra é reforço visual. `total = 0` mostra a barra vazia, sem dividir por zero.
 */
export function ProgressMetric({
  label,
  value,
  total,
  hint,
}: {
  label: string;
  value: number;
  total: number;
  hint?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label text-ink-muted">{label}</span>
        <span className="font-display text-lg font-extrabold leading-none tabular-nums text-ink">
          {value}
          <span className="text-ink-faint">/{total}</span>
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-line-strong"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="t-helper">{hint}</p>}
    </div>
  );
}

/**
 * Um ponto de atenção do hub: ícone + contagem + frase curta + link para onde se resolve.
 * Só contagens e nomes — nunca respostas do check-in.
 */
export function AttentionItem({
  icon,
  tone,
  count,
  title,
  text,
  href,
  linkLabel,
}: {
  icon: IconName;
  tone: "danger" | "warning";
  count: number;
  title: string;
  text: string;
  href: string;
  linkLabel: string;
}) {
  const chip = tone === "danger" ? "bg-danger-tint text-danger-text" : "bg-warning-tint text-ink";
  return (
    <li className="flex flex-col gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${chip}`} aria-hidden>
          <Icon name={icon} size={18} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-medium text-ink">
            <span className="tabular-nums">{count}</span> {title}
          </p>
          <p className="t-helper break-words">{text}</p>
        </div>
      </div>
      <Link href={href} className={buttonClass({ variant: "tertiary", width: "mobile", className: "sm:shrink-0" })}>
        {linkLabel}
        <Icon name="arrow-right" size={16} className="shrink-0" />
      </Link>
    </li>
  );
}
