"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CheckinQuestion } from "@/lib/repository";
import type { CheckinPhoto } from "@/lib/storage/checkin-photos";
import { compressImageToJpeg } from "@/lib/storage/compress-image";
import { buildCheckinSteps, checkAnswer, checkSubmission } from "@/lib/checkin-steps";
import {
  getCheckinPhotosAction,
  saveCheckinDraftAction,
  submitCheckinAction,
  uploadCheckinPhotoAction,
} from "./actions";
import CheckinSent from "./checkin-sent";

// ---------------------------------------------------------------------------------------------
// Fotos (passo 1) — fluxo de storage já verificado (item 5): compressão no navegador + uma
// Server Action por posição, bucket privado, miniaturas por URL assinada gerada no servidor.
// Acrescentado no item 25: reenvio com o mesmo arquivo (sem escolher de novo), erro de rede em
// português e contagem pro resumo da revisão.
// ---------------------------------------------------------------------------------------------

type PhotoAngle = "front" | "back" | "side";

const PHOTO_SLOTS: { angle: PhotoAngle; label: string }[] = [
  { angle: "front", label: "Frente" },
  { angle: "side", label: "Lado" },
  { angle: "back", label: "Costas" },
];

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

function PhotoStep({
  checkinId,
  onSummary,
}: {
  checkinId: string;
  onSummary: (summary: { saved: number; busy: boolean }) => void;
}) {
  const [slots, setSlots] = useState<Record<PhotoAngle, SlotState>>({
    front: EMPTY_SLOT,
    side: EMPTY_SLOT,
    back: EMPTY_SLOT,
  });
  const localUrls = useRef<Partial<Record<PhotoAngle, string>>>({});
  const lastFiles = useRef<Partial<Record<PhotoAngle, File>>>({});

  // Fotos já enviadas antes (recarregou a página / abriu em outro aparelho no meio do check-in).
  useEffect(() => {
    let cancelled = false;
    getCheckinPhotosAction(checkinId)
      .then((photos: CheckinPhoto[]) => {
        if (cancelled) return;
        setSlots((prev) => {
          const next = { ...prev };
          for (const photo of photos) {
            if (photo.url && !next[photo.angle].busy) {
              next[photo.angle] = { preview: photo.url, busy: null, error: null, saved: true, retryable: false };
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
  }, [checkinId]);

  useEffect(() => {
    const urls = localUrls.current;
    return () => {
      for (const url of Object.values(urls)) if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const savedCount = Object.values(slots).filter((s) => s.saved && !s.error).length;
  const anyBusy = Object.values(slots).some((s) => s.busy !== null);
  useEffect(() => {
    onSummary({ saved: savedCount, busy: anyBusy });
  }, [savedCount, anyBusy, onSummary]);

  function patch(angle: PhotoAngle, next: Partial<SlotState>) {
    setSlots((prev) => ({ ...prev, [angle]: { ...prev[angle], ...next } }));
  }

  async function handleFile(angle: PhotoAngle, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      patch(angle, { error: "Escolha um arquivo de imagem." });
      return;
    }
    lastFiles.current[angle] = file;

    patch(angle, { busy: "compressing", error: null });
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

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm text-ink">
        Fotos da semana <span className="text-ink-faint">(opcional)</span>
      </legend>
      <p className="text-sm text-ink-muted">
        Use sempre o mesmo local e a mesma roupa — facilita comparar a sua evolução. Cada foto é
        enviada assim que você escolhe.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {PHOTO_SLOTS.map(({ angle, label }) => {
          const slot = slots[angle];
          return (
            <div key={angle} className="flex min-w-0 flex-col gap-1.5">
              <label
                className={`relative flex aspect-[3/4] min-h-11 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border bg-surface-sunken text-center text-xs text-ink-muted transition-colors focus-within:border-brand hover:border-brand ${
                  slot.error ? "border-coral" : slot.preview ? "border-line" : "border-dashed border-line"
                }`}
              >
                {slot.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada privada (blob: ou Supabase Storage); next/image não serve pra isso.
                  <img
                    src={slot.preview}
                    alt={`Foto ${label.toLowerCase()}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span className="px-2">
                    <span className="block text-2xl leading-none text-ink-faint" aria-hidden>
                      +
                    </span>
                    Adicionar
                  </span>
                )}
                {slot.busy && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1.5 text-[11px] text-white">
                    {slot.busy === "compressing" ? "Otimizando…" : "Enviando…"}
                  </span>
                )}
                {slot.saved && !slot.busy && !slot.error && (
                  <span className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">
                    Enviada
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={slot.busy !== null}
                  aria-label={`Foto ${label.toLowerCase()}`}
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
              <span className="text-center text-xs text-ink-muted">{label}</span>
              {slot.error && (
                <div className="flex flex-col items-center gap-1" role="alert">
                  <span className="text-center text-xs text-coral-text">{slot.error}</span>
                  {slot.retryable && slot.busy === null && (
                    <button
                      type="button"
                      onClick={() => void handleFile(angle, lastFiles.current[angle])}
                      className="min-h-11 rounded-md border border-line px-3 text-xs text-ink transition-colors hover:border-line-strong"
                    >
                      Tentar de novo
                    </button>
                  )}
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
// Rascunho local (por check-in = por aluno + semana). Guarda respostas, passo e se ainda há
// alterações não confirmadas pelo servidor (`dirty`). É o "seguro" contra falha de rede: o que o
// aluno digitou nunca depende do servidor pra sobreviver a um recarregamento.
// ---------------------------------------------------------------------------------------------

type LocalDraft = { answers: Record<string, string>; step: number; dirty: boolean };

const draftKey = (checkinId: string) => `trackly:checkin-draft:${checkinId}`;

function readLocalDraft(checkinId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(checkinId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (!parsed || typeof parsed.answers !== "object" || parsed.answers === null) return null;
    return {
      answers: Object.fromEntries(
        Object.entries(parsed.answers).filter(([, v]) => typeof v === "string")
      ) as Record<string, string>,
      step: Number.isInteger(parsed.step) ? (parsed.step as number) : 0,
      dirty: parsed.dirty === true,
    };
  } catch {
    return null;
  }
}

function writeLocalDraft(checkinId: string, draft: LocalDraft) {
  try {
    window.localStorage.setItem(draftKey(checkinId), JSON.stringify(draft));
  } catch {
    // Sem localStorage (modo privado/cheio): o autosave no servidor continua valendo.
  }
}

function clearLocalDraft(checkinId: string) {
  try {
    window.localStorage.removeItem(draftKey(checkinId));
  } catch {
    // ignore
  }
}

const AUTOSAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 12_000;

type SaveState = "idle" | "saving" | "saved" | "restored" | "error";

const NETWORK_ERROR = "Sem conexão — suas respostas estão salvas neste aparelho.";

// Escala 1-5 (decisão do relatório da tarefa) — cobre bem perguntas do tipo "como foi sua
// semana" sem exigir granularidade de 1-10.
const SCALE_OPTIONS = [1, 2, 3, 4, 5];

const FIELD_INPUT =
  "min-h-12 w-full rounded-md border bg-surface-sunken px-3 py-2 text-base text-ink outline-none focus:border-brand";

/**
 * Formulário GUIADO de check-in do aluno (item 25). As perguntas continuam vindo do template do
 * coach; `buildCheckinSteps` (lib/checkin-steps.ts) as distribui nos passos 1 Peso e fotos ·
 * 2 Alimentação · 3 Treino · 4 Bem-estar (omite os sem pergunta) + Revisão. Um passo por vez,
 * barra de progresso, botões fixos Voltar/Continuar. Autosave: cada mudança vai pro
 * localStorage na hora e, após uma pausa, pro servidor (`saveCheckinDraftAction`, grava em
 * `checkin_answers` enquanto o check-in está pendente — por isso o rascunho também aparece em
 * outro aparelho). Falha de rede/servidor nunca apaga nada: mensagem em português e nova
 * tentativa (automática e manual).
 */
export default function CheckinForm({
  checkinId,
  weekNumber,
  period,
  questions,
  answers: serverAnswers,
}: {
  checkinId: string;
  weekNumber: number;
  /** Linha de contexto (período da semana + até quando fica aberto). */
  period: string;
  questions: CheckinQuestion[];
  answers: Record<string, string>;
}) {
  const steps = useMemo(() => buildCheckinSteps(questions), [questions]);
  const reviewIndex = steps.length; // Revisão vem depois de todos os passos de perguntas
  const totalSteps = steps.length + 1;

  const questionKeys = useMemo(() => new Set(questions.map((q) => q.key)), [questions]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(serverAnswers).filter(([k]) => questionKeys.has(k)))
  );
  const [stepIndex, setStepIndex] = useState<number>(() => {
    // Retomada vinda só do servidor (outro aparelho): primeiro passo com obrigatória em aberto.
    const known = Object.keys(serverAnswers).some((k) => questionKeys.has(k));
    if (!known) return 0;
    const firstOpen = steps.findIndex((s) =>
      s.questions.some((q) => q.required && !(serverAnswers[q.key] ?? "").trim())
    );
    return firstOpen === -1 ? reviewIndex : firstOpen;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>(NETWORK_ERROR);
  const [photoSummary, setPhotoSummary] = useState({ saved: 0, busy: false });
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
            setSaveMessage(`${result.error} As respostas continuam salvas neste aparelho.`);
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
          writeLocalDraft(checkinId, { answers: sent, step: stepRef.current, dirty: false });
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

  // Restaura o rascunho local (sobrevive a recarregar / falha de rede) assim que monta. Se havia
  // alteração ainda não confirmada pelo servidor (`dirty`), ela vence e é reenviada; senão vale o
  // que veio do servidor (que pode ser mais novo, de outro aparelho) e do local só o passo.
  useEffect(() => {
    const local = readLocalDraft(checkinId);
    if (!local) return;
    if (local.dirty) {
      const merged = {
        ...valuesRef.current,
        ...Object.fromEntries(Object.entries(local.answers).filter(([k]) => questionKeys.has(k))),
      };
      valuesRef.current = merged;
      dirtyRef.current = true;
      setValues(merged);
      setSaveState("restored");
      scheduleSave(0);
    } else if (Object.keys(valuesRef.current).length > 0) {
      setSaveState("restored");
    }
    if (local.step >= 0 && local.step <= reviewIndex) {
      stepRef.current = local.step;
      setStepIndex(local.step);
    }
  }, [checkinId, questionKeys, reviewIndex, scheduleSave]);

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
    writeLocalDraft(checkinId, { answers: valuesRef.current, step: clamped, dirty: dirtyRef.current });
    if (dirtyRef.current) scheduleSave(0); // sair do passo salva já, sem esperar a pausa
  }

  function setValue(key: string, value: string) {
    const next = { ...valuesRef.current, [key]: value };
    valuesRef.current = next;
    dirtyRef.current = true;
    setValues(next);
    setSaveState((s) => (s === "saving" ? s : "idle"));
    if (errors[key]) {
      setErrors((prev) => {
        const { [key]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      });
    }
    writeLocalDraft(checkinId, { answers: next, step: stepRef.current, dirty: true });
    scheduleSave(AUTOSAVE_DELAY_MS);
  }

  function validateStep(index: number): boolean {
    const step = steps[index];
    if (!step) return true;
    const found: Record<string, string> = {};
    for (const question of step.questions) {
      const result = checkAnswer(question, values[question.key]);
      if (!result.ok) found[question.key] = result.message;
    }
    setErrors(found);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      requestAnimationFrame(() => document.getElementById(`q-${firstKey}`)?.focus());
      return false;
    }
    return true;
  }

  function handleSubmit() {
    const check = checkSubmission(questions, values);
    if (!check.ok) {
      const at = steps.findIndex((s) => s.questions.some((q) => q.key === check.field));
      setErrors({ [check.field]: check.message.replace(/^.*?: /, "") });
      setSubmitError(check.message);
      if (at >= 0) goToStep(at);
      return;
    }
    if (photoSummary.busy) return;

    setSubmitError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    startSubmit(async () => {
      try {
        const result = await submitCheckinAction(checkinId, values);
        if (result?.error) {
          setSubmitError(result.error);
          if (result.field) {
            const at = steps.findIndex((s) => s.questions.some((q) => q.key === result.field));
            if (at >= 0) goToStep(at);
          }
          return;
        }
        doneRef.current = true;
        clearLocalDraft(checkinId);
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
    <form onSubmit={handleNext} noValidate className="flex flex-col gap-5">
      <p className="-mt-3 text-sm text-ink-muted">{period}</p>

      {/* Progresso */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
            Passo {position} de {totalSteps}
          </span>
          <span
            aria-live="polite"
            className={`min-h-4 text-right text-xs ${saveState === "error" ? "text-warn" : "text-ink-faint"}`}
          >
            {saveText}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso do check-in"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={position}
          aria-valuetext={`Passo ${position} de ${totalSteps}`}
          className="flex gap-1.5"
        >
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-brand" : "bg-line"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl text-ink outline-none"
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
        <div className="flex flex-col gap-5">
          {current.questions.map((question) => {
            const error = errors[question.key];
            const value = values[question.key] ?? "";
            const id = `q-${question.key}`;
            const describedBy = error ? `${id}-error` : undefined;
            return (
              <div key={question.key} className="flex flex-col gap-1.5 text-sm">
                {question.type === "scale" ? (
                  <fieldset className="flex flex-col gap-1.5" aria-describedby={describedBy}>
                    <legend className="text-ink">
                      {question.label}
                      {question.required && <span className="text-coral-text"> *</span>}
                    </legend>
                    <div className="flex gap-2">
                      {SCALE_OPTIONS.map((n) => {
                        const selected = value === String(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            id={n === 1 ? id : undefined}
                            aria-pressed={selected}
                            aria-label={`${n} de 5`}
                            onClick={() => setValue(question.key, selected && !question.required ? "" : String(n))}
                            className={`min-h-12 flex-1 rounded-md border text-base transition-colors ${
                              selected
                                ? "border-brand bg-brand-tint text-brand"
                                : error
                                  ? "border-coral text-ink"
                                  : "border-line text-ink hover:border-line-strong"
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-xs text-ink-faint">
                      Escala de 1 a 5{question.required ? "" : " · toque de novo para limpar"}
                    </span>
                  </fieldset>
                ) : (
                  <label htmlFor={id} className="flex flex-col gap-1.5">
                    <span className="text-ink">
                      {question.label}
                      {question.required && <span className="text-coral-text"> *</span>}
                    </span>
                    {question.type === "number" ? (
                      <div className="relative">
                        <input
                          id={id}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          enterKeyHint="next"
                          value={value}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={describedBy}
                          onChange={(e) => setValue(question.key, e.target.value)}
                          className={`${FIELD_INPUT} ${question.unit ? "pr-14" : ""} ${error ? "border-coral" : "border-line"}`}
                        />
                        {question.unit && (
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-faint">
                            {question.unit}
                          </span>
                        )}
                      </div>
                    ) : (
                      <textarea
                        id={id}
                        value={value}
                        rows={4}
                        maxLength={2000}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy}
                        onChange={(e) => setValue(question.key, e.target.value)}
                        className={`${FIELD_INPUT} ${error ? "border-coral" : "border-line"}`}
                      />
                    )}
                  </label>
                )}
                {error && (
                  <p id={`${id}-error`} role="alert" className="text-xs text-coral-text">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fotos: ficam montadas o tempo todo (não perdem estado ao trocar de passo). */}
      <div className={stepIndex === 0 ? "" : "hidden"}>
        <PhotoStep checkinId={checkinId} onSummary={setPhotoSummary} />
      </div>

      {/* Revisão */}
      {onReview && (
        <div className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <section
              key={step.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg text-ink">{step.title}</h3>
                <button
                  type="button"
                  onClick={() => goToStep(index)}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-brand transition-colors hover:bg-brand-tint"
                >
                  Editar
                </button>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                {step.questions.map((question) => {
                  const raw = (values[question.key] ?? "").trim();
                  const display =
                    raw === ""
                      ? null
                      : question.type === "scale"
                        ? `${raw} de 5`
                        : question.type === "number" && question.unit
                          ? `${raw.replace(".", ",")} ${question.unit}`
                          : question.type === "number"
                            ? raw.replace(".", ",")
                            : raw;
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
                    <dd className={photoSummary.saved > 0 ? "text-ink" : "text-ink-faint"}>
                      {photoSummary.saved > 0
                        ? `${photoSummary.saved} de 3 enviadas`
                        : "Nenhuma foto enviada (opcional)"}
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

      {/* Barra fixa de ações, logo acima das abas do portal. */}
      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-line bg-paper px-4 py-3">
        <div className="flex gap-3">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => goToStep(stepIndex - 1)}
              disabled={submitting}
              className="min-h-12 w-28 shrink-0 rounded-md border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-60"
            >
              Voltar
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || (onReview && photoSummary.busy)}
            className="min-h-12 flex-1 rounded-md bg-brand px-5 py-3 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {onReview
              ? submitting
                ? "Enviando…"
                : photoSummary.busy
                  ? "Aguarde as fotos…"
                  : "Enviar check-in"
              : "Continuar"}
          </button>
        </div>
      </div>
    </form>
  );
}
