import type { WorkoutExercise } from "@/lib/repository";
import { variedFields, type SetPrescription } from "@/lib/workout-prescription";

/**
 * Resumo legível da prescrição: "4 × 8–10 · 60 kg · RIR 2 · descanso 90 s · cadência 3-0-1-0".
 * Cardio: "20 min". Descanso e cadência levam rótulo: sem ele, "90 s" se confunde com a duração
 * de um cardio e "3-0-1-0" não diz nada ao aluno.
 *
 * Com variação por série (0020): o campo que varia sai do resumo ("4 séries variadas") — o
 * detalhe série a série vem de `formatSetTargets` (lib/workout-prescription.ts), que a tela
 * mostra logo abaixo. Assim o resumo nunca exibe um valor uniforme que não vale para todas.
 */
export function formatPrescription(
  we: Pick<
    WorkoutExercise,
    "sets" | "reps" | "reps_min" | "reps_max" | "suggested_load" | "rest_sec" | "rir" | "tempo" | "duration_sec"
  > & { set_prescriptions?: SetPrescription[] | null }
): string[] {
  const varied = variedFields(we);
  const reps = varied.reps
    ? null
    : we.reps_min != null || we.reps_max != null
      ? we.reps_min != null && we.reps_max != null && we.reps_min !== we.reps_max
        ? `${we.reps_min}–${we.reps_max}`
        : String(we.reps_min ?? we.reps_max)
      : we.reps != null
        ? String(we.reps)
        : null;
  const anyVaried = varied.reps || varied.load || varied.rir || varied.rest;
  const setsReps =
    we.sets != null && reps
      ? `${we.sets} × ${reps}`
      : we.sets != null
        ? `${we.sets} séries${anyVaried ? " variadas" : ""}`
        : reps
          ? `${reps} reps`
          : null;
  const duration =
    we.duration_sec != null
      ? we.duration_sec % 60 === 0
        ? `${we.duration_sec / 60} min`
        : `${we.duration_sec} s`
      : null;
  return [
    setsReps,
    duration,
    !varied.load && we.suggested_load != null ? `${we.suggested_load} kg` : null,
    !varied.rir && we.rir != null ? `RIR ${we.rir}` : null,
    !varied.rest && we.rest_sec != null ? `descanso ${we.rest_sec} s` : null,
    we.tempo ? `cadência ${we.tempo}` : null,
  ].filter((x): x is string => !!x);
}
