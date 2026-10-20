import Link from "next/link";
import { Segmented } from "@/components/ui";
import { KpiRow, MeterBar, StatCard, StatusDonut, UpdatedAtStrip } from "@/components/viz";
import { requireAdmin } from "@/lib/admin/auth";
import { getBusinessOverview, getRecentActivity, type ActivityItem } from "@/lib/admin/overview";
import { billingEventLabel, parsePeriodKey, resolvePeriod, type BusinessOverview, type AdminPeriod } from "./_lib/logic";
import { formatCents, formatCount, formatDateOnly, formatDateTime, plural } from "./_lib/format";
import { AreaHeader, PageHeader, Unavailable } from "./_components/parts";

/**
 * Visão geral do negócio (item 22). Só números que o banco sustenta (RPC `admin_business_overview`,
 * contas demo excluídas). Duas áreas visualmente separadas (item 24):
 *  - Receita do Trackly: mensalidade que os coaches pagam ao Trackly (SyncPay).
 *  - Pacotes dos alunos: serviço que o coach vende ao aluno — NÃO é receita do Trackly e nenhum
 *    valor de contrato de aluno entra aqui.
 */
export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const params = await searchParams;
  const period = resolvePeriod(parsePeriodKey(params.periodo));

  const [overview, activity] = await Promise.all([getBusinessOverview(period), getRecentActivity(12)]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Visão geral">
        <Segmented
          label="Período"
          value={period.key}
          items={[
            { id: "mes", label: "Este mês", href: "/admin" },
            { id: "anterior", label: "Mês anterior", href: "/admin?periodo=anterior" },
          ]}
        />
      </PageHeader>

      {overview.ok ? (
        <Overview data={overview.data} readAt={overview.readAt} period={period} />
      ) : (
        <Unavailable what="Indicadores do negócio" />
      )}

      <section aria-labelledby="atividades" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="atividades" className="t-subtitle text-ink">
            Atividades recentes
          </h2>
          <Link href="/admin/assinaturas#eventos" className="text-sm font-semibold text-brand hover:underline">
            Eventos de cobrança
          </Link>
        </div>
        {activity.ok ? <ActivityList items={activity.data} /> : <Unavailable what="Atividades recentes" />}
      </section>
    </div>
  );
}

function Overview({ data, readAt, period }: { data: BusinessOverview; readAt: string; period: AdminPeriod }) {
  const s = data.billingByStatus;
  const subscribed = s.pending_first_payment + s.active + s.overdue + s.suspended + s.cancelled;
  const price = data.platformPriceCents;
  const pkg = data.studentsByPackage;
  const pkgTotal = pkg.training + pkg.nutrition + pkg.hybrid + pkg.legacy;

  return (
    <>
      <KpiRow>
        <StatCard
          icon="user"
          label="Coaches"
          value={formatCount(data.coachesTotal)}
          hint={`+${formatCount(data.newCoaches)} em ${period.label}`}
          href="/admin/coaches"
        />
        <StatCard
          icon="users"
          label="Alunos registrados"
          value={formatCount(data.studentsTotal)}
          hint={`${formatCount(data.studentsWithAccount)} com login · +${formatCount(data.newStudents)} em ${period.label}`}
          href="/admin/alunos"
        />
        <StatCard
          icon="check"
          label="Assinaturas ativas"
          value={formatCount(s.active)}
          hint={`de ${plural(data.coachesTotal, "coach", "coaches")}`}
          tone={s.active > 0 ? "success" : undefined}
          href="/admin/assinaturas?status=active"
        />
        <StatCard
          icon="alert"
          label="Em atraso"
          value={formatCount(s.overdue)}
          hint={s.overdue > 0 ? "Pagamento falhou; ainda na carência" : "Nenhuma assinatura em atraso"}
          tone={s.overdue > 0 ? "warning" : undefined}
          href="/admin/assinaturas?status=overdue"
        />
      </KpiRow>

      <UpdatedAtStrip at={readAt} title="Detalhes">
        <span className="text-xs text-ink-faint">
          assinaturas atualizadas em {data.billingLastUpdate ? formatDateTime(data.billingLastUpdate) : "— (nenhum registro)"}
        </span>
      </UpdatedAtStrip>

      {/* ------------------------------------------------------------------ Receita do Trackly */}
      <section aria-labelledby="receita-trackly" className="flex flex-col gap-4">
        <AreaHeader
          id="receita-trackly"
          icon="wallet"
          title="Receita do Trackly"
          tag="Mensalidades dos coaches"
          tagTone="accent"
        >
          O que os coaches pagam ao Trackly pela assinatura (SyncPay). Suspensas e canceladas nunca contam
          como pagas nem entram no previsto.
        </AreaHeader>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section aria-labelledby="donut-assinaturas" className="card tk-enter min-w-0 p-4 md:p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 id="donut-assinaturas" className="text-sm font-semibold text-ink">
                Assinaturas por estado
              </h3>
              <Link href="/admin/assinaturas" className="text-xs font-semibold text-brand hover:underline">
                Ver lista
              </Link>
            </div>
            <StatusDonut
              className="mt-4"
              label="Assinaturas por estado"
              emptyLabel="Nenhuma assinatura registrada"
              segments={[
                { label: "Ativa", value: s.active, tone: "success" },
                { label: "Aguardando 1º pagamento", value: s.pending_first_payment, tone: "info" },
                { label: "Em atraso", value: s.overdue, tone: "warning" },
                { label: "Suspensa", value: s.suspended, tone: "danger" },
                { label: "Cancelada", value: s.cancelled, tone: "neutral" },
              ]}
            />
            <p className="mt-4 text-xs text-ink-faint">
              {plural(data.coachesTotal - subscribed, "coach sem assinatura registrada", "coaches sem assinatura registrada")}
              {" "}(acesso liberado, como hoje).
            </p>
          </section>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <StatCard
              icon="chart"
              label="MRR previsto"
              value={data.mrrExpectedCents === null ? null : formatCents(data.mrrExpectedCents)}
              emptyHint={
                <span>
                  Preço da mensalidade não configurado.{" "}
                  <Link href="/admin/preco" className="font-semibold text-brand hover:underline">
                    Configure o preço
                  </Link>
                </span>
              }
              hint={price !== null ? `${formatCents(price)} × ${plural(s.active, "assinatura ativa", "assinaturas ativas")}` : undefined}
              href={price === null ? undefined : "/admin/preco"}
            />
            <StatCard
              icon="calendar"
              label="Cobranças previstas"
              value={formatCount(data.nextChargesInPeriod)}
              hint={
                price !== null && data.nextChargesInPeriod > 0
                  ? `Próximas cobranças em ${period.label} · ≈ ${formatCents(price * data.nextChargesInPeriod)} pelo preço vigente`
                  : `Próximas cobranças (ativas ou em atraso) em ${period.label}`
              }
              href="/admin/assinaturas"
            />
            <section className="card @container min-w-0 p-4 sm:col-span-2 md:p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span aria-hidden className="size-2 rounded-full bg-success" />
                Pagamentos confirmados · {period.label}
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="t-stat text-[clamp(1.05rem,8cqi,2rem)] text-ink">{formatCount(data.paidEventsInPeriod)}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    pagamentos confirmados pela SyncPay e aplicados (cada pagamento conta uma vez, mesmo
                    quando vem junto com a ativação ou renovação da assinatura)
                  </p>
                </div>
                <div>
                  <p className="t-stat text-[clamp(1.05rem,8cqi,2rem)] text-ink-faint">—</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Valor recebido em R$: <span className="font-semibold text-ink">não disponível</span>. Os
                    registros da SyncPay ainda não guardam o valor pago; o previsto acima não é recebido.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ Pacotes dos alunos */}
      <section
        aria-labelledby="pacotes-alunos"
        className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-dashed border-line-strong p-4 md:p-5"
      >
        <AreaHeader
          id="pacotes-alunos"
          icon="users"
          title="Pacotes dos alunos"
          tag="Serviço do coach · não é receita do Trackly"
          tagTone="info"
        >
          Treino, Nutrição e Híbrido são serviços que cada coach vende aos próprios alunos. O Trackly não
          recebe pagamentos de alunos, e os valores contratados não entram em nenhum indicador de receita.
        </AreaHeader>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="dist-pacotes" className="card tk-enter min-w-0 p-4 md:p-5">
            <h3 id="dist-pacotes" className="text-sm font-semibold text-ink">
              Alunos por pacote
            </h3>
            <p className="mt-1 text-xs text-ink-faint">Situação de hoje · {plural(pkgTotal, "aluno", "alunos")}</p>
            {pkgTotal === 0 ? (
              <p className="mt-4 text-sm text-ink-faint">Nenhum aluno registrado ainda.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3.5">
                {(
                  [
                    ["Treino", pkg.training, "var(--c4)"],
                    ["Nutrição", pkg.nutrition, "var(--c2)"],
                    ["Híbrido", pkg.hybrid, "var(--c3)"],
                    ["Sem pacote (alunos anteriores ao V5)", pkg.legacy, "var(--ink-faint)"],
                  ] as const
                ).map(([label, value, color]) => (
                  <li key={label} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-semibold text-ink">{label}</span>
                      <span className="shrink-0 tabular-nums text-ink-muted">
                        <span className="font-semibold text-ink">{formatCount(value)}</span>
                        {" · "}
                        {Math.round((value / pkgTotal) * 100)}%
                      </span>
                    </div>
                    <MeterBar value={value} max={pkgTotal} label={`${label}: ${value} de ${pkgTotal}`} color={color} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard
              icon="checkin"
              label="Aguardando questionário"
              value={formatCount(data.studentsAwaitingQuestionnaire)}
              hint="Novos alunos com login que ainda não enviaram"
              href="/admin/alunos"
            />
            <StatCard
              icon="clock"
              label="Protocolos em preparação"
              value={formatCount(data.protocolsInPreparation)}
              hint="Questionário enviado, protocolo não publicado"
              href="/admin/alunos"
            />
            <StatCard
              icon="plus"
              label="Novos alunos"
              value={formatCount(data.newStudents)}
              hint={`Cadastrados em ${period.label}`}
              className="sm:col-span-2 lg:col-span-1"
              href="/admin/coaches"
            />
          </div>
        </div>
      </section>
    </>
  );
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="card p-5 text-sm text-ink-faint">Nenhuma atividade registrada ainda.</p>;
  }
  return (
    <ul className="card flex flex-col divide-y divide-line px-4 md:px-5">
      {items.map((it) => {
        const { title, sub, dot } = describe(it);
        return (
          <li key={it.id} className="flex items-start gap-3 py-3">
            <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{title}</span>
              <span className="block truncate text-xs text-ink-faint">{sub}</span>
            </span>
            <time dateTime={it.at} className="shrink-0 text-xs tabular-nums text-ink-muted">
              {formatDateTime(it.at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

function describe(it: ActivityItem): { title: string; sub: string; dot: string } {
  switch (it.kind) {
    case "billing_event":
      return {
        title: billingEventLabel(it.event),
        sub: `${it.accountName ?? "Conta não identificada"} · ${it.applied ? "aplicado" : "só registrado"}`,
        dot: "bg-brand",
      };
    case "new_coach":
      return { title: "Novo coach", sub: it.accountName, dot: "bg-success" };
    case "new_student":
      return { title: "Novo aluno cadastrado", sub: `Conta ${it.accountName}`, dot: "bg-info" };
    case "price_set":
      return {
        title: "Preço da mensalidade definido",
        sub:
          it.amountCents !== null
            ? `${formatCents(it.amountCents)} a partir de ${formatDateOnly(it.effectiveFrom)}`
            : "Detalhe não registrado",
        dot: "bg-warning",
      };
  }
}
