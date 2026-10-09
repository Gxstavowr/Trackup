"use client";

import { useActionState, useRef, useState } from "react";
import { compressImageToJpeg } from "@/lib/storage/compress-image";
import { MEAL_STATUS_OPTIONS, type MealLogStatus } from "@/lib/nutrition-session";
import { logMealAction, logMealPhotoAction, type MealLogActionState } from "./actions";

const initialState: MealLogActionState = null;
const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5];
const NETWORK_PHOTO_ERROR = "Sem conexão — tente enviar a foto de novo quando a internet voltar.";

/**
 * Registro de aderência de UMA refeição (item 21): status (done/partial/skipped — a própria
 * aderência), dificuldade opcional (1–5), observação opcional e foto opcional. A foto sobe
 * assim que escolhida (`logMealPhotoAction`, mesmo padrão de `checkin-form.tsx`); o resto só
 * grava quando o aluno aperta "Salvar registro" — evita disparar uma Server Action a cada
 * toque num status.
 */
export default function MealLogForm({
  clientId,
  logDate,
  mealId,
  mealName,
  initialStatus,
  initialDifficulty,
  initialNote,
  initialStoragePath,
  initialPhotoUrl,
}: {
  clientId: string;
  logDate: string;
  mealId: string;
  mealName: string;
  initialStatus: MealLogStatus | null;
  initialDifficulty: number | null;
  initialNote: string;
  initialStoragePath: string | null;
  initialPhotoUrl: string | null;
}) {
  const [state, action, pending] = useActionState(logMealAction, initialState);
  const [status, setStatus] = useState<MealLogStatus | null>(initialStatus);
  const [difficulty, setDifficulty] = useState(initialDifficulty != null ? String(initialDifficulty) : "");
  const [note, setNote] = useState(initialNote);
  const [storagePath, setStoragePath] = useState(initialStoragePath);
  const [photoPreview, setPhotoPreview] = useState(initialPhotoUrl);
  const [photoBusy, setPhotoBusy] = useState<"compressing" | "uploading" | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const localUrl = useRef<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Escolha um arquivo de imagem.");
      return;
    }

    setPhotoError(null);
    setPhotoBusy("compressing");
    try {
      const blob = await compressImageToJpeg(file);

      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
      const local = URL.createObjectURL(blob);
      localUrl.current = local;
      setPhotoPreview(local);
      setPhotoBusy("uploading");

      const formData = new FormData();
      formData.set("clientId", clientId);
      formData.set("mealId", mealId);
      formData.set("logDate", logDate);
      formData.set("file", blob, "meal.jpg");
      const result = await logMealPhotoAction(formData);

      if ("error" in result) {
        setPhotoBusy(null);
        setPhotoError(result.error);
        return;
      }
      setStoragePath(result.storagePath);
      setPhotoPreview(result.url);
      setPhotoBusy(null);
    } catch (err) {
      const network = err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message));
      setPhotoBusy(null);
      setPhotoError(network ? NETWORK_PHOTO_ERROR : err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    }
  }

  return (
    <form action={action} className="flex flex-col gap-3 border-t border-line pt-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="mealId" value={mealId} />
      <input type="hidden" name="mealName" value={mealName} />
      <input type="hidden" name="logDate" value={logDate} />
      <input type="hidden" name="status" value={status ?? ""} />
      <input type="hidden" name="storagePath" value={storagePath ?? ""} />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Como foi ${mealName}`}>
        {MEAL_STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStatus(opt.value)}
            aria-pressed={status === opt.value}
            className={`min-h-11 rounded-full border px-3 text-sm transition-colors ${
              status === opt.value
                ? "border-brand bg-brand-tint text-brand"
                : "border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Dificuldade (opcional)</span>
          <select
            name="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 text-ink outline-none focus:border-brand"
          >
            <option value="">Sem dificuldade</option>
            {DIFFICULTY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
                {n === 1 ? " (fácil)" : n === 5 ? " (muito difícil)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Foto (opcional)</span>
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 text-center text-sm text-ink-muted hover:border-brand">
            {photoBusy === "compressing" ? "Otimizando…" : photoBusy === "uploading" ? "Enviando…" : photoPreview ? "Trocar foto" : "Adicionar foto"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoBusy !== null}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                void handleFile(file);
              }}
            />
          </label>
        </div>
      </div>

      {photoPreview && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada privada (blob: ou Storage); next/image não serve pra isso.
        <img
          src={photoPreview}
          alt={`Foto enviada de ${mealName}`}
          className="h-28 w-28 rounded-md border border-line object-cover"
        />
      )}
      {photoError && <p className="text-xs text-coral-text">{photoError}</p>}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observação (opcional)</span>
        <textarea
          name="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Como foi, o que você trocou, dificuldades..."
          className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </label>

      {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !status}
        className="min-h-11 self-start rounded-md bg-brand px-5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Salvando…" : state?.success ? "Salvo ✓" : "Salvar registro"}
      </button>
    </form>
  );
}
