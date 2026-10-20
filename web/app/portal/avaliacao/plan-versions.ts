import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseModule } from "@/lib/onboarding/module-access";
import { getMyOnboardingStatus } from "@/lib/onboarding/status";
import type {
  NutritionSnap,
  PlanVersion,
  SnapBlockType,
  WorkoutExerciseSnap,
  WorkoutSnap,
} from "@/lib/evolution-plan-changes";

/**
 * Versões PUBLICADAS dos planos do aluno (treino e nutrição), para calcular "o que mudou" entre
 * avaliações (`lib/evolution-plan-changes.ts`). Leitura com a sessão do aluno (RLS): a policy de
 * leitura só libera planos NÃO rascunho; as versões arquivadas (substituídas por uma publicação
 * nova) continuam legíveis, e é isso que dá o histórico. Rascunho nunca entra.
 *
 * Os nomes de exercícios e alimentos vêm do client admin SÓ por id (ids que já passaram pela
 * RLS do plano), mesmo padrão de `getExercisesByIds`/`getFoodsByIds` do repositório quando o
 * visualizador é o aluno. Módulo fora do pacote (`canUseModule`) não é lido: o admin ignora a
 * RLS, então o bloqueio é feito antes. Falhas viram lista vazia (a tela some com a seção em vez
 * de quebrar).
 */

const MAX_VERSIONS = 30;

export type PlanVersions = {
  workout: PlanVersion<WorkoutSnap>[];
  nutrition: PlanVersion<NutritionSnap>[];
  /** Módulos que o aluno pode ver (cardio acompanha o treino). */
  access: { training: boolean; nutrition: boolean };
};

type PlanRow = { id: string; name: string; published_at: string | null; created_at?: string; updated_at?: string };

function stamp(row: PlanRow): string {
  return row.published_at ?? row.created_at ?? row.updated_at ?? new Date(0).toISOString();
}

function logAndEmpty<S>(label: string) {
  return (err: unknown) => {
    console.error(`Avaliação: versões de ${label} indisponíveis:`, err instanceof Error ? err.message : err);
    return [] as PlanVersion<S>[];
  };
}

export async function loadPlanVersions(clientId: string): Promise<PlanVersions> {
  const status = await getMyOnboardingStatus(clientId);
  // Visão de status indisponível (migração 0022 ainda não aplicada) = comportamento anterior ao V5:
  // sem bloqueio por pacote (a própria leitura de planos já depende só da RLS do aluno).
  const access = {
    training: !status.available || canUseModule(status.accessInput, "training"),
    nutrition: !status.available || canUseModule(status.accessInput, "nutrition"),
  };
  const [workout, nutrition] = await Promise.all([
    access.training ? loadWorkoutVersions(clientId).catch(logAndEmpty<WorkoutSnap>("treino")) : [],
    access.nutrition ? loadNutritionVersions(clientId).catch(logAndEmpty<NutritionSnap>("nutrição")) : [],
  ]);
  return { workout, nutrition, access };
}

async function loadWorkoutVersions(clientId: string): Promise<PlanVersion<WorkoutSnap>[]> {
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("workout_plans")
    .select("id, name, published_at, created_at")
    .eq("client_id", clientId)
    .eq("is_template", false)
    .eq("is_draft", false)
    .order("created_at", { ascending: false })
    .limit(MAX_VERSIONS);
  if (error) throw new Error(error.message);
  const rows = (plans ?? []) as PlanRow[];
  if (rows.length === 0) return [];
  const planIds = rows.map((p) => p.id);

  const { data: days, error: daysError } = await supabase
    .from("workout_days")
    .select("id, plan_id, name, sort_order")
    .in("plan_id", planIds)
    .order("sort_order", { ascending: true });
  if (daysError) throw new Error(daysError.message);
  const dayRows = (days ?? []) as { id: string; plan_id: string; name: string }[];
  const dayIds = dayRows.map((d) => d.id);

  type ExRow = {
    day_id: string;
    exercise_id: string;
    sets: number | null;
    reps: number | null;
    reps_min: number | null;
    reps_max: number | null;
    suggested_load: number | null;
    rest_sec: number | null;
    block_type: SnapBlockType | null;
    duration_sec: number | null;
  };
  let exRows: ExRow[] = [];
  if (dayIds.length > 0) {
    const { data, error: exError } = await supabase
      .from("workout_exercises")
      .select("day_id, exercise_id, sets, reps, reps_min, reps_max, suggested_load, rest_sec, block_type, duration_sec, sort_order")
      .in("day_id", dayIds)
      .order("sort_order", { ascending: true });
    if (exError) throw new Error(exError.message);
    exRows = (data ?? []) as ExRow[];
  }

  const names = new Map<string, string>();
  const exerciseIds = [...new Set(exRows.map((e) => e.exercise_id))];
  if (exerciseIds.length > 0) {
    const { data } = await createAdminClient().from("exercises").select("id, name").in("id", exerciseIds);
    for (const e of (data ?? []) as { id: string; name: string }[]) names.set(e.id, e.name);
  }

  const byDay = new Map<string, WorkoutExerciseSnap[]>();
  for (const e of exRows) {
    const list = byDay.get(e.day_id) ?? [];
    list.push({
      exerciseId: e.exercise_id,
      name: names.get(e.exercise_id) ?? "Exercício",
      blockType: e.block_type ?? "normal",
      sets: e.sets,
      repsMin: e.reps_min ?? e.reps,
      repsMax: e.reps_max ?? e.reps,
      load: e.suggested_load == null ? null : Number(e.suggested_load),
      restSec: e.rest_sec,
      durationSec: e.duration_sec,
    });
    byDay.set(e.day_id, list);
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    publishedAt: stamp(p),
    snap: {
      days: dayRows.filter((d) => d.plan_id === p.id).map((d) => ({ name: d.name, exercises: byDay.get(d.id) ?? [] })),
    },
  }));
}

async function loadNutritionVersions(clientId: string): Promise<PlanVersion<NutritionSnap>[]> {
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("nutrition_plans")
    .select("id, name, published_at, updated_at, target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_water_ml")
    .eq("client_id", clientId)
    .eq("is_template", false)
    .eq("is_draft", false)
    .order("updated_at", { ascending: false })
    .limit(MAX_VERSIONS);
  if (error) throw new Error(error.message);
  type NRow = PlanRow & {
    target_kcal: number | null;
    target_protein_g: number | null;
    target_carbs_g: number | null;
    target_fat_g: number | null;
    target_water_ml: number | null;
  };
  const rows = (plans ?? []) as NRow[];
  if (rows.length === 0) return [];

  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("id, plan_id, name, time, day_of_week, sort_order")
    .in("plan_id", rows.map((p) => p.id))
    .order("sort_order", { ascending: true });
  if (mealsError) throw new Error(mealsError.message);
  const mealRows = (meals ?? []) as { id: string; plan_id: string; name: string; time: string | null; day_of_week: number | null }[];

  type ItemRow = { meal_id: string; food_id: string | null; qty: string | null; quantity: number | null; unit: string | null };
  let items: ItemRow[] = [];
  if (mealRows.length > 0) {
    const { data, error: itemsError } = await supabase
      .from("meal_items")
      .select("meal_id, food_id, qty, quantity, unit, sort_order")
      .in("meal_id", mealRows.map((m) => m.id))
      .order("sort_order", { ascending: true });
    if (itemsError) throw new Error(itemsError.message);
    items = (data ?? []) as ItemRow[];
  }

  const foodNames = new Map<string, string>();
  const foodIds = [...new Set(items.map((i) => i.food_id).filter((id): id is string => !!id))];
  if (foodIds.length > 0) {
    const { data } = await createAdminClient().from("foods").select("id, name").in("id", foodIds);
    for (const f of (data ?? []) as { id: string; name: string }[]) foodNames.set(f.id, f.name);
  }

  const itemsByMeal = new Map<string, NutritionSnap["meals"][number]["items"]>();
  for (const i of items) {
    if (!i.food_id) continue; // sem alimento da biblioteca não há como comparar o item entre versões
    const qty = i.qty ?? (i.quantity != null ? `${i.quantity}${i.unit ? ` ${i.unit}` : ""}` : null);
    const list = itemsByMeal.get(i.meal_id) ?? [];
    list.push({ key: i.food_id, name: foodNames.get(i.food_id) ?? "Alimento", qty });
    itemsByMeal.set(i.meal_id, list);
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    publishedAt: stamp(p),
    snap: {
      targets: {
        kcal: p.target_kcal,
        proteinG: p.target_protein_g == null ? null : Number(p.target_protein_g),
        carbsG: p.target_carbs_g == null ? null : Number(p.target_carbs_g),
        fatG: p.target_fat_g == null ? null : Number(p.target_fat_g),
        waterMl: p.target_water_ml,
      },
      meals: mealRows
        .filter((m) => m.plan_id === p.id)
        .map((m) => ({ name: m.name, time: m.time, dayOfWeek: m.day_of_week, items: itemsByMeal.get(m.id) ?? [] })),
    },
  }));
}
