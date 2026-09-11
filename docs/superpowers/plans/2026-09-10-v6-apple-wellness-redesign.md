# V6 — Apple/Wellness Premium Redesign Implementation Plan

> **For agentic workers:** This is a static HTML/CSS/JS prototype with no build step and no automated test framework. There is no `pytest`/`jest` here — "tests" in this plan mean **browser verification** via the Claude Browser tool (`mcp__Claude_Browser__*`), the same method already used successfully for V1–V5 of this project. Execute inline in this session (see "Execution Handoff" at the end) rather than dispatching to subagents unfamiliar with the accumulated visual system.

**Goal:** Restyle and re-compose the existing Trackly prototype (coach + student views) into an "Apple/Wellness premium" visual language — less visible information, stronger typography, reveal-on-demand disclosure, minimal premium charts — **without** touching business logic, data model, localStorage persistence, or adding new features.

**Architecture:** Pure presentation-layer change. `assets/js/data.js` (business logic, `Trackly.*`) and `assets/js/storage.js` (persistence) are **not modified** except where explicitly noted (none currently needed — verified during file structure review). Changes land in: `assets/css/tokens.css` (refine color usage/spacing scale), `assets/css/base.css` (new/refactored components), `assets/js/charts.js` (chart visual language), and the markup + light view-logic inside each of the 10 HTML screens. Existing reveal-on-demand primitives already in the codebase (`.tabs`/`.tab-panel`, `.disclosure-btn`/`.disclosure-panel`, `.week-cycle` expand, `.range-sel`, `.chip-filter`) are reused, not reinvented — this keeps the diff proportional to "restyle + rearrange," matching the brief's "don't rebuild" constraint.

**Tech Stack:** Vanilla HTML/CSS/JS, no framework, no build step. Fonts: Fraunces (display), Inter (body), IBM Plex Mono (numeric). Served locally via `python -m http.server 8843 --directory prototype` (`.claude/launch.json`), previewed with the Claude Browser tool.

## Global Constraints

- Never rewrite `Trackly.*` business logic in `assets/js/data.js` — only presentation/markup/CSS/chart-rendering changes.
- Never lose per-client `tracking` config gating (`Trackly.isTracked(client, key)`) — every metric shown/hidden per client must remain conditional exactly as today; V6 only changes *how* a shown metric is presented, never *whether* it's shown.
- Never invent derived metrics not in the data model (explicitly banned by brief §20: no fabricated "% evolução corporal").
- Keep dark-mode-only design; keep localStorage overlay (`applyStoredOverrides`) working — reload must still restore state.
- Keep the invite flow (`convite.html`, `sendInvite`/`acceptInvite`) and check-in scheduling window (`Trackly.getCheckinWindowStatus`) behavior unchanged — only the messaging/visual states around them change.
- No new npm packages, no external chart library, no new persisted fields.
- All shared `<script src="...">` tags must keep the existing cache-busting query string; bump it from `?v=5` to `?v=6` across every HTML file in Task 1 (browser cache bug documented in `ARCHITECTURE.md`).
- Portuguese copy throughout, matching existing tone (short, direct, no explanatory sentences — brief §42–43).

---

## File Structure

**Modify (no new files needed — every V6 primitive either already exists or is a small addition to `base.css`):**

- `prototype/assets/css/tokens.css` — add spacing/typography scale tokens; no color value changes (existing dark palette already matches §36's intent — verified: `--paper:#101210`, `--ink:#F2F4EF`, `--brand:#3FAE81` used sparingly, `--gold:#D6A94E` reserved for attention). The change here is additive tokens only.
- `prototype/assets/css/base.css` — add `.hero-stat`, `.big-counter`, `.list-row`, `.compare-slider`, `.step-dots` components; retune `.card`/`.card-pad` usage (fewer places use it), retune chart CSS, add drawer/section transition helpers.
- `prototype/assets/js/charts.js` — visual language pass: thinner stroke, minimal grid/labels, refined tooltip and current-point marker, unchanged public API (`Charts.sparkline/lineChart/barChart` signatures untouched — every call site keeps working).
- `prototype/assets/js/nav.js` — no functional change; version bump only (shell markup already matches §9's "sidebar + sticky top + bottom nav" requirement).
- `prototype/coach/dashboard.html` — collapse queue sections, replace 4-number row with `.big-counter`.
- `prototype/coach/clientes.html` — restyle roster as `.list-row` list instead of dense table; keep all filter/search/invite logic identical.
- `prototype/coach/cliente.html` — reorder tabs to Visão geral → Evolução → Fotos → Histórico; rewrite Visão geral (`renderResumo`) to reveal-on-demand hero pattern; rewrite Fotos (`renderFotos`) around a comparison slider as the protagonist; light density pass on Evolução/Histórico.
- `prototype/coach/revisar.html` — restyle as compact "workspace," not document; hero stats via `.hero-stat`, tighten spacing.
- `prototype/portal/dashboard.html` — hero focus + goal list density pass, `.hero-stat` for progress row.
- `prototype/portal/checkin.html` — refine step indicator visual (`.step-dots`), keep 4-step wizard logic unchanged.
- `prototype/portal/evolucao.html` — `.hero-stat` for weight hero, comparison slider (shared pattern with coach `cliente.html` Fotos tab), density pass.
- `prototype/portal/historico.html` — timeline density pass (visual only — logic unchanged).
- `prototype/convite.html`, `prototype/index.html` — version bump only (`?v=6`), no structural change (out of brief's explicit scope; touched only for cache-busting consistency).

**Create:** none.

---

### Task 1: Design foundation — tokens, shared components, chart language

**Files:**
- Modify: `prototype/assets/css/tokens.css`
- Modify: `prototype/assets/css/base.css`
- Modify: `prototype/assets/js/charts.js`

**Interfaces:**
- Produces (consumed by every later task): CSS custom properties `--space-1..--space-7`, `--text-hero`, `--text-label`; CSS classes `.hero-stat` (+ `.hero-stat .value/.unit/.delta/.label`), `.big-counter` (+ `.num/.of/.cap/.sub`), `.list-row` (+ `.list-row .lead/.body/.meta/.actions`), `.compare-slider` (+ `.cs-before/.cs-after/.cs-handle`), `.step-dots`.
- `Charts.lineChart/barChart/sparkline` keep their exact current call signature (`{data, height, color, unit, min, max, maxXLabels, goalValue}`) — only internal rendering changes.

- [ ] **Step 1: Add spacing/typography scale tokens**

Append to `prototype/assets/css/tokens.css` right after the `--sidebar-w` line (inside `:root`):

```css
  /* escala de espaçamento — V6: a interface deve respirar (menos elementos, mais espaço) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  /* tipografia — números grandes = protagonistas, labels = pequenos e discretos */
  --text-hero: 34px;
  --text-counter: 56px;
  --text-label: 11.5px;
```

- [ ] **Step 2: Add `.hero-stat` — the "VALOR + VARIAÇÃO" primitive (brief §15)**

Append to `prototype/assets/css/base.css`:

```css
/* ---- V6: hero-stat — um valor grande + variação, em vez de várias infos pequenas ---- */
.hero-stat .value { font-family: var(--font-display); font-size: var(--text-hero); font-weight: 600; line-height: 1; letter-spacing: -.01em; }
.hero-stat .value .unit { font-family: var(--font-body); font-size: 15px; font-weight: 500; color: var(--ink-muted); margin-left: 4px; }
.hero-stat .delta { font-size: 13px; font-weight: 600; margin-top: 7px; }
.hero-stat .label { font-size: var(--text-label); font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--ink-faint); margin-top: 3px; }
.hero-stat.sm .value { font-size: 22px; }
```

- [ ] **Step 3: Add `.big-counter` — the coach dashboard central indicator (brief §7)**

Append to `prototype/assets/css/base.css`:

```css
/* ---- V6: big-counter — um indicador central em vez de quatro cards ---- */
.big-counter { text-align: center; padding: var(--space-2) 0 var(--space-1); }
.big-counter .num { font-family: var(--font-display); font-size: var(--text-counter); font-weight: 600; line-height: 1; letter-spacing: -.01em; }
.big-counter .num .of { color: var(--ink-faint); font-weight: 500; font-size: 30px; }
.big-counter .cap { font-size: var(--text-label); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); margin-top: var(--space-2); }
.big-counter .sub { display: flex; justify-content: center; gap: var(--space-5); margin-top: var(--space-4); font-size: 13px; color: var(--ink-muted); }
.big-counter .sub b { color: var(--ink); font-weight: 600; }
```

- [ ] **Step 4: Add `.list-row` — generic divider-row primitive (brief §4, replaces card-per-item)**

Append to `prototype/assets/css/base.css`:

```css
/* ---- V6: list-row — linha com divisor sutil, substitui "tudo é card" ---- */
.list-row { padding: var(--space-4) 2px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: var(--space-4); transition: background .15s ease; }
.list-row:last-child { border-bottom: none; }
.list-row:hover { background: var(--surface-sunken); border-radius: var(--radius-sm); }
.list-row .lr-lead { flex: none; }
.list-row .lr-body { flex: 1; min-width: 0; }
.list-row .lr-body strong { font-size: 14.5px; display: block; margin-bottom: 3px; }
.list-row .lr-body .lr-meta { font-size: 12px; color: var(--ink-faint); }
.list-row .lr-stats { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-top: 6px; font-size: 12.5px; color: var(--ink-muted); }
.list-row .lr-actions { flex: none; display: flex; align-items: center; gap: var(--space-2); }
.section-label { font-size: var(--text-label); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: var(--space-2); }
```

- [ ] **Step 5: Add `.compare-slider` — before/after photo comparison with draggable handle (brief §17–18)**

Append to `prototype/assets/css/base.css`:

```css
/* ---- V6: compare-slider — a foto é a protagonista, arrastar revela antes/depois ---- */
.compare-slider { position: relative; width: 100%; aspect-ratio: 3/4; border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); user-select: none; touch-action: none; }
.compare-slider .cs-after, .compare-slider .cs-before { position: absolute; inset: 0; }
.compare-slider .cs-before { overflow: hidden; }
.compare-slider .cs-tag { position: absolute; top: 12px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink); background: rgba(10,12,10,.55); backdrop-filter: blur(6px); padding: 4px 10px; border-radius: 999px; }
.compare-slider .cs-tag.before { left: 12px; }
.compare-slider .cs-tag.after { right: 12px; }
.compare-slider .cs-handle { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(242,244,239,.85); cursor: ew-resize; }
.compare-slider .cs-handle::after { content: ""; position: absolute; top: 50%; left: 50%; width: 40px; height: 40px; border-radius: 50%; background: var(--ink); transform: translate(-50%, -50%); box-shadow: 0 4px 14px rgba(0,0,0,.4); }
.compare-slider .cs-handle::before { content: "◂▸"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 11px; color: var(--on-accent); letter-spacing: 2px; z-index: 1; }
.compare-meta { display: flex; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-4); font-size: 12.5px; }
.compare-meta .cm-item { text-align: center; flex: 1; }
.compare-meta .cm-item .l { color: var(--ink-faint); font-size: 11px; margin-bottom: 3px; }
.compare-meta .cm-item .v { font-family: var(--font-mono); }
```

- [ ] **Step 6: Add `.step-dots` — refined step-progress for check-in wizard (brief §28)**

Append to `prototype/assets/css/base.css`:

```css
/* ---- V6: step-dots — indicador de progresso discreto ---- */
.step-dots { display: flex; gap: 6px; }
.step-dots .sd { flex: 1; height: 3px; border-radius: 2px; background: var(--line-strong); transition: background .25s ease; }
.step-dots .sd.done { background: var(--brand); }
```

- [ ] **Step 7: Retune chart CSS — minimal grid, refined tooltip, discrete point (brief §12–14)**

In `prototype/assets/css/base.css`, replace the existing chart block (currently `.chart-axis` through `.chart-tooltip`, roughly lines 324–347) with:

```css
.chart-axis { font-family: var(--font-mono); font-size: 10px; fill: var(--ink-faint); opacity: .7; }
.chart-svg { overflow: visible; }
.sparkline { display: block; }
.chart-line { stroke-width: 1.75; }
.chart-goal-line { stroke: var(--ink-faint); stroke-opacity: .35; }

@keyframes chart-draw { to { stroke-dashoffset: 0; } }
@keyframes chart-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes chart-pop-in { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
.chart-line-draw { animation: chart-draw 1.3s cubic-bezier(.4,0,.2,1) forwards; }
.chart-area { animation: chart-fade-in 1s ease .35s both; }
.chart-dot { animation: chart-pop-in .28s ease both; animation-delay: calc(.55s + var(--d, 0ms)); transform-box: fill-box; transform-origin: center; cursor: pointer; opacity: 0; }
.chart-dot.chart-dot-current { animation: chart-pop-in .3s ease both; animation-delay: calc(.6s + var(--d, 0ms)); }
.chart-bar { animation: chart-fade-in .45s ease both; cursor: pointer; }

.chart-tooltip {
  position: fixed; pointer-events: none; z-index: 60;
  background: var(--surface); border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm); padding: 7px 11px;
  font-size: 12px; font-family: var(--font-mono); color: var(--ink);
  box-shadow: 0 12px 28px -12px rgba(0,0,0,.6);
  opacity: 0; transform: translateY(2px); transition: opacity .12s ease, transform .12s ease;
}
.chart-tooltip.show { opacity: 1; transform: translateY(0); }
```

Note the two dot-animation rules: only the **last** data point in each series should get `chart-dot-current` (added in Step 8) — it renders slightly bigger/brighter so "current value" reads as discrete-but-findable per brief §12 ("ponto atual discreto").

- [ ] **Step 8: Simplify chart internals in `charts.js`**

Read the current file first (`prototype/assets/js/charts.js`) to locate the grid-line drawing block and the dot-generation loop. Make these targeted edits, keeping the exported function names/signatures identical:

1. Reduce horizontal grid lines: if the current implementation draws a grid line per data point or per Y-tick, cut it down to at most 2 (a faint baseline at the bottom + one at the midpoint), each `stroke="var(--line)"` `stroke-opacity="0.5"`, `stroke-dasharray="2 4"`.
2. On the last rendered dot of the series, add class `chart-dot chart-dot-current` (instead of plain `chart-dot`) and bump its radius by ~1.5px so it reads as "current value, discreet emphasis."
3. Reduce X-axis label count further where `maxXLabels` isn't already passed by call sites — default `maxXLabels` to 4 if omitted (was likely defaulting to "all labels," which reads as clutter per brief §12 "poucos labels").
4. Confirm `data-tip` attributes still populate the shared `.chart-tooltip` (delegated listener in the same file) — do not change that delegation mechanism, only the visual CSS above.

- [ ] **Step 9: Bump cache-busting version site-wide**

```bash
cd "prototype" && grep -rl '?v=5' --include="*.html" . | xargs sed -i 's/?v=5/?v=6/g'
```

- [ ] **Step 10: Verify foundation in browser**

Start the dev server preview (`mcp__Claude_Browser__preview_start` with the `.claude/launch.json` entry), open `coach/dashboard.html`, and confirm via `read_page`/screenshot:
- Page loads with no console errors (`read_console_messages`).
- No visual regression yet (Task 1 only adds unused-so-far CSS classes + retunes existing chart CSS) — any chart on this page should still render, with a visibly thinner line and fewer grid lines than before.

- [ ] **Step 11: Commit**

```bash
git add prototype/assets/css/tokens.css prototype/assets/css/base.css prototype/assets/js/charts.js prototype/**/*.html
git commit -m "$(cat <<'EOF'
V6 foundation: design tokens, shared premium components, chart language

Adds spacing/typography scale tokens and shared hero-stat/big-counter/
list-row/compare-slider/step-dots primitives used across the V6 redesign.
Retunes the chart engine toward a minimal premium look (thinner line,
fewer grid lines, discrete current-point marker, refined tooltip) with
no change to the Charts.* public API.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Coach Dashboard (brief §6–9)

**Files:**
- Modify: `prototype/coach/dashboard.html`

**Interfaces:**
- Consumes: `Trackly.buildWeeklySnapshot()`, `Trackly.clientStage(c)`, `Trackly.studentUpdate(c)`, `.big-counter`/`.list-row`/`.section-label` from Task 1.
- Produces: same DOM ids as before (`#week-nums`, `#week-fill`, `#queue-received`, `#queue-completed`, `#queue-awaiting`) so no other page's links break — only their *contents* change shape.

- [ ] **Step 1: Replace the 4-number row with `.big-counter`**

In `prototype/coach/dashboard.html`, replace the `.week-summary` block (lines 51–55) with:

```html
<div class="week-summary">
  <p class="range" id="week-range"></p>
  <div class="big-counter" id="week-counter"></div>
  <div class="week-progress-bar" style="max-width:260px;margin:14px auto 0;"><div class="fill" id="week-fill"></div></div>
</div>
```

- [ ] **Step 2: Rewrite the counter-fill logic in the inline `<script>`**

Replace the `document.getElementById("week-nums").innerHTML = ...` block with:

```js
document.getElementById("week-counter").innerHTML =
  '<div class="num">' + completed.length + '<span class="of">/' + snap.total + '</span></div>' +
  '<div class="cap">acompanhados</div>' +
  '<div class="sub">' +
    (received.length ? '<span><b>' + received.length + '</b> para revisar</span>' : '') +
    (awaiting.length ? '<span><b>' + awaiting.length + '</b> aguardando resposta</span>' : '') +
  '</div>';
```

Keep the `week-fill` width logic exactly as-is (`snap.total ? Math.round(100 * completed.length / snap.total) : 0`).

- [ ] **Step 3: Collapse "Concluídos" behind a reveal (brief §6 "Não mostrar tudo expandido")**

Replace `renderCompletedSection` to render a **collapsed summary row** instead of the full list, with a click-to-expand toggle. Replace the function body:

```js
function renderCompletedSection(completed) {
  if (!completed.length) return "";
  return (
    '<div class="list-row" id="completed-toggle" style="cursor:pointer;">' +
      '<div class="lr-lead">' + ICONS.check + '</div>' +
      '<div class="lr-body"><strong>' + completed.length + ' concluído' + (completed.length === 1 ? "" : "s") + '</strong><span class="lr-meta">Revisados esta semana</span></div>' +
      '<div class="lr-actions"><span style="font-size:12.5px;color:var(--brand);font-weight:600;">Ver concluídos</span></div>' +
    '</div>' +
    '<div id="completed-list" style="display:none;">' + completed.map(function (c) {
      var u = Trackly.studentUpdate(c), color = TracklyNav.colorFor(c);
      return '<div class="list-row"><span class="avatar lr-lead" style="background:' + color + '">' + c.initials + '</span>' +
        '<div class="lr-body"><strong>' + c.name + '</strong><span class="lr-meta">' + ICONS.check + ' ' + (u.completedAtLabel || "Acompanhamento concluído") + '</span></div>' +
        '<div class="lr-actions"><a href="cliente.html?id=' + c.id + '" class="btn btn-secondary">Ver</a></div></div>';
    }).join("") + '</div>'
  );
}
```

Add, right after both calls to `renderCompletedSection` are assigned into the DOM (end of the `render()` function, before its closing brace, and also in the `allDone` early-return branch before its `return;`):

```js
var ct = document.getElementById("completed-toggle");
if (ct) ct.addEventListener("click", function () {
  var list = document.getElementById("completed-list");
  var open = list.style.display !== "none";
  list.style.display = open ? "none" : "block";
  ct.querySelector(".lr-actions span").textContent = open ? "Ver concluídos" : "Ocultar";
});
```

- [ ] **Step 4: Restyle "Para revisar" and "Aguardando resposta" rows as `.list-row` + `.section-label`**

Replace the `qs-label`/`queue-card` markup in the `queue-received` and `queue-awaiting` blocks: swap `class="qs-label"` → `class="section-label"`, and swap the `queue-card` wrapper divs for `list-row` with `lr-lead`/`lr-body`/`lr-stats`/`lr-actions` classes mapping 1:1 to the old `who`/`q-stats`/`q-actions` structure (same inner content/logic, only class renames — do not change the `stats.push(...)` computation logic, only wrap its output in `<span class="lr-stats">...</span>` instead of `<div class="q-stats">`).

- [ ] **Step 5: Remove now-unused old CSS**

In the `<style>` block at the top of `dashboard.html`, delete the rules for `.week-summary .nums`, `.queue-card`, `.q-stats`, `.q-stat`, `.q-actions` (superseded by shared `.list-row`/`.lr-*` from Task 1) — keep `.greet`, `.week-summary .range`, `.queue-section .qs-label` can be deleted too since `.section-label` replaces it, `.empty-queue`, `.all-done`.

- [ ] **Step 6: Verify in browser**

Open `coach/dashboard.html` via the Browser tool. Confirm:
- The 3-second test (brief §45): a single glance shows `X/Y acompanhados`, and sub-line counts for "para revisar" / "aguardando resposta."
- Clicking a `[Revisar]` link still navigates to `revisar.html?id=...` and completing an orientation there, then returning to the dashboard, moves that client from "Para revisar" into the collapsed "Concluídos" row (click the row to confirm it now lists them) — this is the existing interactive-progress behavior from brief §8, unchanged in logic, only re-skinned.
- No console errors.

- [ ] **Step 7: Commit**

```bash
git add prototype/coach/dashboard.html
git commit -m "$(cat <<'EOF'
V6: minimalist coach dashboard — big-counter + collapsed completed section

Replaces the four-number stat row with a single central 8/12 indicator
and collapses the "Concluidos" list behind a click-to-reveal row, per
the reveal-on-demand principle. No change to underlying queue logic.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Clientes list (density pass)

**Files:**
- Modify: `prototype/coach/clientes.html`

**Interfaces:**
- Consumes: `Trackly.computeStatus(c)`, existing `state.filter`/`state.q`, `.list-row` from Task 1.
- Produces: same ids (`#roster-card`, `#roster-body`, `#empty`) — filter/search/invite click handlers untouched.

- [ ] **Step 1: Replace the `<table class="roster">` with a `.list-row` list**

Replace lines 54–61 (`<div class="card" id="roster-card">...</div>`) with:

```html
<div id="roster-card">
  <div id="roster-body"></div>
</div>
```

- [ ] **Step 2: Rewrite the `roster-body` render to emit `.list-row`s instead of `<tr>`s**

Replace the `document.getElementById("roster-body").innerHTML = rows.map(...)` block's row template with:

```js
return (
  '<div class="list-row"' + (clickable ? ' style="cursor:pointer;" onclick="location.href=\'cliente.html?id=' + c.id + '\'"' : '') + '>' +
    '<span class="avatar lr-lead" style="background:' + TracklyNav.colorFor(c) + '">' + c.initials + '</span>' +
    '<div class="lr-body"><strong>' + c.name + '</strong><span class="lr-meta">' + c.objective + (cur && cur.checkin.status === "submitted" ? " · último check-in " + Trackly.fmtShort(cur.end) : "") + '</span></div>' +
    '<span class="pill ' + pillClass + '"><span class="dot"></span>' + x.s.label + '</span>' +
    '<div class="lr-actions">' + actionHtml + '</div>' +
  '</div>'
);
```

Keep every variable (`x`, `c`, `cur`, `pillClass`, `actionHtml`) computed exactly as before — this step only changes the returned markup shape, not the filtering/status logic.

- [ ] **Step 3: Remove the now-unused `<table class="roster">` CSS**

Delete the `.roster`, `.client-cell` rules from `base.css` **only if** grep confirms no other file references them:

```bash
grep -rn "class=\"roster\"\|client-cell" prototype/
```

If clean, remove those two rule blocks from `base.css`; otherwise leave them (other screens may still use `.client-cell`).

- [ ] **Step 4: Verify in browser**

Open `coach/clientes.html`. Confirm: list renders one row per client with avatar/name/objective/status pill/action, filters (`chip-filter`) and search still narrow the list live, clicking a row still opens `cliente.html?id=...`, "Enviar convite" / "Simular aceitação" links still work for invite-status clients, "+ Adicionar aluno" panel still opens/creates a client and it appears in the list immediately.

- [ ] **Step 5: Commit**

```bash
git add prototype/coach/clientes.html prototype/assets/css/base.css
git commit -m "$(cat <<'EOF'
V6: clientes list as divider rows instead of a dense table

Restyles the roster into list-row entries (avatar, name, status, action)
consistent with the reduced-cards V6 language. Filtering, search, and
invite actions are unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Perfil do Cliente — tab shell + Visão geral (brief §10–11)

**Files:**
- Modify: `prototype/coach/cliente.html`

**Interfaces:**
- Consumes: `Trackly.computeKPIs`, `Trackly.computeStatus`, `Trackly.focusLabelFromOrientation`, `Trackly.isTracked`, `.hero-stat` from Task 1.
- Produces: tab ids renamed (`tab-resumo` → keep id, only label/order change) so Task 5–6 markup (Evolução/Fotos/Histórico render functions) still target the same containers.

- [ ] **Step 1: Reorder tabs to Visão geral → Evolução → Fotos → Histórico**

Replace lines 43–53 (`.tabs` block through the four `tab-panel` divs) with:

```html
<div class="tabs" style="margin-top:22px;">
  <button class="tab-btn active" data-tab="resumo">Visão geral</button>
  <button class="tab-btn" data-tab="evolucao">Evolução</button>
  <button class="tab-btn" data-tab="fotos">Fotos</button>
  <button class="tab-btn" data-tab="historico">Histórico</button>
</div>

<div class="tab-panel active" id="tab-resumo"></div>
<div class="tab-panel" id="tab-evolucao"></div>
<div class="tab-panel" id="tab-fotos"></div>
<div class="tab-panel" id="tab-historico"></div>
```

(This only reorders the DOM/label; the `renderers` object and `rendered` cache keyed by `resumo`/`evolucao`/`fotos`/`historico` in the script need no change since they're keyed by `data-tab`, not position.)

- [ ] **Step 2: Rewrite the profile header hero to match brief §10's exact composition**

Replace the `.profile-head` block content assembly (the lines setting `#p-avatar`/`#p-name`/`#p-meta`/`#p-status`) — keep the same element ids, but change `#p-meta` to render as a compact hero row instead of an inline meta line. Replace:

```js
document.getElementById("p-meta").innerHTML =
  '<span>Objetivo: <strong>' + client.objective + '</strong></span>' +
  '<span>Início: <strong>' + Trackly.fmtDate(client.startDate) + '</strong></span>' +
  '<span>Foco atual: <strong>' + Trackly.focusLabelFromOrientation(client, refWeek0) + '</strong></span>';
```

with:

```js
document.getElementById("p-meta").innerHTML =
  '<span>' + client.objective + '</span><span>·</span><span>Foco: ' + Trackly.focusLabelFromOrientation(client, refWeek0) + '</span>';
```

Add, directly under the existing `.profile-head` block in the HTML (before the `.tabs` div), a hero stat row summarizing the two most important numbers (weight + adherence), matching brief §10's example (`82,4 kg / ↓0,6kg`, `92% aderência`):

```html
<div style="display:flex;gap:40px;margin:18px 0 2px;flex-wrap:wrap;" id="p-hero-stats"></div>
```

And in the script, right after setting `#p-status`, add:

```js
var heroItems = [];
if (Trackly.isTracked(client, "weight")) {
  heroItems.push('<div class="hero-stat"><div class="value">' + kpi.weightNow + '<span class="unit">kg</span></div>' + deltaHtml(kpi.weightDelta, "kg") + '<div class="label">peso</div></div>');
}
if (Trackly.isTracked(client, "adherence")) {
  heroItems.push('<div class="hero-stat"><div class="value">' + kpi.adherenceAvg + '<span class="unit">%</span></div><div class="label">aderência</div></div>');
}
document.getElementById("p-hero-stats").innerHTML = heroItems.join("");
```

Note: the existing `deltaHtml(delta, unit, goodIfDown)` function already returns a `<div class="delta ...">` — it slots directly under `.hero-stat .value` per the CSS in Task 1.

- [ ] **Step 3: Rewrite `renderResumo` around brief §11's exact composition (Foco atual → Evolução → one primary chart, nothing else)**

Replace the whole `renderResumo` function body with:

```js
function renderResumo() {
  var cur = Trackly.currentWeek(client);
  var weeks8 = client.weeks.slice(-8).map(function (w) { return { label: "S" + w.weekNumber, value: w.metrics.weight }; });

  var focusBlock =
    '<div class="section-label">Foco atual</div>' +
    '<p style="font-size:15px;line-height:1.5;margin:0 0 18px;">' + Trackly.focusLabelFromOrientation(client, refWeek0) + '.</p>' +
    (cur.orientation ? '<p style="font-size:13.5px;color:var(--ink-muted);line-height:1.6;margin:0 0 28px;font-style:italic;">"' + cur.orientation + '"</p>' : '');

  var chips = [];
  if (Trackly.isTracked(client, "workouts")) chips.push('<div class="hero-stat sm"><div class="value">' + cur.metrics.workouts + '<span class="unit">/' + cur.metrics.workoutsGoal + '</span></div><div class="label">treinos</div></div>');
  if (Trackly.isTracked(client, "cardio")) chips.push('<div class="hero-stat sm"><div class="value">' + cur.metrics.cardio + '<span class="unit">/' + cur.metrics.cardioGoal + '</span></div><div class="label">cardio</div></div>');

  document.getElementById("tab-resumo").innerHTML =
    focusBlock +
    '<div class="section-label">Evolução</div>' +
    '<div style="display:flex;gap:36px;flex-wrap:wrap;margin-bottom:20px;">' + chips.join("") + '</div>' +
    (Trackly.isTracked(client, "weight") ? (
      '<div class="chart-head"><h3 style="font-size:13px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em;">Peso · 8 semanas</h3><a href="#" data-goto-evolucao style="font-size:12.5px;color:var(--brand);font-weight:600;">ver evolução</a></div>' +
      Charts.lineChart({ data: weeks8, height: 160, color: color, unit: "kg", maxXLabels: 4 })
    ) : "");

  var link = document.querySelector('[data-goto-evolucao]');
  if (link) link.addEventListener("click", function (e) { e.preventDefault(); document.querySelector('[data-tab="evolucao"]').click(); });
}
```

This drops the old `.stat-row` 3-card block entirely, replacing it with the `hero-stat` chips + a single chart, matching brief §11 ("Nada além disso deve competir pela atenção").

- [ ] **Step 4: Verify in browser**

Open `coach/cliente.html?id=joao`. Confirm: tab order is Visão geral/Evolução/Fotos/Histórico; Visão geral shows focus text, orientation quote (if any), 1–2 small hero chips (only for tracked metrics), and one chart; switching to a client with fewer tracked metrics (e.g. `?id=ana`) shows fewer chips and no chart section is missing/broken. Zoom into the hero-stat numbers to confirm typography hierarchy (big number, small label) reads clearly.

- [ ] **Step 5: Commit**

```bash
git add prototype/coach/cliente.html
git commit -m "$(cat <<'EOF'
V6: client profile hero + reordered tabs + reveal-on-demand overview

Visao geral now leads with focus + one chart instead of a 3-stat row;
tabs reordered to Visao geral/Evolucao/Fotos/Historico per the brief.
Per-client tracking gating is preserved exactly as before.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Perfil do Cliente — Evolução tab density pass (brief §12–16)

**Files:**
- Modify: `prototype/coach/cliente.html` (only the `renderEvolucao` function + its CSS)

**Interfaces:**
- Consumes: `Trackly.weeksInRange`, `Trackly.isTracked`, `Charts.lineChart/barChart` (Task 1's retuned visuals apply automatically — no call-site change needed for the chart engine itself).

- [ ] **Step 1: Add a weight hero (value + delta) above the primary chart**

In `renderEvolucao`, right before building `blocks`, compute the latest delta:

```js
var lastW = weeks[weeks.length - 1], prevW = weeks.length > 1 ? weeks[weeks.length - 2] : null;
var wDelta = prevW ? Trackly.round1(lastW.metrics.weight - prevW.metrics.weight) : null;
```

Replace the primary chart block's header:

```js
(Trackly.isTracked(client, "weight") ? (
  '<div class="chart-card" style="margin-bottom:24px;">' +
    '<div class="hero-stat" style="margin-bottom:16px;"><div class="value">' + lastW.metrics.weight + '<span class="unit">kg</span></div>' + deltaHtml(wDelta, "kg") + '<div class="label">peso</div></div>' +
    Charts.lineChart({ data: weeks.map(function (w) { return { label: "S" + w.weekNumber, value: w.metrics.weight }; }), height: 260, color: color, unit: "kg" }) +
  '</div>') : "")
```

(Drops the old `<div class="card card-pad">` wrapper + `.chart-head`/`.legend` markup — the chart now sits directly under the hero-stat, no card border, per brief §12 "fundo praticamente vazio.")

- [ ] **Step 2: Turn secondary metric blocks into compact rows instead of a 2-column grid of full cards**

Replace `'<div class="grid-2">' + blocks.join("") + '</div>'` — keep each `blocks.push(...)` call's *chart itself* unchanged, but change each pushed template from a bordered `<div class="card card-pad">...` to a lighter unbordered block:

```js
blocks.push('<div style="margin-bottom:22px;"><div class="chart-head" style="margin-bottom:8px;"><h3 style="font-size:12.5px;font-weight:600;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.03em;">Cintura</h3></div>' +
  Charts.lineChart({ ... }) + '</div>');
```

Apply the same header-style change (bordered card → plain block with an uppercase micro-label) to all five conditional blocks (cintura, aderência, sono, treinos, cardio, água) — same data/logic, only the wrapping markup. Then render them in a single column instead of `.grid-2`:

```js
'<div class="stack">' + blocks.join("") + '</div>'
```

- [ ] **Step 3: Verify in browser**

Open `coach/cliente.html?id=joao`, go to Evolução tab. Confirm: weight hero shows big number + delta above the chart; range selector (4/8/12/tudo) still switches data with the existing smooth transition; secondary metrics render as a vertical stack of light (non-card) sections, each only for tracked metrics. Test with `?id=ana` (fewer tracked metrics) to confirm blocks that shouldn't show (cardio/water/sleep/digestion/emotional/measurements for ana) are correctly absent.

- [ ] **Step 4: Commit**

```bash
git add prototype/coach/cliente.html
git commit -m "$(cat <<'EOF'
V6: Evolucao tab — weight hero-stat + de-carded secondary metrics

Primary weight chart now leads with a big value+delta; secondary
tracked metrics render as a light vertical stack instead of bordered
cards in a 2-column grid, reducing visual density per the brief.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Perfil do Cliente — Fotos tab as comparison-first "Evolução Visual" (brief §17–20)

**Files:**
- Modify: `prototype/coach/cliente.html` (only `renderFotos` + its CSS)

**Interfaces:**
- Consumes: `.compare-slider` from Task 1, existing `compareState`/`submittedWeeks`/`hue`/`photoSwatch` helpers (kept).
- Produces: the same `#tab-fotos` container; drag-handle interaction is new local JS scoped inside `renderFotos`.

- [ ] **Step 1: Rewrite `renderFotos` to lead with the slider comparison, de-emphasize the weekly gallery**

Replace the whole function body:

```js
function renderFotos() {
  var submittedWeeks = client.weeks.filter(function (w) { return w.checkin.status === "submitted"; });
  if (submittedWeeks.length < 2) {
    document.getElementById("tab-fotos").innerHTML = '<div class="empty-state"><h3>Ainda não há fotos suficientes</h3><p>A comparação aparece a partir de duas semanas com check-in enviado.</p></div>';
    return;
  }
  if (compareState.a == null) compareState.a = submittedWeeks[0].weekNumber;
  if (compareState.b == null) compareState.b = submittedWeeks[submittedWeeks.length - 1].weekNumber;

  var options = submittedWeeks.map(function (w) { return w.weekNumber; });
  function optHtml(sel) { return options.map(function (v) { return '<option value="' + v + '"' + (v === sel ? " selected" : "") + '>Semana ' + v + '</option>'; }).join(""); }

  var wA = client.weeks[compareState.a - 1], wB = client.weeks[compareState.b - 1];
  var weightDiff = Trackly.round1(wB.metrics.weight - wA.metrics.weight);
  var weeksBetween = compareState.b - compareState.a;

  var metaItems = [
    Trackly.isTracked(client, "weight") ? { l: "Peso", from: wA.metrics.weight + " kg", to: wB.metrics.weight + " kg", pct: Trackly.round1(100 * weightDiff / wA.metrics.weight) } : null,
    Trackly.isTracked(client, "measurements") && wA.metrics.waist != null ? { l: "Cintura", from: wA.metrics.waist + " cm", to: wB.metrics.waist + " cm", pct: Trackly.round1(100 * (wB.metrics.waist - wA.metrics.waist) / wA.metrics.waist) } : null,
    Trackly.isTracked(client, "adherence") ? { l: "Aderência", from: wA.metrics.adherence + "%", to: wB.metrics.adherence + "%", pct: Trackly.round1(wB.metrics.adherence - wA.metrics.adherence) } : null
  ].filter(Boolean);

  document.getElementById("tab-fotos").innerHTML =
    '<div style="display:flex;gap:14px;margin-bottom:16px;">' +
      '<select class="compare-select" data-side="a">' + optHtml(compareState.a) + '</select>' +
      '<select class="compare-select" data-side="b">' + optHtml(compareState.b) + '</select>' +
    '</div>' +
    '<div class="compare-slider" id="cs-photo">' +
      '<div class="cs-after" style="background:' + photoBg(1) + ';"><span class="cs-tag after">Agora · S' + compareState.b + '</span></div>' +
      '<div class="cs-before" id="cs-before-clip" style="width:50%;"><div style="width:calc(100vw);max-width:520px;height:100%;background:' + photoBg(0) + ';position:relative;"><span class="cs-tag before">Antes · S' + compareState.a + '</span></div></div>' +
      '<div class="cs-handle" id="cs-handle" style="left:50%;"></div>' +
    '</div>' +
    '<div class="compare-meta">' + metaItems.map(function (m) {
      return '<div class="cm-item"><div class="l">' + m.l + '</div><div class="v">' + m.from + ' → ' + m.to + '</div><div style="color:' + (m.pct <= 0 ? "var(--brand)" : "var(--coral)") + ';font-weight:600;">' + (m.pct > 0 ? "+" : "") + m.pct + '%</div></div>';
    }).join("") + '</div>' +
    '<p class="card-sub" style="margin-top:18px;">' + weeksBetween + ' semana' + (weeksBetween === 1 ? "" : "s") + ' entre as fotos. Placeholders ilustrativos — nenhuma foto real.</p>';

  wireCompareInteraction();
  document.querySelectorAll(".compare-select").forEach(function (sel) {
    sel.addEventListener("change", function () { compareState[sel.getAttribute("data-side")] = parseInt(sel.value, 10); renderFotos(); });
  });
}

function photoBg(i) { return 'hsl(' + hue + ',' + (26 + i * 6) + '%,' + (30 + i * 10) + '%)'; }

function wireCompareInteraction() {
  var wrap = document.getElementById("cs-photo");
  var handle = document.getElementById("cs-handle");
  var clip = document.getElementById("cs-before-clip");
  var dragging = false;
  function setPct(clientX) {
    var rect = wrap.getBoundingClientRect();
    var pct = Math.max(4, Math.min(96, ((clientX - rect.left) / rect.width) * 100));
    clip.style.width = pct + "%";
    handle.style.left = pct + "%";
  }
  handle.addEventListener("pointerdown", function (e) { dragging = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener("pointermove", function (e) { if (dragging) setPct(e.clientX); });
  handle.addEventListener("pointerup", function () { dragging = false; });
  wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.classList.contains("cs-after")) setPct(e.clientX); });
}
```

Remove the now-unused `milestoneWeeks`/`cards`/`photo-strip` gallery block entirely — brief §17 explicitly says to remove the "gallery of photos per week" feeling. The angle switcher (Frente/Costas/Lateral, brief §17) is intentionally deferred: the client data model only carries one weight/measurement value per week (no per-angle photo refs to switch between yet), so showing a non-functional angle switch would violate "don't invent" — note this as an explicit **not implemented** item in the Task 13 review pass, not a silent omission.

- [ ] **Step 2: Verify in browser**

Open `coach/cliente.html?id=joao`, go to Fotos tab. Confirm: the comparison slider renders with "Antes"/"Agora" tags, dragging the handle (via `computer` `left_click_drag` from the handle's coordinate) visibly reveals more/less of the "before" panel, the two `<select>`s change which weeks are compared and the meta row (peso/cintura/aderência deltas) updates accordingly, and no raw percentage like "evolução corporal: +17%" appears anywhere (only objective per-metric deltas, satisfying brief §20).

- [ ] **Step 3: Commit**

```bash
git add prototype/coach/cliente.html
git commit -m "$(cat <<'EOF'
V6: Fotos tab redesigned around before/after comparison slider

Replaces the per-week photo gallery with a draggable before/after
comparison as the primary interaction, plus objective per-metric deltas
(weight/waist/adherence) below — no fabricated "physical evolution %".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Perfil do Cliente — Histórico tab + portal Histórico (brief §21–22)

**Files:**
- Modify: `prototype/coach/cliente.html` (only `renderHistorico`)
- Modify: `prototype/portal/historico.html`

**Interfaces:**
- Consumes: existing `.week-cycle`/`.wc-head`/`.wc-body` disclosure primitive (unchanged behavior — click header to expand/collapse) — this already satisfies brief §22 ("ao clicar, abrir... somente quando necessário"), so this task is a **density pass only**, not a rebuild.

- [ ] **Step 1: Simplify the collapsed row to a minimal timeline line (brief §21's example: date, week #, one status line)**

In both files, replace the `.wc-head` template:

```js
'<div class="wc-head">' +
  '<span class="wk">S' + w.weekNumber + '</span>' +
  '<span class="wt">' + Trackly.fmtShort(w.start) + '–' + Trackly.fmtShort(w.end) + '<span style="margin-left:10px;">' + statusPill + '</span></span>' +
  '<span class="chev">' + ICONS.chevronR + '</span>' +
'</div>'
```

with:

```js
'<div class="wc-head">' +
  '<span class="wk">S' + w.weekNumber + '</span>' +
  '<span class="wt">' + Trackly.fmtShort(w.end) + '</span>' +
  '<span class="wc-status" style="color:' + (submitted ? "var(--brand)" : "var(--ink-faint)") + ';">' + (submitted ? (w.orientation ? "✓ Orientação enviada" : "✓ Check-in enviado") : "Pendente") + '</span>' +
  '<span class="chev">' + ICONS.chevronR + '</span>' +
'</div>'
```

This matches the brief's literal example ("Hoje / Semana 8 / ✓ Orientação enviada") more closely than the current pill-badge version, without touching the expand/collapse JS at all.

- [ ] **Step 2: Add `.wc-status` styling**

In `base.css`, near the existing `.wc-head`/`.wc-date` rules, add:

```css
.wc-status { font-size: 12.5px; font-weight: 500; flex: 1; text-align: right; margin-right: 10px; }
```

- [ ] **Step 3: Verify in browser**

Open both `coach/cliente.html?id=joao` (Histórico tab) and `portal/historico.html?client=joao`. Confirm each collapsed row now reads as "S8 · 6 set · ✓ Orientação enviada" (or "Pendente"), clicking a row still expands to show check-in/orientação/metas exactly as before, and the currently-open week (`i === 0`) still starts expanded.

- [ ] **Step 4: Commit**

```bash
git add prototype/coach/cliente.html prototype/portal/historico.html prototype/assets/css/base.css
git commit -m "$(cat <<'EOF'
V6: minimal timeline rows for Historico (coach + portal)

Collapsed week rows now show date + one status line instead of a date
range and a pill badge, matching the brief's minimal timeline example.
Expand/collapse behavior is unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Check-in do coach / Revisar (brief §23–24)

**Files:**
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes: `.hero-stat` from Task 1; every `Trackly.*` call in this file is read-only for display — no logic changes.

- [ ] **Step 1: Replace the "Resumo" card's `.resumo-strip` with a `.hero-stat` row**

Replace the block:

```js
'<div class="card card-pad" style="margin-bottom:18px;">' +
  '<p class="card-title" style="margin-bottom:14px;">Resumo</p>' +
  '<div class="resumo-strip">' + ... + '</div>' +
'</div>'
```

with (drop the card wrapper and title text — brief §43 "o design deve explicar", no "Resumo" label needed above a hero row):

```js
'<div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:26px;">' +
  (Trackly.isTracked(client, "weight") ? '<div class="hero-stat"><div class="value">' + cur.metrics.weight + '<span class="unit">kg</span></div>' + weightDeltaForHero + '<div class="label">peso</div></div>' : "") +
  (Trackly.isTracked(client, "adherence") ? '<div class="hero-stat"><div class="value">' + cur.metrics.adherence + '<span class="unit">%</span></div><div class="label">aderência</div></div>' : "") +
  (Trackly.isTracked(client, "sleep") ? '<div class="hero-stat"><div class="value">' + cur.metrics.sleep + '<span class="unit">h</span></div><div class="label">sono</div></div>' : "") +
'</div>'
```

Compute `weightDeltaForHero` right before this block (there is no existing per-week weight delta computed in this file — derive it the same way `cliente.html`'s `deltaHtml` does, from the previous submitted week):

```js
var weeksSoFar = client.weeks.slice(0, client.weeks.indexOf(cur) + 1).filter(function (w) { return w.checkin.status === "submitted"; });
var prevSubmitted = weeksSoFar.length > 1 ? weeksSoFar[weeksSoFar.length - 2] : null;
var weightDeltaForHero = "";
if (prevSubmitted && Trackly.isTracked(client, "weight")) {
  var wd = Trackly.round1(cur.metrics.weight - prevSubmitted.metrics.weight);
  var good = Trackly.isGoodWeightDelta(client, wd);
  weightDeltaForHero = '<div class="delta" style="color:' + (wd === 0 ? "var(--ink-faint)" : (good ? "var(--brand)" : "var(--coral)")) + ';">' + (wd === 0 ? "" : (wd < 0 ? "↓ " : "↑ ")) + Math.abs(wd) + 'kg</div>';
}
```

- [ ] **Step 2: Rename "O que mudou" section header styling to a `.section-label` (drop the card wrapper's `card-title`) and tighten "Últimas semanas"/"Respostas"/"Evolução visual" blocks to plain sections instead of separate bordered cards**

Change every occurrence of `<p class="card-title" style="margin-bottom:...px;">LABEL</p>` inside this file's template string to `<p class="section-label">LABEL</p>`, and change the wrapping `<div class="card card-pad" style="margin-bottom:18px;">...</div>` for the "O que mudou," "Últimas semanas," "Ver respostas completas," and "Evolução visual" blocks to plain `<div style="margin-bottom:26px;">...</div>` (no border/background) — this is what brief §24 means by "workspace, not document": remove the stacked-cards-as-report feeling, keep every existing data/insight/table untouched.

Keep the orientation input card and the final "Enviar orientação" button as the **one** remaining bordered `.card` on the page (it's the actionable work surface, appropriately emphasized) — do not remove that one.

- [ ] **Step 3: Verify in browser**

Open `coach/revisar.html?id=joao`. Confirm: page opens directly into hero stats (no "Resumo" label above them), "O que mudou"/"Últimas semanas"/respostas-disclosure/"Evolução visual" read as plain sections separated by spacing rather than a stack of boxes, the orientation textarea + metas editor + "Enviar orientação" still work exactly as before (test: type an orientation, adjust a goal input, click send, confirm the success screen appears and the client now shows as completed on the dashboard).

- [ ] **Step 4: Commit**

```bash
git add prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V6: revisar.html as a workspace — hero stats, de-carded sections

Drops the stacked-cards report feel: resumo becomes a hero-stat row,
o-que-mudou/ultimas-semanas/respostas/evolucao-visual become plain
sections. Orientation editor remains the one emphasized action surface.
No change to review/send-orientation logic.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Home do aluno (brief §25)

**Files:**
- Modify: `prototype/portal/dashboard.html`

**Interfaces:**
- Consumes: `Trackly.effectiveGoals`, `Trackly.computeKPIs`, `.hero-stat` from Task 1.

- [ ] **Step 1: Replace the `.progress-row` items with `.hero-stat`**

Replace the `progressItems` array's per-item templates (currently `<div class="item"><div class="l">...</div><div class="v mono">...</div></div>`) with `.hero-stat` markup, keeping the exact same conditions (`Trackly.isTracked(client, "weight"/"adherence"/"workouts")`):

```js
var progressItems = [
  Trackly.isTracked(client, "weight") ? '<div class="hero-stat sm"><div class="value">' + kpi.weightNow + '<span class="unit">kg</span></div><div class="delta" style="color:' + (Trackly.isGoodWeightDelta(client, kpi.weightDelta) ? "var(--brand)" : "var(--coral)") + ';">' + (kpi.weightDelta <= 0 ? "↓" : "↑") + Math.abs(kpi.weightDelta) + 'kg</div><div class="label">peso</div></div>' : "",
  Trackly.isTracked(client, "adherence") ? '<div class="hero-stat sm"><div class="value">' + kpi.adherenceAvg + '<span class="unit">%</span></div><div class="label">aderência</div></div>' : "",
  Trackly.isTracked(client, "workouts") ? '<div class="hero-stat sm"><div class="value">' + cur.metrics.workouts + '<span class="unit">/' + cur.metrics.workoutsGoal + '</span></div><div class="label">treinos</div></div>' : ""
].join("");
```

- [ ] **Step 2: Simplify the goals list to one-line rows instead of bordered cards**

Replace the `#goals-list` template (currently one `<div class="card card-pad" style="display:flex...">` per goal) with `.list-row`:

```js
document.getElementById("goals-list").innerHTML = Trackly.effectiveGoals(client, refWeek).map(function (g) {
  return (
    '<div class="list-row">' +
    '<span class="lr-lead" style="width:32px;height:32px;border-radius:9px;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;">' + goalIcons[g.key] + '</span>' +
    '<div class="lr-body"><strong>' + g.label + '</strong></div>' +
    '<div class="lr-actions mono" style="color:var(--ink-muted);">' + g.target + (g.unit === "%" ? "%" : (" " + g.unit)) + '</div>' +
    '</div>'
  );
}).join("");
```

- [ ] **Step 3: Verify in browser**

Open `portal/dashboard.html?client=joao`. Confirm greeting, focus hero, goal list (list-rows now), coach message card, and progress hero-stats + mini chart all render; test with `?client=ana` (fewer tracked goals) to confirm the goal list only shows ana's tracked metrics.

- [ ] **Step 4: Commit**

```bash
git add prototype/portal/dashboard.html
git commit -m "$(cat <<'EOF'
V6: student home — hero-stat progress row + list-row goals

Applies the shared hero-stat and list-row primitives to the student
dashboard's progress numbers and goal list, reducing card density.
Per-client goal/tracking logic is unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Check-in do aluno — step indicator + blocked state (brief §28, §31)

**Files:**
- Modify: `prototype/portal/checkin.html`

**Interfaces:**
- Consumes: `.step-dots` from Task 1; `Trackly.CHECKIN_STEPS`, `Trackly.getCheckinWindowStatus`, `Trackly.nextOpenDate` — unchanged.

- [ ] **Step 1: Swap the `.step-bar` segments for `.step-dots`**

Replace `renderNav`'s step-bar line:

```js
document.getElementById("step-bar").innerHTML = steps.map(function (s) { return '<div class="seg' + (s.n <= current ? " done" : "") + '"></div>'; }).join("");
```

with:

```js
document.getElementById("step-bar").innerHTML = '<div class="step-dots">' + steps.map(function (s) { return '<div class="sd' + (s.n <= current ? " done" : "") + '"></div>'; }).join("") + '</div>';
```

Remove the now-superseded `.step-bar`/`.step-bar .seg`/`.step-bar .seg.done` rules from this file's `<style>` block (replaced by the shared `.step-dots` from Task 1).

- [ ] **Step 2: Restyle the blocked/reminder state per brief §31 (elegant message, no disabled form)**

Replace the early-return block (`if (pending && win !== "open") { ... }`) markup with a centered hero message using existing typographic tokens, no card border:

```js
document.getElementById("ci-form").innerHTML =
  '<div style="text-align:center;padding:70px 24px 20px;">' +
  '<p class="eyebrow" style="justify-content:center;display:flex;">' + (win === "reminder" ? "Em breve" : "Check-in indisponível") + '</p>' +
  '<h1 style="font-family:var(--font-display);font-size:23px;margin:0 0 10px;">' + (win === "reminder" ? "Seu check-in abre amanhã" : "Seu próximo check-in abre " + nextOpenLabel) + '</h1>' +
  '<p style="font-size:13.5px;color:var(--ink-muted);max-width:280px;margin:0 auto;">' + (win === "reminder" ? "Reserve alguns minutos amanhã para registrar sua semana." : "O período desta semana já terminou — volte então.") + '</p>' +
  '</div><a href="dashboard.html?client=' + client.id + '" class="btn btn-secondary btn-block" style="margin-top:20px;">Voltar ao início</a>';
```

This directly matches brief §31's requested copy shape ("CHECK-IN INDISPONÍVEL" / "Seu próximo check-in abre sexta-feira") while reusing the existing `win`/`nextOpenLabel` variables already computed above this block.

- [ ] **Step 3: Verify in browser**

Open `portal/checkin.html?client=joao` in all three window states using the `?simDate=` override (per `ARCHITECTURE.md`'s documented testing method):
- A Monday–Wednesday date → confirm the new blocked-state message renders (no form fields visible).
- A Thursday date → confirm the "reminder" message renders.
- A Friday/Saturday/Sunday date → confirm the 4-step wizard renders with `.step-dots` at the top, and stepping through all 4 steps + submit still shows the success screen.

- [ ] **Step 4: Commit**

```bash
git add prototype/portal/checkin.html
git commit -m "$(cat <<'EOF'
V6: check-in step-dots + elegant blocked state

Swaps the step progress bar for the shared step-dots primitive and
replaces the closed-window message with a centered, cardless state per
the brief. Scheduling logic and the 4-step wizard flow are unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Evolução do aluno (brief §12–16, mirrors Task 5)

**Files:**
- Modify: `prototype/portal/evolucao.html`

**Interfaces:**
- Consumes: `.hero-stat`, `.compare-slider` (reuse Task 6's slider pattern) from Task 1.

- [ ] **Step 1: Replace the ad hoc `#weight-hero` inline styling with `.hero-stat`**

Replace the `weight-hero` assignment:

```js
document.getElementById("weight-hero").innerHTML =
  '<span style="font-family:var(--font-display);font-size:34px;font-weight:600;">' + lastW.metrics.weight + 'kg</span>' +
  (prevW ? '<span style="font-size:13px;font-weight:600;color:...;">...</span>' : '');
```

with:

```js
document.getElementById("weight-hero").innerHTML =
  '<div class="hero-stat"><div class="value">' + lastW.metrics.weight + '<span class="unit">kg</span></div>' +
  (prevW ? '<div class="delta" style="color:' + (Trackly.isGoodWeightDelta(client, wkDelta) ? "var(--brand)" : "var(--coral)") + ';">' + (wkDelta <= 0 ? "↓" : "↑") + ' ' + Math.abs(wkDelta) + 'kg esta semana</div>' : '') +
  '</div>';
```

- [ ] **Step 2: Replace the compare-select photo grid with the `.compare-slider` from Task 6**

Replace the `renderCompare` function body with the same slider approach used in `coach/cliente.html`'s `renderFotos` (Task 6, Step 1) — copy the `compare-slider`/`wireCompareInteraction`/`photoBg` pattern verbatim, adapted to this file's existing `compareState`/`submittedWeeks`/`angles`/`hue` variables (already present in this file, no new state needed). Render into the existing `#compare-card` container.

- [ ] **Step 3: De-card the secondary metric sections in `#more-panel` the same way Task 5 did for the coach view (uppercase micro-label header, no card border, vertical stack)**

Apply the identical header-style change from Task 5 Step 2 to the sleep/water/workouts/cardio blocks inside `#more-panel`.

- [ ] **Step 4: Verify in browser**

Open `portal/evolucao.html?client=joao`. Confirm: weight hero shows big value + delta, range selector still works, the photo comparison section now uses the drag-slider (test dragging), "Ver mais métricas" disclosure still expands/collapses the secondary charts, and the period summary at the bottom is unchanged. Test `?client=maria` to confirm hidden-metric gating still holds (no sleep/emotional/digestion/measurements/cardio sections for her).

- [ ] **Step 5: Commit**

```bash
git add prototype/portal/evolucao.html
git commit -m "$(cat <<'EOF'
V6: student Evolucao — hero-stat weight + drag comparison slider

Mirrors the coach profile's V6 treatment: weight hero-stat, before/after
drag slider for photos (replacing the two-select grid), de-carded
secondary metric sections. Tracking-based gating unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Mobile pass + microinteractions/transitions (brief §26–27, §39–40)

**Files:**
- Modify: `prototype/assets/css/base.css`

**Interfaces:**
- Pure CSS addition; no markup or JS changes elsewhere (the bottom-nav/mobile-menu markup already exists from `nav.js`).

- [ ] **Step 1: Add short, non-flashy transitions for tab switches and disclosure panels**

Add to `base.css`:

```css
/* ---- V6: transições discretas ---- */
.tab-panel.active { animation: fadein .16s ease; }
.disclosure-panel { transition: max-height .22s ease; }
.week-cycle .wc-body { transition: none; } /* already display:none/block toggle — keep instant, no jank from animating display */
.btn { transition: background-color .12s ease, border-color .12s ease, transform .08s ease; }
.btn:active { transform: scale(.97); }
.list-row { transition: background-color .15s ease; }
```

- [ ] **Step 2: Refine bottom-nav active-state discretion (brief §27 "item ativo deve ser muito discreto")**

Locate `.bn-item.active` in `base.css` (if it currently uses a bold color fill or background pill) and tune it down to a subtle color-only change:

```css
.bn-item { color: var(--ink-faint); }
.bn-item.active { color: var(--brand); }
.bn-item svg { transition: transform .15s ease; }
.bn-item.active svg { transform: translateY(-1px); }
```

(Read the current `.bn-item`/`.bn-item.active` rule first and adjust in place rather than duplicating — the goal is: no background pill, no bold weight change, just a restrained color+micro-lift.)

- [ ] **Step 3: Verify in browser at mobile viewport**

Use `mcp__Claude_Browser__resize_window` with `preset: "mobile"`, open `portal/dashboard.html?client=joao`, confirm bottom nav renders full-width with the active tab shown only via subtle color (not a filled pill), tapping between tabs feels instant, and no layout overflow/horizontal scroll appears. Reset with `preset: "desktop"` afterward.

- [ ] **Step 4: Commit**

```bash
git add prototype/assets/css/base.css
git commit -m "$(cat <<'EOF'
V6: discreet microinteractions and mobile bottom-nav polish

Adds short, restrained transitions (tab fade, button press, list-row
hover) and tones down the bottom-nav active state to color-only per
the brief's "nada de efeito visual" principle.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Final review pass — "app vs. site" test on all 10 screens (brief §45–50)

**Files:** none pre-determined — this task is a verification + targeted-fix pass across every file touched above.

- [ ] **Step 1: Load the `web-design-guidelines` skill and run it against the changed screens**

Invoke it once per major screen family (coach shell, portal shell) rather than per file, since they share the same nav/typography system — flag any accessibility/contrast/touch-target issues it finds (e.g., verify `.compare-slider`'s drag handle has an adequate hit target on mobile, verify pill/status colors keep sufficient contrast against `--surface`).

- [ ] **Step 2: For each of the 10 screens listed in brief §50, open it in the Browser tool and answer "premium app or admin site?"**

Screens: Dashboard Coach, Clientes, Perfil do Cliente (all 4 tabs), Revisão, Orientação (same file as Revisão), Fotos (covered in Perfil), Histórico (both coach + portal), Home Aluno, Check-in, Evolução (portal). For each: run the literal 3-second test from brief §45 (can you tell counts/where-to-click, focus/what-changed, how-to-compare, how-it-evolved, what-to-do-this-week, respectively) using `read_page`/screenshot, and note any screen that still reads as "explaining itself" (leftover `<p class="card-sub">` sentences describing what a section does, per brief §43) — remove any found.

- [ ] **Step 3: Grep for leftover explanatory copy patterns**

```bash
grep -rn "Essa seção\|mostra os\|Nesta tela\|nesta seção" prototype/*.html prototype/coach/*.html prototype/portal/*.html
```

Fix any matches by deleting the explanatory sentence (the section's `.section-label`/heading should already say what it is).

- [ ] **Step 4: Full-flow regression check (webapp-testing skill / Browser tool)**

Re-run, end-to-end, the three flows that must survive untouched:
1. **Coach reviews a check-in:** dashboard → "Revisar" on a client with a pending check-in → adjust goals + write orientation → send → confirm client moves to "Concluídos" on the dashboard and the student now sees the new focus/message on their home.
2. **Student submits a check-in:** portal dashboard (window open, via `?simDate=`) → "Começar check-in" → complete all 4 steps → submit → confirm success screen, and confirm the client now shows as "Para revisar" on the coach dashboard.
3. **Invite a new student:** clientes.html → "+ Adicionar aluno" → create → "Enviar convite" → `convite.html?id=...` → "Aceitar convite" → confirm the student appears with full data going forward.
4. **Reload persistence:** after step 1 or 2, hard-reload the page and confirm the change (orientation sent / check-in submitted) survived via `localStorage` (`applyStoredOverrides`).

- [ ] **Step 5: Fix any regressions found, then final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
V6: final review pass — app-vs-site cleanup and flow regression fixes

Removes leftover explanatory copy, applies web-design-guidelines
findings, and confirms the three core flows (review, check-in submit,
invite) plus localStorage persistence still work end-to-end after the
V6 visual pass.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:** §1–5 (direction/principles) → realized via Task 1's shared primitives and every screen task's markup simplification. §6–9 (dashboard) → Task 2. §10–11 (profile hero/overview) → Task 4. §12–16 (charts) → Task 1 Steps 7–8 + Tasks 5/11. §17–20 (photos) → Task 6/11. §21–22 (histórico) → Task 7. §23–24 (revisar) → Task 8. §25 (home aluno) → Task 9. §26–29 (mobile/interaction) → Task 12 + existing bottom-nav/segmented-control/chip primitives (no new component needed, confirmed present in codebase). §30–31 (check-in dates/blocked state) → Task 10 (logic already correct, only Step 2 is new). §32–35 (invite/individual metrics) → explicitly unchanged, verified in Task 13 Step 4. §36–38 (color/type/space) → Task 1 tokens. §39–40 (microinteractions/transitions) → Task 12. §41–44 (product feel / no scope creep) → enforced by Global Constraints + Task 13's explanatory-copy grep. §45–48 (tests/principles) → Task 13. §49 (implement directly) → every task edits real files, no recommendations-only step. §50–51 (final review/result) → Task 13.

**Gap flagged, not silently dropped:** brief §17's "Frente/Costas/Lateral" angle switcher on the comparison view is **not implemented** — the data model has no per-angle photo reference to switch between (only a single placeholder swatch per week), so building a switcher would either fabricate data or be non-functional chrome. This is called out explicitly in Task 6 Step 1 and should be mentioned to the user as an intentional, honest omission rather than silently skipped.

**Type/name consistency check:** `.hero-stat`, `.big-counter`, `.list-row`, `.compare-slider`, `.step-dots` are defined once in Task 1 and referenced by the exact same class names in every later task (grepped through Tasks 2–11 above) — no renamed variants introduced.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-10-v6-apple-wellness-redesign.md`.

Given this project's established workflow (V1–V5 were all executed directly, inline, with live browser verification after each change — not via subagent dispatch), and given that visual consistency across 10 screens benefits from one continuous agent holding the whole design system in context rather than fragmenting it across fresh subagents, **inline execution in this session is recommended** over subagent-driven-development. Proceeding task-by-task inline, committing after each, with browser verification as specified in each task's steps.
