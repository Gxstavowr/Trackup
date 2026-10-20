import { UpdatedAtStrip } from "@/components/viz";
import { requireAdmin } from "@/lib/admin/auth";
import { listOnboardingByCoach } from "@/lib/admin/overview";
import { formatCount } from "../_lib/format";
import { PageHeader, Unavailable } from "../_components/parts";

/**
 * Detalhe "Aguardando questionário" e "Protocolos em preparação" (item 22), por coach. Só
 * contagens: nome, respostas e dados de saúde dos alunos não saem da conta do coach.
 */
export default async function AdminOnboardingPage() {
  await requireAdmin();
  const result = await listOnboardingByCoach();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Onboarding dos alunos" />
      <p className="-mt-2 max-w-2xl text-sm text-ink-muted">
        Alunos que entraram pelo fluxo novo (convite com pacote e questionário), agrupados por coach. Por
        privacidade, o painel mostra apenas quantidades.
      </p>
      {!result.ok ? (
        <Unavailable what="Onboarding" />
      ) : result.data.rows.length === 0 ? (
        <p className="card p-5 text-sm text-ink-faint">Nenhum aluno no fluxo novo de onboarding ainda.</p>
      ) : (
        <>
          <UpdatedAtStrip at={result.readAt} title="Por coach" />
          {result.data.partial && (
            <p role="status" className="text-xs text-warning">
              Lista parcial: há mais registros do que o limite desta tela. Os totais da Visão geral continuam exatos.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {result.data.rows.map((r) => (
              <li key={r.accountId} className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center">
                <p className="truncate text-sm font-semibold text-ink">{r.accountName}</p>
                {(
                  [
                    ["No fluxo novo", r.newFlow, "text-ink"],
                    ["Aguardando questionário", r.awaitingQuestionnaire, r.awaitingQuestionnaire > 0 ? "text-warning" : "text-ink"],
                    ["Em preparação", r.inPreparation, "text-ink"],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label} className="text-xs">
                    <p className="text-ink-faint">{label}</p>
                    <p className={`font-display text-lg font-bold tabular-nums ${tone}`}>{formatCount(value)}</p>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
