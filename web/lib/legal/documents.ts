/**
 * Documentos legais e finalidades de consentimento (LGPD — ver `docs/lgpd.md`).
 *
 * VERSIONAMENTO: ao mudar o TEXTO de um documento de forma material, suba a versão aqui. O gate
 * de consentimento (`lib/legal/consent.ts`) compara o último aceite do usuário com esta versão —
 * todo mundo é levado de novo pra `/consentimento` e aceita o texto novo, com registro próprio.
 *
 * Os campos entre colchetes em `CONTROLLER` são DADOS QUE SÓ O TITULAR DO NEGÓCIO TEM (razão
 * social, CNPJ, encarregado) — precisam ser preenchidos antes de ir pra produção.
 */

export const LEGAL_VERSION = "2026-10-08";

export const CONTROLLER = {
  productName: "Trackly",
  legalName: "[RAZÃO SOCIAL]",
  cnpj: "[CNPJ]",
  address: "[ENDEREÇO]",
  dpoName: "[NOME DO ENCARREGADO]",
  dpoEmail: "[E-MAIL DO ENCARREGADO]",
} as const;

export type ConsentPurpose = "terms_of_use" | "privacy_policy" | "health_data";

/** Finalidades obrigatórias por papel. Sem TODAS aceitas na versão atual, o app bloqueia. */
export const REQUIRED_PURPOSES: Record<"coach" | "client", ConsentPurpose[]> = {
  coach: ["terms_of_use", "privacy_policy"],
  client: ["privacy_policy", "health_data"],
};

export type DataSubjectRequestType =
  | "access"
  | "correction"
  | "deletion"
  | "portability"
  | "consent_revocation"
  | "other";

export const REQUEST_TYPE_LABELS: Record<DataSubjectRequestType, string> = {
  access: "Acesso aos dados",
  correction: "Correção de dados",
  deletion: "Exclusão dos dados",
  portability: "Portabilidade",
  consent_revocation: "Revogação de consentimento",
  other: "Outro",
};

export type DataSubjectRequestStatus = "open" | "in_progress" | "completed" | "rejected";

export const REQUEST_STATUS_LABELS: Record<DataSubjectRequestStatus, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  completed: "Concluída",
  rejected: "Recusada",
};

/** Prazo de resposta adotado (art. 19, II — "até 15 dias" para a declaração completa). */
export const REQUEST_RESPONSE_DAYS = 15;
