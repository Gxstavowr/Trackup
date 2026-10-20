import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { isPackageId, packageLabel } from "@/lib/onboarding/packages";
import {
  NOT_ANSWERED,
  QUESTIONNAIRE_VERSION,
  groupAnswersForDisplay,
  type AnswerItem,
} from "@/lib/onboarding/questionnaire-catalog";
import { getClientQuestionnaire, markQuestionnaireOpened } from "@/lib/onboarding/questionnaire";
import { todayDateSP } from "@/lib/portal-today";
import { getClient } from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import { formatInstantDay } from "../../student-situation";

export const metadata: Metadata = { title: "Questionário inicial · Trackly" };

/**
 * Respostas que mais pesam na montagem do protocolo (treino e dieta), NESTA ordem: objetivo e
 * detalhe, corpo (nascimento/idade, peso, altura), refeições por dia, alergias e
 * intolerâncias, condições de saúde e sintomas, medicamentos, preferências e aversões, rotina.
 * Aparecem em destaque no topo e continuam na sua categoria. Chaves fora do pacote do aluno
 * simplesmente não existem nas respostas. Não depende de perguntas de treino (não há seção de
 * treino desde a v2: o coach monta o treino a partir destes dados).
 */
const ESSENTIAL_KEYS: readonly string[] = [
  "goal",
  "goal_detail",
  "birth_date",
  "weight_kg",
  "height_cm",
  "experience_training",
  "meals_per_day",
  "food_allergies",
  "food_intolerances",
  "health_conditions",
  "symptoms",
  "medications",
  "disliked_foods",
  "must_have_foods",
  "carb_sources",
  "protein_sources",
  "fat_sources",
  "occupation",
  "daily_activity",
  "sleep_time",
  "wake_time",
  "eating_routine",
];

/** Sintomas relevantes no destaque: só "Frequentemente/Ocasionalmente". */
const NOTABLE_FREQUENCIES: ReadonlySet<string> = new Set(["often", "sometimes"]);

function isPast(iso: string): boolean {
  return Date.now() > Date.parse(iso);
}

function PrivateBadge() {
  return (
    <Badge tone="info" className="whitespace-nowrap">
      Privado
    </Badge>
  );
}

const FREQ_TONE: Record<string, string> = {
  often: "text-danger-text",
  sometimes: "text-warning",
  rarely: "text-ink-muted",
  never: "text-ink-faint",
};

/**
 * Grade (ex.: sintomas): primeiro "Frequentemente" e "Ocasionalmente" (o que importa), depois
 * "Raramente" e "Nunca" em texto discreto. `notableOnly` = só os relevantes (bloco Essencial).
 */
function MatrixValue({ item, notableOnly = false }: { item: AnswerItem; notableOnly?: boolean }) {
  const groups = (item.matrix ?? []).filter((g) => !notableOnly || NOTABLE_FREQUENCIES.has(g.value));
  if (groups.length === 0) {
    return <span className="text-ink-muted">{notableOnly ? "Nenhum sintoma frequente ou ocasional." : NOT_ANSWERED}</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g) => {
        const notable = NOTABLE_FREQUENCIES.has(g.value);
        return (
          <p key={g.value} className={notable ? "text-sm" : "text-xs text-ink-muted"}>
            <span className={`font-semibold ${FREQ_TONE[g.value] ?? "text-ink"}`}>{g.label}:</span>{" "}
            <span className={notable ? "text-ink" : ""}>{g.rows.join(", ")}</span>
          </p>
        );
      })}
    </div>
  );
}

function AnswerRow({ item, highlight = false }: { item: AnswerItem; highlight?: boolean }) {
  const empty = item.value === NOT_ANSWERED;
  const wide = item.matrix !== undefined || item.value.length > 140;
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-md px-3 py-2.5 ${wide ? "sm:col-span-2" : ""} ${
        highlight ? "border-l-2 border-brand bg-brand-tint/40" : "bg-surface-sunken"
      }`}
    >
      <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-faint">
        <span>{item.label}</span>
        {item.sensitive && <PrivateBadge />}
      </dt>
      <dd className={`whitespace-pre-line break-words text-sm leading-snug ${empty ? "text-ink-faint" : "text-ink"}`}>
        {item.matrix !== undefined ? <MatrixValue item={item} notableOnly={highlight} /> : item.value}
      </dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="t-label text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function InitialQuestionnairePage({ params }: PageProps<"/coach/alunos/[id]/questionario">) {
  const { id } = await params;
  await requireCoach();
  const client = await getClient(id);
  if (!client) notFound();

  const data = await getClientQuestionnaire(id);
  const submitted = data.available ? data.submitted : null;

  // Só registra que o coach abriu (idempotente no banco); as respostas não são alteradas.
  if (submitted && !submitted.coach_opened_at) await markQuestionnaireOpened(submitted.id);

  const header = (
    <header className="flex flex-col gap-1">
      <h2 className="t-subtitle text-ink">Questionário inicial</h2>
      <p className="t-helper">
        O que {client.name} respondeu ao se cadastrar. É diferente dos check-ins semanais: aqui ficam os dados de
        partida, que não são alterados depois.
      </p>
    </header>
  );

  if (!data.available) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <EmptyState
          icon="user"
          title="Questionário indisponível agora"
          text="Não foi possível carregar o questionário deste aluno. Tente novamente em instantes."
        />
      </div>
    );
  }

  if (!submitted) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <EmptyState
          icon="user"
          title={data.draft ? "O aluno ainda está respondendo" : "Questionário ainda não enviado"}
          text={
            data.draft
              ? `Ele começou em ${formatInstantDay(data.draft.started_at)} e salvou o progresso em ${formatInstantDay(data.draft.updated_at)}. As respostas aparecem aqui quando ele enviar.`
              : "Quando o aluno enviar o questionário inicial, as respostas aparecem aqui."
          }
        />
      </div>
    );
  }

  const answers = submitted.answers;
  // Envio de versão anterior do catálogo: esconde as perguntas novas que ele nunca viu.
  const oldVersion = submitted.catalog_version !== QUESTIONNAIRE_VERSION;
  const { groups, extra } = groupAnswersForDisplay(submitted.sections, answers, {
    today: todayDateSP(),
    hideEmpty: oldVersion,
  });
  const byKey = new Map(groups.flatMap((g) => g.steps.flatMap((s) => s.items)).map((it) => [it.key, it] as const));
  const essentials = ESSENTIAL_KEYS.map((k) => byKey.get(k)).filter(
    (item): item is AnswerItem => item !== undefined && item.value !== NOT_ANSWERED
  );
  const due = formatInstantDay(submitted.protocol_due_at);
  const overdue = submitted.protocol_due_at ? isPast(submitted.protocol_due_at) : false;
  const pkg = isPackageId(submitted.package) ? submitted.package : null;
  const base = `/coach/alunos/${id}`;
  const previous = data.history.filter((h) => h.id !== submitted.id);

  return (
    <div className="flex flex-col gap-6">
      {header}

      <Card variant="raised" padding="md" className="flex flex-col gap-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Pacote">{pkg ? packageLabel(pkg) : "Sem pacote"}</Fact>
          <Fact label="Recebido em">{formatInstantDay(submitted.submitted_at) ?? "—"}</Fact>
          <Fact label="Prazo do protocolo">
            <span className="flex flex-wrap items-center gap-2">
              {due ?? "—"}
              {overdue && <Badge tone="danger">Atrasado</Badge>}
            </span>
          </Fact>
          <Fact label="Situação">
            {submitted.coach_opened_at
              ? `Aberto por você em ${formatInstantDay(submitted.coach_opened_at)}`
              : "Aberto agora pela primeira vez"}
          </Fact>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Link href={`${base}/treino`} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Montar treino
          </Link>
          <Link href={`${base}/nutricao`} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Montar nutrição
          </Link>
          <Link href={`${base}/pacote`} className={buttonClass({ variant: "tertiary", size: "sm" })}>
            Ver pacote
          </Link>
        </div>
      </Card>

      {essentials.length > 0 && (
        <section aria-labelledby="essentials-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 id="essentials-title" className="font-medium text-ink">
              Essencial para montar o protocolo
            </h3>
            <p className="t-helper">
              Objetivo, corpo, saúde, alimentação e rotina: o que mais pesa no treino e na dieta.
            </p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            {essentials.map((item) => (
              <AnswerRow key={item.key} item={item} highlight />
            ))}
          </dl>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.section} aria-labelledby={`sec-${group.section}`} className="flex flex-col gap-3">
          <h3 id={`sec-${group.section}`} className="font-medium text-ink">
            {group.label}
          </h3>
          {group.steps.length === 0 ? (
            <p className="t-helper">Nenhuma resposta nesta categoria.</p>
          ) : (
            group.steps.map((step) => (
              <Card key={step.id} variant="default" padding="md" className="flex flex-col gap-3">
                <h4 className="t-label text-ink-faint">{step.title}</h4>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {step.items.map((item) => (
                    <AnswerRow key={item.key} item={item} />
                  ))}
                </dl>
              </Card>
            ))
          )}
        </section>
      ))}

      {extra.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-medium text-ink">Outras respostas</h3>
            <p className="t-helper">Perguntas de uma versão anterior do questionário, que não existem mais.</p>
          </div>
          <Card variant="default" padding="md">
            <dl className="grid gap-2 sm:grid-cols-2">
              {extra.map((e) => (
                <AnswerRow key={e.key} item={e} />
              ))}
            </dl>
          </Card>
        </section>
      )}

      <p className="t-helper">
        Respostas marcadas como <strong>Privado</strong> são dados de saúde e renda: só você, como coach do aluno, consegue
        ver, e elas não aparecem em painéis nem em notificações.
        Estas respostas ficam como foram enviadas; suas observações vão para a avaliação, o treino e a nutrição.
      </p>

      {previous.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-ink">Envios anteriores</h3>
          <ul className="flex flex-col gap-1 text-sm text-ink-muted">
            {previous.map((h) => (
              <li key={h.id}>Enviado em {formatInstantDay(h.submitted_at)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
