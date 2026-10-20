"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CheckinQuestion } from "@/lib/repository";
import type { CheckinPhoto } from "@/lib/storage/checkin-photos";
import {
  CHECKIN_PHOTO_ANGLES,
  PHOTO_ANGLE_LABEL,
  REQUIRED_PHOTO_COUNT,
  isCheckinPhotoAngle,
  type CheckinPhotoAngle,
} from "@/lib/storage/photo-angles";
import { compressImageToJpeg } from "@/lib/storage/compress-image";
import {
  CHECKIN_PHOTOS_FIELD,
  WEIGHT_QUESTION_KEY,
  buildCheckinSteps,
  checkAnswer,
  checkSubmission,
  todayIsoSaoPaulo,
} from "@/lib/checkin-steps";
import {
  DEFAULT_CHECKIN_CONTEXT,
  formatCheckinAnswer,
  isQuestionVisible,
  specForQuestion,
  type CheckinContext,
  type QuestionSpec,
} from "@/lib/checkin-catalog";
import {
  getCheckinPhotosAction,
  saveCheckinDraftAction,
  submitCheckinAction,
  uploadCheckinPhotoAction,
} from "./actions";
import CheckinSent from "./checkin-sent";
import { inputBaseClass } from "@/components/ui/field";
import Icon from "@/components/ui/icon";
import { ProgressRing } from "@/components/viz/progress-ring";
import { StepStrip } from "@/components/viz/step-strip";
import { buttonClass } from "@/components/ui/button";

// ---------------------------------------------------------------------------------------------
// Fotos (passo 1) — fluxo de storage já verificado (item 5): compressão no navegador + uma
// Server Action por posição, bucket privado, miniaturas por URL assinada gerada no servidor.
// Acrescentado no item 25: reenvio com o mesmo arquivo (sem escolher de novo), erro de rede em
// português e contagem pro resumo da revisão. V3: QUATRO fotos obrigatórias (frente, lateral
// esquerda, lateral direita, costas) — posições e rótulos vêm de `lib/storage/photo-angles.ts`.
// O servidor confere as 4 no envio; aqui é só a orientação e o bloqueio antecipado.
// ---------------------------------------------------------------------------------------------

type SlotState = {
  /** URL de exibição: preview local durante o envio, depois a URL assinada do servidor. */
  preview: string | null;
  busy: "compressing" | "uploading" | null;
  error: string | null;
  /** Já existe no servidor (enviada nesta sessão ou numa anterior)? */
  saved: boolean;
  /** Há um arquivo guardado pra reenviar sem escolher de novo. */
  retryable: boolean;
};

const EMPTY_SLOT: SlotState = { preview: null, busy: null, error: null, saved: false, retryable: false };

const NETWORK_PHOTO_ERROR = "Sem conexão. Toque em “Tentar de novo”.";

export type PhotoSummary = {
  saved: number;
  busy: boolean;
  /** Posições sem foto confirmada no servidor e sem envio em andamento (vazias ou com erro). */
  missing: CheckinPhotoAngle[];
};

const photoSlotId = (angle: CheckinPhotoAngle) => `photo-${angle}`;

/** Leva o aluno até a foto que falta (rola até o quadro e foca o seletor de arquivo). */
function focusPhotoSlot(angle: CheckinPhotoAngle) {
  const input = document.getElementById(photoSlotId(angle));
  input?.closest("[data-photo-slot]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  input?.focus({ preventScroll: true });
}

function initialSlots(initialPhotos: CheckinPhoto[]): Record<CheckinPhotoAngle, SlotState> {
  const slots = Object.fromEntries(CHECKIN_PHOTO_ANGLES.map((a) => [a, EMPTY_SLOT])) as Record<
    CheckinPhotoAngle,
    SlotState
  >;
  for (const photo of initialPhotos) {
    if (!isCheckinPhotoAngle(photo.angle) || !photo.url) continue;
    slots[photo.angle] = { preview: photo.url, busy: null, error: null, saved: true, retryable: false };
  }
  return slots;
}

/** Resumo das fotos já salvas no servidor (as 4 posições novas; `side` legado não conta). */
function summarizeInitialPhotos(initialPhotos: CheckinPhoto[]): PhotoSummary {
  const saved = new Set<CheckinPhotoAngle>();
  for (const photo of initialPhotos) {
    if (isCheckinPhotoAngle(photo.angle) && photo.url) saved.add(photo.angle);
  }
  return { saved: saved.size, busy: false, missing: CHECKIN_PHOTO_ANGLES.filter((a) => !saved.has(a)) };
}

function PhotoStep({
  checkinId,
  initialPhotos,
  onSummary,
  highlightMissing,
  refreshToken,
}: {
  checkinId: string;
  /** Fotos já enviadas, vindas da página (servidor): o 1º render já mostra o estado certo. */
  initialPhotos: CheckinPhoto[];
  onSummary: (summary: PhotoSummary) => void;
  /** Depois de uma tentativa de avançar/enviar: marca as posições vazias como obrigatórias. */
  highlightMissing: boolean;
  /** Muda quando o servidor recusou o envio por falta de foto: recarrega o que está salvo. */
  refreshToken: number;
}) {
  const [slots, setSlots] = useState<Record<CheckinPhotoAngle, SlotState>>(() =>
    initialSlots(initialPhotos)
  );
  const localUrls = useRef<Partial<Record<CheckinPhotoAngle, string>>>({});
  const lastFiles = useRef<Partial<Record<CheckinPhotoAngle, File>>>({});

  // As fotos já enviadas antes (recarregou a página / abriu em outro aparelho) chegam pela página
  // (`initialPhotos`). Aqui só recarregamos quando o servidor recusou o envio por falta de foto.
  // Só as 4 posições novas contam; uma lateral antiga (`side`) não preenche nenhum quadro.
  useEffect(() => {
    if (refreshToken === 0) return;
    let cancelled = false;
    getCheckinPhotosAction(checkinId)
      .then((photos: CheckinPhoto[]) => {
        if (cancelled) return;
        setSlots((prev) => {
          const next = { ...prev };
          const onServer = new Set<CheckinPhotoAngle>();
          for (const photo of photos) {
            if (!isCheckinPhotoAngle(photo.angle) || !photo.url) continue;
            onServer.add(photo.angle);
            if (!next[photo.angle].busy) {
              next[photo.angle] = { preview: photo.url, busy: null, error: null, saved: true, retryable: false };
            }
          }
          // Recarga pedida pelo servidor: o que o formulário achava salvo e não está lá volta a vazio.
          for (const angle of CHECKIN_PHOTO_ANGLES) {
            const slot = next[angle];
            if (slot.saved && !slot.busy && !onServer.has(angle)) {
              next[angle] = { ...EMPTY_SLOT, error: "Esta foto não chegou ao servidor. Envie de novo." };
            }
          }
          return next;
        });
      })
      .catch(() => {
        // Sem miniaturas prévias não é fatal — o aluno ainda pode enviar as fotos.
      });
    return () => {
      cancelled = true;
    };
  }, [checkinId, refreshToken]);

  useEffect(() => {
    const urls = localUrls.current;
    return () => {
      for (const url of Object.values(urls)) if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const savedCount = CHECKIN_PHOTO_ANGLES.filter((a) => slots[a].saved && !slots[a].error).length;
  const anyBusy = CHECKIN_PHOTO_ANGLES.some((a) => slots[a].busy !== null);
  const missingKey = CHECKIN_PHOTO_ANGLES.filter(
    (a) => !(slots[a].saved && !slots[a].error) && slots[a].busy === null
  ).join(",");
  useEffect(() => {
    const missing = (missingKey ? missingKey.split(",") : []) as CheckinPhotoAngle[];
    onSummary({ saved: savedCount, busy: anyBusy, missing });
  }, [savedCount, anyBusy, missingKey, onSummary]);

  function patch(angle: CheckinPhotoAngle, next: Partial<SlotState>) {
    setSlots((prev) => ({ ...prev, [angle]: { ...prev[angle], ...next } }));
  }

  async function handleFile(angle: CheckinPhotoAngle, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      patch(angle, { error: "Escolha um arquivo de imagem." });
      return;
    }
    lastFiles.current[angle] = file;

    // Trocar uma foto já enviada: até o novo envio terminar ela não conta como confirmada.
    patch(angle, { busy: "compressing", error: null, saved: false });
    try {
      const blob = await compressImageToJpeg(file);

      const previousLocal = localUrls.current[angle];
      if (previousLocal) URL.revokeObjectURL(previousLocal);
      const local = URL.createObjectURL(blob);
      localUrls.current[angle] = local;
      patch(angle, { preview: local, busy: "uploading" });

      const formData = new FormData();
      formData.set("checkinId", checkinId);
      formData.set("angle", angle);
      formData.set("file", blob, `${angle}.jpg`);
      const result = await uploadCheckinPhotoAction(formData);

      if ("error" in result) {
        patch(angle, { busy: null, error: result.error, retryable: true });
      } else {
        delete lastFiles.current[angle];
        patch(angle, {
          busy: null,
          preview: result.photo.url ?? local,
          error: null,
          saved: true,
          retryable: false,
        });
      }
    } catch (err) {
      const network = err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message));
      patch(angle, {
        busy: null,
        retryable: true,
        error: network
          ? NETWORK_PHOTO_ERROR
          : err instanceof Error
            ? err.message
            : "Não foi possível enviar a foto.",
      });
    }
  }

  const missingCount = missingKey ? missingKey.split(",").length : 0;

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby="photos-help">
      <legend className="flex w-full items-baseline justify-between gap-3 text-base font-semibold text-ink">
        <span>
          Fotos da semana <span className="text-coral-text">*</span>
        </span>
        <span
          aria-live="polite"
          className={`tabular-nums text-xs font-semibold ${
            savedCount === REQUIRED_PHOTO_COUNT ? "text-success" : "text-ink-muted"
          }`}
        >
          {savedCount} de {REQUIRED_PHOTO_COUNT}
        </span>
      </legend>
      <p id="photos-help" className="text-sm text-ink-muted">
        As quatro fotos são obrigatórias. Mesmo local, mesma luz e mesma roupa facilitam comparar a sua
        evolução. Cada foto é enviada assim que você escolhe — toque numa foto enviada para trocar.
      </p>
      {highlightMissing && missingCount > 0 && (
        <p role="alert" className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {missingCount === 1
            ? `Falta 1 foto (${PHOTO_ANGLE_LABEL[missingKey as CheckinPhotoAngle].toLowerCase()}). As quatro são obrigatórias.`
            : `Faltam ${missingCount} de ${REQUIRED_PHOTO_COUNT} fotos. As quatro são obrigatórias.`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {CHECKIN_PHOTO_ANGLES.map((angle) => {
          const label = PHOTO_ANGLE_LABEL[angle];
          const slot = slots[angle];
          const state = slot.error
            ? "error"
            : slot.busy
              ? "busy"
              : slot.saved
                ? "saved"
                : slot.preview
                  ? "preview"
                  : "empty";
          const flagged = highlightMissing && (state === "empty" || state === "preview");
          const statusText =
            state === "error"
              ? "Erro no envio"
              : state === "busy"
                ? slot.busy === "compressing"
                  ? "Otimizando…"
                  : "Enviando…"
                : state === "saved"
                  ? "Enviada"
                  : flagged
                    ? "Foto obrigatória"
                    : "Vazia";
          const statusId = `${photoSlotId(angle)}-status`;
          return (
            <div key={angle} data-photo-slot={angle} className="flex min-w-0 flex-col gap-1.5">
              <label
                className={`relative flex aspect-[3/4] min-h-11 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border bg-surface text-center text-xs text-ink-muted transition-colors focus-within:border-brand focus-within:shadow-[var(--focus-ring)] hover:border-brand ${
                  state === "error" || flagged
                    ? "border-coral"
                    : state === "saved"
                      ? "border-success/60"
                      : state === "empty"
                        ? "border-dashed border-line-strong"
                        : "border-line"
                } ${flagged && state === "empty" ? "border-dashed" : ""}`}
              >
                {slot.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada privada (blob: ou Supabase Storage); next/image não serve pra isso.
                  <img
                    src={slot.preview}
                    alt={`Foto ${label.toLowerCase()}`}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                      state === "busy" ? "opacity-50" : ""
                    }`}
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1.5 px-2">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-brand"
                      aria-hidden
                    >
                      <Icon name="plus" size={20} />
                    </span>
                    <span className="font-medium text-ink">{label}</span>
                  </span>
                )}

                {state === "busy" && (
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-black/75 px-2 pb-2 pt-1.5 text-xs font-medium text-white">
                    {slot.busy === "compressing" ? "Otimizando…" : "Enviando…"}
                    <span className="h-1 overflow-hidden rounded-full bg-white/25" aria-hidden>
                      <span
                        className={`block h-full rounded-full bg-brand transition-all duration-700 ${
                          slot.busy === "compressing" ? "w-1/3" : "w-4/5"
                        }`}
                      />
                    </span>
                  </span>
                )}
                {state === "saved" && (
                  <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-on-accent">
                    <Icon name="check" size={12} />
                    Enviada
                  </span>
                )}
                {(state === "saved" || state === "preview") && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1.5 text-xs font-medium text-white">
                    Toque para trocar
                  </span>
                )}
                <input
                  id={photoSlotId(angle)}
                  type="file"
                  accept="image/*"
                  disabled={slot.busy !== null}
                  aria-label={slot.saved ? `Trocar foto ${label.toLowerCase()}` : `Foto ${label.toLowerCase()} (obrigatória)`}
                  aria-describedby={statusId}
                  aria-invalid={state === "error" || flagged ? true : undefined}
                  data-angle={angle}
                  className="sr-only"
                  onChange={(e) => {
                    const input = e.currentTarget;
                    const file = input.files?.[0];
                    // Permite escolher o mesmo arquivo de novo (retentar após erro).
                    input.value = "";
                    void handleFile(angle, file);
                  }}
                />
              </label>
              <span className="flex flex-col items-center gap-0.5 text-center text-xs">
                <span className="font-medium text-ink-muted">{label}</span>
                <span
                  id={statusId}
                  className={
                    state === "error" || flagged
                      ? "font-medium text-coral-text"
                      : state === "saved"
                        ? "text-success"
                        : "text-ink-faint"
                  }
                >
                  {statusText}
                </span>
              </span>
              {slot.error && (
                <div className="flex flex-col items-center gap-1" role="alert">
                  <span className="text-center text-xs leading-snug text-coral-text">{slot.error}</span>
                  {slot.retryable && slot.busy === null && (
                    <button
                      type="button"
                      onClick={() => void handleFile(angle, lastFiles.current[angle])}
                      className={buttonClass({ variant: "secondary", size: "sm", width: "full" })}
                    >
                      Tentar de novo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => patch(angle, { error: null, retryable: false })}
                    className="min-h-8 px-2 text-xs text-ink-faint underline-offset-2 hover:underline"
                  >
                    Dispensar aviso
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Rascunho: SÓ no servidor (`saveCheckinDraftAction` → `checkin_answers`, protegido por RLS).
// Regra do projeto: dado pessoal/de saúde (peso, medidas, substâncias…) nunca vai para o
// localStorage — nem resposta, nem passo. Versões antigas gravavam o rascunho em
// `trackly:checkin-draft:<id>`; `purgeLegacyLocalDrafts` apaga essas chaves deste aparelho.
// ---------------------------------------------------------------------------------------------

const LEGACY_DRAFT_PREFIX = "trackly:checkin-draft:";

function purgeLegacyLocalDrafts() {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(LEGACY_DRAFT_PREFIX)) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // Sem acesso ao localStorage (modo privado/bloqueado): nada a limpar.
  }
}

const AUTOSAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 12_000;

type SaveState = "idle" | "saving" | "saved" | "restored" | "error";

const NETWORK_ERROR = "Sem conexão — vamos tentar salvar de novo. Não feche esta página.";

// Escala 1-5 (decisão do relatório da tarefa) — cobre bem perguntas do tipo "como foi sua
// semana" sem exigir granularidade de 1-10.
const SCALE_OPTIONS = [1, 2, 3, 4, 5];

/** Entrada suave (fade + leve subida) a cada troca de passo — feedback visual de que avançou. */
function StepFade({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  // O chamador usa `key={stepKey}`: cada passo remonta com `shown=false` e anima até true.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`${className ?? ""} transition-all duration-300 ease-out motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

const FIELD_INPUT = `${inputBaseClass} min-h-12`;

/** Margem de rolagem: um campo focado/rolado nunca fica atrás da barra fixa + abas do portal. */
const SCROLL_MARGIN = {
  scrollMarginTop: "1rem",
  scrollMarginBottom: "calc(var(--portal-nav-h, 4.5rem) + 7rem)",
} as const;

function QuestionTitle({ label, required }: { label: string; required: boolean }) {
  return (
    <>
      {label}
      {required && <span className="text-coral-text"> *</span>}
    </>
  );
}

function HelpText({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <span id={id} className="text-xs font-normal leading-snug text-ink-muted">
      {text}
    </span>
  );
}

/**
 * Um campo do check-in, pelo controle do catálogo (`specForQuestion`): escala 1–5, número com
 * unidade, cartões de escolha (única ou múltipla), Sim/Não, data, texto. Nunca uma escolha como
 * texto livre. `id = q-<key>` fica no primeiro elemento focável (o formulário foca o campo com erro).
 */
function QuestionField({
  question,
  spec,
  value,
  error,
  onChange,
}: {
  question: CheckinQuestion;
  spec: QuestionSpec;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = `q-${question.key}`;
  const helpId = `${id}-help`;
  const describedBy = [spec.help ? helpId : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const legendClass = "text-base font-semibold leading-snug text-ink";

  if (spec.input === "scale") {
    return (
      <fieldset className="flex flex-col gap-3" aria-describedby={describedBy}>
        <legend className={`${legendClass} mb-1`}>
          <QuestionTitle label={question.label} required={question.required} />
        </legend>
        <HelpText id={helpId} text={spec.help} />
        <div className="grid grid-cols-5 gap-2">
          {SCALE_OPTIONS.map((n) => {
            const selected = value === String(n);
            return (
              <button
                key={n}
                type="button"
                id={n === 1 ? id : undefined}
                aria-pressed={selected}
                aria-label={`${n} de 5`}
                onClick={() => onChange(selected && !question.required ? "" : String(n))}
                className={`min-h-14 rounded-md border font-display text-xl font-extrabold tabular-nums transition-all active:scale-95 ${
                  selected
                    ? "border-brand bg-brand text-on-accent shadow-[0_0_0_3px_var(--brand-tint-strong)]"
                    : error
                      ? "border-coral text-ink"
                      : "border-line-control bg-surface-sunken text-ink hover:border-brand"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-ink-faint">
          <span>1 · Baixo</span>
          <span>5 · Alto</span>
        </div>
        {!question.required && value && (
          <span className="text-xs text-ink-faint">Toque de novo na nota para limpar.</span>
        )}
      </fieldset>
    );
  }

  if (spec.input === "choice" || spec.input === "toggle" || spec.input === "multi") {
    const multi = spec.input === "multi";
    const selectedValues = multi ? value.split(",").map((v) => v.trim()).filter(Boolean) : [value];
    const compact = spec.input === "toggle" || (spec.options.length <= 3 && spec.options.every((o) => o.label.length <= 16));
    const toggleOption = (optionValue: string) => {
      if (multi) {
        const set = new Set(selectedValues);
        if (set.has(optionValue)) set.delete(optionValue);
        else set.add(optionValue);
        // Grava na ordem das opções (o servidor normaliza igual).
        onChange(spec.options.map((o) => o.value).filter((v) => set.has(v)).join(","));
      } else {
        onChange(value === optionValue && !question.required ? "" : optionValue);
      }
    };
    return (
      <fieldset className="flex flex-col gap-3" aria-describedby={describedBy}>
        <legend className={`${legendClass} mb-1`}>
          <QuestionTitle label={question.label} required={question.required} />
        </legend>
        <HelpText id={helpId} text={spec.help ?? (multi ? "Marque todas que se aplicam." : undefined)} />
        <div
          className={
            compact
              ? spec.options.length === 2
                ? "grid grid-cols-2 gap-2"
                : // Chips de largura mínima que quebram linha quando não cabem lado a lado
                  // (ex.: "Estimulantes" em 390px), em vez de espremer o texto até a borda.
                  "flex flex-wrap gap-2 [&>button]:min-w-[7.5rem] [&>button]:flex-[1_1_7.5rem]"
              : "grid grid-cols-1 gap-2 sm:grid-cols-2"
          }
        >
          {spec.options.map((option, i) => {
            const selected = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                id={i === 0 ? id : undefined}
                aria-pressed={selected}
                onClick={() => toggleOption(option.value)}
                className={`flex min-h-12 items-center gap-2.5 rounded-md border py-2.5 text-left text-sm font-medium leading-snug transition-all active:scale-[0.98] ${
                  compact ? "justify-center px-4 text-center" : "px-3"
                } ${
                  selected
                    ? "border-brand bg-brand-tint text-ink shadow-[0_0_0_3px_var(--brand-tint-strong)]"
                    : error
                      ? "border-coral bg-surface-sunken text-ink"
                      : "border-line-control bg-surface-sunken text-ink hover:border-brand"
                }`}
              >
                {!compact && (
                  <span
                    aria-hidden
                    className={`flex size-5 shrink-0 items-center justify-center border ${
                      multi ? "rounded" : "rounded-full"
                    } ${selected ? "border-brand bg-brand text-on-accent" : "border-line-strong"}`}
                  >
                    {selected && <Icon name="check" size={12} />}
                  </span>
                )}
                <span className="min-w-0 [overflow-wrap:anywhere]">{option.label}</span>
              </button>
            );
          })}
        </div>
        {!question.required && !multi && value && (
          <span className="text-xs text-ink-faint">Toque de novo na opção para limpar.</span>
        )}
      </fieldset>
    );
  }

  return (
    <label htmlFor={id} className="flex flex-col gap-3">
      <span className="flex flex-col gap-1">
        <span className={legendClass}>
          <QuestionTitle label={question.label} required={question.required} />
        </span>
        <HelpText id={helpId} text={spec.help} />
      </span>
      {spec.input === "number" ? (
        <div className="relative">
          <input
            id={id}
            type="text"
            inputMode={spec.step === 1 ? "numeric" : "decimal"}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="0"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputBaseClass} min-h-16 text-center font-display text-3xl font-extrabold tabular-nums ${
              spec.unit ? "pr-16 pl-16" : ""
            } ${error ? "border-coral" : "border-line-control"}`}
          />
          {spec.unit && (
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-base font-medium text-ink-faint">
              {spec.unit}
            </span>
          )}
        </div>
      ) : spec.input === "date" ? (
        <input
          id={id}
          type="date"
          value={value}
          min="1990-01-01"
          max={todayIsoSaoPaulo()}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_INPUT} ${error ? "border-coral" : "border-line-control"}`}
        />
      ) : (
        <>
          <textarea
            id={id}
            value={value}
            rows={spec.maxLength <= 500 ? 2 : 4}
            maxLength={spec.maxLength}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            className={`${FIELD_INPUT} ${error ? "border-coral" : "border-line-control"}`}
          />
          <span className="text-right text-xs tabular-nums text-ink-faint">
            {value.length}/{spec.maxLength}
          </span>
        </>
      )}
    </label>
  );
}

/**
 * Formulário GUIADO de check-in do aluno (item 25). As perguntas continuam vindo do template do
 * coach; `buildCheckinSteps` (lib/checkin-steps.ts) as distribui nos passos 1 Peso e fotos ·
 * 2 Alimentação · 3 Treino · 4 Bem-estar (omite os sem pergunta) + Revisão. Um passo por vez,
 * barra de progresso, botões fixos Voltar/Continuar. Autosave: após uma pausa (ou ao trocar de
 * passo) cada mudança vai pro servidor (`saveCheckinDraftAction`, grava em `checkin_answers`
 * enquanto o check-in está pendente — por isso o rascunho volta ao recarregar e aparece em outro
 * aparelho). Nada do check-in fica no localStorage (dado de saúde). Falha de rede/servidor nunca
 * apaga o que está na tela: mensagem em português, nova tentativa (automática e manual) e aviso
 * ao sair da página com alteração ainda não salva.
 */
export default function CheckinForm({
  checkinId,
  weekNumber,
  period,
  questions,
  answers: serverAnswers,
  suggestedWorkouts = null,
  context = DEFAULT_CHECKIN_CONTEXT,
  initialPhotos = [],
}: {
  checkinId: string;
  weekNumber: number;
  /** Linha de contexto (período da semana + até quando fica aberto). */
  period: string;
  questions: CheckinQuestion[];
  answers: Record<string, string>;
  /** Sessões de treino concluídas na semana (`workout_sessions`) — sugere "Treinos realizados". */
  suggestedWorkouts?: number | null;
  /** Sexo normalizado do aluno (perguntas condicionais, ex.: ciclo menstrual). */
  context?: CheckinContext;
  /** Fotos da semana já enviadas (carregadas pela página no servidor). */
  initialPhotos?: CheckinPhoto[];
}) {
  const steps = useMemo(() => buildCheckinSteps(questions), [questions]);
  const reviewIndex = steps.length; // Revisão vem depois de todos os passos de perguntas

  const questionKeys = useMemo(() => new Set(questions.map((q) => q.key)), [questions]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial = Object.fromEntries(Object.entries(serverAnswers).filter(([k]) => questionKeys.has(k)));
    // Pré-preenche "Treinos realizados" com as sessões concluídas (só se ainda não respondeu e
    // se for 0 < n). O campo continua editável e o valor gravado é o que o aluno confirmar.
    if (
      suggestedWorkouts && suggestedWorkouts > 0 &&
      questionKeys.has("workouts_count") &&
      !(initial.workouts_count ?? "").trim()
    ) {
      initial.workouts_count = String(suggestedWorkouts);
    }
    return initial;
  });
  // Passo inicial derivado SÓ das props (igual no servidor e no cliente — sem "piscar" outro passo
  // depois da hidratação). Retomando um rascunho: primeiro passo com obrigatória em aberto; tudo
  // respondido → Revisão.
  const hasServerDraft = Object.keys(serverAnswers).some((k) => questionKeys.has(k));
  const [initialPhotoSummary] = useState(() => summarizeInitialPhotos(initialPhotos));
  const [stepIndex, setStepIndex] = useState<number>(() => {
    if (!hasServerDraft) return 0;
    // As 4 fotos também são obrigatórias: faltando alguma, retoma em "Peso e fotos" (passo 0,
    // onde o quadro de fotos aparece) mesmo com todas as perguntas respondidas.
    if (initialPhotoSummary.missing.length > 0) return 0;
    const firstOpen = steps.findIndex((s) =>
      s.questions.some(
        (q) => q.required && isQuestionVisible(q.key, serverAnswers, context) && !(serverAnswers[q.key] ?? "").trim()
      )
    );
    return firstOpen === -1 ? reviewIndex : firstOpen;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>(hasServerDraft ? "restored" : "idle");
  const [saveMessage, setSaveMessage] = useState<string>(NETWORK_ERROR);
  const [photoSummary, setPhotoSummary] = useState<PhotoSummary>(initialPhotoSummary);
  const [photoHighlight, setPhotoHighlight] = useState(false);
  const [photoRefresh, setPhotoRefresh] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const valuesRef = useRef(values);
  const stepRef = useRef(stepIndex);
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstRenderRef = useRef(true);

  const flush = useCallback(async () => {
    if (doneRef.current) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      do {
        queuedRef.current = false;
        const sent = valuesRef.current;
        setSaveState("saving");
        let ok = false;
        try {
          const result = await saveCheckinDraftAction(checkinId, sent);
          if (result.ok) {
            ok = true;
          } else {
            setSaveMessage(`${result.error} Vamos tentar de novo — não feche esta página.`);
          }
        } catch {
          setSaveMessage(NETWORK_ERROR);
        }
        if (!ok) {
          setSaveState("error");
          return;
        }
        if (valuesRef.current === sent) {
          dirtyRef.current = false;
          setSaveState("saved");
        } else {
          queuedRef.current = true; // mudou durante o envio: salva de novo
        }
      } while (queuedRef.current);
    } finally {
      inFlightRef.current = false;
    }
  }, [checkinId]);

  const scheduleSave = useCallback(
    (delay: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, delay);
    },
    [flush]
  );

  // Limpa rascunhos antigos que versões anteriores deixavam no localStorage (respostas de saúde).
  // O rascunho em si já veio do servidor nas props (`answers`), então não há nada a restaurar aqui.
  useEffect(() => {
    purgeLegacyLocalDrafts();
  }, []);

  // Sem cópia local: se houver alteração ainda não confirmada pelo servidor, avisa antes de sair.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current || doneRef.current) return;
      e.preventDefault();
      void flush();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flush]);

  // Tentativa automática enquanto o último salvamento falhou + ao voltar a conexão/aba.
  useEffect(() => {
    if (saveState !== "error") return;
    const t = setTimeout(() => void flush(), RETRY_DELAY_MS);
    return () => clearTimeout(t);
  }, [saveState, flush]);

  useEffect(() => {
    function retryIfDirty() {
      if (dirtyRef.current && !doneRef.current) void flush();
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") retryIfDirty();
    }
    window.addEventListener("online", retryIfDirty);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", retryIfDirty);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [flush]);

  // Ao trocar de passo: rola pro topo e leva o foco pro título (leitor de tela) — exceto na
  // montagem inicial.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    headingRef.current?.focus({ preventScroll: true });
  }, [stepIndex]);

  function goToStep(next: number) {
    const clamped = Math.max(0, Math.min(reviewIndex, next));
    stepRef.current = clamped;
    setStepIndex(clamped);
    setSubmitError(null);
    if (dirtyRef.current) scheduleSave(0); // sair do passo salva já, sem esperar a pausa
  }

  function setValue(key: string, value: string) {
    const next = { ...valuesRef.current, [key]: value };
    valuesRef.current = next;
    dirtyRef.current = true;
    setValues(next);
    setSaveState((s) => (s === "saving" ? s : "idle"));
    // Limpa o erro do campo editado e o de perguntas que essa resposta acabou de ocultar
    // (ex.: "Não fiz cardio" esconde dias/duração).
    const stale = Object.keys(errors).filter((k) => k === key || !isQuestionVisible(k, next, context));
    if (stale.length > 0) {
      setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !stale.includes(k))));
    }
    scheduleSave(AUTOSAVE_DELAY_MS);
  }

  /** Rola até a pergunta e foca o campo (depois da troca de passo, que leva o foco pro título). */
  function focusField(key: string) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(`q-${key}`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.focus({ preventScroll: true });
      })
    );
  }

  /** Mesma coisa para a primeira foto que falta no passo 1. */
  function focusMissingPhoto(angle: CheckinPhotoAngle) {
    requestAnimationFrame(() => requestAnimationFrame(() => focusPhotoSlot(angle)));
  }

  function validateStep(index: number): boolean {
    const step = steps[index];
    if (!step) return true;
    const found: Record<string, string> = {};
    for (const question of step.questions) {
      if (!isQuestionVisible(question.key, values, context)) continue; // oculta: não obrigatória
      const result = checkAnswer(question, values[question.key], context);
      if (!result.ok) found[question.key] = result.message;
    }
    setErrors(found);
    // Passo 1: as quatro fotos são obrigatórias. Uma que ainda está subindo não trava o avanço
    // (o envio final espera por ela); vazia ou com erro, trava.
    const photosMissing = step.id === "body" ? photoSummary.missing : [];
    if (step.id === "body") setPhotoHighlight(photosMissing.length > 0);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`q-${firstKey}`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.focus({ preventScroll: true });
      });
      return false;
    }
    if (photosMissing.length > 0) {
      focusPhotoSlot(photosMissing[0]);
      return false;
    }
    return true;
  }

  function handleSubmit() {
    const check = checkSubmission(questions, values, context);
    // Peso é obrigatório mesmo se (por algum motivo) a pergunta não veio na lista.
    const weightMissing =
      !questions.some((q) => q.key === WEIGHT_QUESTION_KEY) && !(values[WEIGHT_QUESTION_KEY] ?? "").trim();
    const photosMissing = photoSummary.missing;
    const bodyIndex = steps.findIndex((s) => s.id === "body");

    if (!check.ok) {
      const at = steps.findIndex((s) => s.questions.some((q) => q.key === check.field));
      setErrors({ [check.field]: check.message.replace(/^.*?: /, "") });
      if (at === bodyIndex) setPhotoHighlight(photosMissing.length > 0);
      if (at >= 0) goToStep(at);
      setSubmitError(check.message);
      focusField(check.field);
      return;
    }
    if (weightMissing || photosMissing.length > 0) {
      setPhotoHighlight(photosMissing.length > 0);
      goToStep(Math.max(0, bodyIndex));
      setSubmitError(
        weightMissing
          ? "Informe o seu peso para enviar o check-in."
          : `Envie as quatro fotos para enviar o check-in (falta${photosMissing.length === 1 ? "" : "m"} ${photosMissing.length}).`
      );
      if (photosMissing.length > 0) focusMissingPhoto(photosMissing[0]);
      return;
    }
    if (photoSummary.busy) {
      setSubmitError("Aguarde as fotos terminarem de enviar.");
      return;
    }

    setSubmitError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    startSubmit(async () => {
      try {
        // Só as perguntas visíveis vão (o servidor recalcula as condições e descarta o resto).
        const visibleValues = Object.fromEntries(
          Object.entries(values).filter(([key]) => isQuestionVisible(key, values, context))
        );
        const result = await submitCheckinAction(checkinId, visibleValues);
        if (result?.error) {
          if (result.field === CHECKIN_PHOTOS_FIELD) {
            // O servidor não encontrou alguma das 4 fotos: volta ao passo 1 e recarrega o que está salvo.
            goToStep(Math.max(0, steps.findIndex((s) => s.id === "body")));
            setPhotoHighlight(true);
            setPhotoRefresh((n) => n + 1);
          } else if (result.field) {
            const at = steps.findIndex((s) => s.questions.some((q) => q.key === result.field));
            if (at >= 0) goToStep(at);
            setErrors({ [result.field]: result.error.replace(/^.*?: /, "") });
            focusField(result.field);
          }
          setSubmitError(result.error);
          return;
        }
        doneRef.current = true;
        setDone(true);
        window.scrollTo({ top: 0, behavior: "auto" });
      } catch {
        setSubmitError(
          "Não foi possível enviar agora — parece que a conexão caiu. Suas respostas continuam salvas; toque em “Enviar check-in” para tentar de novo."
        );
      }
    });
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (stepIndex === reviewIndex) {
      handleSubmit();
      return;
    }
    if (!validateStep(stepIndex)) return;
    goToStep(stepIndex + 1);
  }

  if (done) {
    return <CheckinSent weekNumber={weekNumber} reviewed={false} />;
  }

  const onReview = stepIndex === reviewIndex;
  const current = steps[stepIndex];
  const position = stepIndex + 1;

  const saveText =
    saveState === "saving"
      ? "Salvando…"
      : saveState === "saved"
        ? "Rascunho salvo"
        : saveState === "restored"
          ? "Rascunho restaurado"
          : saveState === "error"
            ? saveMessage
            : "";

  return (
    <form onSubmit={handleNext} noValidate className="flex flex-col gap-5 [&~*]:mb-[4.5rem]">
      <p className="-mt-3 text-sm text-ink-muted">{period}</p>

      {/* Progresso: anel + faixa de etapas (item 29) */}
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={onReview ? steps.length : stepIndex}
            max={steps.length}
            size={64}
            thickness={7}
            tone={onReview ? "success" : "accent"}
            label="Progresso do check-in"
          >
            {onReview ? (
              <Icon name="check" size={22} strokeWidth={2.6} />
            ) : (
              <span className="font-display text-sm font-extrabold tabular-nums text-ink">
                {position}
                <span className="text-ink-faint">/{steps.length}</span>
              </span>
            )}
          </ProgressRing>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="t-label text-ink-faint">
              {onReview ? "Revisão final" : `Passo ${position} de ${steps.length}`}
            </span>
            <span className="break-words font-display text-base font-extrabold leading-tight text-ink">
              {onReview ? "Tudo respondido" : current.title}
            </span>
            <span
              aria-live="polite"
              className={`min-h-4 text-xs ${saveState === "error" ? "text-warn" : "text-ink-faint"}`}
            >
              {saveText}
            </span>
          </div>
        </div>
        <StepStrip
          label="Etapas do check-in"
          steps={steps.map((st, i) => ({
            key: st.id,
            label: st.title,
            state: onReview || i < stepIndex ? "done" : i === stepIndex ? "current" : "upcoming",
          }))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          style={{ outline: "none" }}
          className="font-display text-[1.625rem] font-extrabold leading-tight text-ink outline-none"
        >
          {onReview ? "Revisar e enviar" : current.title}
        </h2>
        <p className="text-sm text-ink-muted">
          {onReview
            ? "Confira suas respostas. Depois de enviar, o check-in vai para o seu coach e não pode mais ser editado."
            : current.hint}
        </p>
      </div>

      {/* Passos de perguntas */}
      {!onReview && current && (
        <StepFade key={current.id} className="flex flex-col gap-4">
          {current.questions
            .filter((question) => isQuestionVisible(question.key, values, context))
            .map((question) => {
            const error = errors[question.key];
            const value = values[question.key] ?? "";
            const id = `q-${question.key}`;
            const isWorkouts = question.key === "workouts_count" && !!suggestedWorkouts && suggestedWorkouts > 0;
            const prefilled = isWorkouts && value.trim() === String(suggestedWorkouts);
            return (
              <div key={question.key} className="card tk-fade flex flex-col gap-3 p-4 text-sm" style={SCROLL_MARGIN}>
                <QuestionField
                  question={question}
                  spec={specForQuestion(question, context)}
                  value={value}
                  error={error}
                  onChange={(next) => setValue(question.key, next)}
                />
                {prefilled && (
                  <p className="flex items-start gap-1.5 rounded-md bg-success-tint px-3 py-2 text-xs text-ink-muted">
                    <span className="mt-px shrink-0 text-success" aria-hidden>
                      <Icon name="check" size={14} />
                    </span>
                    Preenchido com os {suggestedWorkouts} treinos que você concluiu nesta semana. Ajuste se precisar.
                  </p>
                )}
                {isWorkouts && !prefilled && (
                  <button
                    type="button"
                    onClick={() => setValue(question.key, String(suggestedWorkouts))}
                    className="inline-flex min-h-11 items-center self-start rounded-md border border-success/40 px-3 text-xs font-medium text-success transition-colors hover:bg-success-tint"
                  >
                    Usar {suggestedWorkouts} (treinos concluídos na semana)
                  </button>
                )}
                {error && (
                  <p id={`${id}-error`} role="alert" className="text-xs font-medium text-coral-text">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </StepFade>
      )}

      {/* Fotos: ficam montadas o tempo todo (não perdem estado ao trocar de passo). */}
      <div className={stepIndex === 0 ? "card p-4" : "hidden"}>
        <PhotoStep
          checkinId={checkinId}
          initialPhotos={initialPhotos}
          onSummary={setPhotoSummary}
          highlightMissing={photoHighlight}
          refreshToken={photoRefresh}
        />
      </div>

      {/* Revisão */}
      {onReview && (
        <div className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <section
              key={step.id}
              className="flex flex-col gap-2 card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg text-ink">{step.title}</h3>
                <button
                  type="button"
                  onClick={() => goToStep(index)}
                  className={buttonClass({ variant: "tertiary", size: "sm", className: "text-brand" })}
                >
                  Editar
                </button>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                {step.questions
                  .filter((question) => isQuestionVisible(question.key, values, context))
                  .map((question) => {
                  // Rótulo das opções, unidade, data dd/mm/aaaa — o mesmo formatador da avaliação do coach.
                  const display = formatCheckinAnswer(question, values[question.key]) || null;
                  return (
                    <div key={question.key} className="flex flex-col gap-0.5">
                      <dt className="text-ink-muted">{question.label}</dt>
                      <dd className={display ? "whitespace-pre-wrap break-words text-ink" : "text-ink-faint"}>
                        {display ?? "Sem resposta"}
                      </dd>
                    </div>
                  );
                })}
                {step.id === "body" && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-ink-muted">Fotos</dt>
                    <dd
                      className={
                        photoSummary.saved === REQUIRED_PHOTO_COUNT
                          ? "text-ink"
                          : photoSummary.busy
                            ? "text-ink-muted"
                            : "font-medium text-coral-text"
                      }
                    >
                      {photoSummary.saved === REQUIRED_PHOTO_COUNT
                        ? `${REQUIRED_PHOTO_COUNT} de ${REQUIRED_PHOTO_COUNT} enviadas`
                        : photoSummary.busy
                          ? `${photoSummary.saved} de ${REQUIRED_PHOTO_COUNT} enviadas · enviando…`
                          : `${photoSummary.saved} de ${REQUIRED_PHOTO_COUNT} enviadas — as quatro são obrigatórias`}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          ))}
        </div>
      )}

      {submitError && (
        <p
          role="alert"
          className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text"
        >
          {submitError}
        </p>
      )}

      {/* Barra fixa de ações: acima das abas do portal (altura em --portal-nav-h) + área segura do iOS.
          O espaçador garante que o último campo nunca fique escondido atrás dela; o rodapé legal do
          layout (irmão seguinte do <form> no <main>) ganha margem pela classe `[&~*]:mb-…` do form. */}
      <div aria-hidden className="h-4" />
      <div className="fixed inset-x-0 bottom-[calc(var(--portal-nav-h,4.5rem)+env(safe-area-inset-bottom))] z-20 border-t border-line-strong bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl gap-3 px-4 py-3">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => goToStep(stepIndex - 1)}
              disabled={submitting}
              className={buttonClass({ variant: "secondary", size: "lg", className: "w-24 shrink-0" })}
            >
              Voltar
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || (onReview && photoSummary.busy)}
            className={buttonClass({ size: "lg", className: "min-w-0 flex-1" })}
          >
            {onReview ? (
              submitting ? "Enviando…" : photoSummary.busy ? "Aguarde as fotos…" : "Enviar check-in"
            ) : (
              <>
                Continuar
                <Icon name="arrow-right" size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
