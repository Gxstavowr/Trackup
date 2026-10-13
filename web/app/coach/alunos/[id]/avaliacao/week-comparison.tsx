"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { CheckinPhoto } from "@/lib/storage/checkin-photos";
import { isLegacyPhotoAngle, type PhotoAngle } from "@/lib/storage/photo-angles";
import { Modal } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { selectClass } from "@/components/ui/field";
import {
  ANGLE_LABEL,
  ANGLE_PHRASE,
  COMPARISON_ANGLES,
  comparableWeeks,
  defaultComparisonAngle,
  selectableAngles,
  dateShort,
  formatMetricDelta,
  formatMetricValue,
  metricDefs,
  metricDelta,
  noComparisonMessage,
  weekLabel,
  type ComparisonWeek,
  type MetricDef,
} from "@/lib/week-comparison-format";
import CompareSlider, { type SideView } from "./compare-slider";
import { getWeekPhotosAction } from "./photo-actions";
import { PhotoImage } from "../photo-triptych";
import { buttonClass } from "@/components/ui/button";

/** Fotos de UMA semana: o que o servidor entregou (ou o que a última busca devolveu). */
export type WeekPhotosState =
  | { status: "ok"; photos: CheckinPhoto[] }
  | { status: "error"; forbidden: boolean };

type Loaded = { status: "loading" } | (WeekPhotosState & { at: number });

/** A URL assinada vale 600 s; renova antes disso (com folga) quando o coach volta a mexer na tela. */
const STALE_AFTER_MS = 480_000;

const SEGMENT_BASE =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
const SEGMENT_ON = "bg-brand text-on-accent";
const SEGMENT_OFF = "text-ink-muted hover:bg-surface-raised hover:text-ink";

type ViewMode = "side" | "slider";

/** AAAA-MM-DDTHH... -> dd/mm no fuso do Brasil (a data em que a foto foi enviada). */
function uploadedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Comparação visual entre semanas (item 14 do V1; tarefa 13 do V2): a semana EM FOCO (fixa) contra
 * uma semana comparativa escolhida. Foto, período e métricas de cada lado vêm de UM número de
 * semana. Dois modos: lado a lado (padrão — cada foto grande, com as métricas daquela semana logo
 * abaixo) e slider (uma única moldura que revela uma semana sobre a outra).
 *
 * Estado inteiro no cliente: as semanas e as métricas vêm prontas do servidor
 * (`getWeekComparisonData`); as fotos da semana escolhida vêm sob demanda pela Server Action
 * `getWeekPhotosAction` (URL assinada de curta duração, com checagem de acesso do coach) e ficam em
 * cache por semana.
 *
 * "Nunca misturar semanas": todo lado do quadro, legenda e bloco de métricas é resolvido a partir
 * de UM número de semana; a foto só é exibida se `photo.week_number` for exatamente essa semana.
 *
 * `context`: "evaluation" (página da avaliação; a semana em foco é a que está sendo avaliada) ou
 * "photos" (aba Fotos do aluno; a semana em foco é a mais recente com fotos).
 */
export default function WeekComparison({
  clientId,
  currentWeek,
  weeks,
  adherenceIsScale,
  initialCompareWeek,
  initialPhotos,
  context = "evaluation",
  currentLabel,
  heading,
  panelMetrics = true,
}: {
  clientId: string;
  currentWeek: number;
  /** Todas as semanas do aluno até a semana em foco (inclui a atual), em ordem crescente. */
  weeks: ComparisonWeek[];
  adherenceIsScale: boolean;
  /** Semana comparativa inicial (já validada no servidor); `null` = não há semana anterior. */
  initialCompareWeek: number | null;
  /** Fotos já assinadas pelo servidor (semana atual e comparativa inicial), por número de semana. */
  initialPhotos: Record<number, WeekPhotosState>;
  context?: "evaluation" | "photos";
  /** Rótulo da semana em foco na avaliação (reflete a situação real do ciclo). */
  currentLabel?: string;
  /** Título/descrição próprios do quadro (padrão: os de `context`). */
  heading?: { title: string; text: string };
  /**
   * Mostrar os valores de cada semana sob a foto (padrão). `false`: só as VARIAÇÕES entre as duas
   * semanas — a avaliação já mostra os valores da semana atual na área "Recebido nesta semana".
   */
  panelMetrics?: boolean;
}) {
  const [compareWeek, setCompareWeek] = useState<number | null>(initialCompareWeek);
  const [userAngle, setUserAngle] = useState<PhotoAngle | null>(null);
  const [mode, setMode] = useState<ViewMode>("side");
  const [zoom, setZoom] = useState<{ url: string; alt: string; label: string } | null>(null);
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

  // `load`/`ensurePhotos` são efetivamente handlers (só rodam a partir de clique/troca de semana,
  // nunca durante o render) — por isso `Date.now()` aqui é seguro, mas o analisador de pureza do
  // React 19 só reconhece isso quando a função nasce de `useCallback`/`useEffect`.
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
  const currentTag = context === "evaluation" ? (currentLabel ?? "Em avaliação") : "Mais recente";

  if (!currentOrNull) {
    return (
      <Shell context={context} heading={heading}>
        <EmptyState
          icon="info"
          title="Comparação indisponível"
          text="Não encontramos dados desta semana para comparar."
        />
      </Shell>
    );
  }

  const current: ComparisonWeek = currentOrNull;
  const hasOptions = options.length > 0;
  const compare: ComparisonWeek | null = hasOptions
    ? (options.find((w) => w.weekNumber === compareWeek) ?? options[options.length - 1])
    : null;
  const previousWeek = hasOptions ? options[options.length - 1] : null;
  const firstWeek = hasOptions ? options[0] : null;

  // Ângulo: a escolha do coach vale se existir foto nele em alguma das semanas mostradas; senão o
  // primeiro ângulo que tem foto nas DUAS semanas, depois o primeiro que tem em alguma. Cada
  // posição só se compara com ela mesma: a lateral antiga (`side`) é uma opção própria e nunca é
  // pareada com a lateral esquerda/direita dos check-ins novos.
  const shown = compare ? [current, compare] : [current];
  const has = (week: ComparisonWeek, angle: PhotoAngle) => week.photoAngles.includes(angle);
  const inEither = (angle: PhotoAngle) => shown.some((w) => has(w, angle));
  const inBoth = (angle: PhotoAngle) => shown.every((w) => has(w, angle));
  const fallbackAngle = defaultComparisonAngle(shown);
  const angleOptions = selectableAngles(shown);
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
    ensurePhotos(compare ? [compare, current] : [current]);
  }

  const phrase = (week: ComparisonWeek) => `Sem foto ${ANGLE_PHRASE[angle]} na semana ${week.weekNumber}`;

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

  function uploadDate(week: ComparisonWeek): string | null {
    const state = photoStates[week.weekNumber];
    if (!state || state.status !== "ok") return null;
    const photo = state.photos.find((p) => p.week_number === week.weekNumber && p.angle === angle);
    return photo ? uploadedOn(photo.created_at) : null;
  }

  const failedWeeks = shown.filter((w) => {
    const state = photoStates[w.weekNumber];
    return w.photoAngles.length > 0 && state?.status === "error" && !state.forbidden;
  });
  const loadingWeeks = shown.filter(
    (w) => w.photoAngles.length > 0 && (!photoStates[w.weekNumber] || photoStates[w.weekNumber]?.status === "loading")
  );
  const partialAngles = compare ? COMPARISON_ANGLES.filter((a) => inEither(a) && !inBoth(a)) : [];

  const defs = metricDefs(adherenceIsScale).filter(
    (def) => def.core || shown.some((w) => w.metrics[def.key] != null)
  );

  const panelFor = (week: ComparisonWeek, tag: string, withPhoto: boolean) => (
    <WeekPanel
      key={week.weekNumber}
      week={week}
      tag={tag}
      defs={defs}
      emphasis={week.weekNumber === current.weekNumber}
      showMetrics={panelMetrics}
      view={withPhoto ? sideView(week) : null}
      uploadedAt={withPhoto ? uploadDate(week) : null}
      onZoom={(url, alt) => setZoom({ url, alt, label: `${weekLabel(week)} · ${ANGLE_LABEL[angle]}` })}
    />
  );

  return (
    <Shell context={context} heading={heading}>
      <div data-compare-week={compare?.weekNumber ?? ""} data-current-week={current.weekNumber} className="flex flex-col gap-4">
        {/* Controles: semana comparativa + modo + ângulo. */}
        {compare && previousWeek && firstWeek && (
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="compare-week" className="t-label text-ink-faint">
                Comparar a semana {current.weekNumber} com
              </label>
              <select
                id="compare-week"
                value={compare.weekNumber}
                onChange={(e) => selectWeek(Number(e.target.value))}
                className={selectClass}
              >
                {[...options].reverse().map((w) => (
                  <option key={w.weekNumber} value={w.weekNumber}>
                    {weekLabel(w)} · {photoCount(w)}
                    {w.hasCheckin ? "" : " · sem check-in"}
                  </option>
                ))}
              </select>
            </div>
            <div role="group" aria-label="Atalhos de semana comparativa" className="flex flex-wrap gap-2">
              <ShortcutButton
                active={compare.weekNumber === previousWeek.weekNumber}
                onClick={() => selectWeek(previousWeek.weekNumber)}
              >
                Anterior
              </ShortcutButton>
              <ShortcutButton
                active={compare.weekNumber === firstWeek.weekNumber}
                onClick={() => selectWeek(firstWeek.weekNumber)}
              >
                Primeira
              </ShortcutButton>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Ângulo da foto" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-sunken p-1 sm:grid-cols-4">
            {angleOptions.map((a) => {
              const enabled = inEither(a);
              const partial = enabled && !inBoth(a) && compare != null;
              return (
                <button
                  key={a}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={angle === a}
                  onClick={() => selectAngle(a)}
                  title={!enabled ? "Sem fotos nesta posição" : partial ? "Só uma das semanas tem foto" : undefined}
                  className={`${SEGMENT_BASE} flex-col gap-0 leading-tight ${
                    isLegacyPhotoAngle(a) ? "col-span-2 sm:col-span-4" : ""
                  } ${angle === a ? SEGMENT_ON : SEGMENT_OFF}`}
                >
                  {ANGLE_LABEL[a]}
                  {!enabled && <span className="text-xs font-normal">sem fotos</span>}
                  {partial && <span className="text-xs font-normal">em uma semana</span>}
                </button>
              );
            })}
          </div>
          {compare && (
            <div role="group" aria-label="Modo de comparação" className="flex gap-1 rounded-lg border border-line bg-surface-sunken p-1">
              <button
                type="button"
                aria-pressed={mode === "side"}
                onClick={() => setMode("side")}
                className={`${SEGMENT_BASE} ${mode === "side" ? SEGMENT_ON : SEGMENT_OFF}`}
              >
                Lado a lado
              </button>
              <button
                type="button"
                aria-pressed={mode === "slider"}
                onClick={() => setMode("slider")}
                className={`${SEGMENT_BASE} ${mode === "slider" ? SEGMENT_ON : SEGMENT_OFF}`}
              >
                Slider
              </button>
            </div>
          )}
        </div>

        {!anyPhoto ? (
          <EmptyState
            icon="camera"
            title="Sem fotos para comparar"
            text={
              compare
                ? `Nem a ${weekLabel(compare)} nem a ${weekLabel(current)} têm fotos. As métricas de cada semana continuam abaixo.`
                : `O aluno não enviou fotos na ${weekLabel(current)}. Quando enviar, elas aparecem aqui.`
            }
          />
        ) : null}

        {anyPhoto && !compare && (
          <div className="mx-auto w-full max-w-sm">{panelFor(current, currentTag, true)}</div>
        )}

        {anyPhoto && compare && mode === "side" && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {panelFor(compare, "Comparativa", true)}
            {panelFor(current, currentTag, true)}
          </div>
        )}

        {anyPhoto && compare && mode === "slider" && (
          <div className="flex flex-col gap-3">
            <CompareSlider
              ariaLabel={`Comparar semana ${compare.weekNumber} com semana ${current.weekNumber}`}
              left={{ weekNumber: compare.weekNumber, label: weekLabel(compare), view: sideView(compare) }}
              right={{ weekNumber: current.weekNumber, label: weekLabel(current), view: sideView(current) }}
            />
            <p className="mx-auto w-full max-w-lg text-xs text-ink-faint">
              Arraste o controle (ou use as setas, Home e End) para revelar a semana {compare.weekNumber} sobre
              a semana {current.weekNumber}.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {panelFor(compare, "Comparativa", false)}
              {panelFor(current, currentTag, false)}
            </div>
          </div>
        )}

        {!anyPhoto && compare && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {panelFor(compare, "Comparativa", false)}
            {panelFor(current, currentTag, false)}
          </div>
        )}
        {!anyPhoto && !compare && <div className="mx-auto w-full max-w-sm">{panelFor(current, currentTag, false)}</div>}

        {!compare && <p className="text-xs text-ink-faint">{noComparisonMessage(current.weekNumber)}</p>}

        {partialAngles.length > 0 && anyPhoto && (
          <p className="text-xs text-ink-faint">
            {partialAngles
              .map((a) => {
                const only = has(current, a) ? current : compare!;
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
                className={buttonClass({ variant: "secondary" })}
              >
                Tentar de novo
              </button>
            </span>
          ))}
        </div>

        {compare && <DeltaStrip compare={compare} current={current} defs={defs} />}
      </div>

      <Modal open={zoom !== null} onClose={() => setZoom(null)} title={zoom?.label ?? "Foto"}>
        {zoom && (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada privada do Supabase Storage.
          <img src={zoom.url} alt={zoom.alt} referrerPolicy="no-referrer" className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-md object-contain" />
        )}
      </Modal>
    </Shell>
  );
}

function Shell({
  context,
  heading,
  children,
}: {
  context: "evaluation" | "photos";
  heading?: { title: string; text: string };
  children: ReactNode;
}) {
  const title = heading?.title ?? (context === "evaluation" ? "Comparação de fotos" : "Comparar semanas");
  return (
    <section aria-label={heading?.title ?? "Comparação de fotos"} className="card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="t-subtitle text-ink">{title}</h2>
        <p className="t-helper">
          {heading?.text ??
            "Cada foto mostra o período e as métricas da própria semana. A semana em foco fica fixa; escolha com qual comparar."}
        </p>
      </div>
      {children}
    </section>
  );
}

function ShortcutButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex-none sm:px-5 ${
        active ? "border-brand bg-brand-tint text-brand" : "border-line text-ink hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}

function photoCount(week: ComparisonWeek): string {
  const n = week.photoAngles.length;
  return n === 0 ? "sem fotos" : `${n} ${n === 1 ? "foto" : "fotos"}`;
}

/** Um lado da comparação: período, foto (opcional) e as métricas DAQUELA semana. */
function WeekPanel({
  week,
  tag,
  defs,
  emphasis,
  showMetrics,
  view,
  uploadedAt,
  onZoom,
}: {
  week: ComparisonWeek;
  tag: string;
  defs: MetricDef[];
  emphasis: boolean;
  showMetrics: boolean;
  view: SideView | null;
  uploadedAt: string | null;
  onZoom: (url: string, alt: string) => void;
}) {
  return (
    <article
      className="flex min-w-0 flex-col gap-2"
      data-week-panel={week.weekNumber}
      aria-label={`${weekLabel(week)}, ${tag}`}
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-display text-base leading-tight text-ink" data-week-title>
            Semana {week.weekNumber}
          </h3>
          <Badge tone={emphasis ? "accent" : "neutral"}>{tag}</Badge>
        </div>
        <p className="text-xs text-ink-muted" data-week-period>
          {dateShort(week.periodStart)} a {dateShort(week.periodEnd)}
          {uploadedAt ? ` · foto enviada em ${uploadedAt}` : ""}
        </p>
      </header>

      {view && (
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-line bg-surface-sunken">
          {view.kind === "photo" ? (
            <>
              <PhotoImage key={view.url} src={view.url} alt={view.alt} />
              <button
                type="button"
                onClick={() => onZoom(view.url, view.alt)}
                className="absolute bottom-2 right-2 inline-flex min-h-11 items-center rounded-full bg-paper/85 px-3 text-xs font-semibold text-ink backdrop-blur-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Ampliar
              </button>
            </>
          ) : (
            <span
              className={`absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-ink-muted ${
                view.kind === "loading" ? "motion-safe:animate-pulse" : ""
              }`}
            >
              {view.text}
            </span>
          )}
        </div>
      )}

      {showMetrics ? (
        <WeekMetrics week={week} defs={defs} />
      ) : (
        !week.hasCheckin && <p className="text-xs text-ink-faint">Sem check-in enviado nesta semana.</p>
      )}
    </article>
  );
}

function WeekMetrics({ week, defs }: { week: ComparisonWeek; defs: MetricDef[] }) {
  const none = Object.keys(week.metrics).length === 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-sunken p-3" data-metrics-week={week.weekNumber}>
      <dl className="flex flex-col gap-1">
        {defs.map((def) => {
          const value = week.metrics[def.key];
          const primary = def.key === "weight_kg";
          return (
            <div key={def.key} className="flex items-baseline justify-between gap-2" data-metric={def.key}>
              <dt className="min-w-0 truncate text-xs text-ink-muted">{def.label}</dt>
              <dd
                className={`shrink-0 text-right tabular-nums ${
                  primary && value != null ? "font-display text-base text-brand" : "text-sm text-ink"
                }`}
              >
                {value != null ? (
                  formatMetricValue(def, value)
                ) : (
                  <>
                    <span aria-hidden className="text-ink-faint">
                      —
                    </span>
                    <span className="sr-only">sem registro</span>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {none && (
        <p className="text-xs text-ink-faint">
          {week.hasCheckin ? "O check-in desta semana não trouxe valores numéricos." : "Sem check-in enviado nesta semana."}
        </p>
      )}
    </div>
  );
}

/** Diferença numérica entre as DUAS semanas mostradas (atual − comparativa), sem julgamento. */
function DeltaStrip({
  compare,
  current,
  defs,
}: {
  compare: ComparisonWeek;
  current: ComparisonWeek;
  defs: MetricDef[];
}) {
  const key3 = defs.filter((d) => d.core);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3" data-metrics-compare={`${compare.weekNumber}:${current.weekNumber}`}>
      <p className="t-label text-ink-faint">
        Variação: semana {current.weekNumber} menos semana {compare.weekNumber}
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {key3.map((def) => {
          const a = compare.metrics[def.key];
          const b = current.metrics[def.key];
          return (
            <li key={def.key} data-metric={def.key} className="flex items-baseline justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2 sm:flex-col sm:items-start sm:gap-0.5">
              <span className="text-xs text-ink-muted">{def.label}</span>
              <span className="font-display text-base text-ink" data-cell="delta">
                {a != null && b != null ? (
                  formatMetricDelta(def, metricDelta(a, b))
                ) : (
                  <>
                    <span aria-hidden className="text-ink-faint">
                      —
                    </span>
                    <span className="sr-only">sem registro nas duas semanas</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand hover:underline [&::-webkit-details-marker]:hidden">
          Ver todas as métricas lado a lado
        </summary>
        <div className="overflow-hidden rounded-lg border border-line bg-surface-sunken">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">
              Métricas da semana {compare.weekNumber} e da semana {current.weekNumber}, com a variação numérica
              entre elas
            </caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-faint">
                <th scope="col" className="w-[28%] px-2 py-2 font-normal sm:px-3">
                  Métrica
                </th>
                <th scope="col" className="px-2 py-2 font-normal sm:px-3">
                  Sem. {compare.weekNumber}
                </th>
                <th scope="col" className="px-2 py-2 font-normal sm:px-3">
                  Sem. {current.weekNumber}
                </th>
                <th scope="col" className="w-[26%] px-2 py-2 text-right font-normal sm:px-3">
                  Variação
                </th>
              </tr>
            </thead>
            <tbody>
              {defs.map((def) => {
                const a = compare.metrics[def.key];
                const b = current.metrics[def.key];
                return (
                  <tr key={def.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-2 py-2 align-top font-normal text-ink-muted sm:px-3">
                      {def.label}
                    </th>
                    <td className="whitespace-nowrap px-2 py-2 align-top tabular-nums text-ink sm:px-3">{a != null ? formatMetricValue(def, a) : "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top tabular-nums text-ink sm:px-3">{b != null ? formatMetricValue(def, b) : "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular-nums text-ink sm:px-3">
                      {a != null && b != null ? formatMetricDelta(def, metricDelta(a, b)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-xs text-ink-faint">
        É só a diferença numérica entre as duas semanas; o que ela significa depende do objetivo do aluno. “—” = sem
        registro naquela semana.
      </p>
    </div>
  );
}
