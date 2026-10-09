"use server";

import { getClient } from "@/lib/repository";
import { listClientPhotos, type CheckinPhoto } from "@/lib/storage/checkin-photos";
import { requireCoach } from "../../../require-coach";

export type WeekPhotosResult =
  | { ok: true; weekNumber: number; photos: CheckinPhoto[] }
  | { ok: false; reason: "forbidden" | "error" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URLs assinadas das fotos de UMA semana do aluno, sob demanda (o comparador troca de semana no
 * cliente, sem recarregar a página). Server Actions são endpoints POST públicos: nada do que
 * chega aqui é confiável. `requireCoach()` valida sessão + role; `getClient` (RLS) some com aluno
 * de outra conta; e `listClientPhotos` repete a checagem estrita de foto (só o coach dono do
 * aluno ou um admin da conta) ANTES de assinar qualquer path — devolve `null` sem acesso, que
 * aqui vira "forbidden" (não distingue "não existe" de "não é seu"). Os paths assinados são sempre
 * os gravados em `photos` que seguem o formato canônico deste aluno; nada vem do cliente além do
 * id do aluno e do número da semana.
 */
export async function getWeekPhotosAction(
  clientId: string,
  weekNumber: number
): Promise<WeekPhotosResult> {
  await requireCoach();
  if (
    typeof clientId !== "string" ||
    !UUID_RE.test(clientId) ||
    !Number.isInteger(weekNumber) ||
    weekNumber < 1 ||
    weekNumber > 1000
  ) {
    return { ok: false, reason: "forbidden" };
  }

  try {
    const client = await getClient(clientId);
    if (!client) return { ok: false, reason: "forbidden" };
    const photos = await listClientPhotos(clientId, { weekNumber });
    if (photos === null) return { ok: false, reason: "forbidden" };
    return { ok: true, weekNumber, photos };
  } catch (err) {
    console.error("Não foi possível carregar as fotos da comparação:", err);
    return { ok: false, reason: "error" };
  }
}
