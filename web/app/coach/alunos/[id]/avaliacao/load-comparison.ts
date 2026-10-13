import "server-only";
import { listClientPhotos } from "@/lib/storage/checkin-photos";
import { getWeekComparisonData } from "@/lib/week-comparison";
import { comparableWeeks } from "@/lib/week-comparison-format";
import type { WeekPhotosState } from "./week-comparison";

export type ComparisonData = {
  weeks: Awaited<ReturnType<typeof getWeekComparisonData>>;
  compareWeek: number | null;
  initialPhotos: Record<number, WeekPhotosState>;
};

/**
 * Dados da comparação: semanas do aluno + semana comparativa inicial + fotos (assinadas) da semana
 * em foco e da comparativa. O parâmetro `?comparar=N` só vale se N for uma semana anterior que
 * existe; qualquer outro valor (lixo, semana futura, a própria atual) é ignorado e cai no padrão
 * (semana anterior com registro). Falha aqui não derruba a tela: devolve `null`.
 * Usado pela avaliação e pela aba Fotos do aluno.
 */
export async function loadComparison(
  clientId: string,
  startDate: string | null,
  weekNumber: number,
  param: string | string[] | undefined
): Promise<ComparisonData | null> {
  try {
    const weeks = await getWeekComparisonData({ id: clientId, start_date: startDate }, weekNumber);
    const options = comparableWeeks(weeks, weekNumber);
    const raw = Array.isArray(param) ? param[0] : param;
    const asked = raw !== undefined && /^\d{1,4}$/.test(raw) ? Number(raw) : null;
    const compareWeek =
      asked !== null && options.some((w) => w.weekNumber === asked)
        ? asked
        : (options[options.length - 1]?.weekNumber ?? null);

    const initialPhotos: Record<number, WeekPhotosState> = {};
    const toLoad = [weekNumber, ...(compareWeek !== null ? [compareWeek] : [])];
    await Promise.all(
      toLoad.map(async (w) => {
        const meta = weeks.find((x) => x.weekNumber === w);
        if (!meta || meta.photoAngles.length === 0) {
          initialPhotos[w] = { status: "ok", photos: [] };
          return;
        }
        try {
          const photos = await listClientPhotos(clientId, { weekNumber: w });
          initialPhotos[w] =
            photos === null ? { status: "error", forbidden: true } : { status: "ok", photos };
        } catch (err) {
          console.error("Não foi possível carregar as fotos da comparação:", err);
          initialPhotos[w] = { status: "error", forbidden: false };
        }
      })
    );
    return { weeks, compareWeek, initialPhotos };
  } catch (err) {
    console.error("Não foi possível carregar a comparação entre semanas:", err);
    return null;
  }
}
