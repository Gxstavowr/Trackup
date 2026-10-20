import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CompletionMark } from "@/components/ui/completion-mark";
import Icon from "@/components/ui/icon";
import { ProgressRing } from "@/components/viz/progress-ring";
import { StepStrip, type StripStep } from "@/components/viz/step-strip";
import { MODULE_LABELS, modulesOf, packageLabel, type ModuleId, type PackageId } from "@/lib/onboarding/packages";
import { deriveOnboardingStage, studentStageText } from "@/lib/onboarding/stage";

/**
 * Tela "Seu protocolo está sendo preparado" (item 11). Tudo vem de dados reais:
 *  - prazo = `protocol_due_at` gravado pelo banco no envio (envio + 3 dias) — nunca data fixa;
 *  - estado = estágio derivado (`deriveOnboardingStage`): abertura pelo coach e planos PUBLICADOS.
 *    Rascunho do coach não conta; nada é mostrado como pronto antes da publicação real;
 *  - cada módulo do pacote é liberado assim que o respectivo plano é publicado.
 */

const TZ = "America/Sao_Paulo";
const DUE_FMT = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: TZ });
const SENT_FMT = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const MODULE_PLAN: Record<ModuleId, { title: string; text: string; href: string; icon: "workout" | "nutrition" }> = {
  training: {
    title: "Plano de treino",
    text: "Divisão, exercícios, séries e cargas pensados para a sua experiência, seus dias livres e o local onde você treina.",
    href: "/portal/treino",
    icon: "workout",
  },
  nutrition: {
    title: "Plano alimentar",
    text: "Refeições e horários a partir da sua rotina, dos alimentos de que você gosta e das suas restrições.",
    href: "/portal/nutricao",
    icon: "nutrition",
  },
};

export default function ProtocolPreparing({
  pkg,
  submittedAt,
  protocolDueAt,
  coachOpenedAt,
  published,
  justSent,
}: {
  pkg: PackageId | null;
  submittedAt: string;
  protocolDueAt: string;
  coachOpenedAt: string | null;
  published: { training: boolean; nutrition: boolean };
  justSent: boolean;
}) {
  const info = deriveOnboardingStage({
    has_account: true,
    onboarding_required: true,
    invite_status: "active",
    package: pkg,
    questionnaire_status: "submitted",
    questionnaire_opened_at: coachOpenedAt,
    protocol_due_at: protocolDueAt,
    training_published: published.training,
    nutrition_published: published.nutrition,
    // O aluno não enxerga os rascunhos do coach: a abertura do questionário é o sinal disponível.
    training_draft: false,
    nutrition_draft: false,
    invite_last_sent_at: null,
    invite_last_failed_at: null,
    invite_accepted_at: null,
  });

  const modules = modulesOf(pkg);
  const readyCount = modules.filter((m) => published[m]).length;
  const completed = info.stage === "protocol_completed";
  const dueText = info.dueAt ? DUE_FMT.format(info.dueAt) : null;
  const opened = coachOpenedAt !== null || readyCount > 0;

  const process: StripStep[] = [
    { key: "sent", label: "Enviado", state: "done" },
    { key: "review", label: "Coach analisa", state: opened ? "done" : "current" },
    { key: "build", label: "Montagem", state: completed ? "done" : opened ? "current" : "upcoming" },
    { key: "ready", label: "Pronto", state: completed ? "done" : "upcoming" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {justSent && (
        <section className="card tk-enter flex items-start gap-4 p-5" role="status" aria-live="polite">
          <CompletionMark size={48} />
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-ink">Questionário enviado ao seu coach</p>
            <p className="text-sm text-ink-muted">Suas respostas chegaram. Agora é com ele: você não precisa fazer mais nada por aqui.</p>
          </div>
        </section>
      )}

      <section
        className="relative overflow-hidden rounded-[var(--radius-lg)] border border-line-strong bg-surface-raised p-5 shadow-[var(--surface-raised-shadow)] sm:p-6"
        aria-labelledby="prep-title"
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <Badge tone={completed ? "success" : info.isOverdue ? "warning" : "accent"} dot>
                {completed ? "Protocolo pronto" : info.stage === "protocol_partial" ? "Parcialmente pronto" : "Em preparação"}
              </Badge>
              <h2 id="prep-title" className="font-display text-2xl font-bold leading-tight text-ink">
                {completed ? "Seu protocolo está pronto" : "Seu protocolo está sendo preparado"}
              </h2>
              <p className="text-sm text-ink-muted">{studentStageText(info, pkg)}</p>
            </div>
            {modules.length > 0 && (
              <ProgressRing
                value={readyCount}
                max={modules.length}
                size={76}
                thickness={8}
                tone={completed ? "success" : "accent"}
                label="Partes do protocolo publicadas"
              >
                <span className="flex flex-col items-center leading-none">
                  <span className="text-base">
                    {readyCount}/{modules.length}
                  </span>
                  <span className="mt-0.5 text-[0.625rem] font-semibold text-ink-faint">prontos</span>
                </span>
              </ProgressRing>
            )}
          </div>

          <StepStrip steps={process} label="Andamento do seu protocolo" />

          {!completed && dueText && (
            <div
              className={`flex items-start gap-3 rounded-[var(--radius-md)] border p-3 ${
                info.isOverdue ? "border-warning/40 bg-warning-tint" : "border-line bg-surface-sunken"
              }`}
            >
              <Icon name="calendar" size={20} className={info.isOverdue ? "text-warning" : "text-brand"} />
              <p className="text-sm text-ink">
                {info.isOverdue ? (
                  <>
                    A previsão era <strong className="font-semibold">{dueText}</strong>. Seu coach ainda está finalizando; se
                    quiser, fale com ele.
                  </>
                ) : (
                  <>
                    Previsão de entrega: <strong className="font-semibold">até {dueText}</strong>
                    <span className="block text-xs text-ink-muted">Até três dias a partir do envio, em {SENT_FMT.format(new Date(submittedAt))}.</span>
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="prep-what">
        <h3 id="prep-what" className="t-label text-ink-faint">
          {completed ? "O que já está liberado" : `O que seu coach vai preparar${pkg ? ` · pacote ${packageLabel(pkg)}` : ""}`}
        </h3>
        {modules.length === 0 ? (
          <div className="card p-4 text-sm text-ink-muted">
            Seu coach vai usar as suas respostas para montar o seu acompanhamento e avisa quando estiver pronto.
          </div>
        ) : (
          <ul className="tk-stagger flex flex-col gap-3">
            {modules.map((m) => {
              const ready = published[m];
              const plan = MODULE_PLAN[m];
              return (
                <li key={m} className="card flex items-start gap-3 p-4">
                  <span
                    aria-hidden
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                      ready ? "bg-success-tint text-success" : "bg-brand-tint text-brand"
                    }`}
                  >
                    <Icon name={ready ? "check" : plan.icon} size={20} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{plan.title}</span>
                      <Badge tone={ready ? "success" : "neutral"}>{ready ? (m === "nutrition" ? "Nutrição pronta" : "Treino pronto") : "Em preparação"}</Badge>
                    </div>
                    <p className="text-xs text-ink-muted">{plan.text}</p>
                    {ready && (
                      <Link href={plan.href} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
                        Abrir {MODULE_LABELS[m].toLowerCase()} <Icon name="chevron" size={16} />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!completed && (
        <p className="flex items-start gap-2 text-xs text-ink-muted">
          <Icon name="bell" size={16} className="mt-px shrink-0" />
          Cada parte é liberada aqui no portal assim que o coach publicar. Enquanto isso, você pode rever o que enviou.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/portal/onboarding/respostas" variant="secondary" size="lg" width="mobile" icon="checkin">
          Ver respostas enviadas
        </ButtonLink>
        <ButtonLink href="/portal" variant={completed ? "primary" : "tertiary"} size="lg" width="mobile">
          Ir para o início
        </ButtonLink>
      </div>
    </div>
  );
}
