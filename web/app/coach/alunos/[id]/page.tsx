import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getLastSentOrientation, isActionable } from "@/lib/evaluations";
import { getWeightProgress } from "@/lib/repository";
import { requireCoach } from "../../require-coach";
import { evaluationHref, formatDateOnlyShort, formatDateTime } from "../../avaliacoes/evaluation-ui";
import { TrackingIcon, WalletIcon } from "../icons";
import { PaymentStatusBadge, TrackingStatusBadge } from "../status-badges";
import MetricSettingsPanel from "./metric-settings-panel";
import ObservedPatterns from "./observed-patterns";
import { getStudentContext } from "./student-context";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** `start_date` é coluna `date` (sem hora/fuso) — formata em UTC pra não deslocar um dia. */
function formatDateOnly(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatKg(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

/** "Último peso registrado" + de onde começou (só com 2+ registros). `latest`/`first` já vêm de `metrics`. */
function describeWeightHistory(p: { first: number; latest: number; weeks: number }): string {
  if (p.weeks < 2) return "Último peso registrado · primeiro registro";
  const diff = p.latest - p.first;
  const change = diff === 0 ? "sem variação" : `${diff > 0 ? "+" : "−"}${formatKg(Math.abs(diff))}`;
  return `Último peso registrado · começou em ${formatKg(p.first)} (${change} em ${p.weeks} registros)`;
}

const PANEL = "flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4";
const PANEL_TITLE =
  "flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-ink-faint";
const FIELD_LABEL = "font-mono text-label uppercase tracking-wide text-ink-faint";

/**
 * Resumo do aluno (`/coach/alunos/[id]`) — primeira aba do contexto do aluno. Só dado que já
 * existe de verdade: situação do acompanhamento e do financeiro (a MESMA fonte e os MESMOS
 * rótulos da lista de Alunos — `getStudentContext`), semana atual, último peso registrado,
 * última orientação enviada e cadastro. Identidade, situação resumida e ação principal ficam na
 * faixa de contexto do layout; aqui entram os detalhes. Evolução e histórico completos entram
 * como abas quando essas fatias existirem.
 */
export default async function StudentSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCoach();

  const ctx = await getStudentContext(id);
  if (!ctx) {
    // RLS: aluno inexistente e aluno de outra conta são indistinguíveis — 404 nos dois casos.
    notFound();
  }
  const { client, entry, evaluation } = ctx;
  const { tracking, payment } = entry;

  const [weightProgress, lastOrientation] = await Promise.all([
    getWeightProgress(id),
    getLastSentOrientation(id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Situação" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-ink">Situação</h2>
        {/* Acompanhamento e financeiro em áreas separadas — nunca misturados. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={PANEL}>
            <h3 className={PANEL_TITLE}>
              <TrackingIcon />
              Acompanhamento
            </h3>
            <div>
              <TrackingStatusBadge state={tracking.state} late={tracking.late} />
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              {evaluation && (
                <div className="flex flex-col">
                  {/* Com check-in enviado, a linha é a semana EM AVALIAÇÃO (pode ser anterior à corrente,
                      se uma avaliação atrasada ainda não foi enviada); sem check-in a avaliar é a corrente. */}
                  <dt className={FIELD_LABEL}>
                    {isActionable(evaluation.state) ? "Semana em avaliação" : "Semana atual"}
                  </dt>
                  <dd className="text-ink">
                    Semana {evaluation.weekNumber} · {formatDateOnlyShort(evaluation.periodStart)} a{" "}
                    {formatDateOnlyShort(evaluation.periodEnd)}
                    {evaluation.submittedAt && (
                      <span className="text-ink-muted">
                        {" "}
                        · check-in enviado em {formatDateTime(evaluation.submittedAt)}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              <div className="flex flex-col">
                <dt className={FIELD_LABEL}>Próxima ação</dt>
                <dd className={tracking.late ? "text-late-text" : "text-ink"}>{tracking.nextAction}</dd>
              </div>
              <div className="flex flex-col">
                <dt className={FIELD_LABEL}>Última atualização</dt>
                <dd className="text-ink-muted">
                  {entry.lastUpdate.relative} · {entry.lastUpdate.reason}
                </dd>
              </div>
            </dl>
          </div>

          <div className={PANEL}>
            <h3 className={PANEL_TITLE}>
              <WalletIcon />
              Financeiro
            </h3>
            <div>
              <PaymentStatusBadge status={payment.status} />
            </div>
            <p className={`text-sm ${payment.status === "atrasado" ? "text-late-text" : "text-ink-muted"}`}>
              {payment.detail}
            </p>
            <Link
              href={`/coach/alunos/${id}/pagamento`}
              className="mt-auto inline-flex min-h-11 w-fit items-center text-sm text-brand hover:underline"
            >
              Ver pagamentos
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Últimos registros" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-ink">Últimos registros</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={PANEL}>
            <h3 className={PANEL_TITLE}>Peso</h3>
            {weightProgress ? (
              <>
                <span className="font-display text-counter leading-none text-ink">
                  {formatKg(weightProgress.latest)}
                </span>
                <span className="text-sm text-ink-muted">{describeWeightHistory(weightProgress)}</span>
              </>
            ) : (
              <EmptyText>
                Ainda sem peso registrado. Ele aparece aqui depois do primeiro check-in com peso.
              </EmptyText>
            )}
          </div>

          <div className={PANEL}>
            <h3 className={PANEL_TITLE}>Última orientação enviada</h3>
            {lastOrientation ? (
              <>
                <span className="text-sm text-ink-muted">
                  Semana {lastOrientation.weekNumber} · enviada em {formatDateTime(lastOrientation.sentAt)}
                </span>
                <p className="line-clamp-5 whitespace-pre-wrap break-words text-sm text-ink">
                  {lastOrientation.text}
                </p>
                <Link
                  href={evaluationHref(id)}
                  className="mt-auto inline-flex min-h-11 w-fit items-center text-sm text-brand hover:underline"
                >
                  Ver na avaliação
                </Link>
              </>
            ) : (
              <EmptyText>
                Nenhuma orientação enviada ainda. Ela aparece aqui depois que você concluir a primeira
                avaliação semanal.
              </EmptyText>
            )}
          </div>
        </div>
      </section>

      <ObservedPatterns clientId={id} startDate={client.start_date} />

      <MetricSettingsPanel clientId={id} />

      <section aria-label="Cadastro" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-ink">Cadastro</h2>
        <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          <Field label="E-mail" value={client.email || "sem e-mail"} />
          <Field label="Telefone" value={client.phone || "não informado"} />
          <Field label="Criado em" value={formatDate(client.created_at)} />
          <Field
            label="Início do acompanhamento"
            value={client.start_date ? formatDateOnly(client.start_date) : "ainda não iniciou"}
          />
        </dl>
      </section>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-4 py-3">
      <dt className={FIELD_LABEL}>{label}</dt>
      <dd className="break-all text-sm text-ink">{value}</dd>
    </div>
  );
}
