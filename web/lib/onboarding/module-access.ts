/**
 * Liberação de módulos por pacote (V5, plano §5) — puro. Decide, para um módulo, se o aluno vê o
 * conteúdo real, uma prévia bloqueada ou um aviso de "em preparação". O app aplica isso nas
 * telas e nas ações do servidor; a RLS reforça o bloqueio no banco.
 */
import { packageIncludes, type ModuleId, type PackageId } from "./packages";

export type ModuleAccessState =
  /** Contratado e publicado (ou legado com plano publicado): módulo normal. */
  | "available"
  /** Legado sem plano publicado: vazio, como hoje. */
  | "empty"
  /** Fora do pacote: prévia demonstrativa com cadeado; não buscar o plano real. */
  | "not_contracted"
  /** Contratado, não publicado, questionário ainda não enviado. */
  | "awaiting_questionnaire"
  /** Contratado, não publicado, coach preparando (sem upsell). */
  | "preparing";

export type ModuleAccessInput = {
  /** Pacote vigente; `null` = aluno legado (sem contrato). */
  package: PackageId | null;
  /** Há plano ativo publicado por módulo. */
  published: Readonly<Record<ModuleId, boolean>>;
  questionnaireStatus: "draft" | "submitted" | null;
  /** Prazo do protocolo (ISO); só existe depois do envio do questionário. */
  dueAt?: string | Date | null;
  onboardingRequired?: boolean;
  now?: Date;
};

export type ModuleAccess = {
  state: ModuleAccessState;
  /** Só em `preparing`. */
  dueAt: Date | null;
  isOverdue: boolean;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function moduleAccess(input: ModuleAccessInput, module: ModuleId): ModuleAccess {
  const plain = (state: ModuleAccessState): ModuleAccess => ({ state, dueAt: null, isOverdue: false });
  const isPublished = Boolean(input.published[module]);

  // Legado: "publicado = visível", como antes do V5.
  if (input.package === null) return plain(isPublished ? "available" : "empty");

  if (!packageIncludes(input.package, module)) return plain("not_contracted");
  if (isPublished) return plain("available");

  const submitted = input.questionnaireStatus === "submitted";
  // Quem ainda deve o questionário (onboarding obrigatório) espera por ele; um aluno legado que
  // recebeu pacote depois não passa pelo questionário, então só aguarda o coach.
  if (!submitted && input.onboardingRequired !== false) return plain("awaiting_questionnaire");

  const dueAt = toDate(input.dueAt);
  const now = input.now ?? new Date();
  return { state: "preparing", dueAt, isOverdue: dueAt !== null && now.getTime() > dueAt.getTime() };
}

/** Atalho: o conteúdo real do módulo pode ser buscado/exibido? */
export function canUseModule(input: ModuleAccessInput, module: ModuleId): boolean {
  return moduleAccess(input, module).state === "available";
}
