import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MODULE_LABELS, packageLabel, type ModuleId, type PackageId } from "@/lib/onboarding/packages";

/**
 * Módulo FORA do pacote contratado (V5, item 15): prévia demonstrativa com cadeado. Todo o
 * conteúdo é fictício e genérico ("exemplo"); nada vem do plano real do aluno e a prévia não tem
 * nenhuma ação executável (`inert`, sem links nem botões). Tom comercial amigável, não de erro.
 *
 * Contato com o coach: o app ainda não tem canal de mensagens aluno-coach nem expõe o telefone do
 * coach ao aluno. Se um dia houver, passe `contactHref` (ex.: link do WhatsApp); sem ele, o texto
 * orienta a falar com o coach e o botão leva a "Minha conta" (onde o pacote aparece).
 */

const COPY: Record<ModuleId, { title: string; benefit: string }> = {
  training: {
    title: "Treino fora do seu pacote",
    benefit: "um plano de treino com exercícios, séries, cargas e acompanhamento da execução",
  },
  nutrition: {
    title: "Nutrição fora do seu pacote",
    benefit: "um plano alimentar com refeições, horários, metas e registro da sua rotina",
  },
};

function LockIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function TrainingSample() {
  const rows = [
    ["Exercício de exemplo 1", "3 × 12"],
    ["Exercício de exemplo 2", "4 × 10"],
    ["Exercício de exemplo 3", "3 × 15"],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="t-kicker text-brand">Semana de exemplo</span>
        <h3 className="font-display text-xl font-bold text-ink">Treino A · exemplo</h3>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map(([name, sets]) => (
          <li key={name} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-sunken px-3 py-3">
            <span className="text-sm font-semibold text-ink">{name}</span>
            <span className="text-sm tabular-nums text-ink-muted">{sets}</span>
          </li>
        ))}
      </ul>
      <div className="min-h-11 rounded-md bg-brand-tint px-4 py-3 text-center text-sm font-semibold text-brand">Começar treino</div>
    </div>
  );
}

function NutritionSample() {
  const meals = [
    ["Refeição de exemplo 1", "00:00", "000 kcal"],
    ["Refeição de exemplo 2", "00:00", "000 kcal"],
    ["Refeição de exemplo 3", "00:00", "000 kcal"],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="t-kicker text-brand">Dia de exemplo</span>
        <h3 className="font-display text-xl font-bold text-ink">Plano alimentar · exemplo</h3>
      </div>
      <ul className="flex flex-col gap-2">
        {meals.map(([name, time, kcal]) => (
          <li key={name} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-sunken px-3 py-3">
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">{name}</span>
              <span className="text-xs text-ink-muted">Alimento de exemplo · {time}</span>
            </span>
            <span className="text-sm tabular-nums text-ink-muted">{kcal}</span>
          </li>
        ))}
      </ul>
      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full w-1/2 rounded-full bg-brand" />
      </div>
    </div>
  );
}

export default function ModuleLock({
  module,
  pkg,
  contactHref,
}: {
  module: ModuleId;
  /** Pacote vigente do aluno, para o texto "seu pacote atual (...)". */
  pkg: PackageId | null;
  /** Link externo para falar com o coach (WhatsApp etc.), se existir. */
  contactHref?: string | null;
}) {
  const copy = COPY[module];
  return (
    <section aria-labelledby="module-lock-title" className="relative overflow-hidden rounded-[var(--radius-xl)] border border-line-strong bg-surface-raised shadow-[var(--surface-raised-shadow)]">
      {/* Prévia fictícia: decorativa, borrada e sem interação. */}
      <div aria-hidden inert className="pointer-events-none select-none p-5 opacity-60 blur-[3px] sm:p-6">
        <div className="mb-3">
          <Badge tone="neutral">Exemplo ilustrativo</Badge>
        </div>
        {module === "training" ? <TrainingSample /> : <NutritionSample />}
      </div>

      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-surface/70 p-4 backdrop-blur-[1px]">
        <div className="tk-enter flex w-full max-w-sm flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-line-strong bg-surface-raised p-5 text-center shadow-[var(--surface-raised-shadow)]">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand">
            <LockIcon />
          </span>
          <h2 id="module-lock-title" className="font-display text-xl font-bold leading-tight text-ink">
            {copy.title}
          </h2>
          <p className="text-sm text-ink-muted">
            {pkg
              ? `Seu pacote atual (${packageLabel(pkg)}) não inclui ${MODULE_LABELS[module].toLowerCase()}. `
              : `${MODULE_LABELS[module]} não faz parte do seu pacote. `}
            Com ele você teria {copy.benefit}.
          </p>
          <p className="text-xs text-ink-faint">Quer incluir? É só conversar com o seu coach.</p>
          {contactHref ? (
            <ButtonLink href={contactHref} target="_blank" rel="noopener noreferrer" variant="primary" size="md" width="mobile" icon="message">
              Falar com meu coach
            </ButtonLink>
          ) : (
            <ButtonLink href="/portal/conta" variant="secondary" size="md" width="mobile">
              Ver meu pacote
            </ButtonLink>
          )}
        </div>
      </div>
    </section>
  );
}
