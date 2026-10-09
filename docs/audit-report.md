# TRACKUP (prototype name: "Trackly") — Prototype Audit Report

Date: 2026-09-16
Scope: full read of every file under `prototype/` (coach/*, portal/*, index.html, convite.html, assets/css/*, assets/js/*), plus `git log --oneline -30`.

---

## 0. What this prototype is, in one paragraph

A static, no-build, vanilla-JS HTML prototype (no framework, no bundler) for "Trackly" — the working name used throughout the code and copy (title tags, brand mark, `Trackly` global JS namespace, `trackly_v4_state` localStorage key). It simulates a coach↔student weekly check-in loop: student submits a check-in → coach reviews and sends an "orientação" (guidance) + next week's goals → student sees it on their home. Built iteratively over ~30 commits ("V2" through "V12"), each commit narrowly scoped (e.g. "V12: Financeiro reformulation", "V11: nav restructure"). The commit messages are unusually self-aware — many reference "brief §NN" and internal state-name conventions, suggesting there's a working spec/brief this was built against test-by-test, but that brief is not itself in the repo (not found in `prototype/` or root — only `eu.md` and `tasks.md` exist untracked at repo root, not reviewed here as out of scope).

All 4 demo clients, the 1 coach, and all weeks/history are procedurally generated in `assets/js/data.js` (`buildWeeks()`), then mutations (check-in submitted, orientation sent, reminders, manually-created clients, workout/nutrition edits, payments) are persisted to `localStorage` via `assets/js/storage.js` and reapplied on top of the generated data on every load (`applyStoredOverrides()`). There is no backend, no real auth, no multi-tenancy — it is a single hardcoded coach ("Renata Prado") with 4 hardcoded students plus whatever the user creates through the UI in that browser's localStorage.

---

## 1. Folder / route structure

```
prototype/
  index.html          — marketing landing page (public)
  convite.html         — invite-accept flow (coach → student), standalone page
  coach/
    dashboard.html      — "Acompanhamento" — weekly work queue (home for coach)
    clientes.html        — "Alunos" — full roster/list + inline "add student" panel
    cliente.html          — per-student profile, tabbed (Visão geral/Evolução/Fotos/Histórico/Pagamentos)
    revisar.html           — the check-in review + orientation-writing screen
    treino.html             — workout protocol builder (coach edits a student's plan)
    nutricao.html            — nutrition plan builder (coach edits a student's plan)
    financeiro.html          — coach's business financial dashboard
  portal/            — student-facing pages, "app-like" mobile shell (`.portal` wrapper)
    dashboard.html    — student home ("Início")
    checkin.html       — check-in wizard (multi-step form)
    treino.html          — today's workout, execution flow
    nutricao.html         — today's meals
    evolucao.html          — "Progresso" — weight chart, photo compare, period summary
    historico.html           — read-only weekly timeline (drawer-based)
    conta.html                 — account/settings hub
    pagamento.html               — payment/plan detail + simulated pay button
  assets/
    css/ tokens.css, base.css, landing.css, portal.css
    js/  data.js, storage.js, nav.js, charts.js, icons.js
```

There is no router and no build step — this is a flat multi-page app (MPA). Every `.html` file independently loads the same 5 JS files (`storage.js`, `data.js`, `icons.js`, `charts.js`, `nav.js`) and 1–2 CSS files via `<script src="../assets/js/....js?v=12">` with manually incremented cache-busting query params (currently inconsistent: base.css/most JS at `?v=12`, `portal.css` at `?v=13` — see Technical Debt §9).

**Coach vs. portal separation** is purely visual/thematic, not architectural:
- Both are plain HTML files in different folders, sharing the *same* JS data layer (`window.Trackly`, `window.TracklyStore`, `window.TracklyNav`) and the *same* CSS component classes (`.card`, `.list-row`, `.btn`, `.pill`, `.hero-stat`, drawer, toast, chart system).
- `portal.css` re-skins the shared tokens by overriding CSS custom properties scoped under a `.portal` class (light/warm theme vs. coach's dark/graphite theme) — this is a genuinely clean pattern: one component library, two theme layers, zero duplicated markup logic.
- There is no server-side or client-side route guard of any kind — "coach" and "portal" are just conventions; any page can be opened directly by URL with `?id=` (coach pages) or `?client=` (portal pages) query params, defaulting to `"joao"` if absent. No session/auth concept exists at all.

**Navigation** (`assets/js/nav.js`):
- `mountCoachShell(active, clientId)` renders the sidebar with 3 hardcoded items: Acompanhamento (dashboard.html), Alunos (clientes.html), Financeiro (financeiro.html) — plus an optional 4th "Cliente aberto" jump-link when a student profile is open. This matches TODO #3's target exactly already (3 top-level items).
- `mountPortalNav(active, clientId)` renders a 4-item bottom tab bar: Início, Treino, Nutrição, Progresso — matching TODO #16's target bottom-nav exactly already.
- `cliente.html`'s in-page tabs (Visão geral/Treino/Nutrição/Avaliação/Evolução/Fotos/Histórico/Pagamentos) are NOT part of nav.js — they're hand-coded per-page tab bars using `.tabs`/`.tab-btn`/`.tab-panel` from base.css, with `Treino`/`Nutrição`/`Avaliação` implemented as *page-navigation links* (`location.href = 'treino.html?id=...'`) disguised as tabs, while the other 5 (`Visão geral`, `Evolução`, `Fotos`, `Histórico`, `Pagamentos`) are true client-side tab-panel toggles. This is a meaningful inconsistency — see §6.
- Drawer (`openDrawer`/`closeDrawer`) and Toast (`toast()`) are shared, generic, reusable UI primitives — used by History (coach + portal) and by Nutrição's meal detail. Good reusable pattern.
- `nav.js` builds every nav item's HTML via string concatenation with hardcoded route arrays; there is no data-driven or config-driven nav (adding a nav item means editing this file, which is a single central point of truth today — actually good for TODO #3, less good for future multi-role/permission-based nav).

---

## 2. Data model today vs. target (TODO #31)

Everything lives in one in-memory array `Trackly.CLIENTS` (built once in `data.js`, mutated in place, and reconciled with localStorage patches on load). There is no notion of separate normalized tables — it's one denormalized object graph per client.

### Actual shape today

```
COACH = { name, role, initials, phone }              // single hardcoded coach, no multi-coach concept
CLIENTS: [{
  id, name, initials, colorVar, gender, age, heightCm, phone, email,
  objective, startDate, clientStatus, tracking: { weight, adherence, workouts,
      cardio, water, sleep, digestion, emotional, measurements, photos: bool... },
  inviteStatus: 'pending'|'invited'|'active', invitedAt, activatedAt,
  weeks: [{                                            // ~= "weekly_cycles" + "checkins" + "checkin_answers"
    weekNumber, start, end,
    checkin: { status: 'pending'|'submitted'|'late', submittedAt },
    metrics: { weight, waist, bodyFat, adherence, workouts, workoutsGoal,
               cardio, cardioGoal, water, waterGoal, sleep, sleepGoal, energy, hunger },
    goals: [{ key, icon, label, unit, target, actual, mode, status }],  // ~= goals+goal_results, generated not stored
    qa: { dieta, refeicaoLivre, beliscos, cardioDetalhe, performanceTreino,
          periodoMenstrual?, digestao, emocional, substancias, exame },  // ~= checkin_answers, fixed keys not schema-driven
    orientation: string|null,        // ~= coach_reviews / orientations, single free-text field
    orientationSentAt, orientationSentTime, focusOverride,
    coachReview: { note }|undefined, // private coach note
    reviewOpenedAt,                  // ephemeral UI-state flag, not a real audit trail
    note: string|undefined           // seed-data-only "what happened this week" text
  }],
  workout: { protocolName, days: [{ id, name, durationMin,
      exercises: [{ exerciseId, sets, reps, restSec, rir, notes }] }] },  // ~= workout_plans/days/exercises/sets (flattened, no per-set granularity)
  workoutHistory: { [exerciseId]: { lastLoad, lastReps, lastDate } },     // ~= workout_logs, but only LAST value kept, not a log
  nutritionPlan: { planName, meals: [{ id, name, time, items: [{food, qty}],
      substitutes: [[a,b]], macros: {protein,carbs,fat,kcal} } ] },       // ~= nutrition_plans/meals/foods/meal_items/substitutions (flattened)
  plan: { name, priceCents, period },
  paymentsHistory: [{ id, dueDate, paidDate, amountCents, status, method }]  // ~= subscriptions+payments merged, no payment_events/refunds
}]
EXERCISE_LIBRARY: [{ id, name, category, instructions }]   // global, shared across coach, not per-coach
CHECKIN_TEMPLATE: [{ key, label, type, step, active, required, tracks, genderOnly }]  // ONE global template, not per-coach
```

### Gap analysis against the 24-entity target model (TODO #31)

| Target entity | Status today |
|---|---|
| `users` | **Missing.** No user/auth abstraction — coach and client are separate ad hoc shapes, not rows of one `users` table. No password/session/identity anywhere. |
| `coaches` | **Partial.** One hardcoded `COACH` object. No multi-coach, no coach-owns-data boundary, no coach settings. |
| `students` | **Partial.** `CLIENTS` array is close, but fields like `age`/`heightCm`/`gender` are flat, not separated from account/profile concerns. |
| `coach_student` | **Missing as a join concept** — implicit 1:1 via array membership (every client "belongs" to the one coach). No support for a student having/switching coaches, or a coach roster being a real relation with its own metadata (start date already conflated into client). |
| `weekly_cycles` | **Conceptually present but not modeled as a first-class state machine.** `client.weeks[]` are ordered array entries, not typed cycle records with an explicit state field. State is *derived* every time via `clientStage()`/`computeStatus()`, not stored. See §6. |
| `checkins` | **Present**, embedded inside week (`week.checkin`), not a separate entity/table. Fine for a prototype, but conflates "check-in" and "week" as the same row. |
| `checkin_answers` | **Present but schema-frozen.** `week.qa` is a fixed object with ~10 hardcoded keys (`dieta`, `refeicaoLivre`, `beliscos`, ...) mirroring `CHECKIN_TEMPLATE` 1:1 — not a generic `{questionKey: answer}` bag driven by a truly configurable template per coach. `CHECKIN_TEMPLATE` exists (`data.js` lines ~1032-1065) and *looks* schema-ready (`type`, `step`, `active`, `required`, `tracks`, `genderOnly` fields per question) but it is a single hardcoded global array — every page that renders the check-in UI (`checkin.html`) has its own separately hand-authored `stepPanels` HTML that does NOT read from `CHECKIN_TEMPLATE` at all. So the "configurable template" data structure exists but is disconnected from the actual UI — a half-finished abstraction. |
| `photos` | **Missing entirely as data.** No photo entity, no upload/storage. Photo compare UI (`compare-slider`) exists purely as a visual mock using CSS `hsl()` colored rectangles as stand-ins ("Placeholders ilustrativos — nenhuma foto real" is stated explicitly in the UI copy). The check-in wizard *does* have file inputs (`<input type="file">`) that preview via `URL.createObjectURL`, but nothing is persisted — reload loses it. |
| `metrics` / `metric_values` | **Present but hardcoded, not a registry.** `client.tracking` is a fixed set of ~10 boolean flags (weight/adherence/workouts/cardio/water/sleep/digestion/emotional/measurements/photos); `week.metrics` is a fixed-shape object with those same keys baked in. This is genuinely close in *intent* to TODO #8's "trackingSettings" idea (per-student on/off flags already exist and are read everywhere via `Trackly.isTracked()`), but it is not a metric *registry* — you cannot add a new metric type without editing code in `data.js`, `charts.js` call sites, `checkin.html`, `revisar.html`, `cliente.html`, `portal/*` in parallel. There is no `metric_values` as generic time-series rows; each metric is its own named field on `week.metrics`. |
| `goals` / `goal_results` | **Present, generated not authored as history.** `week.goals` is regenerated by `buildWeeks()` from formulas (deterministic pseudo-random performance curves), not really "coach set a goal, student hit/missed it" as durable historical fact for seed data — though the *live* interaction (`completeOrientation()` writing `nextGoals`) does correctly persist coach-edited targets going forward. So the mechanism for goals-as-history exists for real usage, just not for the seeded past. |
| `coach_reviews` / `coach_notes` | **Present**, single field per week (`week.coachReview.note`, `week.orientation`). No versioning, no structured review (e.g., separate visibility flags, no distinction between internal note and sent message beyond the two fields already split — which is actually a reasonable minimal split). |
| `orientations` | **Present** as a single free-text field per week, no structure, no attachments, no distinguishing "orientation" from other message types. Fine for MVP; not a normalized entity. |
| `workout_plans/days/exercises/sets/logs` | **Plans+days+exercises: present** (`client.workout.days[].exercises[]`). **Sets: NOT modeled per-set** — an exercise row is `{sets: 3, reps: 12, ...}` (a *prescription*, count+reps, not individual set records). **Logs: barely present** — `workoutHistory[exerciseId]` stores only the *single most recent* load/reps/date per exercise, not a log/history array; every new session overwrites the previous entry. There is no `workout_plans` versioning (editing a protocol overwrites it in place, no history of what the plan was last month). |
| `nutrition_plans/meals/foods/meal_items/substitutions` | **Plans+meals+items+substitutions: present**, flattened (foods are inline strings, not a `foods` reference table — "Frango grelhado" is just text, not an id into a foods database). No serving-size normalization, no macro database — the coach types macros manually per meal. |
| `subscriptions` | **Partial.** `client.plan = {name, priceCents, period}` is a single current-plan snapshot, not a `subscriptions` table with history of plan changes, no start/end dates, no cancellation reason. |
| `payments` | **Present** as `paymentsHistory[]`, reasonably shaped (`dueDate, paidDate, amountCents, status, method`), but **no `payment_events`** (state-change audit log — e.g. who/when marked as overdue), and **no `refunds`** entity at all (status enum includes `'refunded'` but there's no refund record/reason/amount-if-partial). |
| `notifications` / `notification_events` | **Missing as data.** WhatsApp "nudge" is a stateless `wa.me` deep link built on-the-fly from a template function (`checkinNudgeMessage`, `overduePaymentMessage`, etc.) — nothing is logged as a "notification was sent" event except `client.remindedAt`/`remindedTime` (a single last-reminder timestamp, not a notification log). There's no in-app notification concept (no bell/inbox for coach or student beyond ad hoc toasts), no multi-channel abstraction, no read/unread state. |

**Summary verdict on §2:** ~40% of the target model has a recognizable analog today, but almost everything is flattened, denormalized, single-tenant, and generated-not-authored. The two structural absences with the widest blast radius are: (a) **no first-class `weekly_cycles` state machine** — state is always recomputed from raw data via ad hoc functions rather than stored/transitioned explicitly, and (b) **no `notifications`/`payment_events`/`workout_logs` audit trails** — the system only ever remembers "the current value," never "what happened and when," which will bite as soon as real multi-week history, disputes, or analytics are needed.

---

## 3. What's already good and should be preserved

1. **The weekly-cycle *narrative* is already deeply internalized in the code**, even though it isn't a stored state machine. `data.js`'s own comments literally say: *"Cada semana é o ciclo completo: check-in do cliente -> análise do coach -> orientação -> metas -> resultado."* The derived-state functions (`clientStage()`, `computeStatus()`, `needsReview()`, `isLate()`) already encode exactly the target enum from TODO #5 (`awaiting_checkin`, `checkin_received`/`under_review`, `completed`) as *string return values* — porting this to a real stored `status` field on a `weekly_cycles` row is a refactor, not a rethink.
2. **The design system is genuinely mature and consistent.** `tokens.css` → `base.css` → theme override (`portal.css`) is a clean, well-factored cascade: one component vocabulary (`.card`, `.btn-*`, `.pill-*`, `.hero-stat`, `.list-row`, `.tabs`, `.stat-row`, `.goal-grid`, `.timeline`, `.drawer-*`, `.toast`, `.status-list`, `.compare-slider`, `.chart-*`) reused verbatim across coach and portal, re-skinned only via CSS custom-property overrides scoped to `.portal`. This is exactly the right pattern for TODO #28 (visual consistency) and should absolutely be preserved and extended rather than rebuilt.
3. **The SVG chart engine (`charts.js`) is self-contained, dependency-free, and already has the "signature visual" (progressive-draw line + sparkline + tooltip) the brief clearly wants** — sparkline, lineChart (with goal line, area fill, progressive stroke-dashoffset animation, single delegated tooltip), barChart. No external chart library dependency to rip out later.
4. **The drawer/toast pattern (`nav.js` + `.drawer-*`/`.toast` CSS) is a solid "app > site" primitive** (TODO #29) — already responsive (side panel on desktop, bottom sheet on mobile via one media query), already reused identically by coach History, portal History, and portal Nutrição's meal-detail. This is the right shape to extend to more sheet/modal use cases rather than reinventing per-feature modals.
5. **Per-student metric tracking flags (`client.tracking`) already drive visibility everywhere** — check-in form fields, review page hero stats, evolution charts, history rows all correctly hide/show based on `Trackly.isTracked(client, key)`. The intent of TODO #8 ("nunca um número universal") is already respected as a *behavior*, even if the underlying flag set is hardcoded rather than a true per-coach-configurable registry.
6. **`whatsappUrl()` + per-context message-template functions are a good, minimal "channel abstraction"** (TODO #20) — messages vary by day/context/status rather than being generic, and the wiring is centralized in `data.js` rather than duplicated per page.
7. **`buildCoachMemory()`, `buildPeriodSummary()`, `trendLine()`, `checkInInsights()` are a real (if simple) "insight layer"** already living in one file, with explicit minimum-data-required gating (documented in comments referencing "brief V7 §42": <3 weeks = nothing, 3–5 = simple comparison, 6+ = consistency check, 8+ = weight-stability band). This is directly the seed of TODO #24 (longitudinal memory) and TODO #25 (simple-rules intelligence) — already scoped to be "no AI, no causal claims," which matches the target philosophy explicitly.
8. **The responsive pass (V12) is real and reasonably thorough**, not cosmetic — see §8.
9. **The `paymentProvider` abstraction object** (`{name: 'simulado', charge: fn}` in `data.js`) is a correctly-shaped seam for later real gateway integration (TODO #22) — small, but exactly the right instinct (don't call a fake API directly from UI code).
10. **`localStorage`-backed mutate-then-patch persistence (`TracklyStore` + `applyStoredOverrides()`) is a coherent, well-understood pattern** for a prototype without a backend — every mutation function (`submitCheckin`, `completeOrientation`, `saveWorkoutProtocol`, `saveNutritionPlan`, `simulatePayment`, `logWorkoutSession`, `sendReminder`, `sendInvite`, `acceptInvite`, `createClient`) follows the same "mutate in-memory object, then patch the same shape into localStorage" convention. Migrating this to real API calls later is mostly a drop-in replacement of the `if (global.TracklyStore) {...}` blocks.

---

## 4. What needs only refinement (small changes, same structure)

- **Cache-busting version drift**: `base.css`/JS files are `?v=12` everywhere but `portal.css` is `?v=13` in every portal page — either intentional (portal.css changed after the v12 tag) or a leftover inconsistency; should be unified into one build-time version stamp.
- **`CHECKIN_TEMPLATE` should actually drive `checkin.html`'s rendering** instead of being a disconnected, unused-at-runtime data structure sitting next to a hand-authored parallel step UI. This is a refinement, not a rebuild, because the shape of `CHECKIN_TEMPLATE` already matches what a template-driven renderer would need (`type`, `step`, `tracks`, `required`, `genderOnly`).
- **`cliente.html`'s tab bar mixing true tabs and page-navigation links** (Treino/Nutrição/Avaliação navigate away; the rest toggle panels) is confusing as an interaction pattern and should be normalized — either all tabs stay in-page, or the whole tab bar is replaced by the TODO #15 target structure (see §6) where this distinction disappears naturally.
- **Coach's Financeiro "Novos no período"/"Cancelados" metrics** (`financeiro.html`) are computed ad hoc inline in the page script rather than through the `Trackly.*` data-layer API like everything else — small refactor to move into `data.js` for consistency and testability.
- **Workout/nutrition "last saved" autosave indicator** (`treino.html`, `nutricao.html`) uses a bare `setTimeout` debounce with no error/conflict handling — fine for prototype, but should graduate to a real save-state (saving/saved/error) once there's a backend.
- **`slugify()`/manual client id generation** (`createClient`) is a client-side-only id scheme with a `while` loop checking uniqueness against the in-memory array — will not survive concurrent multi-browser usage; trivial fix once there's a real backend issuing ids.
- **Minor accessibility gaps**: several custom interactive rows use `onclick` inline HTML attribute strings (e.g. `clientes.html`'s roster rows) rather than addEventListener, and rely on manual `tabindex`/`role="button"`/keydown-Enter wiring repeated per page instead of a shared helper — works, but duplicated logic in `clientes.html`, `cliente.html`, `historico.html` (coach+portal) that could be one shared `makeRowClickable()` utility in `nav.js`.
- **Inline `style="..."` attributes are extremely common** across nearly every render function (hundreds of instances) instead of utility classes — not wrong for a prototype but will slow down any future theming/whitelabeling work.

---

## 5. What needs reorganization (structure changes, logic mostly reusable)

- **`cliente.html`'s tab structure must become the TODO #15 workspace** (Visão geral · Avaliação · Treino · Nutrição · Evolução · Fotos · Histórico · Pagamentos). Today it has 8 tabs already, but 3 (Treino/Nutrição/Avaliação) are disguised links to *separate pages* (`treino.html`, `nutricao.html`, `revisar.html`) rather than in-page panels, breaking the "one workspace" mental model the TODO wants. The underlying render functions (`renderResumo`, `renderEvolucao`, `renderFotos`, `renderHistorico`, `renderPagamentos`) are already exactly shaped as swappable tab-panel renderers — reusing this pattern for the 3 missing panels (embedding `treino.html`'s builder, `nutricao.html`'s builder, and `revisar.html`'s review flow as in-page panels instead of page navigations) is a reorganization of *where* the code runs, not a rewrite of *what* it does.
- **The weekly-cycle state (`clientStage`/`computeStatus`) needs to move from "always recomputed from raw fields" to "an explicit stored `status` on a `weekly_cycles`-shaped record"** that transitions through the TODO #5 enum via explicit actions (submit check-in → `checkin_received`; open review → `under_review`; save draft → `orientation_draft`; send → `orientation_sent`/`completed`; next week starts → `next_checkin_due`/`awaiting_checkin`). The current code already computes 3 of those states correctly (`awaiting_checkin`, `checkin_received`, `completed`) — the reorg is chiefly about introducing `under_review`/`orientation_draft`/`orientation_sent`/`next_checkin_due` as real distinguishable states instead of collapsing review-in-progress and review-not-started into the same "received" bucket, and doing so via stored transitions instead of derivation from timestamps.
- **`revisar.html` is currently a full separate page reached only from the coach dashboard/roster**, but per TODO #15/#19 it should be one workspace panel (Avaliação) of the per-student view, and its "send orientation" action should be the same action available whether entered from the dashboard queue or from inside a student's profile. Reorganizing means: keep `revisar.html`'s rendering logic (it's good — hero stats, "what changed," recent-weeks table, QA disclosure, focus/orientation inputs, goal editor) but mount it inside `cliente.html`'s Avaliação tab instead of (or in addition to) a standalone route, and make the dashboard's "Avaliar agora" open that same in-place panel/drawer rather than a page navigation.
- **Check-in template needs to move from a hardcoded global array to a per-coach-configurable structure** (TODO #6). The current `CHECKIN_TEMPLATE` is close to the right shape but is global (one questionnaire for the whole app, not per coach) and, as noted, isn't actually wired to the renderer. Reorganizing this means: (1) connect the renderer to the template (refinement, §4), then (2) make the template a per-coach setting rather than a hardcoded constant (reorganization — needs a coach-settings concept that doesn't exist today).
- **Photos need to move from "decorative color-block placeholder rendered inline wherever needed" to an actual entity** (`photos` table: student, week, angle, url/blob ref). Today the same `photoBg(i, angle)` hue-shifting placeholder function is *copy-pasted 3 times* (coach `cliente.html`, coach `revisar.html`, portal `evolucao.html`) with identical logic — this should become one shared utility, and eventually a real photo-storage integration, but the compare-slider UI/UX itself (drag handle, angle tabs, before/after tags, keyboard support) is solid and should be preserved as-is once real images replace the placeholders.

---

## 6. What must be substituted / rebuilt

- **Multi-tenancy / auth / users is not a reorganization — it doesn't exist.** There's exactly one coach, identified by a hardcoded JS object, and students are addressed by URL query param with no access control. Any real product needs a `users`/session layer built from scratch; nothing here is reusable except the *shape* of what a coach/student profile needs to contain.
- **The "weekly cycle as atomic unit" (TODO #5) is a narrative and a derivation today, not a stored entity.** As described in §5, this needs the state machine to become real (stored, transitioned by explicit actions, auditable) rather than continuing to be recomputed from `checkin.status` + `orientation != null` + ephemeral `reviewOpenedAt`. This is more "promote a well-understood pattern to a real data model" than "rebuild from nothing" — but it is a genuine architecture change, not a refinement.
- **Check-in is NOT actually configurable per coach today** (TODO #6's core ask). `CHECKIN_TEMPLATE` is a single hardcoded array shared by every coach in the system (there's only one coach, so this has never been tested against a second configuration), and — as emphasized above — `checkin.html`'s actual form markup does not even read from it; the wizard's 4 steps and their fields are hand-authored HTML strings in the page script. Making check-in truly configurable requires: a per-coach template store, a generic renderer driven by `{type, label, tracks, required}` (question types already enumerated: number, photos, scale+text, text, stepper, yesno, number+text — a reasonable type taxonomy to keep), and validation/rendering logic that doesn't assume the specific field keys (`peso`, `dieta`, `agua`, etc.) the way `submitCheckin()` currently does (it has hardcoded `if (payload.weight != null) ...` per known field name, not a generic answer-bag writer).
- **Photos are 100% placeholder — there is no upload, storage, retrieval, or real comparison.** Every "photo" anywhere in the app is a CSS `hsl()` gradient rectangle computed from the client's brand color plus a per-week/per-angle offset. The check-in wizard's file input previews a blob URL that is discarded on reload. This entire vertical needs to be built, not reorganized — nothing here is production logic, only the *interaction design* (compare-slider drag/keyboard, angle tabs, before/after week pickers) is reusable.
- **Notifications / multi-channel layer (TODO #21) does not exist beyond WhatsApp deep-links.** There's no in-app notification center, no push, no email, no notification-events log, no read state. The WhatsApp `wa.me` links are a fine *complement* per the brief's own framing ("WhatsApp nunca o centro do produto") but cannot be the *only* channel for a real product — this needs to be built from scratch, informed by (not replacing) the existing message-template functions.
- **Payments/subscriptions integration is entirely simulated** (`paymentProvider.charge()` just returns `{ok:true, simulated:true}`). The abstraction seam is good (§3), but the actual gateway integration, webhook handling, `payment_events`, and `refunds` are 100% unbuilt.
- **Metrics system is not a registry** (TODO #8's deeper ask beyond the on/off flags that already exist). Adding a 11th trackable metric today means editing `data.js`'s `TRACKING_DEFAULT`, `CHECKIN_TEMPLATE`, `week.metrics` shape, `submitCheckin()`, `recentWeeksTable()`'s column list, `buildCoachMemory()`'s hardcoded checks, `cliente.html`'s evolution-chart block list, `checkin.html`'s step-4 field list, and both portal/coach chip renderers — roughly 8 files touched for one new metric. A real `trackingSettings`-driven metric registry (metric definitions + generic renderers reading the registry) is a rebuild of this cross-cutting concern, even though each individual piece of UI logic being replaced is otherwise fine.
- **Multi-coach / white-label is unbuilt.** `COACH` is a single global object; there is no coach-settings screen, no coach-level branding, no coach-level check-in template ownership, no billing-for-the-coach concept (Financeiro is the coach's view of *their students'* payments to *them*, not Trackly's own SaaS billing of the coach — that layer doesn't exist at all).

---

## 7. Reusable components / CSS system

**Yes — there is a real, consistent design system, and it should be the foundation, not rebuilt.**

- `tokens.css`: single source of truth for color, spacing, type-scale, radius. Dark "graphite/emerald" palette for coach, with a documented rationale in comments ("mais 'painel de clínica bem desenhada' que 'app de academia'"). Uses `clamp()`-based fluid type/spacing tokens (`--text-hero`, `--text-counter`, `--text-label`, `--sidebar-w`) already — this is exactly the mechanism TODO #30/responsive work should keep leaning on.
- `base.css`: ~500 lines, well-organized by component with clear section comments (buttons, cards, pills, KPI stat, tabs, goals, timeline, photos, forms, portal shell, charts, drawer, toast, history rows...). Component classes are generic and reused across coach+portal rather than page-specific — e.g. `.card`, `.btn-*`, `.list-row`, `.hero-stat`, `.pill-*`, `.stat-row`, `.status-list`, `.wc-*` (week-cycle detail blocks used identically in coach and portal history drawers).
- `portal.css`: theme-override layer scoped to `.portal`, redefining the same custom properties plus a handful of portal-specific components (`.focus-hero`, `.msg-card`, `.today-mini`, `.ex-step` workout execution card, `.meal-row`, `.pay-alert`). This is a textbook "one system, two skins" implementation.
- `landing.css`: page-specific, not really meant to be reused elsewhere (marketing page only) — fine as-is, lowest priority.
- States: empty-state (`.empty-state`) exists and is used in a few places (nutrition/workout "not set up yet", roster "no results"), but is NOT used everywhere it should be (see §8/§9) — loading and error states are absent entirely (no page has a loading skeleton or a network-error state, unsurprising since there's no real network layer yet, but this needs to be designed before a backend lands, per TODO #34).
- Drawers/sheets: one shared drawer component (`ensureDrawer`/`openDrawer`/`closeDrawer` in `nav.js` + `.drawer-*` CSS) responsive by default (panel on desktop, bottom sheet on mobile) — already reused 3+ times. No full-screen modal component exists yet (confirmations are currently handled by full state-swaps like `revisar.html`'s "confirm" view, not a modal).
- Toast: one shared, generic, auto-dismissing toast (`toast()` in `nav.js`) used for reminder-sent / invite-sent feedback — a good minimal "discrete confirmation" primitive (TODO #34's confirmation-states ask, partially met).

**Verdict:** the CSS/component system is one of the strongest parts of this prototype and should absolutely be preserved and extended, not rebuilt. The main gap is *coverage* (loading/error states, a true modal, a generic empty-state usage audit), not *architecture*.

---

## 8. Responsiveness

**What's already handled** (per the V12 "full responsive pass" commit and confirmed by reading the CSS):
- Fluid type scale via `clamp()` on the most-visible numbers (`--text-hero`, `--text-counter`, big-counter, hero-stat values, page headings) — this avoids most breakpoint-specific font-size overrides.
- Sidebar (coach) collapses to an off-canvas drawer under 768px (`.sidebar { position: fixed; left: -100% }` + `.sidebar.open`), with a hamburger button (`.mobile-menu-btn`) shown only ≤768px.
- `.stat-row`/`.grid-2`/`.grid-3` grids explicitly step down (auto-fit → 2 cols → 1 col) at 768px/480px breakpoints.
- Portal is mobile-first by construction: `.portal { max-width: 480px }`, and only *grows into* a centered "phone-shaped" card on desktop (`@media (min-width: 640px)`) rather than the more common (and worse) "design desktop, squeeze to mobile" direction.
- `env(safe-area-inset-bottom)` is respected in the bottom nav — a real mobile-web detail, not just a media query afterthought.
- Drawer becomes a bottom sheet (not a side panel) under 768px — a deliberate, not incidental, mobile treatment.
- Touch/pointer events (not just mouse) are used for the compare-slider drag handle (`pointerdown`/`pointermove`/`pointerup`), with keyboard arrow-key support too — accessible and touch-correct.
- Two explicit breakpoints used consistently across the CSS: 768px (tablet/sidebar) and 480px (small phone) — not a sprawling breakpoint list, which is good hygiene.

**What's missing relative to TODO #30's ask of "different responsive priorities for coach vs. student":**
- The coach side, while it collapses gracefully, is still fundamentally a dashboard-with-sidebar pattern squeezed onto mobile — there's no coach-specific "mobile priority" redesign (e.g., what should a coach actually want to do from a phone? Today it's the same dashboard, just narrower). The brief's target (TODO #30) implies the coach and student surfaces should have *deliberately different* mobile strategies, not just "the same layout, responsively." This hasn't been designed yet.
- No dedicated tablet-specific layout thinking beyond the two breakpoints (i.e., 768–1024px just inherits the desktop sidebar layout, unexamined).
- Several data-dense screens (Financeiro's table, Treino/Nutrição builder rows) fall back to naive stacking on mobile (`grid-template-columns: 1fr` or a 2-col reflow) rather than a genuinely reconsidered mobile-first data-entry pattern — functional, not elegant, and likely to need rework once real usage patterns are known (a coach building a workout protocol on a phone, in particular, seems like a poor experience today given the dense `.ex-row` 7-column grid just collapses to stacked full-width fields).

---

## 9. Technical debt / duplication / inconsistencies (concrete list)

1. **`photoBg(i, angle)` hue-shift placeholder function is duplicated verbatim in 3 files**: `coach/cliente.html`, `coach/revisar.html`, `portal/evolucao.html` — same formula, same magic numbers, copy-pasted with no shared helper.
2. **`wireCompareInteraction()` (compare-slider drag logic) is duplicated verbatim in the same 3 files** — same pointerdown/pointermove/keydown code, ~25 lines each, could be one function in `nav.js` or `charts.js`.
3. **The "recent weeks table" / history-drawer body markup logic is duplicated between `coach/cliente.html`'s `historicoDrawerBody()` and `portal/historico.html`'s `drawerBody()`** — nearly identical functions with minor label differences ("Nota do coach" section present only in coach version). Should be one shared renderer parameterized by viewer role.
4. **Payment status label/pill maps (`statusLabel`/`statusPill` objects) are redefined independently in at least 4 files**: `coach/clientes.html`, `coach/cliente.html`, `coach/financeiro.html`, `portal/pagamento.html`, `portal/conta.html` — same `{paid: 'Pago', pending: 'Pendente', ...}` object retyped each time instead of exported once from `data.js` or `nav.js`.
5. **Cache-busting version mismatch**: `?v=12` on base.css and all JS files, but `?v=13` on `portal.css` in every portal page — either stale or inconsistent versioning scheme, no single source of truth for the asset version.
6. **`CHECKIN_TEMPLATE`/`CHECKIN_STEPS` in `data.js` are effectively dead code** — defined, exported on `window.Trackly`, but never read by `checkin.html`'s actual renderer, which hand-authors its own step content. This is the single most misleading piece of the codebase for anyone auditing "is check-in configurable" — the data suggests yes, the runtime says no.
7. **Coach shell tab bar in `cliente.html` mixes real tabs and page-navigation links without any visual distinction** — a user cannot tell that clicking "Treino" navigates away while clicking "Evolução" doesn't, until it happens.
8. **`instantiateManualClient()` in `data.js` duplicates a chunk of `buildWeeks()`'s default-week-seeding call** (same `weightStart:75, weightEnd:75, waterGoal:3...` object) in two places (`acceptInvite()` and `instantiateManualClient()`) instead of one shared "seed first week" helper.
9. **Inline `onclick="..."` string handlers mixed with `addEventListener`-based wiring** across the codebase (e.g., `clientes.html` roster rows use `onclick`, most other interactive elements use `addEventListener`) — inconsistent event-wiring convention.
10. **Heavy use of inline `style="..."` attributes for layout** (hundreds of occurrences) instead of utility/component classes, particularly in `cliente.html` and `revisar.html`'s render functions — makes future theming or design-system audits harder, and is inconsistent with how disciplined the actual CSS component library (`base.css`) otherwise is.
11. **`workoutHistory` only stores the single latest set per exercise, silently overwritten each session** — there's no history/log, so "progression over time" (mentioned in commit messages, e.g. "logWorkoutSession... progression context") is only ever comparing to the *one* previous value, not a real trend.
12. **`week.note` (seed-data-only free text like "Semana de viagem a trabalho...") has no corresponding way for a real user to add such a note** — it's baked into demo data generation (`buildWeeks(cfg.notes)`) but there's no UI for a coach or student to actually create one going forward, so it will silently stop appearing for any client created after the seed data.
13. **No automated tests of any kind** (no test runner, no test files found) — all "regression checks" mentioned in commit messages (e.g., "V12: final review - combined persistence regression, responsive check, docs") are manual, per the commit-message pattern, not codified.
14. **Global namespace pollution by convention, not by module system**: `window.Trackly`, `window.TracklyStore`, `window.TracklyNav`, `window.Charts`, `window.ICONS` — fine for a no-build prototype, but will need a real module boundary (ESM or bundler) before this scales past ~5 people's mental model of "what's on which global."
15. **No `docs/`, `ARCHITECTURE.md`, or brief file inside `prototype/` itself** despite `data.js`'s own top comment referencing "ver ARCHITECTURE.md" — that file does not exist anywhere in the repo (`git log`/`find` confirm it's not tracked), meaning the referenced source of truth for "the real schema" is missing or was never checked in. This audit had to reverse-engineer the target model entirely from code comments and the TODO list provided by the user.

---

## 10. Recommended order of attack + per-TODO-item verdict

### Dependency read
Two things block or de-risk almost everything else and should come first regardless of order preference:
1. **A real, stored `weekly_cycles` state machine** (TODO #5) — dashboard queueing (#4), avaliação (#7), orientação (#19), "semana concluída" experience (#35), and even notifications (#21, which needs to react to state transitions) all currently fake this via derived functions. Promoting it to a real stored/transitioned entity is the single highest-leverage change.
2. **The full target data model / metric registry** (TODO #31, #8) — check-in configurability (#6), the student workspace (#15), evolution/metrics UI (#11), and multi-tenancy (#32) all currently assume the hardcoded shape. Building the real schema (even before a real backend exists, e.g. as a better-typed in-memory layer) unblocks configurability everywhere else.

### One-line verdict per TODO item

1. **Auditar base existente** — this document; done.
2. **Arquitetura central como jornada contínua (ciclo semanal)** — *partially satisfied*: the narrative and derived states exist; no stored state machine.
3. **Organizar navegação do coach (3 itens)** — *satisfied*: `nav.js` already renders exactly Acompanhamento/Alunos/Financeiro.
4. **Acompanhamento como fila semanal de trabalho** — *mostly satisfied*: `coach/dashboard.html` already groups by received/completed/awaiting queues with a weekly progress counter; needs richer states once #5 lands.
5. **Ciclo semanal como unidade atômica (estados)** — *not started as a stored entity*: derived-only today; 3 of 7 target states are distinguishable, 4 are not stored/explicit.
6. **Check-in configurável por coach** — *not started functionally*: template data structure exists but is disconnected from the renderer, and is global (one coach) not per-coach.
7. **Avaliação como área de decisão (comparação entre semanas)** — *mostly satisfied*: `revisar.html` already has "o que mudou," recent-weeks table, goal editing; needs to move into the student workspace (#15) and gain explicit review-state.
8. **Métricas individuais por aluno (trackingSettings)** — *partially satisfied*: on/off flags already drive visibility everywhere; not a true registry, adding a metric touches ~8 files.
9. **Metas como dados históricos por aluno** — *partially satisfied*: live goal-setting persists correctly going forward; seeded history is formula-generated, not authored/durable in the target sense.
10. **Fotos como ferramenta de comparação (slider)** — *UI satisfied, data not started*: compare-slider UX is solid and reusable; there is zero real photo storage/upload, 100% placeholder.
11. **Evolução como leitura simples de tendência (peso)** — *satisfied*: single main weight chart + stat chips is exactly the V12 redesign already shipped.
12. **Histórico como timeline enxuta** — *satisfied*: drawer-based compact list (coach+portal) already matches this well.
13. **Treino como parte do workspace do aluno** — *partially satisfied*: builder (coach) and execution (student) both exist and work well; not embedded in the workspace, lives as a separate page (#15 dependency).
14. **Nutrição como parte do workspace do aluno** — *partially satisfied*: same situation as #13 — solid builder/consumption UI, wrong location.
15. **Workspace completo do aluno (8 tabs)** — *partially satisfied*: `cliente.html` already has all 8 tab labels but 3 of them are disguised page-navigations, breaking the "one workspace" goal.
16. **Home do aluno mobile-first (bottom nav)** — *satisfied*: exact 4-item bottom nav (Início/Treino/Nutrição/Progresso) already implemented.
17. **Início do aluno como central de "o que importa agora"** — *mostly satisfied*: `portal/dashboard.html` already surfaces check-in CTA, coach message, today's workout/meal minis, progress chips, status checklist in priority order.
18. **Check-in do aluno como fluxo natural mobile-first** — *mostly satisfied*: multi-step wizard with progress dots, steppers, range inputs, and window-status gating (open/reminder/closed) already implemented; needs to become template-driven (#6).
19. **Orientação do coach para o aluno** — *satisfied at data/UX level*: message + goals shown prominently on student home with the coach's identity attached; needs the workspace relocation (#15) and stored-state tie-in (#5).
20. **WhatsApp como canal (wa.me contextual)** — *satisfied*: multiple contextual message templates (check-in nudge varies by day, payment overdue, orientation-ready) already wired via `whatsappUrl()`.
21. **Camada de notificações multicanal** — *not started*: only WhatsApp deep-links and ephemeral toasts exist; no in-app inbox, no push/email, no notification log.
22. **Pagamentos (plano, gateway, webhooks)** — *partially satisfied*: plan/payment history data model and a clean `paymentProvider` abstraction seam exist; everything is simulated, no real gateway/webhook.
23. **Financeiro do coach (visão operacional)** — *satisfied*: `coach/financeiro.html` already delivers revenue/MRR/receivable/overdue/upcoming/filterable-list in a non-ERP, operational framing per the brief's own stated intent.
24. **Memória longitudinal (histórico agregado)** — *partially satisfied*: `buildCoachMemory()`/`buildPeriodSummary()`/`trendLine()` already implement minimum-data-gated longitudinal summaries; not backed by durable audit-trail data (see #9/#31 gaps on logs).
25. **Inteligência incremental por regras simples** — *partially satisfied*: the "insight" functions are exactly this in spirit (simple threshold rules, explicitly no causal language); scope is narrow (weight/adherence/sleep/water only) and would need to generalize once the metric registry (#8) exists.
26. **Preparar para benchmarking futuro** — *not started*: no cross-client aggregation, anonymization, or benchmarking scaffolding found anywhere.
27. **Manter produto profundo, não amplo (lista de não-fazer)** — *not evaluable from code*; this is a product-scope discipline item, not something the prototype can satisfy or fail on its own — worth capturing as an explicit written "won't build" list going forward since none exists in-repo.
28. **Consistência visual e de experiência** — *satisfied*: strong, coherent token/component system as detailed in §7.
29. **Lógica "app > site" (tabs, drawers, sheets)** — *mostly satisfied*: drawer/sheet pattern is genuinely responsive and reused; tabs exist but are inconsistently "real" (see #15/debt #7); no full modal component yet.
30. **Responsividade com prioridades diferentes coach/aluno** — *partially satisfied*: both sides are responsive and portal is genuinely mobile-first; the two sides are not yet *differently prioritized*, they're both just "the same layout, responsively" (see §8).
31. **Modelo de dados completo** — *partially satisfied, largest single gap*: see full breakdown in §2; roughly 40% analog coverage, denormalized, single-tenant, no audit trails.
32. **Multi-tenancy, privacidade, segurança** — *not started*: single hardcoded coach, no auth, no access control, no privacy design at all.
33. **PWA do aluno realmente usável** — *not started*: no manifest, no service worker, no offline handling, no installability found in any portal page's `<head>`.
34. **Estados vazios/erro/loading/confirmação** — *partially satisfied*: empty states exist in a few spots (nutrition/workout unset, roster no-results) and toasts cover some confirmations; loading and error states are absent everywhere (no network layer yet to require them, but they need designing before one exists).
35. **Experiência coerente de "semana concluída"** — *partially satisfied*: dashboard's "all done" state and `revisar.html`'s confirmation screen both exist and are pleasant, but they're two independently-built moments, not one coherent, reusable "week completed" pattern tied to the (not-yet-real) state machine.
36. **Validar fluxo completo ponta a ponta** — *not started as a formal exercise*: no test suite; the commit-message habit of "regression check" per release suggests manual E2E walkthroughs happen, but nothing is codified or repeatable.
37. **Produto mais valioso com o tempo** — *conceptually seeded, not built*: the longitudinal-memory functions (#24) are the right seed for this; nothing yet actively compounds value beyond "more weeks of history exist."
38. **Revisão final de produto/UX/posicionamento** — *not applicable yet*: this is necessarily the last item and depends on everything above landing first.

---

---

## Addendum (2026-09-17) — refresh for MASTER TODO — EVOLUÇÃO DO TRACKLY, item 1

Everything above is the original audit from before the previous TODO's items 6-38 were built and
verified live (see `ARCHITECTURE.md`'s V13-V18 changelog and the git log for the full list — photo
comparison, multi-channel notifications in-app layer, editable payments/subscriptions, student PWA
manifest+service worker, a full responsive pass, empty/error states, and an end-to-end integration
pass that found and fixed 4 real cross-cutting bugs). Most of items 21/22/30/33/34/36 in the *old*
audit's numbered list (§21-§38 above) moved from "not started"/"partial" to "satisfied" as a result.
This addendum answers item 1 of the *new* master TODO specifically — preserve/reuse vs. rebuild —
without repeating the file-by-file inventory above, which is still accurate for structure/routes.

**What should be preserved as-is (works well, don't rebuild):** the weekly-cycle state machine
(`cycleStatus`/`cycleStatusHistory` in `data.js`), the check-in→review→orientation→next-week loop,
the coach-memory/insight functions (`buildCoachMemory`, `checkInInsights`, `trendLine` — genuinely
good, rule-based, honest about their data-minimum gates), the drawer/toast/compare-slider shared
components in `base.css`, and the WhatsApp deep-link message builders. These are product logic and
UX decisions, not implementation debt — a visual or architectural refactor should carry them
forward, not redo them.

**Mocks / localStorage / simulated behavior (all of it lives in `assets/js/data.js` and
`assets/js/storage.js`)**: the 4 seed clients and all their weeks are procedurally generated
(`buildWeeks()`); every mutation (check-in submit, orientation, workout/nutrition edits, payments,
notifications) is persisted via `TracklyStore.patchClient()` to a single `trackly_v4_state`
localStorage key and re-merged on load via `applyStoredOverrides()`. `paymentProvider.charge/refund`
are explicit no-op stubs. Push/e-mail notification channels are marked `"declared"`, never sent.
This is the entire surface item 2-5 (real backend) needs to replace — see the "camada de dados"
note in `ARCHITECTURE.md` (`lib/repository.ts` is already planned as the seam: swap the mock
implementation for a real one behind the same function signatures, screens don't change).

**Duplication worth collapsing (relevant to item 33):** `data.js` is 2043 lines and mixes three
concerns that should eventually separate — (a) seed/mock data generation, (b) business logic
(status computation, KPI/trend calculation, the notification/payment event dispatchers), and
(c) the localStorage persistence bridge. Coach-side pages (`coach/cliente.html` alone is ~2000
lines) build every panel's HTML via large string-concatenation render functions
(`renderPagamentos()`, `renderTreino()`, `renderFotos()`, etc.) repeated with only small variations
across `coach/cliente.html` and the standalone `coach/treino.html`/`coach/nutricao.html` pages —
the standalone builder pages and the in-profile tabs duplicate nearly identical rendering logic
for the same workout/nutrition editors. The `.hero-stat`/`.list-row`/`.compare-slider`/`.card-pad`
CSS components are already well-factored and reused correctly — that part doesn't need rework.

**Reusable-component candidates for a real componentized frontend:** the stat-chip row, the
compare-slider (photo/metric before-after), the week-history drawer body, the empty-state block,
and the plan/subscription edit form are each duplicated 2-4 times across coach/portal pages with
copy-pasted markup-building functions — natural candidates to become actual reusable
functions/components once item 33's refactor happens.

**Dependency note before restructuring nav/IA (items 6-13):** `coach/cliente.html`'s tab router
reads `location.hash` for deep-linking (`#avaliacao`, `#pagamentos`, etc.) — several other pages
link directly to those hashes (`coach/dashboard.html`, `coach/clientes.html`, `coach/revisar.html`'s
"Ver histórico"). Any nav/IA restructuring must keep those hash targets working or update every
inbound link in the same pass, or those links will silently land on the wrong tab.

---

## Appendix: files read (all in full)

Coach: `coach/dashboard.html`, `coach/clientes.html`, `coach/cliente.html`, `coach/revisar.html`, `coach/treino.html`, `coach/nutricao.html`, `coach/financeiro.html`
Portal: `portal/dashboard.html`, `portal/checkin.html`, `portal/evolucao.html`, `portal/historico.html`, `portal/nutricao.html`, `portal/pagamento.html`, `portal/treino.html`, `portal/conta.html`
Shared: `index.html`, `convite.html`
Assets: `assets/css/tokens.css`, `assets/css/base.css`, `assets/css/landing.css`, `assets/css/portal.css`, `assets/js/data.js` (1309 lines), `assets/js/storage.js`, `assets/js/nav.js`, `assets/js/charts.js`, `assets/js/icons.js`
Also reviewed: `git log --oneline -30` (V2 through V12 iteration history).
