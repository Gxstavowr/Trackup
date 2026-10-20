import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { MODULE_LABELS, type ModuleId } from "@/lib/onboarding/packages";

/**
 * Módulo INCLUÍDO no pacote, mas ainda não publicado (V5, item 16). Estado próprio, diferente do
 * cadeado: sem upsell, sem "fale com o coach para contratar". O prazo é o `protocol_due_at` real
 * (envio do questionário + 3 dias); sem prazo conhecido, o texto não inventa data.
 */

const DUE_FMT = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export default function ModulePreparing({
  module,
  dueAt,
  isOverdue = false,
  awaitingQuestionnaire = false,
}: {
  module: ModuleId;
  dueAt: Date | null;
  isOverdue?: boolean;
  /** Questionário ainda não enviado: o coach só começa depois dele. */
  awaitingQuestionnaire?: boolean;
}) {
  const label = MODULE_LABELS[module];
  const noun = module === "training" ? "seu treino" : "seu plano alimentar";
  return (
    <section aria-labelledby="module-prep-title" className="relative overflow-hidden rounded-[var(--radius-xl)] border border-line-strong bg-surface-raised p-5 shadow-[var(--surface-raised-shadow)] sm:p-6">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-brand-tint blur-2xl" />
      <div className="relative flex flex-col gap-4">
        <Badge tone={isOverdue ? "warning" : "accent"} dot>
          {awaitingQuestionnaire ? "Falta o questionário" : "Em preparação"}
        </Badge>
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Icon name={module === "training" ? "workout" : "nutrition"} size={24} />
          </span>
          <div className="min-w-0">
            <h2 id="module-prep-title" className="font-display text-xl font-bold leading-tight text-ink">
              {awaitingQuestionnaire ? `Responda o questionário para liberar ${noun}` : `Seu coach está preparando ${noun}`}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {awaitingQuestionnaire
                ? `${label} faz parte do seu pacote. Assim que você enviar o questionário inicial, seu coach começa a montar.`
                : `${label} faz parte do seu pacote e aparece aqui assim que for publicado. Você não precisa fazer nada.`}
            </p>
          </div>
        </div>
        {!awaitingQuestionnaire && dueAt && (
          <div className={`flex items-start gap-3 rounded-[var(--radius-md)] border p-3 ${isOverdue ? "border-warning/40 bg-warning-tint" : "border-line bg-surface-sunken"}`}>
            <Icon name="calendar" size={20} className={isOverdue ? "text-warning" : "text-brand"} />
            <p className="text-sm text-ink">
              {isOverdue ? (
                <>A previsão era <strong className="font-semibold">{DUE_FMT.format(dueAt)}</strong>. Seu coach ainda está finalizando.</>
              ) : (
                <>Previsão: <strong className="font-semibold">até {DUE_FMT.format(dueAt)}</strong> (até três dias depois do envio).</>
              )}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          {awaitingQuestionnaire ? (
            <ButtonLink href="/portal/onboarding" variant="primary" size="lg" width="mobile">
              Ir para o questionário
            </ButtonLink>
          ) : (
            <ButtonLink href="/portal/onboarding/respostas" variant="secondary" size="lg" width="mobile" icon="checkin">
              Ver respostas enviadas
            </ButtonLink>
          )}
          <ButtonLink href="/portal" variant="tertiary" size="lg" width="mobile">
            Ir para o início
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
