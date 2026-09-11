# V12 — Product Reformulation

**Goal:** not new subsystems (V11 already built Treino/Nutrição/Pagamentos/Financeiro) — this
is a refinement pass across the whole product so it reads as one coherent experience instead
of "modules glued together." Preserve everything that already works; change composition where
the brief calls for it explicitly.

**Reality check after reading the current code:** most of coach/dashboard.html and
coach/revisar.html already satisfy the brief's Acompanhamento/Avaliação vision (grouped
queue, progress counter "X restantes", peso+fotos unified module, "O que mudou" pairs,
"Últimas semanas" table, nota do coach, decisão block) — these evolved toward exactly this
shape across V4-V10. So the real delta is narrower than the brief's length suggests. No
re-fetch of the 7 benchmark sites — already done in V11 this session, same conclusions apply
(consolidate around the student, avoid ranking/community, keep financeiro simple).

## Scope (only what's actually missing vs. the brief)

1. **Alunos list** — row is missing idade/altura (brief §12 explicit row spec). Add.
2. **Avaliação** — "Últimas semanas" table has no "Ver histórico" CTA (brief §20). Add link.
3. **Histórico → drawer pattern** (brief §28) — currently an inline accordion
   (`.week-cycle`/`.wc-body` expand-in-place) in `portal/historico.html` and
   `coach/cliente.html`'s Histórico tab. Brief wants a compact list that opens a drawer.
   Build one shared drawer component (CSS + small JS helper in `nav.js`), reuse in both
   places instead of duplicating.
4. **Evolução (portal) — biggest real violation of §23-26**: currently renders 5-6 full
   line/bar charts stacked (peso, cintura, aderência, +disclosure sono/água/treinos/cardio).
   Brief wants ONE main chart (peso) + everything else as compact inline stat rows. Rework.
5. **Financeiro — reformulate hierarchy** (brief §42-50): currently 4 equal `.stat` cells.
   Brief wants receita as protagonist, "Próximas entradas" (next N pending payments sorted by
   date), alerts only-when-a-problem-exists ("N atrasados → Ver pendências", hidden when
   zero), a filterable receivables list (chips: Todos/Pago/Pendente/Atrasado), and additional
   honest metrics (clientes ativos, novos no período via `startDate`, cancelados via payment
   status, ticket médio from paying active clients only — never fabricated).
6. **Self-critique pass** (brief §110) + cache-bust v12 + ARCHITECTURE.md + delivery summary.

## Explicitly NOT touched (already correct, would be churn to rewrite)

- Nav structure, data layer, Treino/Nutrição builders, Pagamentos, WhatsApp messages,
  check-in flow, persistence pattern — all already match the brief.
- Fotos tabs — already comparison-only (no gallery), matches §27 already.
- Card-itis audit: spot-checked `coach/cliente.html`, `portal/dashboard.html` — mostly
  hero-stat/list-row already, not card-per-metric. No rewrite needed there.

## Tasks (one commit each, browser-verified)

1. Alunos row: add idade/altura.
2. Avaliação: "Ver histórico" link on the Últimas semanas table.
3. Shared drawer component (CSS in base.css + helper in nav.js) + apply to
   `portal/historico.html` (list + drawer instead of accordion).
4. Apply drawer to `coach/cliente.html`'s Histórico tab (consistency, same component).
5. Evolução (portal) rework: one weight chart + compact stat-chip row for everything else,
   period selector still drives both.
6. Financeiro rework: hierarchy, Próximas entradas, alerts-only-when-problem, receivables
   filter chips, additional metrics.
7. Self-critique pass, responsive spot-check, cache-bust v12, ARCHITECTURE.md, delivery
   summary per brief §113.
