# V11 — Ecosystem Expansion (Treino/Nutrição/Pagamentos/Financeiro)

**Goal:** Add training, nutrition, payments, and a coach financial view as parts of the SAME product (not bolted-on modules), reusing the existing design system (hero-stat/list-row/section-label/tabs/disclosure/compare-slider/chart engine) and wiring new data into the existing acompanhamento loop instead of duplicating it.

**Research grounding (3 competitor fetches: treinei.app.br, treino.io, primecoaching.com.br):** all three converge on the same IA the brief asks for — coach side consolidates client mgmt + workout + nutrition + payments under one roof; student side is workout/nutrition/progress-first, mobile. All three lean on ranking/community/gamification to some degree — explicitly excluded here per brief §84. None expose real gateway integration details — confirms "simulate, abstract the provider" is the right call.

**Scope discipline:** every new piece must pass brief §83's 10x test. Where the brief allows a lighter version ("boa base, não gigantesca"; "não criar complexidade desnecessária"), take the lighter version — e.g. up/down reordering instead of drag-and-drop, no exercise video hosting (placeholder icon + label only, consistent with how photos are already honest placeholders).

## Data shapes (assets/js/data.js)

```js
EXERCISE_LIBRARY: [{id, name, category}]  // ~24 exercises across peito/costas/perna/ombro/braço/core/cardio

client.workout: {
  protocolName: string,
  days: [{ id, name, durationMin, exercises: [{ exerciseId, sets, reps, restSec, rir, notes }] }]
}
client.workoutHistory: { [exerciseId]: { lastLoad, lastReps, lastDate } }
client._weekWorkoutsDone: number  // reset conceptually per new week's fixture; incremented by logWorkoutSession

client.nutritionPlan: {
  meals: [{ id, name, time, items: [{ food, qty }], substitutes: [[foodA, foodB]], macros: {protein, carbs, fat, kcal} }]
}

client.plan: { name, priceCents, period: "monthly" }
client.paymentsHistory: [{ id, dueDate, paidDate, amountCents, status, method }]
// status: pending | paid | overdue | cancelled | refunded
```

`paymentProvider` object: `{ name: "simulado", charge: fn, note: "abstração — trocar por Mercado Pago/Asaas/Stripe quando integrar de verdade" }` — never called for anything real, just documents the seam.

## File plan

**New:**
- `portal/treino.html`, `portal/nutricao.html`, `portal/conta.html`, `portal/pagamento.html`
- `coach/treino.html`, `coach/nutricao.html`, `coach/financeiro.html`

**Modified:** `assets/js/data.js`, `assets/js/nav.js`, `coach/cliente.html`, `coach/clientes.html` (payment status column), `portal/dashboard.html` (Home rewrite), `portal/checkin.html` (treino step auto-tally), `portal/evolucao.html` (relabel Progresso + histórico link), all files (cache-bust `?v=11`), `ARCHITECTURE.md`.

## Tasks (executed in order, one commit each)

1. Data layer — exercise library, workout model, fixture protocols for joao/maria/pedro/ana, `logWorkoutSession`.
2. Data layer — nutrition model, fixture meal plans (4 distinct plans matching each client's objective).
3. Data layer — payments model, fixture payment states (joao=pago, maria=pendente, pedro=atrasado, ana=pago), `simulatePayment`, `overduePaymentMessage`, `paymentProvider` stub.
4. Nav restructure — coach sidebar +Financeiro; portal bottom nav → Início/Treino/Nutrição/Progresso; avatar becomes a link to `portal/conta.html`.
5. Coach Treino builder — protocol/day/exercise CRUD, reorder via up/down, duplicate day/exercise.
6. Student Treino — today's workout (day picked by `(weekNumber-1) % days.length`), execution with load/reps + "última vez" context, autosave to `workoutHistory` + `_weekWorkoutsDone`.
7. Coach Nutrição builder — meal CRUD with items/macros/substitutions.
8. Student Nutrição — today's meals, tap-to-expand.
9. Student Pagamentos + Conta — plan/status/history/[Pagar] simulate.
10. Coach-side payment visibility — Alunos list status column + contextual "Cobrar no WhatsApp" when overdue.
11. Financeiro — receita/MRR/a receber/atrasado, client payment list, one revenue chart.
12. Home do aluno rewrite — Treino hoje / próxima refeição / foco / progresso mini / check-in status, per §68's literal layout.
13. Cross-wiring — check-in treino step reads `_weekWorkoutsDone` read-only instead of a manual stepper; Progresso page gets a "ver histórico completo" link (Histórico dropped from bottom nav per §69).
14. Perfil do aluno — Treino/Nutrição/Pagamentos tabs added as links (same pattern as V10's Avaliação tab).
15. Final review — full persistence regression on the new data, responsive pass (375/390/430/768/desktop), cache-bust v11, ARCHITECTURE.md, delivery summary per brief §105.

Execution: inline, same session, browser-verified after each task, committed individually.
