import { UpdatedAtStrip } from "@/components/viz";
import { requireAdmin } from "@/lib/admin/auth";
import { listCoaches } from "@/lib/admin/overview";
import { resolvePeriod } from "../_lib/logic";
import { formatCount, formatDate } from "../_lib/format";
import { PageHeader, StatusBadge, Unavailable } from "../_components/parts";

/**
 * Detalhe "Coaches" e "Novos coaches" (item 22): contas reais (sem demo), dono da conta, alunos e
 * estado da assinatura do Trackly. Coaches criados no mês atual ficam marcados como novos.
 */
export default async function AdminCoachesPage() {
  await requireAdmin();
  const coaches = await listCoaches();
  const month = resolvePeriod("mes");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Coaches" />
      {!coaches.ok ? (
        <Unavailable what="Coaches" />
      ) : coaches.data.length === 0 ? (
        <p className="card p-5 text-sm text-ink-faint">Nenhum coach cadastrado ainda (contas de demonstração não aparecem aqui).</p>
      ) : (
        <>
          <UpdatedAtStrip at={coaches.readAt} title={`${formatCount(coaches.data.length)} coaches`} />
          <ul className="flex flex-col gap-2">
            {coaches.data.map((c) => {
              const created = Date.parse(c.createdAt);
              const isNew = created >= Date.parse(month.from) && created < Date.parse(month.to);
              return (
                <li
                  key={c.accountId}
                  className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                      <span className="truncate">{c.accountName}</span>
                      {isNew && <span className="tag-new shrink-0">Novo</span>}
                    </p>
                    <p className="truncate text-xs text-ink-faint">
                      {[c.coachName, c.coachEmail].filter(Boolean).join(" · ") || "Coach não identificado"}
                    </p>
                  </div>
                  <div className="text-xs">
                    <p className="text-ink-faint">Alunos</p>
                    <p className="font-semibold tabular-nums text-ink">{c.students === null ? "—" : formatCount(c.students)}</p>
                  </div>
                  <div className="text-xs">
                    <p className="text-ink-faint">Desde</p>
                    <p className="font-semibold tabular-nums text-ink">{formatDate(c.createdAt)}</p>
                  </div>
                  <StatusBadge status={c.billingStatus} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
