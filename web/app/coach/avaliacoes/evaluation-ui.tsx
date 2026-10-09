import Link from "next/link";
import type { ReactNode } from "react";
import type { EvaluationRow, EvaluationState } from "@/lib/evaluations";
import { getSaoPauloClock } from "@/lib/portal-today";

/**
 * Peças de UI compartilhadas entre `/coach` (fila de trabalho), `/coach/avaliacoes` (lista
 * completa) e a página de avaliação do aluno — uma fonte só pro vocabulário de status e pros
 * botões de ação, pra os três lugares nunca divergirem.
 *
 * Vocabulário: estados do CICLO de avaliação (nunca status financeiro — pagamento é outro eixo).
 */

export const BADGE_BASE = "rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide";

export const STATE_META: Record<
  EvaluationState,
  { label: string; badge: string; action: string }
> = {
  pending: { label: "Avaliação pendente", badge: "bg-brand-tint text-brand", action: "Abrir avaliação" },
  in_progress: { label: "Em avaliação", badge: "bg-brand-tint text-brand", action: "Continuar avaliação" },
  draft: { label: "Orientação em rascunho", badge: "bg-warn-tint text-warn", action: "Finalizar orientação" },
  awaiting_checkin: {
    label: "Aguardando check-in",
    badge: "bg-surface-sunken text-ink-muted",
    action: "Cobrar check-in",
  },
  done: { label: "Ciclo concluído", badge: "bg-ok-tint text-ok", action: "Ver avaliação" },
};

/** Botão principal (ação do coach) e secundário — sempre com aparência de botão, alvo >= 44px. */
export const BUTTON_PRIMARY =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 sm:w-auto";
export const BUTTON_OUTLINE =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-brand px-5 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand-tint sm:w-auto";
export const BUTTON_GHOST =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong sm:w-auto";
export const BUTTON_DISABLED =
  "inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-md border border-line px-5 py-2.5 text-sm font-medium text-ink-faint opacity-70 sm:w-auto";

export function StateBadge({ state }: { state: EvaluationState }) {
  const meta = STATE_META[state];
  return <span className={`${BADGE_BASE} ${meta.badge}`}>{meta.label}</span>;
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
      Avisar orientação
      <span className="sr-only"> — {client.name} pelo WhatsApp (abre em nova aba)</span>
    </a>
  );
}

function rowDetail(row: EvaluationRow): string {
  switch (row.state) {
    case "pending":
      return row.submittedAt
        ? `Check-in enviado em ${formatShortDate(row.submittedAt)} · ainda não aberto por você`
        : "Check-in enviado · ainda não aberto por você";
    case "in_progress":
      return row.reviewOpenedAt
        ? `Avaliação aberta em ${formatShortDate(row.reviewOpenedAt)} · orientação ainda não enviada`
        : "Avaliação aberta · orientação ainda não enviada";
    case "draft":
      return "Rascunho de orientação salvo · falta enviar ao aluno";
    case "awaiting_checkin":
      return row.late
        ? `Check-in atrasado · previsto até ${formatDateOnlyShort(row.periodEnd)}`
        : `Aguardando o aluno enviar · até ${formatDateOnlyShort(row.periodEnd)}`;
    case "done":
      return row.reviewedAt
        ? `Orientação enviada em ${formatShortDate(row.reviewedAt)}`
        : "Orientação enviada";
  }
}

/** Link da avaliação do aluno — a mesma rota serve os estados pendente/andamento/rascunho/concluído. */
export function evaluationHref(clientId: string): string {
  return `/coach/alunos/${clientId}/avaliacao`;
}

/** Uma linha por aluno: nome + status explícito + UM botão principal pra situação. */
export function EvaluationListItem({ row }: { row: EvaluationRow }) {
  const meta = STATE_META[row.state];
  return (
    <li className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            href={`/coach/alunos/${row.client.id}`}
            className="inline-flex min-h-11 max-w-full items-center font-medium text-ink hover:text-brand"
          >
            {row.client.name}
          </Link>
          <StateBadge state={row.state} />
        </div>
        <p className={`text-xs ${row.late ? "text-late-text" : "text-ink-muted"}`}>
          Semana {row.weekNumber} · {rowDetail(row)}
        </p>
      </div>

      <div className="sm:shrink-0">
        {row.state === "awaiting_checkin" ? (
          <ChargeCheckinButton client={row.client} weekNumber={row.weekNumber} late={row.late} />
        ) : (
          <Link
            href={evaluationHref(row.client.id)}
            className={row.state === "done" ? BUTTON_GHOST : BUTTON_PRIMARY}
          >
            {meta.action}
            <span className="sr-only"> — {row.client.name}</span>
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * "Merece atenção" — só situações que o ciclo já sabe derivar (nada de regra nova nem query
 * extra), no vocabulário do ciclo de avaliação (nunca status financeiro):
 *  - `late`: check-in atrasado (a instância foi marcada `late`, ver `EvaluationRow.late`);
 *  - `draft`: rascunho de orientação parado — o rascunho ficou pra trás e a semana dele já
 *    acabou (`periodEnd` < hoje) sem a orientação ser enviada;
 *  - `previous_week`: avaliação de uma semana anterior (check-in enviado, semana já encerrada)
 *    ainda sem orientação enviada.
 * Uma linha por aluno, na mesma ordem da fila (o que espera há mais tempo primeiro).
 */
export type AttentionKind = "late" | "draft" | "previous_week";
export type AttentionItem = { row: EvaluationRow; kind: AttentionKind; reason: string };

/** `todayStr` = `AAAA-MM-DD` em São Paulo (`todayDateSP`) — o mesmo referencial de `computeWeekInfo` / da fila. */
export function getAttentionItems(rows: EvaluationRow[], todayStr: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const row of rows) {
    const week = row.weekNumber;
    if (row.state === "awaiting_checkin" && row.late) {
      items.push({
        row,
        kind: "late",
        reason: `Check-in da semana ${week} atrasado — previsto até ${formatDateOnlyShort(row.periodEnd)} e o aluno ainda não enviou.`,
      });
    } else if (row.state === "draft" && row.periodEnd < todayStr) {
      items.push({
        row,
        kind: "draft",
        reason: `Rascunho da orientação da semana ${week} parado — a semana já acabou e a orientação não foi enviada ao aluno.`,
      });
    } else if ((row.state === "pending" || row.state === "in_progress") && row.periodEnd < todayStr) {
      items.push({
        row,
        kind: "previous_week",
        reason: `Avaliação da semana ${week} (semana anterior) sem orientação enviada${
          row.submittedAt ? ` — check-in enviado em ${formatShortDate(row.submittedAt)}` : ""
        }.`,
      });
    }
  }
  return items;
}

/** Bloco compacto: nome + motivo explícito + UM botão de ação por linha (mesmo padrão de `RowsList`). */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-warn/40 bg-surface shadow-[var(--surface-raised-shadow)]">
      {items.map(({ row, kind, reason }) => (
        <li
          key={row.client.id}
          className="flex flex-col gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={`/coach/alunos/${row.client.id}`}
              className="inline-flex min-h-11 max-w-full items-center font-medium text-ink hover:text-brand"
            >
              {row.client.name}
            </Link>
            <p className={`text-xs ${kind === "late" ? "text-late-text" : "text-ink-muted"}`}>{reason}</p>
          </div>
          <div className="sm:shrink-0">
            {kind === "late" ? (
              <ChargeCheckinButton client={row.client} weekNumber={row.weekNumber} late />
            ) : (
              <Link href={evaluationHref(row.client.id)} className={BUTTON_PRIMARY}>
                {STATE_META[row.state].action}
                <span className="sr-only"> — {row.client.name}</span>
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Contêiner de lista de linhas (borda + fundo de superfície), com um título de grupo opcional. */
export function EvaluationGroup({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count: number;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-baseline gap-2 text-lg font-medium text-ink">
          {title}
          <span className="font-mono text-sm text-ink-faint">{count}</span>
        </h2>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function RowsList({ rows }: { rows: EvaluationRow[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--surface-raised-shadow)]">
      {rows.map((row) => (
        <EvaluationListItem key={row.client.id} row={row} />
      ))}
    </ul>
  );
}

/** Estado vazio de um grupo — explica o que fazer, nunca só "nada aqui". */
export function GroupEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-line px-5 py-6 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mx-auto max-w-md text-sm text-ink-muted">{text}</p>
    </div>
  );
}

/** Contador do resumo — número grande + rótulo + uma linha de contexto opcional. */
export function Counter({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "brand" | "late";
}) {
  const valueColor = tone === "brand" && value > 0 ? "text-brand" : tone === "late" && value > 0 ? "text-late" : "text-ink";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3 shadow-[var(--surface-raised-shadow)] sm:p-4">
      <span className="font-mono text-label uppercase leading-tight tracking-wide text-ink-faint">
        {label}
      </span>
      <span className={`font-display text-counter leading-none ${valueColor}`}>{value}</span>
      {hint && <span className="text-xs leading-snug text-ink-muted">{hint}</span>}
    </div>
  );
}
