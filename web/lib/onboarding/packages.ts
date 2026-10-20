/**
 * Pacotes de serviço do aluno (V5) — módulo puro, sem I/O. Os ids são exatamente os da migração
 * 0022 (`client_service_contracts.package`). O pacote define quais módulos o aluno contratou
 * (treino e/ou nutrição) e quais seções do questionário inicial ele responde. Aluno legado (sem
 * contrato) é representado por `null` e não passa por nenhuma restrição.
 */

export type PackageId = "training" | "nutrition" | "hybrid";
export type ModuleId = "training" | "nutrition";
/** Seções do questionário inicial (mesmo conjunto aceito pelo banco em `sections`). */
export type QuestionnaireSection = "common" | "training" | "nutrition";
/** Período de cobrança do contrato (check da 0022). */
export type BillingPeriod = "monthly" | "quarterly" | "semiannual" | "annual";

export type PackageDefinition = {
  id: PackageId;
  label: string;
  /** Texto curto e objetivo do que o pacote inclui. */
  includes: string;
  modules: readonly ModuleId[];
};

export const PACKAGES: Readonly<Record<PackageId, PackageDefinition>> = {
  training: {
    id: "training",
    label: "Treino",
    includes: "Plano de treino personalizado, registro das séries e acompanhamento do coach.",
    modules: ["training"],
  },
  nutrition: {
    id: "nutrition",
    label: "Nutrição",
    includes: "Plano alimentar personalizado, registro das refeições e acompanhamento do coach.",
    modules: ["nutrition"],
  },
  hybrid: {
    id: "hybrid",
    label: "Híbrido",
    includes: "Treino e nutrição juntos, com o mesmo acompanhamento do coach.",
    modules: ["training", "nutrition"],
  },
};

export const PACKAGE_IDS: readonly PackageId[] = ["training", "nutrition", "hybrid"];
export const MODULE_IDS: readonly ModuleId[] = ["training", "nutrition"];

export const MODULE_LABELS: Readonly<Record<ModuleId, string>> = {
  training: "Treino",
  nutrition: "Nutrição",
};

export const BILLING_PERIOD_LABELS: Readonly<Record<BillingPeriod, string>> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export function isPackageId(value: unknown): value is PackageId {
  return typeof value === "string" && (PACKAGE_IDS as readonly string[]).includes(value);
}

/** Módulos do pacote. `null` (legado, sem contrato) → lista vazia: "não se aplica". */
export function modulesOf(pkg: PackageId | null | undefined): readonly ModuleId[] {
  return pkg ? PACKAGES[pkg].modules : [];
}

/** O pacote inclui o módulo? Legado (`null`) → `false`; quem decide o legado é `moduleAccess`. */
export function packageIncludes(pkg: PackageId | null | undefined, module: ModuleId): boolean {
  return modulesOf(pkg).includes(module);
}

export function packageLabel(pkg: PackageId | null | undefined): string {
  return pkg ? PACKAGES[pkg].label : "Sem pacote";
}

export function packageIncludesText(pkg: PackageId): string {
  return PACKAGES[pkg].includes;
}

/**
 * Seções do questionário: sempre `common`, mais `nutrition` quando o pacote inclui nutrição.
 * Não há seção de treino desde a v2 do catálogo: o coach monta o treino a partir da seção comum
 * (`training` só existe em envios antigos). Pacote `null` (legado) ou Treino → só `common`.
 */
export function sectionsFor(pkg: PackageId | null | undefined): QuestionnaireSection[] {
  return modulesOf(pkg).includes("nutrition") ? ["common", "nutrition"] : ["common"];
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos em BRL ("R$ 1.234,56"). Valor inválido → "R$ 0,00". */
export function formatPriceBRL(cents: number | null | undefined): string {
  const safe = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return BRL.format(Math.round(safe) / 100).replace(/ /g, " ");
}
