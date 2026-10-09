import type { PlanChangeLog } from "@/lib/repository";
import { formatRelativeTime } from "@/lib/format-relative-time";

const ACTION_LABEL: Record<PlanChangeLog["action"], string> = {
  created: "Criou",
  updated: "Editou",
  deleted: "Removeu",
  published: "Publicou",
  unpublished: "Despublicou",
  template_applied: "Aplicou template",
};

/**
 * Histórico de alterações de um plano (`plan_change_logs`, itens 18/20 — treino e nutrição) —
 * quem fez o quê e quando, mais recente primeiro. Lista fechada some (nada aconteceu ainda,
 * nada a mostrar).
 *
 * Compartilhado entre `treino/` e `nutricao/`: era literalmente o mesmo componente duplicado
 * nas duas pastas (mesma assinatura `logs: PlanChangeLog[]`, mesma marcação, só o comentário
 * diferia) — unificado aqui na pasta pai, comum às duas, em vez de manter as duas cópias
 * idênticas em sincronia manualmente (auditoria item 33 do TODO).
 */
export default function PlanHistoryPanel({ logs }: { logs: PlanChangeLog[] }) {
  if (logs.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-ink">Histórico de alterações</h2>
      <ul className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-1">
        {logs.map((log) => (
          <li key={log.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
            <span className="text-ink">
              <span className="font-mono text-xs uppercase tracking-wide text-ink-faint">
                {ACTION_LABEL[log.action]}
              </span>{" "}
              {log.summary}
            </span>
            <span className="whitespace-nowrap text-xs text-ink-faint">
              {log.actor_name ?? "Coach"} · {formatRelativeTime(log.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
