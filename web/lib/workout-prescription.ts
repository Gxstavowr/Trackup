/**
 * Funções PURAS da prescrição POR SÉRIE e dos SUBSTITUTOS de um exercício do treino
 * (migration `supabase/migrations/0020_per_set_prescription_and_substitutes.sql`).
 *
 * Modelo: o exercício continua com a prescrição uniforme (sets, reps/faixa, carga, RIR,
 * descanso). Linhas de `workout_exercise_sets` são overrides OPCIONAIS por número de série:
 * cada campo nulo cai no valor uniforme. Sem linhas, nada muda. Usado pelo construtor do coach
 * (editor, prévia), pela sessão do aluno (alvo por série, descanso) e pelos Server Actions
 * (normalização antes de gravar). Testes: `lib/workout-prescription.test.ts`.
 */

/** Espelha as colunas editáveis de `workout_exercise_sets` (0020). */
export type SetPrescription = {
  set_number: number;
  reps_min: number | null;
  reps_max: number | null;
  load: number | null;
  rir: number | null;
  rest_sec: number | null;
};

/** Campos uniformes do exercício que a resolução por série consulta. */
export type UniformPrescriptionLike = {
  sets: number | null;
  reps: number | null;
  reps_min: number | null;
  reps_max: number | null;
  suggested_load: number | null;
  rir: number | null;
  rest_sec: number | null;
  set_prescriptions?: SetPrescription[] | null;
};

/** Alvo efetivo de UMA série. `repsMin === repsMax` = reps fixas. */
export type SetTarget = {
  setNumber: number;
  repsMin: number | null;
  repsMax: number | null;
  load: number | null;
  rir: number | null;
  restSec: number | null;
};

export const MAX_SETS_PER_EXERCISE = 50;

function uniformReps(we: UniformPrescriptionLike): { min: number | null; max: number | null } {
  if (we.reps_min != null || we.reps_max != null) {
    return { min: we.reps_min ?? we.reps_max, max: we.reps_max ?? we.reps_min };
  }
  return { min: we.reps, max: we.reps };
}

function rowFor(we: UniformPrescriptionLike, setNumber: number): SetPrescription | undefined {
  return (we.set_prescriptions ?? []).find((r) => r.set_number === setNumber);
}

/**
 * Alvo da série `setNumber`: cada campo do override por série vence; nulo = valor uniforme.
 * Reps: se o override tem min ou max, a faixa inteira vem dele (um só lado preenchido = fixo).
 */
export function resolveSetTarget(we: UniformPrescriptionLike, setNumber: number): SetTarget {
  const row = rowFor(we, setNumber);
  const uni = uniformReps(we);
  const hasRowReps = row != null && (row.reps_min != null || row.reps_max != null);
  return {
    setNumber,
    repsMin: hasRowReps ? (row!.reps_min ?? row!.reps_max) : uni.min,
    repsMax: hasRowReps ? (row!.reps_max ?? row!.reps_min) : uni.max,
    load: row?.load ?? we.suggested_load,
    rir: row?.rir ?? we.rir,
    restSec: row?.rest_sec ?? we.rest_sec,
  };
}

function setCount(we: UniformPrescriptionLike): number {
  return we.sets != null && we.sets > 0 ? Math.min(we.sets, MAX_SETS_PER_EXERCISE) : 0;
}

function rowHasValue(r: SetPrescription): boolean {
  return r.reps_min != null || r.reps_max != null || r.load != null || r.rir != null || r.rest_sec != null;
}

/** Há override com valor em alguma série dentro de `sets`? (linhas além de `sets` não contam) */
export function hasSetVariation(we: UniformPrescriptionLike): boolean {
  const n = setCount(we);
  return (we.set_prescriptions ?? []).some((r) => r.set_number >= 1 && r.set_number <= n && rowHasValue(r));
}

/** Quais campos têm override em alguma série (para a UI esconder o valor uniforme enganoso). */
export function variedFields(we: UniformPrescriptionLike): { reps: boolean; load: boolean; rir: boolean; rest: boolean } {
  const n = setCount(we);
  const rows = (we.set_prescriptions ?? []).filter((r) => r.set_number >= 1 && r.set_number <= n);
  return {
    reps: rows.some((r) => r.reps_min != null || r.reps_max != null),
    load: rows.some((r) => r.load != null),
    rir: rows.some((r) => r.rir != null),
    rest: rows.some((r) => r.rest_sec != null),
  };
}

const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function formatRepsRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max}`;
  return String(min ?? max);
}

/** "12 × 20 kg" / "8–10 reps" / "20 kg" — só reps e carga (o compacto da lista). */
export function formatSetTargetShort(t: SetTarget): string {
  const reps = formatRepsRange(t.repsMin, t.repsMax);
  if (reps && t.load != null) return `${reps} × ${fmtNum(t.load)} kg`;
  if (reps) return `${reps} reps`;
  if (t.load != null) return `${fmtNum(t.load)} kg`;
  return "—";
}

/**
 * Uma linha por série quando há variação ("1ª 12 × 20 kg", "2ª 10 × 22 kg · RIR 1 · 120 s");
 * `[]` sem variação (aí o resumo uniforme já diz tudo). RIR/descanso só aparecem na linha quando
 * variam entre as séries — senão ficam no resumo uniforme.
 */
export function formatSetTargets(we: UniformPrescriptionLike): string[] {
  if (!hasSetVariation(we)) return [];
  const varied = variedFields(we);
  const out: string[] = [];
  for (let n = 1; n <= setCount(we); n++) {
    const t = resolveSetTarget(we, n);
    const parts = [formatSetTargetShort(t)];
    if (varied.rir && t.rir != null) parts.push(`RIR ${t.rir}`);
    if (varied.rest && t.restSec != null) parts.push(`${t.restSec} s`);
    out.push(`${n}ª ${parts.join(" · ")}`);
  }
  return out;
}

// ============================================================================
// Editor do coach — texto de reps e normalização antes de gravar
// ============================================================================

/** "12" -> 12/12; "8-10" / "8–10" / "8 a 10" -> 8/10; "" -> nulos; inválido -> `null`. */
export function parseRepsText(text: string): { min: number | null; max: number | null } | null {
  const s = text.trim();
  if (!s) return { min: null, max: null };
  const m = /^(\d{1,4})\s*(?:[-–—]|a|até)\s*(\d{1,4})$/i.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a <= b ? { min: a, max: b } : null;
  }
  if (/^\d{1,4}$/.test(s)) {
    const n = Number(s);
    return { min: n, max: n };
  }
  return null;
}

export function repsText(min: number | null, max: number | null): string {
  return formatRepsRange(min, max)?.replace("–", "-") ?? "";
}

/**
 * Valida e normaliza as linhas por série vindas do editor antes de gravar: descarta linhas sem
 * valor e as de número fora de 1..`sets`, ordena e remove número repetido (fica a 1ª). Devolve
 * `{ error }` com mensagem pronta para exibir quando algo é inválido.
 */
export function normalizeSetRows(
  rows: SetPrescription[],
  sets: number | null
): { rows: SetPrescription[] } | { error: string } {
  const limit = sets != null && sets > 0 ? Math.min(sets, MAX_SETS_PER_EXERCISE) : 0;
  const seen = new Set<number>();
  const out: SetPrescription[] = [];
  for (const r of [...rows].sort((a, b) => a.set_number - b.set_number)) {
    if (!Number.isInteger(r.set_number) || r.set_number < 1 || r.set_number > limit) continue;
    if (seen.has(r.set_number) || !rowHasValue(r)) continue;
    const n = r.set_number;
    if ((r.reps_min != null && r.reps_min < 0) || (r.reps_max != null && r.reps_max < 0)) {
      return { error: `Série ${n}: repetições não podem ser negativas.` };
    }
    if (r.reps_min != null && r.reps_max != null && r.reps_max < r.reps_min) {
      return { error: `Série ${n}: a repetição máxima não pode ser menor que a mínima.` };
    }
    if (r.load != null && (r.load < 0 || r.load > 10000)) return { error: `Série ${n}: carga inválida.` };
    if (r.rir != null && (r.rir < 0 || r.rir > 10)) return { error: `Série ${n}: RIR deve estar entre 0 e 10.` };
    if (r.rest_sec != null && (r.rest_sec < 0 || r.rest_sec > 3600)) {
      return { error: `Série ${n}: descanso deve estar entre 0 e 3600 s.` };
    }
    seen.add(n);
    out.push({ ...r });
  }
  return { rows: out };
}

/** Ids dos substitutos em ordem, sem vazio, sem repetido e sem o próprio exercício prescrito. */
export function normalizeSubstituteIds(ids: (string | null | undefined)[], mainExerciseId: string): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!id || id === mainExerciseId || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Payload de `set_workout_exercise_details` para COPIAR as séries e substitutos de um exercício
 * em outro (duplicar exercício no dia). Só os campos da prescrição — nunca ids de linha.
 */
export function copyExerciseDetails(
  sets: SetPrescription[],
  substitutes: { exercise_id: string; sort_order: number }[]
): { sets: SetPrescription[]; substituteIds: string[] } {
  return {
    sets: sets.map((r) => ({
      set_number: r.set_number,
      reps_min: r.reps_min,
      reps_max: r.reps_max,
      load: r.load,
      rir: r.rir,
      rest_sec: r.rest_sec,
    })),
    substituteIds: [...substitutes].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.exercise_id),
  };
}

/**
 * Substitutos efetivos de um exercício: os da tabela nova, em ordem; se ela não tiver nenhum,
 * cai na coluna antiga `substitute_exercise_id` (linha gravada por código anterior à 0020).
 */
export function effectiveSubstituteIds(
  rows: { exercise_id: string; sort_order: number }[],
  legacyId: string | null
): string[] {
  if (rows.length > 0) return [...rows].sort((a, b) => a.sort_order - b.sort_order).map((r) => r.exercise_id);
  return legacyId ? [legacyId] : [];
}
