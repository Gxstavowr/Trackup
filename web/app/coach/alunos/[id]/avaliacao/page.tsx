import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getClient } from "@/lib/repository";
import { getEvaluationDetail, type EvaluationDetail } from "@/lib/evaluations";
import { deriveEvaluationSignals, hasPriorWeeks, previousValue } from "@/lib/evaluation-signals";
import { listClientPhotos, type CheckinPhoto } from "@/lib/storage/checkin-photos";
import { getWeekComparisonData } from "@/lib/week-comparison";
import { comparableWeeks } from "@/lib/week-comparison-format";
import { requireCoach } from "../../../require-coach";
import {
  BUTTON_OUTLINE,
  ChargeCheckinButton,
  StateBadge,
  formatDateOnlyShort,
  formatDateTime,
} from "../../../avaliacoes/evaluation-ui";
import PhotoTriptych from "../photo-triptych";
import CycleDoneBanner from "./cycle-done-banner";
import EvaluationForm from "./evaluation-form";
import MarkReviewOpened from "./mark-review-opened";
import WeekComparison, { type WeekPhotosState } from "./week-comparison";

function formatKg(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

function num(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Avaliação do aluno (`/coach/alunos/[id]/avaliacao`) — o centro do ciclo: o coach lê o
 * check-in da semana (sinais, métricas, fotos, respostas com os rótulos das perguntas, metas,
 * últimas semanas), escreve a nota privada e a orientação, salva rascunho ou conclui e envia.
 *
 * Logo depois do estado do ciclo vem a COMPARAÇÃO entre semanas (`WeekComparison`, item 14): a semana
 * em avaliação contra uma semana comparativa (padrão: a anterior com registro; `?comparar=N` abre
 * outra, validado aqui no servidor), com fotos (slider), ângulo e métricas juntos. Mais abaixo
 * seguem as fotos ATUAIS da semana (`PhotoTriptych`, reutilizável). "Sinais importantes" são
 * regras factuais sobre dado real (`lib/evaluation-signals.ts`) — nunca diagnóstico.
 * Isolamento: `getClient` + o RLS devolvem 404 pra aluno de outra conta (o layout já faz o mesmo;
 * esta página confere de novo — layouts não re-renderizam entre abas). `getEvaluationDetail` só
 * enxerga alunos da conta do coach.
 */
export default async function StudentEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { comparar } = await searchParams;
  await requireCoach();

  const client = await getClient(id);
  if (!client) notFound();

  const detail = await getEvaluationDetail(id);

  // Aluno fora da fila: convite ainda não aceito ou acompanhamento pausado.
  if (!detail) {
    return (
      <EmptyCard
        title={
          client.status === "paused" ? "Acompanhamento pausado" : "Este aluno ainda não iniciou o acompanhamento"
        }
        text={
          client.status === "paused"
            ? "Enquanto o acompanhamento estiver pausado, não há avaliação semanal para este aluno."
            : "A avaliação nasce do check-in semanal. Assim que o aluno aceitar o convite e enviar o primeiro check-in, ele aparece aqui."
        }
        action={
          <Link
            href={`/coach/alunos/${id}`}
            className="inline-flex min-h-11 items-center rounded-md border border-line px-5 py-2.5 text-sm font-medium text-ink hover:border-line-strong"
          >
            Ver resumo do aluno
          </Link>
        }
      />
    );
  }

  const { row } = detail;

  if (row.state === "awaiting_checkin") {
    return (
      <EmptyCard
        badge={<StateBadge state="awaiting_checkin" />}
        title={`Aguardando o check-in de ${client.name}`}
        text={`A avaliação da semana ${row.weekNumber} começa quando o aluno enviar o check-in (previsto até ${formatDateOnlyShort(row.periodEnd)}). Se quiser, lembre-o agora.`}
        action={<ChargeCheckinButton client={row.client} weekNumber={row.weekNumber} late={row.late} />}
      />
    );
  }

  const done = row.state === "done";
  const o = detail.orientation;
  const [photos, comparison] = await Promise.all([
    loadWeekPhotos(id, row.weekNumber),
    loadComparison(id, client.start_date, row.weekNumber, comparar),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* Sempre montado (ver o componente): só marca a semana com que a tela foi ABERTA. */}
      <MarkReviewOpened key={id} clientId={id} weekNumber={row.weekNumber} pending={row.state === "pending"} />

      {/* Estado da avaliação — sempre no topo, com linguagem de ciclo explícita. */}
      <section
        aria-label="Situação da avaliação"
        className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-[var(--surface-raised-shadow)]"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StateBadge state={row.state} />
          <span className="text-sm text-ink-muted">
            Semana {row.weekNumber} · {formatDateOnlyShort(row.periodStart)} a{" "}
            {formatDateOnlyShort(row.periodEnd)}
          </span>
        </div>
        <p className="text-sm text-ink-muted">
          {row.submittedAt ? `Check-in enviado em ${formatDateTime(row.submittedAt)}. ` : ""}
          {row.state === "pending" &&
            "Check-in aguardando a sua avaliação. Ela passa a constar como em andamento assim que você abrir esta tela."}
          {row.state === "in_progress" && "Você já abriu esta avaliação. A orientação ainda não foi enviada."}
          {row.state === "draft" && "Há um rascunho de orientação salvo. Falta finalizar e enviar ao aluno."}
          {done && row.reviewedAt && `Orientação enviada em ${formatDateTime(row.reviewedAt)}.`}
        </p>
        {done && (
          <CycleDoneBanner>
            Ciclo da semana {row.weekNumber} concluído: a orientação foi enviada e {client.name} já
            recebeu a notificação.
          </CycleDoneBanner>
        )}
        {/* No celular o formulário fica abaixo de toda a leitura: atalho direto pra ele. */}
        {!done && (
          <a href="#orientacao" className={`${BUTTON_OUTLINE} mt-1 lg:hidden`}>
            Ir para a nota e a orientação
          </a>
        )}
      </section>

      {/* Comparação entre semanas: o centro da leitura, antes das respostas e da nota. */}
      {comparison ? (
        <WeekComparison
          key={`${id}:${row.weekNumber}`}
          clientId={id}
          currentWeek={row.weekNumber}
          weeks={comparison.weeks}
          adherenceIsScale={detail.adherenceIsScale}
          initialCompareWeek={comparison.compareWeek}
          initialPhotos={comparison.initialPhotos}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          Não foi possível carregar a comparação entre semanas agora. Recarregue a página para tentar de novo.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        {/* Coluna de leitura: o que o aluno mandou + contexto. */}
        <div className="flex min-w-0 flex-col gap-6">
          <SignalsSection detail={detail} />
          <MetricsSection detail={detail} />
          <PhotosSection clientId={id} weekNumber={row.weekNumber} photos={photos} />
          <AnswersSection detail={detail} />
          <GoalsSection detail={detail} />
          <ContextSection detail={detail} />
        </div>

        {/* Coluna de decisão: nota + orientação. Fixa ao rolar no desktop. */}
        <section
          id="orientacao"
          aria-label="Orientação"
          className="flex min-w-0 scroll-mt-4 flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-[var(--surface-raised-shadow)] lg:sticky lg:top-6"
        >
          <h2 className="text-lg font-medium text-ink">
            {done ? "Orientação enviada" : "Sua avaliação"}
          </h2>

          {done ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-label uppercase tracking-wide text-ink-faint">
                  Orientação para {client.name}
                  {o?.sent_at ? ` · ${formatDateTime(o.sent_at)}` : ""}
                </span>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">{o?.text}</p>
              </div>
              {o?.coach_note && (
                <div className="flex flex-col gap-1.5 border-t border-line pt-4">
                  <span className="font-mono text-label uppercase tracking-wide text-ink-faint">
                    Nota do coach (privada)
                  </span>
                  <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{o.coach_note}</p>
                </div>
              )}
            </div>
          ) : (
            <EvaluationForm
              key={id}
              clientId={id}
              clientName={client.name}
              weekNumber={row.weekNumber}
              initialText={o?.text ?? ""}
              initialNote={o?.coach_note ?? ""}
              hasDraft={Boolean(o)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyCard({
  badge,
  title,
  text,
  action,
}: {
  badge?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
      {badge}
      <p className="font-display text-hero text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-muted">{text}</p>
      {action && <div className="mt-2 w-full max-w-xs sm:w-auto">{action}</div>}
    </div>
  );
}

/**
 * Sinais importantes: só fatos derivados dos registros (ver `lib/evaluation-signals.ts` pras
 * regras e limiares). Descrevem o que mudou, com os números — não explicam a causa.
 */
function SignalsSection({ detail }: { detail: EvaluationDetail }) {
  const signals = deriveEvaluationSignals(detail);
  return (
    <section aria-label="Sinais importantes" className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink">Sinais importantes</h2>
      {signals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          {hasPriorWeeks(detail)
            ? "Nenhum sinal nas regras automáticas: sem variação relevante de peso, aderência ou energia, sem check-ins faltando e sem metas não atingidas."
            : "Este é o primeiro registro do aluno — ainda não há semanas anteriores para comparar."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {signals.map((signal) => (
            <li
              key={signal.id}
              className="flex items-start gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0"
            >
              <span
                aria-hidden
                className={`mt-1.5 size-2 shrink-0 rounded-full ${signal.tone === "attention" ? "bg-warn" : "bg-brand"}`}
              />
              <span className="min-w-0 break-words text-ink">
                <span className="sr-only">{signal.tone === "attention" ? "Atenção: " : "Informação: "}</span>
                {signal.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-faint">
        Calculados a partir dos registros do aluno: são pontos para você observar, não um diagnóstico.
      </p>
    </section>
  );
}

/** Métricas da semana: peso (com variação) + aderência e energia contra a semana anterior com registro. */
function MetricsSection({ detail }: { detail: EvaluationDetail }) {
  const currentWeek = detail.context.find((w) => w.weekNumber === detail.row.weekNumber);
  return (
    <section aria-label="Métricas da semana" className="flex flex-col gap-3">
      <WeightCard detail={detail} />
      <div className="grid grid-cols-2 gap-3">
        <ScaleMetricCard
          label="Aderência"
          current={currentWeek?.adherence ?? null}
          previous={previousValue(detail, (w) => w.adherence)}
          suffix={detail.adherenceIsScale ? " de 5" : ""}
        />
        <ScaleMetricCard
          label="Energia"
          current={currentWeek?.energy ?? null}
          previous={previousValue(detail, (w) => w.energy)}
          suffix=" de 5"
        />
      </div>
    </section>
  );
}

function ScaleMetricCard({
  label,
  current,
  previous,
  suffix,
}: {
  label: string;
  current: number | null;
  previous: { weekNumber: number; value: number } | null;
  suffix: string;
}) {
  const diff = current != null && previous ? current - previous.value : null;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-[var(--surface-raised-shadow)]">
      <span className="font-mono text-label uppercase tracking-wide text-ink-faint">{label}</span>
      {current == null ? (
        <p className="text-sm text-ink-muted">Não informada neste check-in.</p>
      ) : (
        <>
          <span className="font-display text-2xl leading-none text-ink">
            {num(current)}
            {suffix}
          </span>
          {diff != null && previous ? (
            <span className="text-sm text-ink-muted">
              {diff === 0 ? "Igual" : `${diff > 0 ? "▲ +" : "▼ −"}${num(Math.abs(diff))}`} em relação à semana{" "}
              {previous.weekNumber} ({num(previous.value)}
              {suffix})
            </span>
          ) : (
            <span className="text-sm text-ink-muted">Sem semana anterior para comparar.</span>
          )}
        </>
      )}
    </div>
  );
}

/** Peso atual + variação contra a semana anterior com registro (neutro: subir/descer depende do objetivo). */
function WeightCard({ detail }: { detail: EvaluationDetail }) {
  const { current, previous, delta } = detail.weight;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-[var(--surface-raised-shadow)]">
      <span className="font-mono text-label uppercase tracking-wide text-ink-faint">
        Peso da semana {detail.row.weekNumber}
      </span>
      {current == null ? (
        <p className="text-sm text-ink-muted">O aluno não informou o peso neste check-in.</p>
      ) : (
        <>
          <span className="font-display text-counter leading-none text-ink">{formatKg(current)}</span>
          {delta != null && previous ? (
            <span className="text-sm text-ink-muted">
              {delta === 0 ? "Igual" : `${delta > 0 ? "▲ +" : "▼ −"}${formatKg(Math.abs(delta))}`} em relação à
              semana {previous.weekNumber} ({formatKg(previous.value)})
            </span>
          ) : (
            <span className="text-sm text-ink-muted">
              Primeiro registro de peso — ainda não há semana anterior para comparar.
            </span>
          )}
        </>
      )}
    </div>
  );
}

type WeekPhotos =
  | { status: "ok"; photos: CheckinPhoto[] }
  | { status: "forbidden" }
  | { status: "error" };

/**
 * Fotos da semana avaliada, com URLs assinadas de curta duração (mesma lógica da aba Fotos:
 * `listClientPhotos` só devolve algo pro coach dono do aluno ou admin da conta). Uma falha de
 * Storage não derruba a avaliação inteira — a seção mostra o aviso e o resto da tela segue.
 */
async function loadWeekPhotos(clientId: string, weekNumber: number): Promise<WeekPhotos> {
  try {
    const photos = await listClientPhotos(clientId, { weekNumber });
    return photos === null ? { status: "forbidden" } : { status: "ok", photos };
  } catch (err) {
    console.error("Não foi possível carregar as fotos da avaliação:", err);
    return { status: "error" };
  }
}

/**
 * Dados da comparação: semanas do aluno + semana comparativa inicial + fotos (assinadas) da semana
 * atual e da comparativa. O parâmetro `?comparar=N` só vale se N for uma semana anterior que
 * existe; qualquer outro valor (lixo, semana futura, a própria atual) é ignorado e cai no padrão
 * (semana anterior com registro). Falha aqui não derruba a avaliação: devolve `null`.
 */
async function loadComparison(
  clientId: string,
  startDate: string | null,
  weekNumber: number,
  param: string | string[] | undefined
): Promise<{
  weeks: Awaited<ReturnType<typeof getWeekComparisonData>>;
  compareWeek: number | null;
  initialPhotos: Record<number, WeekPhotosState>;
} | null> {
  try {
    const weeks = await getWeekComparisonData({ id: clientId, start_date: startDate }, weekNumber);
    const options = comparableWeeks(weeks, weekNumber);
    const raw = Array.isArray(param) ? param[0] : param;
    const asked = raw !== undefined && /^\d{1,4}$/.test(raw) ? Number(raw) : null;
    const compareWeek =
      asked !== null && options.some((w) => w.weekNumber === asked)
        ? asked
        : (options[options.length - 1]?.weekNumber ?? null);

    const initialPhotos: Record<number, WeekPhotosState> = {};
    const toLoad = [weekNumber, ...(compareWeek !== null ? [compareWeek] : [])];
    await Promise.all(
      toLoad.map(async (w) => {
        const meta = weeks.find((x) => x.weekNumber === w);
        if (!meta || meta.photoAngles.length === 0) {
          initialPhotos[w] = { status: "ok", photos: [] };
          return;
        }
        try {
          const photos = await listClientPhotos(clientId, { weekNumber: w });
          initialPhotos[w] =
            photos === null ? { status: "error", forbidden: true } : { status: "ok", photos };
        } catch (err) {
          console.error("Não foi possível carregar as fotos da comparação:", err);
          initialPhotos[w] = { status: "error", forbidden: false };
        }
      })
    );
    return { weeks, compareWeek, initialPhotos };
  } catch (err) {
    console.error("Não foi possível carregar a comparação entre semanas:", err);
    return null;
  }
}

function PhotosSection({
  clientId,
  weekNumber,
  photos,
}: {
  clientId: string;
  weekNumber: number;
  photos: WeekPhotos;
}) {
  return (
    <section aria-label="Fotos da semana" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-lg font-medium text-ink">Fotos da semana {weekNumber}</h2>
        <Link
          href={`/coach/alunos/${clientId}/fotos`}
          className="inline-flex min-h-11 items-center text-sm text-brand hover:underline"
        >
          Ver todas as fotos
        </Link>
      </div>
      {photos.status === "ok" && photos.photos.length > 0 ? (
        <PhotoTriptych weekNumber={weekNumber} photos={photos.photos} />
      ) : (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          {photos.status === "ok"
            ? "O aluno não enviou fotos neste check-in."
            : photos.status === "forbidden"
              ? "Você não tem acesso às fotos deste aluno (só o coach responsável ou um admin da conta)."
              : "Não foi possível carregar as fotos agora. Recarregue a página para tentar de novo."}
        </p>
      )}
    </section>
  );
}

function AnswersSection({ detail }: { detail: EvaluationDetail }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink">Check-in da semana</h2>
      {detail.answers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          Nenhuma resposta registrada neste check-in.
        </p>
      ) : (
        <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line">
          {detail.answers.map((a) => (
            <div key={a.key} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
              <dt className="text-xs text-ink-faint">{a.label}</dt>
              <dd className="whitespace-pre-wrap break-words text-sm text-ink">{a.display}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

const GOAL_STATUS: Record<string, string> = {
  success: "Atingida",
  partial: "Parcial",
  fail: "Não atingida",
  pending: "Em aberto",
};

function GoalsSection({ detail }: { detail: EvaluationDetail }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink">Metas da semana</h2>
      {detail.goals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          Nenhuma meta definida para esta semana.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {detail.goals.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-sm last:border-b-0"
            >
              <span className="text-ink">{g.label}</span>
              <span className="text-ink-muted">
                meta {g.target_value.toLocaleString("pt-BR")}
                {g.unit ? ` ${g.unit}` : ""}
                {g.result_value != null ? ` · resultado ${Number(g.result_value).toLocaleString("pt-BR")}` : ""}
                {" · "}
                {GOAL_STATUS[g.result_status] ?? g.result_status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContextSection({ detail }: { detail: EvaluationDetail }) {
  const prev = detail.previousOrientation;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink">Últimas semanas</h2>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-label uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2 font-normal sm:px-3">Semana</th>
              <th className="px-2 py-2 font-normal sm:px-3">Peso</th>
              <th className="px-2 py-2 font-normal sm:px-3">Aderência</th>
              <th className="px-2 py-2 font-normal sm:px-3">Energia</th>
              <th className="px-2 py-2 font-normal sm:px-3">Check-in</th>
            </tr>
          </thead>
          <tbody>
            {detail.context.map((w) => (
              <tr key={w.weekNumber} className="border-b border-line last:border-b-0">
                <td className="px-2 py-2 text-ink sm:px-3">
                  {w.weekNumber}
                  {w.weekNumber === detail.row.weekNumber && (
                    <span className="ml-1.5 text-xs text-brand">atual</span>
                  )}
                </td>
                <td className="px-2 py-2 text-ink-muted sm:px-3">{w.weight != null ? formatKg(w.weight) : "—"}</td>
                <td className="px-2 py-2 text-ink-muted sm:px-3">
                  {w.adherence != null ? `${num(w.adherence)}${detail.adherenceIsScale ? " de 5" : ""}` : "—"}
                </td>
                <td className="px-2 py-2 text-ink-muted sm:px-3">{w.energy != null ? `${w.energy} de 5` : "—"}</td>
                <td className="px-2 py-2 text-ink-muted sm:px-3">{w.submitted ? "Enviado" : "Sem envio"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {prev && (
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4">
          <span className="font-mono text-label uppercase tracking-wide text-ink-faint">
            Orientação enviada na semana {prev.weekNumber}
          </span>
          <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{prev.text}</p>
        </div>
      )}
    </section>
  );
}
