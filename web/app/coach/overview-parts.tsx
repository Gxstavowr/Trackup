import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import Icon, { type IconName } from "@/components/ui/icon";
import type { ProtocolPendingStudent } from "./protocol-queue";

/** Uma pendência do painel: ícone + contagem + frase + quem + onde resolver. Só contagens e nomes. */
export type TaskEntry = {
  key: string;
  icon: IconName;
  tone: "accent" | "warning" | "danger" | "neutral";
  count: number;
  title: string;
  text: string;
  href: string;
  linkLabel: string;
  /** Só informa: aparece na lista, mas não entra no total de pendências. */
  info?: boolean;
};

const CHIP: Record<TaskEntry["tone"], string> = {
  accent: "bg-brand-tint text-brand",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger-text",
  neutral: "bg-surface-raised text-ink-muted",
};

/**
 * Coluna de pendências ("Com você" / "Com o aluno"): cabeçalho com dono da pendência e total,
 * linhas clicáveis (a linha inteira é o alvo de toque) e estado calmo quando não há nada.
 */
export function TaskColumn({
  title,
  subtitle,
  icon,
  entries,
  emptyText,
  accent = false,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  entries: TaskEntry[];
  emptyText: string;
  /** Destaca a coluna do coach (borda de acento quando há trabalho). */
  accent?: boolean;
}) {
  const total = entries.reduce((sum, e) => (e.info ? sum : sum + e.count), 0);
  return (
    <Card
      as="section"
      padding="none"
      className={`flex min-w-0 flex-col overflow-hidden ${accent && total > 0 ? "!border-brand/40" : ""}`}
      aria-label={title}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-4 md:px-5">
        <span
          aria-hidden
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${accent ? "bg-brand text-on-accent" : "bg-surface-raised text-ink-muted"}`}
        >
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="t-subtitle text-ink">{title}</h2>
          <p className="t-helper">{subtitle}</p>
        </div>
        <Badge tone={total > 0 ? (accent ? "accent" : "warning") : "success"}>
          {total > 0 ? `${total} ${total === 1 ? "pendência" : "pendências"}` : "Em dia"}
        </Badge>
      </header>

      {entries.length > 0 ? (
        <ul className="tk-stagger flex flex-col">
          {entries.map((e) => (
            <li key={e.key} className="border-b border-line last:border-b-0">
              <Link
                href={e.href}
                className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand md:px-5"
              >
                <span aria-hidden className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${CHIP[e.tone]}`}>
                  <Icon name={e.icon} size={18} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium text-ink">
                    <span className="tabular-nums">{e.count}</span> {e.title}
                  </span>
                  <span className="t-helper break-words">{e.text}</span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-ink-muted group-hover:text-brand sm:inline-flex">
                  {e.linkLabel}
                  <Icon name="arrow-right" size={16} />
                </span>
                <Icon name="chevron" size={16} className="shrink-0 text-ink-faint sm:hidden" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-1 items-center gap-3 px-4 py-6 md:px-5">
          <Icon name="check-circle" size={22} className="shrink-0 text-success" />
          <p className="text-sm text-ink-muted">{emptyText}</p>
        </div>
      )}
    </Card>
  );
}

/** Cabeçalho de seção leve (título + ação à direita). */
export function SectionHead({ title, id, action }: { title: string; id: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="t-subtitle text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}

/**
 * Novos alunos que responderam o questionário inicial e aguardam o protocolo (pendência do COACH).
 * Sempre visível: com a lista vazia mostra "Nenhum" — hoje é sempre vazia, porque o questionário
 * inicial ainda não existe no banco (ver `protocol-queue.ts`). Nada é inventado.
 */
export function ProtocolQueue({
  students,
  unavailable = false,
}: {
  students: ProtocolPendingStudent[];
  /** Falha ao ler a fila: mostra "não foi possível carregar" em vez de "Nenhum". */
  unavailable?: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return (
    <Card as="section" padding="none" aria-labelledby="protocol-title" className="overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3.5 md:px-5">
        <span
          aria-hidden
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${students.length > 0 ? "bg-brand-tint text-brand" : "bg-surface-raised text-ink-muted"}`}
        >
          <Icon name="user" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="protocol-title" className="font-medium text-ink">
            Protocolos para preparar
          </h2>
          <p className="t-helper">Novos alunos que já enviaram o questionário inicial</p>
        </div>
        <Badge tone={students.length > 0 ? "accent" : "neutral"}>
          {unavailable
            ? "Indisponível"
            : students.length > 0
              ? `${students.length} ${students.length === 1 ? "aluno" : "alunos"}`
              : "Nenhum"}
        </Badge>
      </header>
      {unavailable && (
        <p role="status" className="border-t border-line px-4 py-3 text-sm text-ink-muted md:px-5">
          Não foi possível carregar agora.
        </p>
      )}
      {students.length > 0 && (
        <ul className="border-t border-line">
          {students.map((s) => (
            <li key={s.clientId} className="border-b border-line last:border-b-0">
              <Link
                href={`/coach/alunos/${s.clientId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-raised md:px-5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{s.name}</span>
                  <span className="t-helper">
                    {s.packageLabel} · recebido em {dateFmt.format(new Date(s.receivedAt))}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-ink-muted">
                  até {dateFmt.format(new Date(s.dueAt))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
