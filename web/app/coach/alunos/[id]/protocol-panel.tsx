import "server-only";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import {
  MODULE_LABELS,
  modulesOf,
  packageIncludesText,
  packageLabel,
  isPackageId,
  type ModuleId,
  type PackageId,
} from "@/lib/onboarding/packages";
import {
  deriveOnboardingStage,
  coachStageLabel,
  type OnboardingStageInfo,
  type OnboardingStatusRow,
} from "@/lib/onboarding/stage";

export type ModuleState = "published" | "draft" | "not_started";

export type ProtocolInfo = {
  package: PackageId;
  stage: OnboardingStageInfo;
  stageLabel: string;
  questionnaireSubmitted: boolean;
  modules: { id: ModuleId; state: ModuleState }[];
};

const MODULE_TONE: Record<ModuleState, BadgeTone> = { published: "success", draft: "warning", not_started: "neutral" };
const MODULE_TEXT: Record<ModuleState, string> = {
  published: "Publicado",
  draft: "Rascunho (o aluno ainda não vê)",
  not_started: "Não iniciado",
};

const DAY = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * Pacote e estado do protocolo do aluno, lidos da view `client_onboarding_status` (0022).
 * Devolve `null` para aluno legado (sem contrato) e também se a view ainda não existir ou a
 * consulta falhar: nesse caso as telas seguem como antes, sem painel e sem avisos.
 */
export async function getProtocolInfo(clientId: string): Promise<ProtocolInfo | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_onboarding_status")
      .select(
        "has_account, onboarding_required, invite_status, package, questionnaire_status, questionnaire_opened_at, protocol_due_at, training_published, nutrition_published, training_draft, nutrition_draft, invite_last_sent_at, invite_last_failed_at, invite_accepted_at"
      )
      .eq("client_id", clientId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as OnboardingStatusRow;
    if (!isPackageId(row.package)) return null;
    const stage = deriveOnboardingStage(row);
    const flags: Record<ModuleId, { published: boolean; draft: boolean }> = {
      training: { published: row.training_published, draft: row.training_draft },
      nutrition: { published: row.nutrition_published, draft: row.nutrition_draft },
    };
    return {
      package: row.package,
      stage,
      stageLabel: coachStageLabel(stage),
      questionnaireSubmitted: row.questionnaire_status === "submitted",
      modules: modulesOf(row.package).map((id) => ({
        id,
        state: flags[id].published ? "published" : flags[id].draft ? "draft" : "not_started",
      })),
    };
  } catch (err) {
    console.error("Não foi possível ler o pacote do aluno:", err);
    return null;
  }
}

const LINK =
  "inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand";

/** Painel "Protocolo" do perfil do aluno. Aluno legado/sem dados: não renderiza nada. */
export default async function ProtocolPanel({ clientId }: { clientId: string }) {
  const info = await getProtocolInfo(clientId);
  if (!info) return null;
  const { stage } = info;
  const missing = info.modules.filter((m) => m.state !== "published");
  // Aluno anterior ao novo cadastro (sem questionário obrigatório) que recebeu pacote: não deve
  // questionário nenhum. Com todos os módulos publicados, o protocolo está entregue (item 35).
  const legacyFlow = stage.stage === "legacy";
  const done = stage.stage === "protocol_completed" || (legacyFlow && missing.length === 0);

  return (
    <section aria-label="Protocolo" className="flex flex-col gap-3">
      <h2 className="t-subtitle text-ink">Protocolo</h2>
      <div className="card flex min-w-0 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Pacote {packageLabel(info.package)}</Badge>
          <Badge tone={done ? "success" : stage.isOverdue ? "danger" : "warning"} dot>
            {info.stageLabel}
          </Badge>
        </div>
        <p className="text-sm text-ink-muted">{packageIncludesText(info.package)}</p>

        {stage.dueAt && !done && (
          <p className={`text-sm ${stage.isOverdue ? "text-late-text" : "text-ink"}`}>
            Prazo previsto: <strong>{DAY.format(stage.dueAt)}</strong>
            {stage.isOverdue ? " (atrasado)" : ""}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {info.modules.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
            >
              <span className="text-sm font-semibold text-ink">{MODULE_LABELS[m.id]}</span>
              <Badge tone={MODULE_TONE[m.state]}>{MODULE_TEXT[m.state]}</Badge>
            </li>
          ))}
        </ul>

        <p className="text-sm text-ink-muted" aria-live="polite">
          {done
            ? "Protocolo concluído: todos os módulos do pacote estão publicados."
            : !info.questionnaireSubmitted && !legacyFlow
              ? "Falta o aluno enviar o questionário inicial."
              : `Falta publicar: ${missing.map((m) => MODULE_LABELS[m.id]).join(" e ")}. Rascunho não conta como entregue.`}
        </p>

        <div className="flex flex-wrap gap-2">
          {info.modules.map((m) => (
            <Link
              key={m.id}
              href={`/coach/alunos/${clientId}/${m.id === "training" ? "treino" : "nutricao"}`}
              className={LINK}
            >
              {m.state === "published" ? "Ver" : "Montar"} {MODULE_LABELS[m.id].toLowerCase()}
            </Link>
          ))}
          <Link href={`/coach/alunos/${clientId}/questionario`} className={LINK}>
            Questionário inicial
          </Link>
        </div>
        <p className="text-xs text-ink-faint">
          Para pré-visualizar como o aluno vê, abra o editor do módulo e use a prévia.
        </p>
      </div>
    </section>
  );
}

/**
 * Aviso nas telas de treino/nutrição: pacote durante a preparação e, se o módulo não faz parte
 * do pacote, que o aluno não verá. Aluno legado/sem dados: nada.
 */
export async function ModuleNotice({ clientId, module }: { clientId: string; module: ModuleId }) {
  const info = await getProtocolInfo(clientId);
  if (!info) return null;
  const included = modulesOf(info.package).includes(module);
  const mine = info.modules.find((m) => m.id === module);
  const label = MODULE_LABELS[module].toLowerCase();

  if (!included) {
    return (
      <div role="status" className="card flex flex-col gap-1 border-warning p-4 text-sm">
        <Badge tone="warning">Fora do pacote contratado</Badge>
        <p className="text-ink">
          Este aluno contratou o pacote <strong>{packageLabel(info.package)}</strong>, que não inclui {label}. Você pode
          montar o plano, mas o aluno <strong>não verá</strong> este módulo enquanto o pacote não for alterado.
        </p>
      </div>
    );
  }
  return (
    <div role="status" className="card flex flex-wrap items-center gap-2 p-4 text-sm">
      <Badge tone="accent">Pacote {packageLabel(info.package)}</Badge>
      {mine && <Badge tone={MODULE_TONE[mine.state]}>{MODULE_TEXT[mine.state]}</Badge>}
      <span className="text-ink-muted">
        {mine?.state === "published"
          ? `${module === "training" ? "O treino está publicado e liberado" : "A nutrição está publicada e liberada"} para o aluno.`
          : "Publique para liberar este módulo ao aluno. Rascunho não conta como entregue."}
      </span>
      <Link href={`/coach/alunos/${clientId}`} className="ml-auto text-brand hover:underline">
        Ver protocolo
      </Link>
    </div>
  );
}
