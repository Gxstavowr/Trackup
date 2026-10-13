"use client";

import { useState } from "react";
import type { CheckinPhoto } from "@/lib/storage/checkin-photos";
import { Modal } from "@/components/ui/overlay";
import { ANGLE_LABEL, COMPARISON_ANGLES } from "@/lib/week-comparison-format";
import { photoGridClass } from "@/lib/storage/photo-angles";
import { PhotoImage } from "@/app/coach/alunos/[id]/photo-triptych";
import { weekPeriodLabel } from "./week-label";

/**
 * Fotos da única semana com foto — usadas no topo do Progresso quando ainda não há outra semana
 * com foto para comparar (V2 tarefa 26 / V3 tarefa 12). Miniaturas por posição; toque abre a foto maior. Só mostra posições enviadas:
 * até 4 nos check-ins novos (2x2 no celular); a lateral de registro antigo aparece com o próprio
 * rótulo "Lateral (registro anterior)".
 */
export default function LatestPhotos({
  weekNumber,
  periodStart,
  periodEnd,
  photos,
}: {
  weekNumber: number;
  periodStart: string;
  periodEnd: string;
  photos: CheckinPhoto[];
}) {
  const [open, setOpen] = useState<CheckinPhoto | null>(null);
  const shown = COMPARISON_ANGLES.map((a) => photos.find((p) => p.week_number === weekNumber && p.angle === a)).filter(
    (p): p is CheckinPhoto => Boolean(p)
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink">{weekPeriodLabel({ weekNumber, periodStart, periodEnd })}</p>
      <div className={`grid gap-3 ${photoGridClass(shown.length)}`}>
        {shown.map((p) => (
          <figure key={p.id} className="flex min-w-0 flex-col gap-1.5">
            <button
              type="button"
              disabled={!p.url}
              onClick={() => setOpen(p)}
              aria-label={`Ampliar foto ${ANGLE_LABEL[p.angle].toLowerCase()} da semana ${weekNumber}`}
              className="relative aspect-[3/4] overflow-hidden rounded-md border border-line bg-surface-sunken"
            >
              {p.url ? (
                <PhotoImage key={p.url} src={p.url} alt={`${ANGLE_LABEL[p.angle]} — semana ${weekNumber}`} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-ink-faint">
                  Foto indisponível
                </span>
              )}
            </button>
            <figcaption className="text-center text-xs text-ink-faint">{ANGLE_LABEL[p.angle]}</figcaption>
          </figure>
        ))}
      </div>
      <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
        Estas são suas primeiras fotos registradas. A comparação lado a lado fica disponível quando você enviar fotos em outra semana.
      </p>
      <Modal open={open != null} onClose={() => setOpen(null)} title={open ? `${ANGLE_LABEL[open.angle]} — semana ${weekNumber}` : "Foto"}>
        {open?.url && (
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-md bg-surface-sunken">
            <PhotoImage key={open.url} src={open.url} alt={`${ANGLE_LABEL[open.angle]} — semana ${weekNumber}`} />
          </div>
        )}
      </Modal>
    </div>
  );
}
