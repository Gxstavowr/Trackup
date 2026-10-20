"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import Icon from "@/components/ui/icon";
import QueueRow from "./queue-row";
import ClientRow, { LIST_GRID_XL, ROW_SUBGRID_XL } from "./client-row";
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  DEFAULT_CONTROLS,
  PAYMENT_FILTER_LABEL,
  PAYMENT_FILTER_ORDER,
  TRACKING_FILTER_ORDER,
  TRACKING_LABEL,
  countBuckets,
  GROUP_LABEL,
  filterAndSort,
  groupOf,
  hasActiveFilters,
  type ListControls,
  type ListView,
  type SortKey,
  type StudentEntry,
} from "./student-situation";
import { inputClass, selectClass } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";

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
export default function StudentList({
  entries,
  onboardingUnavailable = false,
}: {
  entries: StudentEntry[];
  /** Falha ao ler a fila de cadastros novos: avisa em vez de sumir com a aba. */
  onboardingUnavailable?: boolean;
}) {
  const [controls, setControls] = useState<ListControls>(DEFAULT_CONTROLS);
  const set = <K extends keyof ListControls>(key: K, value: ListControls[K]) =>
    setControls((c) => ({ ...c, [key]: value }));

  const visible = useMemo(() => filterAndSort(entries, controls), [entries, controls]);
  const needsActionTotal = useMemo(() => entries.filter((e) => e.needsAction).length, [entries]);
  const filtersOn = hasActiveFilters(controls);
  const inQueue = controls.view === "new";
  const grouped = controls.sort === "urgency" && !inQueue;
  const buckets = useMemo(() => countBuckets(entries), [entries]);
  // Sem nenhum cadastro novo (ou sem a view, migração pendente), a aba nem aparece.
  const showQueueTabs = buckets.total > 0 || inQueue;

  const clearFilters = () => setControls((c) => ({ ...DEFAULT_CONTROLS, sort: c.sort, view: c.view }));
  const select = `${selectClass} min-h-11 md:min-h-10 text-sm`;

  return (
    <div className="flex flex-col gap-4">
      {onboardingUnavailable && (
        <p role="status" className="text-sm text-ink-muted">
          Novos cadastros: não foi possível carregar agora.
        </p>
      )}
      {showQueueTabs && (
        <div className="flex flex-col gap-2.5">
          <Segmented
            label="Visão da lista"
            value={controls.view}
            onChange={(id) => setControls((c) => ({ ...c, view: id as ListView, newFilter: "all" }))}
            items={[
              { id: "all", label: "Todos os alunos" },
              { id: "new", label: "Novos cadastros", count: buckets.total },
            ]}
          />
          {inQueue && (
            <Segmented
              label="Filtrar novos cadastros"
              size="sm"
              value={controls.newFilter}
              onChange={(id) => set("newFilter", id as ListControls["newFilter"])}
              items={[
                { id: "all", label: "Todos", count: buckets.total },
                ...BUCKET_ORDER.map((b) => ({ id: b, label: BUCKET_LABEL[b], count: buckets[b] })),
              ]}
            />
          )}
        </div>
      )}
      <section aria-label="Buscar e filtrar alunos" className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2.5">
          <label className="relative block">
            <span className="sr-only">Buscar aluno por nome, e-mail ou objetivo</span>
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              value={controls.query}
              onChange={(e) => set("query", e.target.value)}
              placeholder="Buscar por nome, e-mail ou objetivo"
              autoComplete="off"
              className={`${inputClass} pl-10 md:min-h-10`}
            />
          </label>

          <div className={`grid grid-cols-2 gap-2.5 lg:flex ${inQueue ? "hidden" : ""}`}>
            <label className="lg:w-52">
              <span className="sr-only">Filtrar por situação do acompanhamento</span>
              <select
                value={controls.tracking}
                onChange={(e) => set("tracking", e.target.value as ListControls["tracking"])}
                className={select}
              >
                <option value="all">Situação</option>
                {TRACKING_FILTER_ORDER.map((state) => (
                  <option key={state} value={state}>
                    {TRACKING_LABEL[state]}
                  </option>
                ))}
              </select>
            </label>

            <label className="lg:w-48">
              <span className="sr-only">Filtrar por situação financeira</span>
              <select
                value={controls.payment}
                onChange={(e) => set("payment", e.target.value as ListControls["payment"])}
                className={select}
              >
                <option value="all">Financeiro</option>
                {PAYMENT_FILTER_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {PAYMENT_FILTER_LABEL[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-span-2 lg:col-span-1 lg:w-64">
              <span className="sr-only">Ordenar por</span>
              <select
                value={controls.sort}
                onChange={(e) => set("sort", e.target.value as SortKey)}
                className={select}
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    Ordem: {SORT_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            hidden={inQueue}
            aria-pressed={controls.onlyNeedsAction}
            onClick={() => set("onlyNeedsAction", !controls.onlyNeedsAction)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:translate-y-px md:min-h-9 ${
              controls.onlyNeedsAction
                ? "border-brand bg-brand-tint text-brand"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            <Icon name="filter" size={16} />
            Só quem precisa da minha ação ({needsActionTotal})
          </button>
          {filtersOn && (
            <Button variant="tertiary" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
          <p role="status" aria-live="polite" className="ml-auto text-sm text-ink-muted">
            {visible.length === entries.length
              ? `${entries.length} ${entries.length === 1 ? "aluno" : "alunos"}`
              : `${visible.length} de ${entries.length} alunos`}
          </p>
        </div>
      </section>

      {visible.length === 0 ? (
        <EmptyState
          icon="search"
          title={inQueue ? "Nenhum novo cadastro nesta fila" : "Nenhum aluno encontrado"}
          text={
            inQueue
              ? "Ninguém combina com a busca e o filtro atuais. Troque o filtro ou volte para Todos os alunos."
              : "Nenhum aluno combina com a busca e os filtros atuais. Ajuste-os ou limpe para ver todos."
          }
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        inQueue ? (
          <ul className="flex flex-col gap-2">
            {visible.map((entry) => (
              <QueueRow key={entry.id} entry={entry} />
            ))}
          </ul>
        ) : (
        <>
          {/* Desktop (>= 1280px): a lista vira uma grade e cada linha (e o cabeçalho) usa subgrid,
              então as colunas ficam alinhadas e a de ação se ajusta ao botão mais largo. */}
          <ul className={`flex flex-col gap-2 ${LIST_GRID_XL}`}>
            <li
              role="presentation"
              aria-hidden
              className={`t-label hidden border border-l-4 border-transparent px-4 text-ink-faint xl:grid ${ROW_SUBGRID_XL}`}
            >
              <span>Aluno</span>
              <span>Acompanhamento</span>
              <span>Financeiro</span>
              <span>Ação</span>
            </li>
            {visible.map((entry, index) => {
              const previous = visible[index - 1];
              const group = groupOf(entry);
              const startsGroup = grouped && (index === 0 || groupOf(previous) !== group);
              return (
                <Fragment key={entry.id}>
                  {startsGroup && (
                    <li role="presentation" className={`xl:col-span-full ${index === 0 ? "" : "pt-4"}`}>
                      <h2 className="flex items-baseline gap-2 t-subtitle text-ink">
                        {GROUP_LABEL[group]}
                        <span className="tabular-nums text-sm font-normal text-ink-faint">
                          {visible.filter((v) => groupOf(v) === group).length}
                        </span>
                      </h2>
                    </li>
                  )}
                  <ClientRow entry={entry} />
                </Fragment>
              );
            })}
          </ul>
        </>
        )
      )}
    </div>
  );
}
