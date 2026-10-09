"use client";

import { useCallback, useState } from "react";
import type { CheckinPhoto } from "@/lib/storage/checkin-photos";
import type { PhotoAngle } from "@/lib/storage/buckets";
import {
  ANGLE_LABEL,
  ANGLE_PHRASE,
  COMPARISON_ANGLES,
  comparableWeeks,
  dateShort,
  formatMetricDelta,
  formatMetricValue,
  metricDefs,
  metricDelta,
  weekLabel,
  type ComparisonWeek,
} from "@/lib/week-comparison-format";
import CompareSlider, { type SideView } from "./compare-slider";
import { getWeekPhotosAction } from "./photo-actions";

/** Fotos de UMA semana: o que o servidor entregou (ou o que a última busca devolveu). */
export type WeekPhotosState =
  | { status: "ok"; photos: CheckinPhoto[] }
  | { status: "error"; forbidden: boolean };

type Loaded = { status: "loading" } | (WeekPhotosState & { at: number });

/** A URL assinada vale 600 s; renova antes disso (com folga) quando o coach volta a mexer na tela. */
const STALE_AFTER_MS = 480_000;

const CARD = "rounded-lg border border-line bg-surface p-4 shadow-[var(--surface-raised-shadow)]";
const CONTROL_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Comparação visual entre semanas (item 14): a semana EM AVALIAÇÃO (fixa) contra uma semana
 * comparativa escolhida, com fotos (slider), ângulo e métricas mudando juntos. Estado inteiro no
 * cliente: as semanas e as métricas vêm prontas do servidor (`getWeekComparisonData`); as fotos
 * da semana escolhida vêm sob demanda pela Server Action `getWeekPhotosAction` (URL assinada de
 * curta duração, com checagem de acesso do coach) e ficam em cache por semana.
 *
 * "Nunca misturar semanas": todo lado do quadro, legenda e coluna de métrica é resolvido a partir
 * de UM número de semana; a foto só é exibida se `photo.week_number` for exatamente essa semana.
 */
export default function WeekComparison({
  clientId,
  currentWeek,
  weeks,
  adherenceIsScale,
  initialCompareWeek,
  initialPhotos,
}: {
  clientId: string;
  currentWeek: number;
  /** Todas as semanas do aluno até a semana avaliada (inclui a atual), em ordem crescente. */
  weeks: ComparisonWeek[];
  adherenceIsScale: boolean;
  /** Semana comparativa inicial (já validada no servidor); `null` = não há semana anterior. */
  initialCompareWeek: number | null;
  /** Fotos já assinadas pelo servidor (semana atual e comparativa inicial), por número de semana. */
  initialPhotos: Record<number, WeekPhotosState>;
}) {
  const [compareWeek, setCompareWeek] = useState<number | null>(initialCompareWeek);
  const [userAngle, setUserAngle] = useState<PhotoAngle | null>(null);
  const [photoStates, setPhotoStates] = useState<Record<number, Loaded>>(() => {
    // `at: 0` só aqui: as URLs do servidor nasceram agora; a renovação por idade só olha o que
    // foi buscado depois (o servidor não manda relógio) e, na prática, quem fica 10 min parado e
    // volta a mexer na tela recebe a renovação silenciosa no primeiro clique.
    const initial: Record<number, Loaded> = {};
    for (const [week, state] of Object.entries(initialPhotos)) {
      initial[Number(week)] = { ...state, at: 0 };
    }
    return initial;
  });
  const [mountedAt] = useState(() => Date.now());

  // `load`/`ensurePhotos` são efetivamente handlers (só rodam a partir de clique/troca de semana
  // ou de dentro do efeito abaixo, nunca durante o render) — por isso `Date.now()` aqui é seguro,
  // mas o analisador de pureza do React 19 só reconhece isso quando a função nasce de
  // `useCallback`/`useEffect` (não de uma function declaration solta no corpo do componente).
  // Ver react-hooks/purity: https://react.dev/reference/rules/components-and-hooks-must-be-pure
  const load = useCallback(
    async (week: number, silent: boolean) => {
      if (!silent) setPhotoStates((s) => ({ ...s, [week]: { status: "loading" } }));
      let next: Loaded;
      try {
        const result = await getWeekPhotosAction(clientId, week);
        next = result.ok
          ? { status: "ok", photos: result.photos, at: Date.now() }
          : { status: "error", forbidden: result.reason === "forbidden", at: Date.now() };
      } catch {
        next = { status: "error", forbidden: false, at: Date.now() };
      }
      setPhotoStates((s) => {
        // Renovação silenciosa que falhou não derruba fotos que já estavam na tela.
        if (silent && next.status === "error" && s[week]?.status === "ok") return s;
        return { ...s, [week]: next };
      });
    },
    [clientId]
  );

  /** Busca (ou renova) as fotos das semanas que a tela vai mostrar; só as que têm alguma foto. */
  const ensurePhotos = useCallback(
    (targets: ComparisonWeek[]) => {
      for (const week of targets) {
        if (week.photoAngles.length === 0) continue;
        const state = photoStates[week.weekNumber];
        if (!state || (state.status === "error" && !state.forbidden)) {
          void load(week.weekNumber, false);
        } else if (state.status === "ok" && Date.now() - (state.at || mountedAt) > STALE_AFTER_MS) {
          void load(week.weekNumber, true);
        }
      }
    },
    [photoStates, load, mountedAt]
  );

  const currentOrNull = weeks.find((w) => w.weekNumber === currentWeek) ?? null;
  const options = comparableWeeks(weeks, currentWeek);

  if (!currentOrNull || options.length === 0) {
    return (
      <section aria-label="Comparação entre semanas" className={`${CARD} flex flex-col gap-2`}>
        <h2 className="text-lg font-medium text-ink">Comparação entre semanas</h2>
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          Esta é a primeira semana com registro do aluno — ainda não há com o que comparar. Quando
          houver outra semana, você poderá ver as fotos e as métricas lado a lado aqui.
        </p>
      </section>
    );
  }

  const current: ComparisonWeek = currentOrNull;
  const compare = options.find((w) => w.weekNumber === compareWeek) ?? options[options.length - 1];
  const previousWeek = options[options.length - 1];
  const firstWeek = options[0];

  // Ângulo: a escolha do coach vale se existir foto nele em alguma das duas semanas; senão o
  // primeiro ângulo que tem foto nas DUAS semanas, depois o primeiro que tem em alguma.
  const has = (week: ComparisonWeek, angle: PhotoAngle) => week.photoAngles.includes(angle);
  const inEither = (angle: PhotoAngle) => has(current, angle) || has(compare, angle);
  const inBoth = (angle: PhotoAngle) => has(current, angle) && has(compare, angle);
  const fallbackAngle =
    COMPARISON_ANGLES.find(inBoth) ?? COMPARISON_ANGLES.find(inEither) ?? COMPARISON_ANGLES[0];
  const angle = userAngle && inEither(userAngle) ? userAngle : fallbackAngle;
  const anyPhoto = COMPARISON_ANGLES.some(inEither);

  function selectWeek(weekNumber: number) {
    const target = options.find((w) => w.weekNumber === weekNumber);
    if (!target) return;
    setCompareWeek(weekNumber);
    // Link direto/refresh: o servidor valida o parâmetro e ignora valor inválido.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("comparar", String(weekNumber));
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // sem History API: só não atualiza a URL.
    }
    ensurePhotos([target, current]);
  }

  function selectAngle(next: PhotoAngle) {
    setUserAngle(next);
    ensurePhotos([compare, current]);
  }

  const phrase = (week: ComparisonWeek) => `Sem foto ${phraseFor(angle)} na semana ${week.weekNumber}`;

  function sideView(week: ComparisonWeek): SideView {
    if (!has(week, angle)) return { kind: "message", text: phrase(week) };
    const state = photoStates[week.weekNumber];
    if (!state || state.status === "loading") {
      return { kind: "loading", text: `Carregando foto da semana ${week.weekNumber}…` };
    }
    if (state.status === "error") {
      return {
        kind: "message",
        text: state.forbidden
          ? `Sem acesso às fotos da semana ${week.weekNumber}`
          : `Fotos da semana ${week.weekNumber} indisponíveis`,
      };
    }
    // Só a foto DESTA semana e DESTE ângulo — nunca outra.
    const photo = state.photos.find((p) => p.week_number === week.weekNumber && p.angle === angle);
    if (!photo) return { kind: "message", text: phrase(week) };
    if (!photo.url) return { kind: "message", text: "Foto indisponível" };
    return { kind: "photo", url: photo.url, alt: `${ANGLE_LABEL[angle]} — semana ${week.weekNumber}` };
  }

  const failedWeeks = [compare, current].filter((w) => {
    const state = photoStates[w.weekNumber];
    return w.photoAngles.length > 0 && state?.status === "error" && !state.forbidden;
  });
  const loadingWeeks = [compare, current].filter(
    (w) => w.photoAngles.length > 0 && (!photoStates[w.weekNumber] || photoStates[w.weekNumber]?.status === "loading")
  );

  const partialAngles = COMPARISON_ANGLES.filter((a) => inEither(a) && !inBoth(a));

  return (
    <section
      aria-label="Comparação entre semanas"
      className={`${CARD} flex flex-col gap-4`}
      data-compare-week={compare.weekNumber}
      data-current-week={current.weekNumber}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-ink">Comparação entre semanas</h2>
        <p className="text-sm text-ink-muted">
          A semana em avaliação fica fixa; escolha com qual semana comparar. Fotos e métricas
          acompanham a mesma escolha.
        </p>
      </div>

      {/* Controles: semana comparativa + ângulo. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-mono text-label uppercase tracking-wide text-ink-faint">Semana atual</span>
          <p className="flex min-h-11 items-center rounded-md border border-line bg-surface-sunken px-3 text-sm text-ink">
            {weekLabel(current)}
            <span className="ml-2 text-xs text-brand">em avaliação</span>
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="compare-week" className="font-mono text-label uppercase tracking-wide text-ink-faint">
            Comparar com
          </label>
          <select
            id="compare-week"
            value={compare.weekNumber}
            onChange={(e) => selectWeek(Number(e.target.value))}
            className="min-h-11 w-full rounded-md border border-line bg-surface-sunken px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {[...options].reverse().map((w) => (
              <option key={w.weekNumber} value={w.weekNumber}>
                {weekLabel(w)} · {photoCount(w)}
                {w.hasCheckin ? "" : " · sem check-in"}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de semana comparativa">
            <button
              type="button"
              onClick={() => selectWeek(previousWeek.weekNumber)}
              aria-pressed={compare.weekNumber === previousWeek.weekNumber}
              className={`${CONTROL_BASE} ${
                compare.weekNumber === previousWeek.weekNumber
                  ? "border-brand bg-brand-tint text-brand"
                  : "border-line text-ink hover:border-line-strong"
              }`}
            >
              Semana anterior
            </button>
            <button
              type="button"
              onClick={() => selectWeek(firstWeek.weekNumber)}
              aria-pressed={compare.weekNumber === firstWeek.weekNumber}
              className={`${CONTROL_BASE} ${
                compare.weekNumber === firstWeek.weekNumber
                  ? "border-brand bg-brand-tint text-brand"
                  : "border-line text-ink hover:border-line-strong"
              }`}
            >
              Primeira semana
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        {/* Fotos */}
        <div className="flex min-w-0 flex-col gap-3">
          <div role="group" aria-label="Ângulo da foto" className="grid grid-cols-3 gap-2">
            {COMPARISON_ANGLES.map((a) => {
              const enabled = inEither(a);
              const partial = enabled && !inBoth(a);
              return (
                <button
                  key={a}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={angle === a}
                  onClick={() => selectAngle(a)}
                  className={`${CONTROL_BASE} flex-col gap-0 px-2 leading-tight ${
                    angle === a
                      ? "border-brand bg-brand-tint text-brand"
                      : "border-line text-ink hover:border-line-strong"
                  } disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-60 disabled:hover:border-line`}
                >
                  {ANGLE_LABEL[a]}
                  {!enabled && <span className="text-[0.7rem] font-normal">sem fotos</span>}
                  {partial && <span className="text-[0.7rem] font-normal">em uma semana</span>}
                </button>
              );
            })}
          </div>

          {anyPhoto ? (
            <>
              <CompareSlider
                ariaLabel={`Comparar semana ${compare.weekNumber} com semana ${current.weekNumber}`}
                left={{ weekNumber: compare.weekNumber, label: weekLabel(compare), view: sideView(compare) }}
                right={{ weekNumber: current.weekNumber, label: weekLabel(current), view: sideView(current) }}
              />
              <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3 text-xs">
                <p className="min-w-0 text-left" data-caption="left">
                  <span className="block font-medium text-ink">{weekLabel(compare)}</span>
                  <span className="text-ink-faint">comparativa</span>
                </p>
                <p className="min-w-0 text-right" data-caption="right">
                  <span className="block font-medium text-ink">{weekLabel(current)}</span>
                  <span className="text-ink-faint">atual</span>
                </p>
              </div>
              <p className="mx-auto w-full max-w-md text-xs text-ink-faint">
                Arraste o controle (ou use as setas, Home e End) para revelar a semana{" "}
                {compare.weekNumber} sobre a semana {current.weekNumber}.
              </p>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
              Nenhuma das duas semanas ({weekLabel(compare)} e {weekLabel(current)}) tem fotos. As
              métricas ao lado continuam comparando as mesmas semanas.
            </p>
          )}

          {partialAngles.length > 0 && anyPhoto && (
            <p className="text-xs text-ink-faint">
              {partialAngles
                .map((a) => {
                  const only = has(current, a) ? current : compare;
                  return `${ANGLE_LABEL[a]}: só a semana ${only.weekNumber} tem foto.`;
                })
                .join(" ")}
            </p>
          )}

          <div role="status" aria-live="polite" className="flex flex-col gap-2 text-sm text-ink-muted empty:hidden">
            {loadingWeeks.length > 0 && (
              <span>Carregando fotos da semana {loadingWeeks.map((w) => w.weekNumber).join(" e ")}…</span>
            )}
            {failedWeeks.map((w) => (
              <span key={w.weekNumber} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink">
                Não foi possível carregar as fotos da semana {w.weekNumber}.
                <button
                  type="button"
                  onClick={() => void load(w.weekNumber, false)}
                  className={`${CONTROL_BASE} border-brand text-brand hover:bg-brand-tint`}
                >
                  Tentar de novo
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Métricas das MESMAS duas semanas */}
        <MetricsPanel
          compare={compare}
          current={current}
          adherenceIsScale={adherenceIsScale}
        />
      </div>
    </section>
  );
}

function phraseFor(angle: PhotoAngle): string {
  return ANGLE_PHRASE[angle];
}

function photoCount(week: ComparisonWeek): string {
  const n = week.photoAngles.length;
  return n === 0 ? "sem fotos" : `${n} ${n === 1 ? "foto" : "fotos"}`;
}

function MetricsPanel({
  compare,
  current,
  adherenceIsScale,
}: {
  compare: ComparisonWeek;
  current: ComparisonWeek;
  adherenceIsScale: boolean;
}) {
  const rows = metricDefs(adherenceIsScale).filter(
    (def) => def.core || compare.metrics[def.key] != null || current.metrics[def.key] != null
  );
  const emptyWeeks = [compare, current].filter((w) => Object.keys(w.metrics).length === 0);

  return (
    <div className="flex min-w-0 flex-col gap-3" data-metrics-compare={`${compare.weekNumber}:${current.weekNumber}`}>
      <h3 className="text-base font-medium text-ink">Métricas das duas semanas</h3>
      <div className="overflow-hidden rounded-lg border border-line bg-surface-sunken">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">
            Métricas da semana {compare.weekNumber} e da semana {current.weekNumber}, com a variação
            numérica entre elas
          </caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-faint">
              <th scope="col" className="w-[26%] px-2 py-2 font-normal sm:px-3">
                Métrica
              </th>
              <WeekHeader week={compare} />
              <WeekHeader week={current} />
              <th scope="col" className="w-[26%] px-2 py-2 text-right font-normal sm:px-3">
                Variação
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((def) => {
              const a = compare.metrics[def.key];
              const b = current.metrics[def.key];
              return (
                <tr key={def.key} className="border-b border-line last:border-b-0" data-metric={def.key}>
                  <th scope="row" className="px-2 py-2.5 align-top font-normal text-ink-muted sm:px-3">
                    {def.label}
                  </th>
                  <td className="px-2 py-2.5 align-top text-ink sm:px-3" data-cell="compare">
                    {a != null ? formatMetricValue(def, a) : <Dash />}
                  </td>
                  <td className="px-2 py-2.5 align-top text-ink sm:px-3" data-cell="current">
                    {b != null ? formatMetricValue(def, b) : <Dash />}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top text-ink sm:px-3" data-cell="delta">
                    {a != null && b != null ? formatMetricDelta(def, metricDelta(a, b)) : <Dash />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">
        Variação = valor da semana {current.weekNumber} menos o da semana {compare.weekNumber}. É só
        a diferença numérica; o que ela significa depende do objetivo do aluno. “—” = sem registro
        naquela semana.
      </p>
      {emptyWeeks.map((w) => (
        <p key={w.weekNumber} className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-muted">
          A semana {w.weekNumber} não tem métricas registradas
          {w.hasCheckin ? " (o check-in não trouxe valores numéricos)" : " (não há check-in enviado nessa semana)"}
          ; por isso a variação aparece como “—”.
        </p>
      ))}
    </div>
  );
}

function WeekHeader({ week }: { week: ComparisonWeek }) {
  return (
    <th scope="col" className="px-2 py-2 font-normal sm:px-3">
      <span className="block font-medium text-ink">Semana {week.weekNumber}</span>
      <span>{dateShort(week.periodStart)}</span>
    </th>
  );
}

function Dash() {
  return (
    <>
      <span aria-hidden className="text-ink-faint">
        —
      </span>
      <span className="sr-only">sem registro</span>
    </>
  );
}
