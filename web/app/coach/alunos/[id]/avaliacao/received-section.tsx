import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { EvaluationGoal } from "@/lib/evaluations";
import type { WeekRecord } from "@/lib/evaluation-week";
import { formatAnswerForCoach, splitAnswers, type CoachAnswer } from "@/lib/evaluation-answers";
import { isStoredLateOverdue } from "@/lib/evaluation-late";
import { formatMetricValue, formatNumber, metricDefs, type ComparisonWeek, type MetricKey } from "@/lib/week-comparison-format";
import { formatDateOnlyShort, formatDateTime } from "../../../avaliacoes/evaluation-ui";
import { ProgressRing } from "@/components/viz";
import PhotoTriptych from "../photo-triptych";
import type { WeekPhotosState } from "./week-comparison";

/** Chave da métrica -> chave da resposta do check-in que a originou. */
const ANSWER_KEY: Partial<Record<MetricKey, string>> = { adherence: "adherence_pct" };

/** Respostas curtas em grade; as longas (texto livre) viram itens expansíveis — nada se perde. */
const SHORT_ANSWER_MAX = 70;

/**
 * Área "Recebido nesta semana" (V3, tarefa 16-A): TUDO o que o aluno mandou no check-in de UMA
 * semana — data/hora do envio, peso e demais métricas (uma vez só, sem variação: variação é da área
 * de comparação), fotos da semana, todas as respostas e, à parte, as informações sensíveis.
 *
 * `variant="current"`: destacada como a semana em avaliação. `variant="past"`: a mesma área na
 * visão somente leitura de uma semana passada (`?semana=N`) — o dado é SEMPRE o daquela semana
 * (`getWeekRecord` + `getWeekComparisonData` + fotos daquela semana), nunca o da semana atual.
 * O que não foi registrado aparece como "não informado" — nada é estimado.
 */
export default function ReceivedSection({
  id,
  variant,
  clientId,
  weekNumber,
  periodStart,
  periodEnd,
  record,
  metrics,
  photos,
  adherenceIsScale,
  goals,
}: {
  id: string;
  variant: "current" | "past";
  clientId: string;
  weekNumber: number;
  periodStart: string;
  periodEnd: string;
  /** `null` = a leitura do registro falhou. */
  record: WeekRecord | null;
  /** Métricas/posições de foto da semana (comparação); `null` se a leitura falhou. */
  metrics: ComparisonWeek | null;
  photos: WeekPhotosState | undefined;
  adherenceIsScale: boolean;
  goals: EvaluationGoal[];
}) {
  const current = variant === "current";
  const checkin = record?.checkin ?? null;
  const sent = checkin && (checkin.status === "submitted" || checkin.status === "reviewed");
  const title = current ? "Recebido nesta semana" : `Recebido na semana ${weekNumber}`;

  // Métricas exibidas como número (as 3 principais sempre — "não informado" quando faltam).
  const defs = metricDefs(adherenceIsScale);
  const coreDefs = defs.filter((d) => d.core);
  const extraDefs = metrics ? defs.filter((d) => !d.core && metrics.metrics[d.key] != null) : [];
  const shownAsMetric = metrics
    ? [...coreDefs.filter((d) => metrics.metrics[d.key] != null), ...extraDefs].map((d) => ANSWER_KEY[d.key] ?? d.key)
    : [];
  const { regular, sensitive } = splitAnswers(record?.answers ?? [], shownAsMetric);
  const sessionsDone = record?.sessionsDone ?? null;

  return (
    <section
      id={id}
      aria-label={title}
      className={`@container card tk-enter flex min-w-0 scroll-mt-4 flex-col gap-5 p-4 sm:p-5 ${
        current ? "border-brand/45 shadow-[inset_3px_0_0_var(--color-brand)]" : ""
      }`}
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="t-subtitle text-ink">{title}</h2>
          <Badge tone={current ? "accent" : "neutral"} dot={current}>
            {current ? "Check-in atual" : "Registro anterior"}
          </Badge>
        </div>
        <p className="text-sm text-ink-muted">
          {/* Semana atual: o período já está no cabeçalho da página — aqui só quando foi enviado. */}
          {!current && `Semana ${weekNumber} · ${formatDateOnlyShort(periodStart)} a ${formatDateOnlyShort(periodEnd)}`}
          {sent && checkin.submittedAt ? (
            <>
              {!current && " · "}
              <span className="text-ink">Enviado em {formatDateTime(checkin.submittedAt)}</span>
            </>
          ) : null}
        </p>
      </header>

      {record === null && (
        <Notice>Não foi possível carregar o check-in desta semana agora. Recarregue a página para tentar de novo.</Notice>
      )}
      {record !== null && !sent && (
        <Notice>
          {isStoredLateOverdue(checkin?.status, periodEnd)
            ? "O check-in desta semana ficou atrasado e não foi enviado."
            : "Nenhum check-in enviado nesta semana."}{" "}
          Não há respostas, fotos ou métricas do aluno para mostrar.
        </Notice>
      )}

      {/* Métricas: cada valor aparece UMA vez, sem variação (a variação fica na comparação). */}
      {(sent || (metrics && Object.keys(metrics.metrics).length > 0)) && (
        <Block title="Números da semana">
          {metrics ? (
            // Colunas pela largura do BLOCO (container query), não da tela: em 1024 px a coluna de
            // "Recebido" é estreita e a grade de 3 colunas cortava o peso e os rótulos dos anéis.
            <div className="@container">
            <div className="tk-stagger grid grid-cols-2 gap-2.5 @xl:grid-cols-[1.35fr_1fr_1fr]">
              {coreDefs.map((d) => {
                const value = metrics.metrics[d.key];
                const weight = d.key === "weight_kg";
                const ringMax = d.key === "adherence" && !adherenceIsScale ? 100 : 5;
                return (
                  <div
                    key={d.key}
                    data-metric={d.key}
                    className={`flex min-w-0 items-center gap-2.5 rounded-xl border p-3 @xl:gap-3 @xl:p-3.5 ${
                      weight
                        ? `col-span-2 flex-col items-start justify-between gap-1 @xl:col-span-1 ${
                            current ? "border-brand/45 bg-brand-tint" : "border-line bg-surface-sunken"
                          }`
                        : "border-line bg-surface-sunken"
                    }`}
                  >
                    {weight ? (
                      <>
                        <span className="text-xs font-semibold text-ink-muted">{d.label}</span>
                        {value != null ? (
                          <span
                            className={`whitespace-nowrap font-display leading-none tabular-nums text-4xl sm:text-[2.5rem] ${
                              current ? "text-brand" : "text-ink"
                            }`}
                          >
                            {formatNumber(value)}
                            {d.suffix && (
                              <>
                                {" "}
                                <span className="text-lg">{d.suffix}</span>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-sm text-ink-faint">Não informado</span>
                        )}
                      </>
                    ) : value != null ? (
                      <>
                        <ProgressRing
                          value={value}
                          max={ringMax}
                          label={d.label}
                          size={52}
                          thickness={6}
                          tone={d.key === "energy" ? "info" : "accent"}
                        >
                          <span className="text-sm">{formatNumber(value)}</span>
                        </ProgressRing>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs font-semibold text-ink-muted">{d.label}</span>
                          <span className="whitespace-nowrap text-xs text-ink-faint">
                            {d.suffix ? d.suffix : ringMax === 100 ? "%" : ""}
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-ink-muted">{d.label}</span>
                        <span className="text-sm text-ink-faint">Não informado</span>
                      </span>
                    )}
                  </div>
                );
              })}
              <GoalsTile goals={goals} />
            </div>
            </div>
          ) : (
            <Notice>Não foi possível carregar as métricas desta semana. As respostas abaixo trazem os valores informados.</Notice>
          )}
          {(extraDefs.length > 0 || (sessionsDone != null && sessionsDone > 0)) && metrics && (
            <dl className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-line px-3 py-2.5" aria-label="Outras métricas da semana">
              {extraDefs.map((d) => (
                <div key={d.key} className="flex items-baseline gap-2" data-metric={d.key}>
                  <dt className="text-xs text-ink-muted">
                    {d.key === "workouts_count" ? "Treinos informados no check-in" : d.label}
                  </dt>
                  <dd className="font-display text-base text-ink tabular-nums">
                    {formatMetricValue(d, metrics.metrics[d.key] as number)}
                  </dd>
                </div>
              ))}
              {sessionsDone != null && sessionsDone > 0 && (
                <div className="flex items-baseline gap-2">
                  <dt className="text-xs text-ink-muted">Treinos concluídos no app</dt>
                  <dd className="font-display text-base text-ink tabular-nums">{sessionsDone}</dd>
                </div>
              )}
            </dl>
          )}
        </Block>
      )}

      {/* Fotos da semana (posições conforme o que foi enviado — o legado aparece como lateral antiga). */}
      {(sent || (metrics && metrics.photoAngles.length > 0)) && (
        <Block
          title="Fotos da semana"
          aside={
            <Link href={`/coach/alunos/${clientId}/fotos`} className="text-sm font-semibold text-brand hover:underline">
              Todas as fotos
            </Link>
          }
        >
          <WeekPhotos weekNumber={weekNumber} metrics={metrics} photos={photos} />
        </Block>
      )}

      {sent && (
        <Block
          title="Respostas do check-in"
          aside={
            // Conta só as respostas mostradas neste bloco (as numéricas já aparecem em "Métricas").
            regular.length + sensitive.length > 0 ? (
              <span className="text-sm text-ink-muted">
                {regular.length + sensitive.length} {regular.length + sensitive.length === 1 ? "resposta" : "respostas"}
              </span>
            ) : null
          }
        >
          {regular.length === 0 && sensitive.length === 0 ? (
            <Notice>
              {record && record.answers.length > 0
                ? "As respostas deste check-in são as métricas mostradas acima."
                : "Nenhuma resposta registrada neste check-in."}
            </Notice>
          ) : (
            <AnswersList answers={regular} />
          )}
          {sensitive.length > 0 && <SensitiveAnswers answers={sensitive} />}
        </Block>
      )}
    </section>
  );
}

function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="t-label text-ink-faint">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">{children}</p>
  );
}

function GoalsTile({ goals }: { goals: EvaluationGoal[] }) {
  const met = goals.filter((g) => g.result_status === "success").length;
  const partial = goals.filter((g) => g.result_status === "partial").length;
  const failed = goals.filter((g) => g.result_status === "fail").length;
  const open = goals.filter((g) => g.result_status === "pending").length;
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface-sunken p-3.5 @xl:col-span-3" data-metric="goals">
      <span className="text-xs text-ink-muted">Metas da semana</span>
      {goals.length === 0 ? (
        <span className="text-sm text-ink-faint">Nenhuma meta definida</span>
      ) : (
        <>
          <span className="font-display text-xl leading-none text-ink tabular-nums">
            {met}
            <span className="text-sm text-ink-muted"> de {goals.length}</span>
          </span>
          <span className="text-xs leading-snug text-ink-muted">
            {met === 1 ? "atingida" : "atingidas"}
            {partial > 0 ? ` · ${partial} em parte` : ""}
            {failed > 0 ? ` · ${failed} não atingida${failed === 1 ? "" : "s"}` : ""}
            {open > 0 ? ` · ${open} em aberto` : ""}
          </span>
        </>
      )}
    </div>
  );
}

function WeekPhotos({
  weekNumber,
  metrics,
  photos,
}: {
  weekNumber: number;
  metrics: ComparisonWeek | null;
  photos: WeekPhotosState | undefined;
}) {
  if (metrics && metrics.photoAngles.length === 0) {
    return <Notice>Nenhuma foto enviada nesta semana.</Notice>;
  }
  if (!photos) {
    return <Notice>Não foi possível carregar as fotos desta semana agora.</Notice>;
  }
  if (photos.status === "error") {
    return (
      <Notice>
        {photos.forbidden
          ? "Você não tem acesso às fotos deste aluno."
          : "Não foi possível carregar as fotos desta semana agora. Recarregue a página para tentar de novo."}
      </Notice>
    );
  }
  // Só as fotos DESTA semana — nunca de outra.
  const own = photos.photos.filter((p) => p.week_number === weekNumber);
  if (own.length === 0) return <Notice>Nenhuma foto enviada nesta semana.</Notice>;
  return <PhotoTriptych weekNumber={weekNumber} photos={own} />;
}

function AnswersList({ answers }: { answers: CoachAnswer[] }) {
  if (answers.length === 0) return null;
  const formatted = answers.map((a) => ({ ...a, text: formatAnswerForCoach(a) }));
  const short = formatted.filter((a) => a.text.length <= SHORT_ANSWER_MAX && !a.text.includes("\n"));
  const long = formatted.filter((a) => !short.includes(a));
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {short.length > 0 && (
        <dl className="grid gap-px bg-line @lg:grid-cols-2">
          {short.map((a, i) => (
            <div
              key={a.key}
              // Quantidade ímpar: a última ocupa as 2 colunas (sem célula vazia ao lado).
              className={`flex flex-col gap-0.5 bg-surface px-4 py-3 ${
                short.length % 2 === 1 && i === short.length - 1 ? "sm:col-span-2" : ""
              }`}
              data-answer={a.key}
            >
              <dt className="text-xs text-ink-muted">{a.label}</dt>
              <dd className="break-words text-sm font-medium text-ink">{a.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {long.map((a) => (
        <details key={a.key} className="group border-t border-line first:border-t-0" data-answer={a.key}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-raised [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-xs text-ink-muted">{a.label}</span>
              <span className="block truncate text-sm text-ink">{a.text.replace(/\s+/g, " ")}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-brand group-open:hidden">Ler</span>
            <span className="hidden shrink-0 text-xs font-semibold text-brand group-open:inline">Fechar</span>
          </summary>
          <p className="whitespace-pre-wrap break-words border-t border-line bg-surface-sunken px-4 py-3 text-sm text-ink">
            {a.text}
          </p>
        </details>
      ))}
    </div>
  );
}

/**
 * Hormônios/estimulantes/peptídeos, dose, efeitos, exame de sangue, ciclo menstrual: dado de saúde
 * sensível. Bloco discreto, fechado por padrão; mostra o que o aluno informou, sem interpretação.
 */
function SensitiveAnswers({ answers }: { answers: CoachAnswer[] }) {
  return (
    <details className="group rounded-lg border border-dashed border-line-strong" data-sensitive-answers>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-ink">Informações sensíveis</span>
          <span className="text-xs text-ink-muted">
            {answers.length} {answers.length === 1 ? "resposta" : "respostas"} de saúde · visível só para você
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-brand group-open:hidden">Mostrar</span>
        <span className="hidden shrink-0 text-xs font-semibold text-brand group-open:inline">Ocultar</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
        <dl className="flex flex-col divide-y divide-line">
          {answers.map((a) => (
            <div key={a.key} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0" data-answer={a.key}>
              <dt className="text-xs text-ink-muted">{a.label}</dt>
              <dd className="whitespace-pre-wrap break-words text-sm text-ink">{formatAnswerForCoach(a)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-faint">
          Exatamente o que o aluno informou. O Trackly não tira conclusões médicas destes dados.
        </p>
      </div>
    </details>
  );
}
