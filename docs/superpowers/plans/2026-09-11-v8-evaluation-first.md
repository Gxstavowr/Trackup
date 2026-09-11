# V8 — Evaluation First Implementation Plan

> **For agentic workers:** Static HTML/CSS/JS prototype, no build step, no test framework. "Tests" here mean **browser verification** via the Claude Browser tool, same method as V1–V7. Execute inline in this session (see "Execution Handoff").

**Goal:** Make the coach's weekly review ("Avaliação") the product's center of gravity — a single screen where weight, the previous-week↔current-week photo comparison, what changed, recent context, and the decision live together — and fix the one real inconsistency V7 left behind (the Evolução tab's period selector doesn't actually control the period-summary text). No new pages, no new nav items, no new persisted concepts beyond one small `coachNote` field.

**Architecture:** Three real gaps exist between the brief and the current (post-V7) code, everything else the brief describes is already built:
1. `coach/revisar.html`'s photo comparison is a row of four tiny 40×54px swatches with no drag/compare interaction — the brief wants the same big `.compare-slider` component already used in the Fotos tabs, pinned to previous↔current week, front here in the review instead of buried behind "ver comparação."
2. `portal/evolucao.html`'s "Resumo do período" always summarizes the last 8 weeks regardless of the range selector the user just clicked (`Trackly.buildPeriodSummary(client, 8)` hardcoded) — brief §9–11 explicitly requires the period control to drive the summary, not just the chart. `coach/cliente.html`'s Evolução tab has no period-summary block at all yet.
3. There's nowhere for the coach to jot a short private note during review, and no Frente/Costas/Lateral switch on any photo comparison (V6 deliberately skipped it as "no real per-angle photo data" — V8 asks again explicitly in two places, so this time it's implemented honestly: the angle control changes which placeholder swatch renders, exactly as disclosed by the existing "placeholders ilustrativos" caption — it never claims to be a real photo).

**Tech Stack:** Vanilla HTML/CSS/JS, same as V1–V7. Cache-busting bumps to `?v=8`.

## Global Constraints

- Never claim a real photo — the angle switch changes a placeholder swatch's hue, and the existing "Placeholders ilustrativos — nenhuma foto real" caption stays on every screen that shows one.
- Never mix periods in one summary — `buildPeriodSummary`'s returned object must represent exactly the range the user selected, nothing blended.
- Never show a metric/section for an untracked key (`Trackly.isTracked` gates everything new, exactly like every prior version).
- No new top-level nav items, no "Analytics/Insights/Memory/Reports" page — everything lives inside the existing Dashboard/Clientes (coach) and Início/Check-in/Evolução/Histórico (aluno) screens.
- No AI-flavored affordances ("Ask AI", "Analyze with AI") anywhere — grepped for in Task 6.
- `coachNote` persists via the same `TracklyStore.patchClient` call `completeOrientation` already makes — no new storage key, no new schema table.
- Bump `?v=7` → `?v=8` on every shared script tag, site-wide, same commit as the last JS/CSS change.

---

## File Structure

**Modify:**
- `prototype/assets/js/data.js` — `buildPeriodSummary(client, range)` accepts the same range tokens as `weeksInRange` (`"4"|"8"|"12"|"all"`) instead of a raw week count; `completeOrientation` accepts and persists an optional `note`; `applyStoredOverrides` reapplies it as `cur.coachReview = { note }`.
- `prototype/coach/revisar.html` — renamed to "Avaliação" in title/heading; simplified Resumo da Semana (peso/aderência/treinos); new "Evolução desta semana" module (big compare-slider, prev↔current week, angle switch); reordered sections; new "Notas do coach" textarea wired into the send-orientation payload.
- `prototype/portal/evolucao.html` — period-summary call now uses `state.range` instead of hardcoded `8`; photo comparison gets an angle switch.
- `prototype/coach/cliente.html` — Evolução tab gains a period-summary block wired to `evoState.range`; Fotos tab's comparison gets the angle switch and a larger size.
- `prototype/coach/cliente.html`, `prototype/portal/historico.html` — collapsed-week status copy: "✓ Orientação enviada" → "✓ Acompanhamento concluído" (brief §20's literal wording).
- `prototype/assets/css/base.css` — `.compare-slider.lg` size modifier; small `.angle-tabs` segmented-control style (reuses `.range-sel` visual language, new class only because the markup context differs).
- Every HTML file — cache-bust `?v=7` → `?v=8`.

**Create:** none.

---

### Task 1: Data layer — period-token summary + coach note persistence

**Files:**
- Modify: `prototype/assets/js/data.js`

**Interfaces:**
- Changes: `buildPeriodSummary(client, range)` — `range` is now `"4"|"8"|"12"|"all"` (default `"8"`), matching `weeksInRange`'s contract exactly. Still returns `null` under 4 qualifying weeks.
- Changes: `completeOrientation(clientId, payload)` — `payload.note` (optional string) is now read and persisted.
- Changes: `applyStoredOverrides()` — reapplies `patch.coachNote` into `cur.coachReview.note` on load.

- [ ] **Step 1: Change `buildPeriodSummary` to take a range token**

Replace the function's opening two lines:

```js
  function buildPeriodSummary(client, n) {
    n = n || 8;
    var weeks = weeksInRange(client, String(n)).filter(function (w) { return w.metrics.adherence != null; });
```

with:

```js
  function buildPeriodSummary(client, range) {
    range = range || "8";
    var weeks = weeksInRange(client, range).filter(function (w) { return w.metrics.adherence != null; });
```

No other line in the function body needs to change — `n`/`range` was already only used for that one `weeksInRange` call, and the returned `weeksCount` already comes from `weeks.length` (the actual filtered count), not from the input parameter.

- [ ] **Step 2: Accept and store `note` in `completeOrientation`**

```js
  function completeOrientation(clientId, payload) {
    var client = getClient(clientId);
    var cur = currentWeek(client);
    if (!cur) return;
    var now = new Date();
    cur.orientation = payload.orientation;
    cur.orientationSentAt = now;
    cur.orientationSentTime = fmtTime(now);
    cur.focusOverride = payload.focus || null;
    if (payload.note) cur.coachReview = { note: payload.note };
    var nextGoals = {};
    trackedGoals(cur, client).forEach(function (g) {
      if (g.key === "adherence") return;
      if (payload.goals && payload.goals[g.key] != null) nextGoals[g.key] = payload.goals[g.key];
    });
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        orientation: payload.orientation, focus: payload.focus || null, nextGoals: nextGoals,
        coachNote: payload.note || null,
        completedAt: now.toISOString(), completedTime: cur.orientationSentTime
      });
    }
  }
```

- [ ] **Step 3: Reapply `coachNote` on load**

In `applyStoredOverrides`, right after the existing `if (patch.nextGoals) c._nextGoals = patch.nextGoals;` line, add:

```js
      if (patch.coachNote) cur.coachReview = { note: patch.coachNote };
```

(`cur` is already in scope in that function — it's assigned two lines above from `currentWeek(c)`.)

- [ ] **Step 4: Verify in browser (console-only, no UI depends on this yet)**

```js
JSON.stringify(Trackly.buildPeriodSummary(Trackly.getClient("joao"), "4"))
JSON.stringify(Trackly.buildPeriodSummary(Trackly.getClient("joao"), "12"))
JSON.stringify(Trackly.buildPeriodSummary(Trackly.getClient("joao"), "all"))
```
Expected: three different `weeksCount`/`weightDelta` values (4 vs 12 vs 16), no exceptions, `"all"` doesn't crash `weeksInRange`.

- [ ] **Step 5: Commit**

```bash
git add prototype/assets/js/data.js
git commit -m "$(cat <<'EOF'
V8: period-token summary + coach-note persistence

buildPeriodSummary now takes the same range token the UI's period
selector already uses (4/8/12/all) instead of a raw week count, so a
selected period can drive the summary text without a translation step.
completeOrientation accepts an optional note, persisted alongside the
orientation via the same TracklyStore.patchClient call and reapplied on
load as cur.coachReview.note - no new storage key.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Evolução tab — one period controls everything

**Files:**
- Modify: `prototype/portal/evolucao.html`
- Modify: `prototype/coach/cliente.html` (`renderEvolucao` only)

**Interfaces:**
- Consumes: `Trackly.buildPeriodSummary(client, range)` from Task 1, `state.range` / `evoState.range` (already exist in both files).

- [ ] **Step 1: Wire the existing "Resumo do período" in `portal/evolucao.html` to the selected range**

Find `var period = Trackly.buildPeriodSummary(client, 8);` — it currently sits **outside** `render()` (computed once at load, never on range change). Move the whole "Resumo do período" block (the `document.getElementById("period-summary").innerHTML = ...` assignment and the `var period = ...` line immediately before it) **inside** `render()`, and change the call to:

```js
    var period = Trackly.buildPeriodSummary(client, state.range);
```

Since `render()` already re-runs on every range-button click (`state.range = ...; render();`), this alone makes the period summary update in lock-step with the chart — no other logic changes.

- [ ] **Step 2: Add the equivalent period-summary block to `coach/cliente.html`'s Evolução tab**

`renderEvolucao` currently ends its returned HTML with `'<div class="stack">' + blocks.join("") + '</div>'`. Append a period-summary section using the same visual pattern as the portal (brand-tinted `.period-card`, already styled in `base.css`):

```js
    var period = Trackly.buildPeriodSummary(client, evoState.range);
    var periodHtml = !period ? "" : (
      '<div class="period-card" style="margin-top:24px;">' +
      '<div class="weeks" style="text-align:left;margin-bottom:0;">' + period.weeksCount + ' SEMANAS SELECIONADAS</div>' +
      '<div class="period-stats">' +
        (Trackly.isTracked(client, "weight") ? '<div class="item"><div class="l">Peso</div><div class="v">' + (period.weightDelta > 0 ? "+" : "") + period.weightDelta + 'kg</div></div>' : "") +
        (Trackly.isTracked(client, "measurements") && period.waistDelta != null ? '<div class="item"><div class="l">Cintura</div><div class="v">' + (period.waistDelta > 0 ? "+" : "") + period.waistDelta + 'cm</div></div>' : "") +
        (Trackly.isTracked(client, "adherence") ? '<div class="item"><div class="l">Aderência</div><div class="v">' + period.adherenceAvg + '%</div></div>' : "") +
        (Trackly.isTracked(client, "workouts") ? '<div class="item"><div class="l">Treinos</div><div class="v">' + period.workoutsTotal + '/' + period.workoutsGoalTotal + '</div></div>' : "") +
      '</div>' +
      '<p class="period-narrative"><strong>O que mudou</strong>' + period.narrative + '</p>' +
      '</div>'
    );
```

Then change the `document.getElementById("tab-evolucao").innerHTML = ...` assignment's final line from `'<div class="stack">' + blocks.join("") + '</div>';` to `'<div class="stack">' + blocks.join("") + '</div>' + periodHtml;`.

- [ ] **Step 3: Verify in browser**

Open `coach/cliente.html?id=joao` → Evolução: confirm a "Resumo do período" card appears below the metric stack, click 4 sem/8 sem/12 sem/tudo and confirm the card's numbers and week count change each time (not just the chart). Open `portal/evolucao.html?client=joao`, same test — click through all four range buttons and confirm "Resumo do período" at the bottom updates every time instead of staying frozen at 8 weeks. Test `?id=pedro` (only 5-6 weeks of data) — confirm selecting "12 sem" or "tudo" doesn't crash even though there aren't 12 weeks (should just show however many exist, or omit the card if under 4 qualifying weeks).

- [ ] **Step 4: Commit**

```bash
git add prototype/portal/evolucao.html prototype/coach/cliente.html
git commit -m "$(cat <<'EOF'
V8: one period controls chart + summary together (brief section 9-11)

portal/evolucao.html's period summary was hardcoded to the last 8 weeks
regardless of the range selector - now it reads state.range like the
chart already did. coach/cliente.html's Evolucao tab gains the same
period-summary block, which it was missing entirely. Verified all four
range buttons update both the chart and the summary in both files.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Avaliação — big weekly evolution module + coach notes

**Files:**
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes: `.compare-slider`/`.cs-*` CSS from V6 Task 1 (reused, not reinvented), `Trackly.completeOrientation` extended in Task 1.

- [ ] **Step 1: Rename the screen**

Change `<title>Revisar check-in — Trackly</title>` to `<title>Avaliação — Trackly</title>`. In the header markup (the `.review-head` block), the `<h1>` already shows the client's name — add an eyebrow above it: replace

```js
    '<div class="review-head">' +
      '<div class="who"><span class="avatar" style="background:' + color + '">' + client.initials + '</span><h1>' + client.name + '</h1></div>' +
      '<div class="wk">Check-in — Semana ' + cur.weekNumber + ' &nbsp;·&nbsp; recebido ' + Trackly.relativeLabel(cur.checkin.submittedAt) + '</div>' +
    '</div>' +
```

with:

```js
    '<div class="review-head">' +
      '<p class="eyebrow">Avaliação</p>' +
      '<div class="who"><span class="avatar" style="background:' + color + '">' + client.initials + '</span><h1>' + client.name + '</h1></div>' +
      '<div class="wk">Semana ' + cur.weekNumber + ' &nbsp;·&nbsp; recebido ' + Trackly.relativeLabel(cur.checkin.submittedAt) + '</div>' +
    '</div>' +
```

- [ ] **Step 2: Simplify Resumo da Semana to peso/aderência/treinos (brief's literal example)**

Replace the hero-stat row:

```js
    '<div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:28px;">' +
      (Trackly.isTracked(client, "weight") ? '<div class="hero-stat"><div class="value">' + cur.metrics.weight + '<span class="unit">kg</span></div>' + weightDeltaForHero + '<div class="label">peso</div></div>' : "") +
      (Trackly.isTracked(client, "adherence") ? '<div class="hero-stat"><div class="value">' + cur.metrics.adherence + '<span class="unit">%</span></div><div class="label">aderência</div></div>' : "") +
      (Trackly.isTracked(client, "sleep") ? '<div class="hero-stat"><div class="value">' + cur.metrics.sleep + '<span class="unit">h</span></div><div class="label">sono</div></div>' : "") +
    '</div>' +
```

with:

```js
    '<div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:28px;">' +
      (Trackly.isTracked(client, "weight") ? '<div class="hero-stat"><div class="value">' + cur.metrics.weight + '<span class="unit">kg</span></div>' + weightDeltaForHero + '<div class="label">peso</div></div>' : "") +
      (Trackly.isTracked(client, "adherence") ? '<div class="hero-stat"><div class="value">' + cur.metrics.adherence + '<span class="unit">%</span></div><div class="label">aderência</div></div>' : "") +
      (Trackly.isTracked(client, "workouts") ? '<div class="hero-stat"><div class="value">' + cur.metrics.workouts + '<span class="unit">/' + cur.metrics.workoutsGoal + '</span></div><div class="label">treinos</div></div>' : "") +
    '</div>' +
```

(Sono moves down into "O que mudou," where it already appears as a before→after row when it changed — no information lost, just not duplicated at the top.)

- [ ] **Step 3: Replace the tiny 4-swatch preview with the big compare-slider module**

Delete the existing `visualEvoHtml` IIFE entirely (the one building `.visual-evo`/`.vs-photos` mini thumbnails) and replace it with a module that reuses the same `.compare-slider` markup/interaction pattern from `cliente.html`'s Fotos tab, pinned to `prevSubmitted` (previous submitted week) vs `cur` (this week) — no week pickers here, since in the review context the pair is always fixed to "the two weeks being compared right now":

```js
  var angleState = { angle: "front" };
  var evoWeekModuleHtml = (function () {
    if (!Trackly.isTracked(client, "weight") && !Trackly.isTracked(client, "photos")) return "";
    var hasPhotoPair = Trackly.isTracked(client, "photos") && prevSubmitted;
    var sliderHtml = !hasPhotoPair ? "" : (
      '<div class="angle-tabs" id="angle-tabs" style="margin-bottom:14px;">' +
        ["front", "back", "side"].map(function (a) {
          var names = { front: "Frente", back: "Costas", side: "Lateral" };
          return '<button data-angle="' + a + '" class="' + (angleState.angle === a ? "active" : "") + '">' + names[a] + '</button>';
        }).join("") +
      '</div>' +
      '<div class="compare-slider" id="cs-photo">' +
        '<div class="cs-after" style="background:' + photoBg(1, angleState.angle) + ';"><span class="cs-tag after">Agora · S' + cur.weekNumber + '</span></div>' +
        '<div class="cs-before" id="cs-before-clip" style="width:50%;"><div style="background:' + photoBg(0, angleState.angle) + ';"><span class="cs-tag before">Antes · S' + prevSubmitted.weekNumber + '</span></div></div>' +
        '<div class="cs-handle" id="cs-handle" tabindex="0" role="slider" aria-label="Comparar antes e depois" aria-valuemin="4" aria-valuemax="96" aria-valuenow="50" style="left:50%;"></div>' +
      '</div>'
    );
    return (
      '<div style="margin-bottom:28px;">' +
        '<p class="section-label">Evolução desta semana</p>' +
        (Trackly.isTracked(client, "weight") ? '<div class="hero-stat" style="margin-bottom:16px;"><div class="value">' + cur.metrics.weight + '<span class="unit">kg</span></div>' + weightDeltaForHero + '<div class="label">peso' + (prevSubmitted ? " · semana " + prevSubmitted.weekNumber + " → " + cur.weekNumber : "") + '</div></div>' : "") +
        sliderHtml +
      '</div>'
    );
  })();

  function photoBg(i, angle) {
    var angleShift = angle === "back" ? 40 : angle === "side" ? 80 : 0;
    return "hsl(" + (hue + angleShift) + "," + (26 + i * 6) + "%," + (30 + i * 10) + "%)";
  }
```

Place `evoWeekModuleHtml` in the template **right after** the hero-stat row from Step 2 and **before** "O que mudou" (matching brief §21's order: Resumo → Evolução visual → O que mudou → Últimas semanas → Respostas → Notas → Decisão):

```js
    evoWeekModuleHtml +

    (whatChangedRows.length ? (
```

Remove the now-unused `photosHtml`/`photoAngles` block above (superseded by the angle-tabs + swatch approach) **only if** nothing else in the file still references `photosHtml` — check first: it's used once more, inside the respostas-disclosure ("Fotos desta semana" mini-row). Keep `photoAngles`/`photosHtml` as-is for that separate spot; only the big `visualEvoHtml` IIFE is deleted/replaced.

- [ ] **Step 4: Wire the compare-slider drag + angle-tab clicks**

After the `document.getElementById("review-body").innerHTML = ...` assignment (alongside the existing `qa-toggle` listener), add:

```js
  if (document.getElementById("cs-photo")) wireCompareInteraction();
  var angleTabs = document.getElementById("angle-tabs");
  if (angleTabs) angleTabs.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () { angleState.angle = b.getAttribute("data-angle"); rerenderEvoModule(); });
  });

  function wireCompareInteraction() {
    var wrap = document.getElementById("cs-photo");
    var handle = document.getElementById("cs-handle");
    var clip = document.getElementById("cs-before-clip");
    var fullWidth = wrap.getBoundingClientRect().width;
    clip.firstElementChild.style.width = fullWidth + "px";
    var dragging = false;
    function setPct(pct) {
      pct = Math.max(4, Math.min(96, pct));
      clip.style.width = pct + "%";
      handle.style.left = pct + "%";
      handle.setAttribute("aria-valuenow", Math.round(pct));
    }
    function setPctFromX(clientX) { var rect = wrap.getBoundingClientRect(); setPct(((clientX - rect.left) / rect.width) * 100); }
    handle.addEventListener("pointerdown", function (e) { dragging = true; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener("pointermove", function (e) { if (dragging) setPctFromX(e.clientX); });
    handle.addEventListener("pointerup", function () { dragging = false; });
    handle.addEventListener("keydown", function (e) {
      var cur2 = parseFloat(handle.style.left) || 50;
      if (e.key === "ArrowLeft") { e.preventDefault(); setPct(cur2 - 5); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPct(cur2 + 5); }
    });
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.classList.contains("cs-after")) setPctFromX(e.clientX); });
  }

  function rerenderEvoModule() {
    // recomputes just the module's two swatch colors and the angle-tab active state, in place —
    // avoids rebuilding the whole review body (which would lose scroll position mid-review).
    var wrap = document.getElementById("cs-photo");
    if (!wrap) return;
    wrap.querySelector(".cs-after").style.background = photoBg(1, angleState.angle);
    wrap.querySelector(".cs-before > div").style.background = photoBg(0, angleState.angle);
    angleTabs.querySelectorAll("button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-angle") === angleState.angle); });
  }
```

- [ ] **Step 5: Add the "Notas do coach" field**

Insert a compact section right after the respostas-disclosure block and before the orientation `.card`:

```js
    '<div style="margin-bottom:26px;">' +
      '<p class="section-label">Notas do coach</p>' +
      '<textarea id="coach-note-input" rows="2" placeholder="Algo que não cabe nos números? (opcional, só você vê)" style="width:100%;border:1px solid var(--line-strong);border-radius:var(--radius-sm);padding:10px 13px;font-family:var(--font-body);font-size:13.5px;background:var(--surface);color:var(--ink);resize:vertical;">' + (cur.coachReview && cur.coachReview.note ? cur.coachReview.note : "") + '</textarea>' +
    '</div>' +
```

Place this string right before the orientation `'<div class="card card-pad" style="margin-bottom:18px;">' + '<p class="card-title" style="margin-bottom:4px;">O que você quer orientar esta semana?"` block.

- [ ] **Step 6: Include the note when sending**

In the `send-orientation` click handler, add the note to the payload:

```js
    Trackly.completeOrientation(client.id, {
      focus: document.getElementById("focus-input").value.trim(),
      orientation: document.getElementById("orientation-input").value.trim(),
      note: document.getElementById("coach-note-input").value.trim(),
      goals: goals
    });
```

- [ ] **Step 7: Verify in browser**

Open `coach/revisar.html?id=joao`. Confirm: page title reads "Avaliação"; Resumo da Semana shows peso/aderência/treinos (not sono); "Evolução desta semana" appears right after, with the big compare-slider — drag it and confirm the reveal works; click Frente/Costas/Lateral and confirm the swatch colors visibly change without losing the drag position's underlying width-fixup (re-check drag still works after switching angle); scroll down and confirm "O que mudou"/"Últimas semanas"/"Ver respostas completas" still work exactly as before; type a note in "Notas do coach," send the orientation, and confirm no errors. Reload the page (same `?id=joao`) — since the current week is now "completed," re-open and confirm the note prefills into a fresh `coach-note-input` the next time this client's week is reviewed (test by checking `Trackly.getClient("joao").weeks` in console: last week's `coachReview.note` should equal what was typed). Test with a client who has `photos: false` in tracking (none currently do, but confirm `Trackly.isTracked(client,"photos")` gating means the slider portion is simply absent, no broken markup) and with a client with no `prevSubmitted` (first-ever check-in) — confirm the module still renders the weight hero without a slider and without throwing.

- [ ] **Step 8: Commit**

```bash
git add prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V8: Avaliacao - big weekly photo+weight module, coach notes

Renames the review screen to Avaliacao, simplifies Resumo da Semana to
peso/aderencia/treinos, and replaces the old 4-thumbnail visual-evo
preview with the same big compare-slider used in the Fotos tabs, pinned
to previous-submitted-week vs current-week with a working Frente/Costas/
Lateral switch (changes the placeholder swatch honestly, never claims a
real photo). Adds a small "Notas do coach" textarea persisted through
completeOrientation. Verified drag+angle-switch, first-check-in and
photos-untracked edge cases, and note persistence across reload.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Fotos tabs — angle switch + larger comparison

**Files:**
- Modify: `prototype/coach/cliente.html` (`renderFotos` only)
- Modify: `prototype/portal/evolucao.html` (`renderCompare` only)
- Modify: `prototype/assets/css/base.css`

**Interfaces:**
- Consumes: the same `photoBg(i, angle)` pattern introduced in Task 3 — duplicated per-page (consistent with this codebase's existing convention of small per-page helpers rather than a shared module).

- [ ] **Step 1: Add the `.compare-slider.lg` size modifier**

In `base.css`, right after the existing `.compare-slider { ... }` rule, add:

```css
.compare-slider.lg { max-width: 640px; }
.angle-tabs { display: inline-flex; background: var(--surface-sunken); border-radius: 999px; padding: 3px; gap: 2px; }
.angle-tabs button { padding: 6px 14px; border-radius: 999px; border: none; background: none; font-size: 12.5px; font-weight: 600; color: var(--ink-muted); cursor: pointer; }
.angle-tabs button.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
```

- [ ] **Step 2: Add the angle parameter + tabs to `coach/cliente.html`'s `renderFotos`**

Replace `function photoBg(i) { ... }` with the two-argument version from Task 3 (`photoBg(i, angle)` with the hue-shift-by-angle logic), add `var photoAngleState = { angle: "front" };` next to the existing `var compareState = {};`, and in `renderFotos`'s returned markup: add the `.angle-tabs` block (identical structure to Task 3 Step 3) right above `'<div class="compare-slider" ...'`, and add the `.lg` class to that slider's `class` attribute (`class="compare-slider lg"`). Update the two `photoBg(1)`/`photoBg(0)` calls to `photoBg(1, photoAngleState.angle)` / `photoBg(0, photoAngleState.angle)`. Wire the tab clicks the same way as Task 3 Step 4 (in `wireCompareInteraction`, or a sibling function called right after it) — re-render just the two swatch backgrounds and the active-tab class, not the whole tab.

- [ ] **Step 3: Same change in `portal/evolucao.html`'s `renderCompare`**

Mirror Step 2 exactly (this file already has its own `photoBg`/`wireCompareInteraction` copies from V6/V7 — apply the identical angle-parameter + tabs + `.lg` class change).

- [ ] **Step 4: Verify in browser**

Open `coach/cliente.html?id=joao` → Fotos tab: confirm the slider is visibly larger than before, angle tabs appear above it, clicking each one changes both swatches' color without resetting the selected week-pair dropdowns. Repeat on `portal/evolucao.html?client=joao`. Check at mobile viewport (375×812) that the larger slider still fits without horizontal overflow (it's `width:100%` up to `max-width`, so it should shrink correctly — confirm visually).

- [ ] **Step 5: Commit**

```bash
git add prototype/coach/cliente.html prototype/portal/evolucao.html prototype/assets/css/base.css
git commit -m "$(cat <<'EOF'
V8: Fotos tabs - larger comparison + Frente/Costas/Lateral switch

Bumps the compare-slider to a larger max-width (640px) in both Fotos
tabs and adds a working angle switch - it changes which placeholder
swatch renders, never claims to be a real photo. Verified at desktop
and mobile viewport, week-pair selection still works independently of
the angle tabs.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Histórico copy alignment

**Files:**
- Modify: `prototype/coach/cliente.html` (`renderHistorico` only)
- Modify: `prototype/portal/historico.html`

- [ ] **Step 1: Match the brief's literal wording**

In both files, change the `wc-status` text from `"✓ Orientação enviada"` to `"✓ Acompanhamento concluído"` (keep `"✓ Check-in enviado"` for the submitted-but-not-yet-reviewed case, and `"Pendente"` for not-submitted — only the "fully done" label changes):

```js
'<span class="wc-status" style="color:' + (submitted ? "var(--brand)" : "var(--ink-faint)") + ';">' + (submitted ? (w.orientation ? "✓ Acompanhamento concluído" : "✓ Check-in enviado") : "Pendente") + '</span>' +
```

- [ ] **Step 2: Verify in browser**

Open both `coach/cliente.html?id=joao` (Histórico tab) and `portal/historico.html?client=joao` — confirm completed weeks now read "✓ Acompanhamento concluído."

- [ ] **Step 3: Commit**

```bash
git add prototype/coach/cliente.html prototype/portal/historico.html
git commit -m "$(cat <<'EOF'
V8: Historico copy - "Acompanhamento concluido" per brief wording

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final review — cache-bust, AI-language sweep, persistence, docs

**Files:** all HTML files (version bump only); no other pre-determined files.

- [ ] **Step 1: Bump cache-busting version site-wide**

```bash
cd prototype && grep -rl '?v=7' --include="*.html" . | xargs sed -i 's/?v=7/?v=8/g'
```

- [ ] **Step 2: Grep for AI-generic language (brief §35, §38)**

```bash
grep -rni "ask ai\|analyze with ai\|ai coach\|ai assistant\|chatbot" prototype/
```

Expected: no matches. If any surfaced, remove immediately — this is an explicit hard "don't."

- [ ] **Step 3: `web-design-guidelines` pass on the new interactive elements**

Check: angle-tab buttons and the compare-slider handle are the same pattern already verified accessible in V6/V7 (native `<button>`s, `role="slider"`+keyboard on the handle) — confirm the Avaliação page's new instances inherit the same behavior (they reuse identical markup/JS, so this should hold by construction; spot-check with a Tab-key walkthrough that focus reaches the handle and the angle buttons in a sane order).

- [ ] **Step 4: Full persistence regression (brief §33, webapp-testing)**

1. Submit a check-in as a pending client (e.g. `pedro`, via `?simDate=` open window) → hard-reload `portal/dashboard.html?client=pedro` → confirm still shows submitted.
2. Open `coach/dashboard.html`, hard-reload → confirm that client now shows under "Para revisar."
3. Open `coach/revisar.html?id=pedro`, write an orientation + a coach note, send → hard-reload `coach/dashboard.html` → confirm client now shows completed.
4. Re-open `coach/revisar.html?id=pedro` is no longer possible the normal way (week already reviewed) — instead verify the note persisted by checking in console: `Trackly.getClient("pedro").weeks.slice(-1)[0].coachReview` should show the typed note.
5. Clear the test-induced localStorage afterward: `localStorage.removeItem("trackly_v4_state")`.

- [ ] **Step 5: Update `ARCHITECTURE.md` with a V8 section**

Append a "V8" section documenting: the Avaliação rename + big compare-slider module, the period-token fix to `buildPeriodSummary` (and that portal/evolucao.html had a real bug here — summary was frozen at 8 weeks regardless of the selector), the angle-switch honesty rule, and `coachReview.note`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
V8: final review pass - cache-bust v8, AI-language sweep, docs

Confirms no AI-generic affordances were introduced, re-verifies
keyboard access on the new angle-tab/compare-slider instances, and runs
the full check-in -> review -> orientation -> reload persistence chain
including the new coach note. Documents V8 in ARCHITECTURE.md, noting
the period-summary bug this version fixed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:** §1-2 (evaluation-as-center principle) → Task 3 restructures revisar.html around exactly this sequence. §3-8 (Avaliação screen structure, big photos, angle control) → Task 3. §9-11 (period controls everything) → Task 2 (this is also a **real bug fix**, not just a feature — flagged explicitly). §12-14 (one main chart, other metrics as value+trend) → already true since V6/V7, unchanged. §15-16 (Visão Geral / Evolução tab minimalism) → Visão Geral already compliant via V7's buildCoachMemory; Evolução gains the period-summary block in Task 2. §17-19 (Fotos as comparison tool, photo protagonist) → Task 4. §20 (Histórico copy) → Task 5. §21-23 (review structure, coach notes, coachReview) → Task 3 + Task 1. §24-25 (longitudinal memory prep, accumulating context) → already the architecture of `buildCoachMemory`/`trendLine` from V7; no new task needed, just confirmed unchanged. §26 (goal-vs-previous-goal consistency) → already handled by `effectiveGoals`/`_nextGoals` since V4-V7, unchanged. §27-29 (individual metrics/goals, check-in window) → unchanged, verified in Task 6. §30 (check-in order) → already fixed in V7. §31-32 (notifications, post-orientation state) → already built in V7, unchanged. §33 (persistence bugs) → Task 6 Step 4. §34-36 (design system, avoid AI-generated look, interaction) → enforced throughout, Task 6 greps for the language version of this. §37-38 (no new pages, no generic AI) → enforced by Global Constraints + Task 6 Step 2's grep. §39-45 (test scenarios) → covered by each task's own verification step plus Task 6's regression list. §46 (10x principle) → rationale for Task 3, not a separate task. §47 (future-proofing) → already satisfied by existing `buildCoachMemory` architecture; nothing new needed. §48-49 (simpler despite more intelligence) → the whole plan's design constraint; verified by Task 3 actually removing content (sono from the top hero row, the 4-thumbnail row) as much as it adds. §50 (implement directly) → every task edits real files. §51-52 (final review + delivery format) → Task 6 + this session's closing summary.

**Gap flagged, not silently dropped:** brief §16 lists "Outros indicadores" for the Evolução tab as value+trend, no chart — the existing `renderEvolucao` already renders cintura/aderência/sono as small line/bar charts (from V6), not bare value+trend tiles. This plan does **not** change that (out of scope — would be a significant rebuild of already-working, already-reviewed charts for a preference the brief states as a soft "can be" rather than a hard requirement: "Esses dados **podem** ser mostrados como valor/variação/tendência... Só criar outro gráfico quando houver **verdadeira necessidade** de interpretação"). Worth surfacing in the delivery summary as a deliberate no-op, not an oversight.

**Type consistency check:** `photoBg(i, angle)` signature is introduced once in Task 3 and reused with the identical two-argument shape in Task 4's two files — no mismatched arity. `buildPeriodSummary`'s new `range` parameter is a string token in every call site touched (Task 1 Step 4 verification, Task 2 Steps 1-2) — no leftover numeric call.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-11-v8-evaluation-first.md`. Continuing with **inline execution** in this session (same rationale as V6/V7), committing after each task with browser verification as specified.
