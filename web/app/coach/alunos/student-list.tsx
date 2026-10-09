"use client";

import { Fragment, useMemo, useState } from "react";
import { BUTTON_GHOST } from "../avaliacoes/evaluation-ui";
import ClientRow from "./client-row";
import { FilterIcon, SearchIcon } from "./icons";
import {
  DEFAULT_CONTROLS,
  PAYMENT_FILTER_LABEL,
  PAYMENT_FILTER_ORDER,
  TRACKING_FILTER_ORDER,
  TRACKING_LABEL,
  filterAndSort,
  hasActiveFilters,
  type ListControls,
  type SortKey,
  type StudentEntry,
} from "./student-situation";

const CONTROL =
  "min-h-11 w-full rounded-md border border-line bg-surface-sunken px-3 text-sm text-ink outline-none transition-colors focus:border-brand";
const CONTROL_LABEL = "font-mono text-label uppercase tracking-wide text-ink-faint";

const SORT_LABEL: Record<SortKey, string> = {
  urgency: "Necessidade de ação",
  name: "Nome (A–Z)",
  updated: "Última atualização",
};

/**
 * Lista operacional de alunos: busca, filtros (situação do acompanhamento, situação
 * financeira, "só quem precisa de ação") e ordenação — por padrão, por NECESSIDADE DE AÇÃO
 * (mais urgente primeiro). A prioridade não depende só de badge: além da ordem, há divisão em
 * dois blocos ("Precisam da sua ação" / "Sem ação agora"), borda de destaque na linha, o texto
 * "Próxima ação" e o botão principal preenchido.
 */
export default function StudentList({ entries }: { entries: StudentEntry[] }) {
  const [controls, setControls] = useState<ListControls>(DEFAULT_CONTROLS);
  const set = <K extends keyof ListControls>(key: K, value: ListControls[K]) =>
    setControls((c) => ({ ...c, [key]: value }));

  const visible = useMemo(() => filterAndSort(entries, controls), [entries, controls]);
  const needsActionTotal = useMemo(() => entries.filter((e) => e.needsAction).length, [entries]);
  const filtersOn = hasActiveFilters(controls);
  const anyMissingData = entries.some((e) => e.age == null || e.heightCm == null || !e.objective);
  const grouped = controls.sort === "urgency";

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Buscar e filtrar alunos" className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Buscar aluno por nome, e-mail ou objetivo</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={controls.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Buscar por nome, e-mail ou objetivo"
            autoComplete="off"
            className={`${CONTROL} pl-10`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={CONTROL_LABEL}>Acompanhamento</span>
            <select
              value={controls.tracking}
              onChange={(e) => set("tracking", e.target.value as ListControls["tracking"])}
              className={CONTROL}
            >
              <option value="all">Todas</option>
              {TRACKING_FILTER_ORDER.map((state) => (
                <option key={state} value={state}>
                  {TRACKING_LABEL[state]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={CONTROL_LABEL}>Financeiro</span>
            <select
              value={controls.payment}
              onChange={(e) => set("payment", e.target.value as ListControls["payment"])}
              className={CONTROL}
            >
              <option value="all">Todas</option>
              {PAYMENT_FILTER_ORDER.map((status) => (
                <option key={status} value={status}>
                  {PAYMENT_FILTER_LABEL[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className={CONTROL_LABEL}>Ordenar por</span>
            <select
              value={controls.sort}
              onChange={(e) => set("sort", e.target.value as SortKey)}
              className={CONTROL}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-pressed={controls.onlyNeedsAction}
            onClick={() => set("onlyNeedsAction", !controls.onlyNeedsAction)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors ${
              controls.onlyNeedsAction
                ? "border-brand bg-brand-tint text-brand"
                : "border-line text-ink hover:border-line-strong"
            }`}
          >
            <FilterIcon />
            Só quem precisa da minha ação ({needsActionTotal})
          </button>
          {filtersOn && (
            <button
              type="button"
              onClick={() => setControls((c) => ({ ...DEFAULT_CONTROLS, sort: c.sort }))}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Limpar filtros
            </button>
          )}
          <p role="status" aria-live="polite" className="ml-auto text-sm text-ink-muted">
            {visible.length === entries.length
              ? `${entries.length} ${entries.length === 1 ? "aluno" : "alunos"}`
              : `${visible.length} de ${entries.length} alunos`}
          </p>
        </div>
      </section>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center">
          <p className="font-display text-hero text-ink">Nenhum aluno encontrado</p>
          <p className="max-w-sm text-sm text-ink-muted">
            Nenhum aluno combina com a busca e os filtros atuais. Ajuste-os ou limpe para ver todos.
          </p>
          <button
            type="button"
            onClick={() => setControls((c) => ({ ...DEFAULT_CONTROLS, sort: c.sort }))}
            className={BUTTON_GHOST}
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((entry, index) => {
            const previous = visible[index - 1];
            const startsGroup = grouped && (index === 0 || previous.needsAction !== entry.needsAction);
            return (
              <Fragment key={entry.id}>
                {startsGroup && (
                  <li role="presentation" className={index === 0 ? "" : "pt-3"}>
                    <h2 className="flex items-baseline gap-2 text-lg font-medium text-ink">
                      {entry.needsAction ? "Precisam da sua ação" : "Sem ação agora"}
                      <span className="font-mono text-sm text-ink-faint">
                        {visible.filter((v) => v.needsAction === entry.needsAction).length}
                      </span>
                    </h2>
                  </li>
                )}
                <ClientRow entry={entry} />
              </Fragment>
            );
          })}
        </ul>
      )}

      {anyMissingData && (
        <p className="text-xs text-ink-faint">
          &quot;—&quot; indica dado não informado no cadastro. Idade, altura e objetivo são preenchidos
          ao adicionar o aluno.
        </p>
      )}
    </div>
  );
}
