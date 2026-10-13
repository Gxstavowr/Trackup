/**
 * Helper ÚNICO de macros de alimentos (V2, tarefa 21/22) — convenção SEM migration:
 *
 *  - `foods.macros` (jsonb) guarda os valores de UMA porção-base: `kcal`, `protein_g`,
 *    `carbs_g`, `fat_g` + `base_qty` + `base_unit`. Sem `base_qty`, vale o padrão: 100 para
 *    g/ml (valor "por 100 g") e 1 para unidades (ovo, fatia, colher...).
 *  - `meal_items.macros` e `meal_substitutions.macros` guardam o valor JÁ ESCALADO pela
 *    quantidade prescrita (alimento × quantidade ÷ porção-base), gravado na hora de
 *    adicionar/editar. Por isso toda leitura (editor do coach, portal do aluno, resumos) só
 *    soma esses campos — e o que for "desconhecido" fica `undefined`/`null`, nunca 0.
 *  - Itens antigos (cópia sem escala) continuam sendo lidos como "total do item".
 *
 * Funções puras (sem I/O) — usadas por repository, UI do coach e portal do aluno.
 */

export type MacroKey = "kcal" | "protein_g" | "carbs_g" | "fat_g";

export type MacrosJson = {
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  base_qty?: number | null;
  base_unit?: string | null;
};

export const MACRO_KEYS: MacroKey[] = ["kcal", "protein_g", "carbs_g", "fat_g"];

const WEIGHT_VOLUME_UNITS = new Set(["g", "ml"]);

function normUnit(unit: string | null | undefined): string {
  return (unit ?? "").trim().toLowerCase();
}

/** Porção-base de um alimento: a declarada em `macros.base_qty`, ou 100 (g/ml) / 1 (unidade). */
export function foodBase(food: { unit: string; macros: MacrosJson }): { qty: number; unit: string } {
  const unit = (food.macros.base_unit ?? food.unit ?? "g").trim() || "g";
  const declared = food.macros.base_qty;
  if (declared != null && Number.isFinite(declared) && declared > 0) return { qty: declared, unit };
  return { qty: WEIGHT_VOLUME_UNITS.has(normUnit(unit)) ? 100 : 1, unit };
}

// ----------------------------------------------------------------------------
// Formatação pt-BR
// ----------------------------------------------------------------------------

const nfCache = new Map<number, Intl.NumberFormat>();

/** Número em pt-BR (vírgula), até `maxDecimals` casas, sem zeros à direita. `—` se ausente. */
export function formatNumber(value: number | null | undefined, maxDecimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  let nf = nfCache.get(maxDecimals);
  if (!nf) {
    nf = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
    nfCache.set(maxDecimals, nf);
  }
  return nf.format(value);
}

export const formatKcal = (v: number | null | undefined) => (v == null ? "—" : `${formatNumber(v, 0)} kcal`);
export const formatGrams = (v: number | null | undefined) => (v == null ? "—" : `${formatNumber(v, 1)} g`);

/** "150 g" / "2 un" — quantidade + unidade com vírgula decimal. `null` sem quantidade. */
export function formatQuantity(quantity: number | null | undefined, unit: string | null | undefined): string | null {
  if (quantity == null) return null;
  const u = unit?.trim();
  return u ? `${formatNumber(quantity, 2)} ${u}` : formatNumber(quantity, 2);
}

/** "por 100 g" / "por 1 un". */
export function formatBase(food: { unit: string; macros: MacrosJson }): string {
  const b = foodBase(food);
  return `por ${formatNumber(b.qty, 2)} ${b.unit}`;
}

/** Texto curto "128 kcal · P 2,5 · C 28,1 · G 0,2" só com o que existe; `null` se nada. */
export function macrosSummaryText(macros: MacrosJson | null | undefined): string | null {
  if (!macros) return null;
  const parts = [
    macros.kcal != null && `${formatNumber(macros.kcal, 0)} kcal`,
    macros.protein_g != null && `P ${formatNumber(macros.protein_g)} g`,
    macros.carbs_g != null && `C ${formatNumber(macros.carbs_g)} g`,
    macros.fat_g != null && `G ${formatNumber(macros.fat_g)} g`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// ----------------------------------------------------------------------------
// Escala por quantidade
// ----------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Macros de `quantity` `unit` do alimento: valor × quantidade ÷ porção-base. Devolve `{}` (tudo
 * desconhecido) se não há quantidade, ou se a unidade do item não é a da porção-base (não dá
 * pra converter sem inventar). Campos que o alimento não tem ficam de fora (nunca 0).
 */
export function scaleFoodMacros(
  food: { unit: string; macros: MacrosJson },
  quantity: number | null | undefined,
  unit: string | null | undefined
): MacrosJson {
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) return {};
  const base = foodBase(food);
  const itemUnit = normUnit(unit) || normUnit(base.unit);
  if (itemUnit !== normUnit(base.unit)) return {};
  const factor = quantity / base.qty;
  const out: MacrosJson = {};
  for (const key of MACRO_KEYS) {
    const v = food.macros[key];
    if (v != null && Number.isFinite(v)) out[key] = key === "kcal" ? Math.round(v * factor) : round1(v * factor);
  }
  return out;
}

/** Lê "150 g", "2 un", "1,5 colher" de um texto livre (substituições) -> número + unidade. */
export function parseQuantityText(text: string | null | undefined): { quantity: number; unit: string | null } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([^\d\s][^\d]*)?$/.exec(text ?? "");
  if (!m) return null;
  const quantity = Number(m[1].replace(",", "."));
  if (!Number.isFinite(quantity)) return null;
  return { quantity, unit: m[2]?.trim() || null };
}

// ----------------------------------------------------------------------------
// Somas
// ----------------------------------------------------------------------------

export type KnownTotals = Record<MacroKey, number | null>;

/** Soma macros; um campo só vira número se ALGUM item o tem (senão fica `null` = "—"). */
export function sumKnownMacros(items: { macros: MacrosJson | null | undefined }[]): KnownTotals {
  const totals: KnownTotals = { kcal: null, protein_g: null, carbs_g: null, fat_g: null };
  for (const item of items) {
    for (const key of MACRO_KEYS) {
      const v = item.macros?.[key];
      if (v != null && Number.isFinite(v)) totals[key] = (totals[key] ?? 0) + v;
    }
  }
  return totals;
}

/** Quantos itens não têm kcal (para avisar "total parcial"). */
export function countItemsMissingKcal(items: { macros: MacrosJson | null | undefined }[]): number {
  return items.filter((i) => i.macros?.kcal == null).length;
}
