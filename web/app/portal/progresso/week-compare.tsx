"use client";

import { useState } from "react";
import type { CheckinPhoto } from "@/lib/storage/checkin-photos";
import { CHECKIN_PHOTO_ANGLES, isLegacyPhotoAngle, PHOTO_ANGLE_SHORT_LABEL, type PhotoAngle } from "@/lib/storage/photo-angles";
import { coverageLabel, suggestShortcuts } from "@/lib/evolution-compare";
import { selectClass } from "@/components/ui/field";
import {
  ANGLE_LABEL,
  ANGLE_PHRASE,
  COMPARISON_ANGLES,
  defaultComparisonAngle,
  selectableAngles,
  formatMetricDelta,
  formatMetricValue,
  metricDefs,
  metricDelta,
  type ComparisonWeek,
} from "@/lib/week-comparison-format";
import { PhotoImage } from "@/app/coach/alunos/[id]/photo-triptych";
import CompareSlider, { type SideView } from "@/app/coach/alunos/[id]/avaliacao/compare-slider";
import { weekPeriodLabel, weekRange } from "./week-label";

type Mode = "side" | "slider" | "all";

/**
 * Comparação de fotos (V3 tarefa 12) — primeiro conteúdo da área Progresso. Parte da semana MAIS
 * RECENTE com foto comparada com a primeira; o aluno troca qualquer uma das duas semanas, a
 * posição (Frente / Lateral esquerda / Lateral direita / Costas; a lateral de registro antigo só
 * aparece se alguma das semanas tem) e o modo (lado a lado ou deslizar, reaproveitando o quadro
 * com slider da avaliação do coach). Cada lado é de UMA semana, rotulada "Semana N · dd/mm–dd/mm";
 * a foto só aparece se `week_number` e posição baterem — nunca a lateral antiga no lugar de
 * esquerda/direita. Abaixo, as medidas das duas semanas com a diferença numérica crua.
 */
/** Cobertura em forma curta para caber no select em 390px ("2/4 fotos+"). */
function shortCoverage(angles: Parameters<typeof coverageLabel>[0]): string {
  return coverageLabel(angles)
    .replace(/^(\d) de 4 posições/, "$1/4 fotos")
    .replace(/^4 posições/, "4/4 fotos")
    .replace(/ \+ antiga$/, "+");
}

export default function WeekCompare({
  weeks,
  photos,
}: {
  /** Semanas COM FOTO, ascendente (pelo menos 2). */
  weeks: ComparisonWeek[];
  photos: CheckinPhoto[];
}) {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const [fromWeek, setFromWeek] = useState(first.weekNumber);
  const [toWeek, setToWeek] = useState(last.weekNumber);
  const [userAngle, setUserAngle] = useState<PhotoAngle | null>(null);
  const [mode, setMode] = useState<Mode>("side");

  const from = weeks.find((w) => w.weekNumber === fromWeek) ?? first;
  const to = weeks.find((w) => w.weekNumber === toWeek) ?? last;
  const shown = [from, to];
  const sameWeek = from.weekNumber === to.weekNumber;

  const inEither = (a: PhotoAngle) => shown.some((w) => w.photoAngles.includes(a));
  const angleOptions = selectableAngles(shown);
  const angle = userAngle && inEither(userAngle) ? userAngle : defaultComparisonAngle(shown);
  const anyPhoto = COMPARISON_ANGLES.some(inEither);

  const defs = metricDefs(true).filter((d) => shown.some((w) => w.metrics[d.key] != null));

  const photoOf = (week: ComparisonWeek) => photos.find((p) => p.week_number === week.weekNumber && p.angle === angle);
  const missingText = (week: ComparisonWeek) => `Sem foto ${ANGLE_PHRASE[angle]} na semana ${week.weekNumber}`;

  function sideView(week: ComparisonWeek): SideView {
    const photo = photoOf(week);
    if (photo?.url) return { kind: "photo", url: photo.url, alt: `${ANGLE_LABEL[angle]} — ${weekPeriodLabel(week)}` };
    return { kind: "message", text: photo ? "Foto indisponível" : missingText(week) };
  }

  function sideFigure(week: ComparisonWeek, role: string) {
    const photo = photoOf(week);
    return (
      <figure className="flex min-w-0 flex-col gap-2">
        <figcaption className="flex flex-col text-xs leading-snug">
          <span className="t-label text-ink-faint">{role}</span>
          <span className="font-semibold text-ink">{weekPeriodLabel(week)}</span>
        </figcaption>
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-line bg-surface-sunken">
          {photo?.url ? (
            <PhotoImage key={photo.url} src={photo.url} alt={`${ANGLE_LABEL[angle]} — ${weekPeriodLabel(week)}`} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-ink-faint">
              {photo ? "Foto indisponível" : missingText(week)}
            </span>
          )}
        </div>
      </figure>
    );
  }

  const weekOptions = weeks.map((w) => (
    <option key={w.weekNumber} value={w.weekNumber}>
      {`S${w.weekNumber} · ${weekRange(w)} · ${shortCoverage(w.photoAngles)}`}
    </option>
  ));

  const shortcuts = suggestShortcuts(weeks.map((w) => w.weekNumber)).map((s) => ({
    label: s.label,
    a: s.from,
    b: s.to,
  }));

  /** Miniatura de uma semana numa posição, para a visão das quatro posições. */
  function thumb(week: ComparisonWeek, a: PhotoAngle) {
    const photo = photos.find((p) => p.week_number === week.weekNumber && p.angle === a);
    return (
      <button
        type="button"
        onClick={() => {
          setUserAngle(a);
          setMode("side");
        }}
        aria-label={`Ver ${ANGLE_LABEL[a].toLowerCase()} em tamanho maior — ${weekPeriodLabel(week)}`}
        className="relative aspect-[3/4] overflow-hidden rounded-md border border-line bg-surface-sunken"
      >
        {photo?.url ? (
          <PhotoImage key={photo.url} src={photo.url} alt={`${ANGLE_LABEL[a]} — ${weekPeriodLabel(week)}`} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[0.65rem] leading-tight text-ink-faint">
            Sem foto
          </span>
        )}
      </button>
    );
  }

  const pill = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
      on ? "border-brand bg-brand-tint text-brand" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="t-label text-ink-faint">Antes</span>
          <select className={selectClass} value={from.weekNumber} onChange={(e) => setFromWeek(Number(e.target.value))}>
            {weekOptions}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="t-label text-ink-faint">Depois</span>
          <select className={selectClass} value={to.weekNumber} onChange={(e) => setToWeek(Number(e.target.value))}>
            {weekOptions}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Atalhos de semanas" className="flex flex-wrap gap-2">
          {shortcuts.map((s) => {
            const on = from.weekNumber === s.a && to.weekNumber === s.b;
            return (
              <button
                key={s.label}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setFromWeek(s.a);
                  setToWeek(s.b);
                }}
                className={pill(on)}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {anyPhoto && !sameWeek && (
          <div role="group" aria-label="Modo de comparação" className="flex gap-1 rounded-full border border-line p-1">
            {(
              [
                { value: "side", label: "Lado a lado" },
                { value: "all", label: "4 posições" },
                { value: "slider", label: "Deslizar" },
              ] as const
            ).map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                onClick={() => setMode(m.value)}
                className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${
                  mode === m.value ? "bg-brand text-on-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {sameWeek && (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
          Escolha duas semanas diferentes para comparar.
        </p>
      )}

      {anyPhoto ? (
        <div className="flex flex-col gap-3">
          {mode !== "all" && (
          <div role="group" aria-label="Posição da foto" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-sunken p-1 sm:grid-cols-4">
            {angleOptions.map((a) => {
              const enabled = inEither(a);
              return (
                <button
                  key={a}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={angle === a}
                  onClick={() => setUserAngle(a)}
                  className={`inline-flex min-h-11 items-center justify-center rounded-md px-2 text-center text-sm font-semibold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isLegacyPhotoAngle(a) ? "col-span-2 sm:col-span-4" : ""
                  } ${angle === a ? "bg-brand text-on-accent" : "text-ink-muted hover:bg-surface-raised hover:text-ink"}`}
                >
                  {ANGLE_LABEL[a]}
                </button>
              );
            })}
          </div>
          )}

          {mode === "all" && !sameWeek ? (
            <div className="flex flex-col gap-2">
              {[from, to].map((w, i) => (
                <div key={w.weekNumber} className="flex flex-col gap-1.5">
                  <p className="text-xs">
                    <span className="t-label text-ink-faint">{i === 0 ? "Antes" : "Depois"}</span>{" "}
                    <span className="font-semibold text-ink">{weekPeriodLabel(w)}</span>
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {CHECKIN_PHOTO_ANGLES.map((a) => (
                      <div key={a} className="flex min-w-0 flex-col gap-1">
                        {thumb(w, a)}
                        <span className="truncate text-center text-[0.65rem] text-ink-faint">{PHOTO_ANGLE_SHORT_LABEL[a]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(from.photoAngles.includes("side") || to.photoAngles.includes("side")) && (
                <p className="text-xs text-ink-faint">
                  A lateral de registro antigo não aparece aqui; veja em “Lado a lado”.
                </p>
              )}
              <p className="text-xs text-ink-faint">Toque numa foto para ver a posição em tamanho maior.</p>
            </div>
          ) : mode === "slider" && !sameWeek ? (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between gap-3 text-xs">
                <span className="font-semibold text-ink">Antes · {weekPeriodLabel(from)}</span>
                <span className="text-right font-semibold text-ink">Depois · {weekPeriodLabel(to)}</span>
              </div>
              <CompareSlider
                ariaLabel={`Comparar ${ANGLE_LABEL[angle].toLowerCase()}: arraste para revelar a semana ${from.weekNumber} sobre a semana ${to.weekNumber}`}
                left={{ weekNumber: from.weekNumber, label: `Semana ${from.weekNumber}`, view: sideView(from) }}
                right={{ weekNumber: to.weekNumber, label: `Semana ${to.weekNumber}`, view: sideView(to) }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sideFigure(from, "Antes")}
              {sideFigure(to, "Depois")}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
          Nenhuma das duas semanas tem foto. Escolha semanas com fotos para comparar a mesma posição.
        </p>
      )}

      {defs.length > 0 && !sameWeek && (
        <details className="group rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            Medidas dessas duas semanas
            <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <table className="w-full border-t border-line text-sm">
            <caption className="sr-only">
              Medidas da semana {from.weekNumber} e da semana {to.weekNumber}
            </caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-left">
                <th scope="col" className="t-label px-3 py-2.5 text-ink-faint">
                  Medida
                </th>
                <th scope="col" className="t-label px-3 py-2.5 text-ink-faint">
                  S{from.weekNumber}
                </th>
                <th scope="col" className="t-label px-3 py-2.5 text-ink-faint">
                  S{to.weekNumber}
                </th>
                <th scope="col" className="t-label px-3 py-2.5 text-ink-faint">
                  Diferença
                </th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => {
                const a = from.metrics[d.key];
                const b = to.metrics[d.key];
                return (
                  <tr key={d.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-3 py-3 text-left font-medium text-ink">
                      {d.label}
                    </th>
                    <td className="px-3 py-3 tabular-nums text-ink-muted">{a != null ? formatMetricValue(d, a) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums text-ink">{b != null ? formatMetricValue(d, b) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums text-ink-muted">
                      {a != null && b != null ? formatMetricDelta(d, metricDelta(a, b)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
