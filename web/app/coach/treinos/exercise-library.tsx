"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { Exercise } from "@/lib/repository";
import { distinctFilterOptions } from "@/lib/workout-builder";
import { Badge, Button, Drawer, EmptyState, Field, Icon, Input, Modal, Select, Textarea } from "@/components/ui";
import {
  importCatalogAction,
  saveExerciseAction,
  setExerciseArchivedAction,
  type TreinosActionState,
} from "./actions";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ERROR_BOX = "rounded-md border border-danger/40 bg-danger-tint px-3 py-2 text-sm text-danger-text";

/** Biblioteca geral de exercícios da conta: busca instantânea, filtros, detalhe e CRUD. */
export default function ExerciseLibrary({ exercises }: { exercises: Exercise[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const options = useMemo(() => distinctFilterOptions(exercises), [exercises]);
  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return exercises.filter(
      (e) =>
        (showArchived || !e.is_archived) &&
        (!category || e.category === category) &&
        (!muscle || e.muscle_group === muscle) &&
        (!equipment || e.equipment === equipment) &&
        (!nq || norm(e.name).includes(nq))
    );
  }, [exercises, q, category, muscle, equipment, showArchived]);

  const selected = exercises.find((e) => e.id === selectedId) ?? null;
  const activeCount = exercises.filter((e) => !e.is_archived).length;
  const hasFilter = q || category || muscle || equipment || showArchived;

  const createModal = (
    <Modal open={creating} onClose={() => setCreating(false)} title="Novo exercício">
      <ExerciseForm onDone={() => setCreating(false)} />
    </Modal>
  );

  if (exercises.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon="workout"
          title="Sua biblioteca de exercícios está vazia"
          text="Importe o catálogo padrão para começar com exercícios prontos (você pode editar ou arquivar qualquer um) ou crie o seu."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ImportCatalogButton />
              <Button variant="secondary" icon="plus" onClick={() => setCreating(true)}>
                Novo exercício
              </Button>
            </div>
          }
        />
        {createModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-helper">
          {activeCount} {activeCount === 1 ? "exercício" : "exercícios"} · {options.categories.length}{" "}
          {options.categories.length === 1 ? "categoria" : "categorias"} · {options.muscleGroups.length}{" "}
          {options.muscleGroups.length === 1 ? "grupo muscular" : "grupos musculares"}
        </p>
        <div className="flex flex-wrap gap-2">
          <ImportCatalogButton compact />
          <Button icon="plus" onClick={() => setCreating(true)}>
            Novo exercício
          </Button>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <Icon name="search" size={18} />
          </span>
          <Input
            type="search"
            aria-label="Buscar exercício por nome"
            placeholder="Buscar exercício por nome…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10"
          />
        </div>
        {/* Cada filtro tem largura mínima para o rótulo inteiro ("Todos os grupos musculares");
            quando não cabem três na linha (tablet com sidebar), a linha quebra. */}
        <div className="flex flex-wrap gap-3 [&>select]:min-w-0 [&>select]:flex-[1_1_15rem]">
          <Select aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {options.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="Grupo muscular" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            <option value="">Todos os grupos musculares</option>
            {options.muscleGroups.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="Equipamento" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            <option value="">Todos os equipamentos</option>
            {options.equipment.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-5"
            />
            Mostrar arquivados
          </label>
          {hasFilter && (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                setQ("");
                setCategory("");
                setMuscle("");
                setEquipment("");
                setShowArchived(false);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      <p className="t-helper" role="status" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon="search" title="Nenhum exercício encontrado" text="Ajuste a busca ou limpe os filtros." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setSelectedId(e.id)}
                className="card flex min-h-11 w-full flex-col gap-2 p-4 text-left transition-colors hover:border-brand"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-ink">{e.name}</span>
                  {e.is_archived && <Badge>Arquivado</Badge>}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone="accent">{e.category}</Badge>
                  {e.muscle_group && <Badge>{e.muscle_group}</Badge>}
                  {e.equipment && <Badge>{e.equipment}</Badge>}
                  {e.is_custom && <Badge tone="info">Personalizado</Badge>}
                </span>
                {(e.video_url || e.instruction) && (
                  <span className="t-helper flex items-center gap-3">
                    {e.instruction && <span>Com instruções</span>}
                    {e.video_url && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="link" size={14} /> Vídeo
                      </span>
                    )}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {createModal}

      <Drawer open={!!selected} onClose={() => setSelectedId(null)} title={selected?.name ?? "Exercício"}>
        {selected && <ExerciseDetail key={selected.id} exercise={selected} />}
      </Drawer>
    </div>
  );
}

function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<TreinosActionState, FormData>(setExerciseArchivedAction, null);

  if (editing) return <ExerciseForm exercise={exercise} onDone={() => setEditing(false)} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="accent">{exercise.category}</Badge>
        {exercise.muscle_group && <Badge>{exercise.muscle_group}</Badge>}
        {exercise.equipment && <Badge>{exercise.equipment}</Badge>}
        <Badge tone={exercise.is_custom ? "info" : "neutral"}>
          {exercise.is_custom ? "Personalizado" : "Catálogo padrão"}
        </Badge>
        {exercise.is_archived && <Badge tone="warning">Arquivado</Badge>}
      </div>

      <section className="flex flex-col gap-1.5">
        <h3 className="t-label">Instruções</h3>
        {exercise.instruction ? (
          <p className="whitespace-pre-line text-sm text-ink">{exercise.instruction}</p>
        ) : (
          <p className="text-sm text-ink-muted">Nenhuma instrução cadastrada.</p>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="t-label">Vídeo demonstrativo</h3>
        {exercise.video_url ? (
          <a
            href={exercise.video_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center gap-2 break-all text-sm text-brand hover:underline"
          >
            <Icon name="link" size={16} /> Abrir vídeo em nova aba
          </a>
        ) : (
          <p className="text-sm text-ink-muted">Nenhum vídeo cadastrado.</p>
        )}
      </section>

      {state?.error && <p className={ERROR_BOX}>{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{state.success}</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <form action={action}>
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <input type="hidden" name="archive" value={exercise.is_archived ? "0" : "1"} />
          <Button type="submit" variant={exercise.is_archived ? "secondary" : "danger"} disabled={pending}>
            {exercise.is_archived ? "Reativar" : "Arquivar"}
          </Button>
        </form>
      </div>
      <p className="t-helper">
        Exercícios em uso em treinos de alunos não são apagados, apenas arquivados — os treinos existentes continuam
        intactos.
      </p>
    </div>
  );
}

function ExerciseForm({ exercise, onDone }: { exercise?: Exercise; onDone: () => void }) {
  const [state, action, pending] = useActionState<TreinosActionState, FormData>(saveExerciseAction, null);

  useEffect(() => {
    if (state?.success) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-3">
      {exercise && <input type="hidden" name="exerciseId" value={exercise.id} />}
      <Field label="Nome">
        <Input name="name" required defaultValue={exercise?.name} />
      </Field>
      <Field label="Categoria">
        <Input name="category" required placeholder="Peito, costas, pernas…" defaultValue={exercise?.category} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Grupo muscular">
          <Input name="muscle_group" placeholder="Peitoral, quadríceps…" defaultValue={exercise?.muscle_group ?? ""} />
        </Field>
        <Field label="Equipamento">
          <Input name="equipment" placeholder="Barra, halteres…" defaultValue={exercise?.equipment ?? ""} />
        </Field>
      </div>
      <Field label="Instruções (opcional)">
        <Textarea name="instruction" rows={3} defaultValue={exercise?.instruction ?? ""} />
      </Field>
      <Field label="Vídeo demonstrativo (URL, opcional)">
        <Input name="video_url" type="url" placeholder="https://…" defaultValue={exercise?.video_url ?? ""} />
      </Field>
      {state?.error && <p className={ERROR_BOX}>{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : exercise ? "Salvar alterações" : "Criar exercício"}
        </Button>
        <Button type="button" variant="tertiary" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ImportCatalogButton({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState<TreinosActionState, FormData>(importCatalogAction, null);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <Button type="submit" variant={compact ? "secondary" : "primary"} icon="plus" disabled={pending}>
        {pending ? "Importando…" : "Importar catálogo padrão"}
      </Button>
      {state?.error && <p className="text-xs text-danger-text">{state.error}</p>}
      {state?.success && <p className="text-xs text-success">{state.success}</p>}
    </form>
  );
}
