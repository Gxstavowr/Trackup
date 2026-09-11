# V10 — Coach Workspace Implementation Plan

> **For agentic workers:** Static HTML/CSS/JS prototype, no build step, no test framework. "Tests" here mean **browser verification** via the Claude Browser tool, same method as V1–V9. Execute inline in this session.

**Goal:** Make the coach side read as an unambiguous work tool — clear per-check-in states (aguardando aluno / aguardando avaliação / em avaliação / concluído), action-labeled CTAs instead of a generic "Revisar," renamed top-level nav ("Acompanhamento"/"Alunos"), and a comparison module in Avaliação where photos + weight + waist + adherence all move together when the coach picks a different week to compare against (today only weight reacts).

**Architecture:** The dashboard/Avaliação/Alunos screens are already structurally sound (V6–V9). V10's real work is (1) one new piece of state — whether the coach has *opened* a pending evaluation, letting the CTA read "Avaliar agora" vs "Continuar avaliação" — persisted the same way every other mutation is; (2) expanding the existing "Comparar com" module (V9) to move waist/adherence alongside weight, not just weight; (3) renaming labels/copy across nav, dashboard, and the Alunos list to the brief's exact wording; (4) a lightweight "Avaliação" tab on the profile that jumps straight to the existing dedicated Avaliação page rather than duplicating it as an embedded panel — per the brief's own principle (§41) that a new screen must answer a different question, and this doesn't.

**Deliberately not built:** a "Carteira" (portfolio) area. The brief explicitly gates it behind "só deve existir se possuir finalidade clara" and asks for nothing beyond a hypothetical example; adding a third nav item for a one-line aggregate would violate the brief's own §41 principle ("não criar telas para preencher espaço") more than it would serve one. Noted in the delivery summary as an intentional no-op, not an oversight.

**Tech Stack:** Vanilla HTML/CSS/JS, same as V1–V9. Cache-busting bumps to `?v=10`.

## Global Constraints

- No new persisted concept beyond `cur.reviewOpenedAt` (a timestamp, set once, mirrors how `orientationSentAt`/`coachReview` already persist per-week).
- The "Comparar com" selector stays scoped to its own module — it must never touch `evoState.range` or any page-level state (unchanged rule from V9, now enforced across three data types instead of one).
- Never invent a distinction the data can't honestly support — brief §6 lists 5 states but only 4 are observable without fabricating a "draft in progress" autosave; "em avaliação" and "orientação em preparação" collapse into one real state (`in_progress`), documented as a deliberate simplification.
- `computeStatus`'s existing five codes (`late`/`review`/`warn`/`ok`/`invite`) are extended, not replaced — every existing call site (dashboard grouping via `clientStage`, list filtering) keeps working; a new `progress` code is added alongside.
- Bump `?v=9` → `?v=10` on every shared script tag, site-wide, same commit as the last JS/CSS change.

---

## File Structure

**Modify:**
- `prototype/assets/js/data.js` — `markReviewOpened(clientId)`; `computeStatus` gains the `progress` code (submitted, opened, not yet oriented) and reworded labels ("Aguardando avaliação"/"Em avaliação"/"Check-in atrasado" → contextual); `applyStoredOverrides` reapplies `reviewOpenedAt`.
- `prototype/assets/js/nav.js` — sidebar labels "Dashboard"→"Acompanhamento", "Clientes"→"Alunos" (hrefs/filenames unchanged).
- `prototype/coach/dashboard.html` — header copy ("ACOMPANHAMENTO" / "8 de 12 concluídos" / "4 restantes"), "Para revisar"→"Para fazer" with state-aware CTA labels, "Aguardando resposta"→"Aguardando aluno", concluded-row copy to "✓ Avaliação concluída · Hoje às HH:MM".
- `prototype/coach/revisar.html` — calls `markReviewOpened` on mount when applicable; header state badge; comparison module gains waist/adherence alongside weight, all reading the same `compareWeekState`; confirmation screen rewritten to the §24 checklist.
- `prototype/coach/clientes.html` — page title "Alunos"; filter chips "Todos/Avaliação/Atenção/Em dia" (Avaliação bucket = `late`+`review`+`progress`); row status/action copy driven by the same states.
- `prototype/coach/cliente.html` — adds an "Avaliação" tab that navigates straight to `revisar.html?id=...` instead of rendering a panel.
- Every HTML file — cache-bust `?v=9` → `?v=10`.

**Create:** none.

---

### Task 1: Data layer — "opened" state + extended status codes

**Files:**
- Modify: `prototype/assets/js/data.js`

- [ ] **Step 1: `markReviewOpened`**

Add near `sendReminder`:

```js
  function markReviewOpened(clientId) {
    var client = getClient(clientId);
    var cur = currentWeek(client);
    if (!cur || cur.checkin.status !== "submitted" || cur.orientation || cur.reviewOpenedAt) return;
    cur.reviewOpenedAt = new Date();
    if (global.TracklyStore) TracklyStore.patchClient(clientId, { reviewOpenedAt: cur.reviewOpenedAt.toISOString() });
  }
```

- [ ] **Step 2: Reapply on load**

In `applyStoredOverrides`, alongside the existing `patch.remindedAt` line:

```js
      if (patch.reviewOpenedAt && !cur.orientation) cur.reviewOpenedAt = new Date(patch.reviewOpenedAt);
```

- [ ] **Step 3: Extend `computeStatus`**

Replace the `needsReview` branch:

```js
    if (needsReview(client)) {
      if (cur.reviewOpenedAt) {
        return { code: "progress", label: "Em avaliação", reason: "Avaliação de " + client.name.split(" ")[0] + " em andamento — ainda não enviada." };
      }
      return { code: "review", label: "Aguardando avaliação", reason: "Check-in da semana " + cur.weekNumber + " recebido " + relativeLabel(cur.checkin.submittedAt) + " — ainda sem avaliação." };
    }
```

Also reword the `late` branch's label from "Check-in atrasado" to keep it (already accurate — "atrasado" describes the student's check-in, not a coach action, so it stays as-is; only the two lines above change).

- [ ] **Step 4: Export**

```js
    sendReminder: sendReminder, markReviewOpened: markReviewOpened,
```

(add alongside the existing `sendReminder` export line)

- [ ] **Step 5: Verify in browser (console)**

```js
Trackly.markReviewOpened("maria");
JSON.stringify(Trackly.computeStatus(Trackly.getClient("maria")))
```
Expected: `code: "progress"`. Reload the page, re-check the same call — status should still read `"progress"` (persisted). Clear localStorage after.

- [ ] **Step 6: Commit**

```bash
git add prototype/assets/js/data.js
git commit -m "$(cat <<'EOF'
V10: "opened" evaluation state + extended status codes

markReviewOpened records that the coach has started (but not sent) an
evaluation, persisted like every other per-week mutation. computeStatus
gains a "progress" code so the UI can tell "just arrived" apart from
"coach already has this open" without fabricating a draft-autosave
system - collapsing the brief's "em avaliacao"/"orientacao em preparacao"
into one honest observable state.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Nav rename + Dashboard ("Acompanhamento") restructure

**Files:**
- Modify: `prototype/assets/js/nav.js`
- Modify: `prototype/coach/dashboard.html`

- [ ] **Step 1: Rename sidebar labels**

In `nav.js`'s `coachShell`, change:

```js
{ key: "dashboard", label: "Dashboard", href: root + "coach/dashboard.html", icon: I.grid },
{ key: "clientes", label: "Clientes", href: root + "coach/clientes.html", icon: I.users }
```

to:

```js
{ key: "dashboard", label: "Acompanhamento", href: root + "coach/dashboard.html", icon: I.grid },
{ key: "clientes", label: "Alunos", href: root + "coach/clientes.html", icon: I.users }
```

- [ ] **Step 2: Dashboard header copy**

Change `<h1>Acompanhamento da semana</h1>` to `<h1>Acompanhamento</h1>`. Update the big-counter markup in `render()`:

```js
    document.getElementById("week-counter").innerHTML =
      '<div class="num">' + completed.length + '<span class="of"> de ' + snap.total + '</span></div>' +
      '<div class="cap">concluídos</div>' +
      '<div class="sub">' +
        (snap.total - completed.length > 0 ? '<span><b>' + (snap.total - completed.length) + '</b> restante' + (snap.total - completed.length === 1 ? "" : "s") + '</span>' : '') +
      '</div>';
```

(Drops the separate "para revisar"/"aguardando resposta" sub-counts from the big number itself — brief §12 wants just "8 de 12 / 4 restantes"; the breakdown lives in the section headers below, per §8–10.)

- [ ] **Step 2b: `.num .of` needs the new inline "de" text to not collide with the existing CSS**

`.big-counter .num .of` currently expects a bare number after `/`; check `base.css`'s rule still applies fine to `<span class="of"> de 12</span>` (font-size/color rule is selector-based, not content-based — no CSS change needed).

- [ ] **Step 3: "Para revisar" → "Para fazer" with state-aware CTA**

Replace the received-queue row template:

```js
    document.getElementById("queue-received").innerHTML = !received.length ? "" : (
      '<p class="section-label">Para fazer</p>' + received.map(function (c) {
        var u = Trackly.studentUpdate(c), color = TracklyNav.colorFor(c), st = Trackly.computeStatus(c);
        var stats = [];
        if (u.weightDelta != null && Math.abs(u.weightDelta) >= 0.1) stats.push('<span style="color:' + (u.weightGood ? "var(--brand)" : "var(--coral)") + ';">Peso ' + (u.weightDelta < 0 ? "↓" : "↑") + ' ' + Math.abs(u.weightDelta) + 'kg</span>');
        else if (u.weightDelta != null) stats.push('<span>Peso estável</span>');
        stats.push('<span>Aderência ' + u.adherenceNow + '%' + (u.adherenceTrend === "up" ? " ↑" : u.adherenceTrend === "down" ? " ↓" : "") + '</span>');
        if (u.sleepTrend === "down") stats.push('<span style="color:var(--coral);">Sono ↓</span>');
        var ctaLabel = st.code === "progress" ? "Continuar avaliação" : "Avaliar agora";
        return '<div class="list-row"><span class="avatar lr-lead" style="background:' + color + '">' + c.initials + '</span>' +
          '<div class="lr-body"><strong>' + c.name + '</strong><span class="lr-meta">' + st.label + ' · ' + u.label + '</span><div class="lr-stats">' + stats.join("") + '</div></div>' +
          '<div class="lr-actions"><a href="revisar.html?id=' + c.id + '" class="btn btn-primary">' + ctaLabel + '</a></div></div>';
      }).join("")
    );
```

- [ ] **Step 4: "Aguardando resposta" → "Aguardando aluno"**

Change the section label string from `"Aguardando resposta"` to `"Aguardando aluno"` (one-word swap in the existing `'<p class="section-label">Aguardando resposta</p>'` line).

- [ ] **Step 5: Concluded rows show the actual timestamp**

`renderCompletedSection`'s per-row line already uses `u.completedAtLabel` (from `studentUpdate`, already formatted as `"Orientação enviada " + relativeLabel + " às " + time`). Change its wording to match brief §10/§25's literal phrasing — replace the row template's meta span:

```js
'<div class="lr-body"><strong>' + c.name + '</strong><span class="lr-meta">' + ICONS.check + ' Avaliação concluída' + (u.completedAtLabel ? " · " + u.completedAtLabel.replace("Orientação enviada ", "") : "") + '</span></div>' +
```

- [ ] **Step 6: Verify in browser**

Open `coach/dashboard.html`. Confirm sidebar reads "Acompanhamento"/"Alunos". Confirm header reads "Acompanhamento" and the counter shows "X de Y" / "concluídos" / "N restantes" (no restante line when N=0). Confirm "Para fazer" section shows "Avaliar agora" for a never-opened check-in. Open `coach/revisar.html?id=maria` (or whichever client is in that queue), then back on the dashboard confirm that same client's button now reads "Continuar avaliação" (Task 1's `markReviewOpened` needs to actually be wired — that's Task 3; for now just confirm the *fallback* "Avaliar agora" path renders correctly and nothing throws). Confirm "Aguardando aluno" section renders. Confirm concluded rows read "✓ Avaliação concluída · [time]".

- [ ] **Step 7: Commit**

```bash
git add prototype/assets/js/nav.js prototype/coach/dashboard.html
git commit -m "$(cat <<'EOF'
V10: nav rename (Acompanhamento/Alunos) + dashboard state-aware CTAs

Sidebar: Dashboard -> Acompanhamento, Clientes -> Alunos. Dashboard
header/counter reworded to the brief's exact "X de Y concluidos / N
restantes" copy. "Para revisar" -> "Para fazer" with state-aware CTA
text (Avaliar agora / Continuar avaliacao). "Aguardando resposta" ->
"Aguardando aluno". Concluded rows read "Avaliacao concluida".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Avaliação — opened-state wiring, header badge, multi-metric comparison

**Files:**
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes: `Trackly.markReviewOpened`, `Trackly.computeStatus` from Task 1; extends the `compareWeekState`/`evoWeekModuleHtml` module from V9.

- [ ] **Step 1: Call `markReviewOpened` on mount**

Right after the early-return guard (`if (cur.checkin.status !== "submitted") { ...; return; }`), add:

```js
  Trackly.markReviewOpened(client.id);
```

- [ ] **Step 2: Header state badge**

In the `review-head` block, add a status badge under the age/height line:

```js
  var evalStatus = Trackly.computeStatus(client);
```

(compute this once, near the top, alongside `var cur = ...`), then in the template:

```js
    '<div class="review-head">' +
      '<p class="eyebrow">Avaliação</p>' +
      '<div class="who"><span class="avatar" style="background:' + color + '">' + client.initials + '</span><div><h1>' + client.name + '</h1>' +
        (client.age && client.heightCm ? '<p style="font-size:12.5px;color:var(--ink-faint);margin:2px 0 0;">' + client.age + ' anos · ' + (client.heightCm / 100).toFixed(2).replace(".", ",") + ' m</p>' : '') +
      '</div></div>' +
      '<div class="wk">Semana ' + cur.weekNumber + ' &nbsp;·&nbsp; recebido ' + Trackly.relativeLabel(cur.checkin.submittedAt) + '</div>' +
      '<span class="pill pill-warn" style="margin-top:10px;"><span class="dot"></span>' + evalStatus.label.toUpperCase() + '</span>' +
    '</div>' +
```

- [ ] **Step 3: Expand the comparison module to move waist/adherence with weight**

In `evoWeekModuleHtml`, after computing `compareWeek`, add a metrics block matching the Fotos-tab pattern and render it right after the slider:

```js
    var compareMetaHtml = !compareWeek ? "" : (function () {
      var wDiff = Trackly.isTracked(client, "weight") ? Trackly.round1(cur.metrics.weight - compareWeek.metrics.weight) : null;
      var items = [
        wDiff != null ? { l: "Peso", from: compareWeek.metrics.weight + " kg", to: cur.metrics.weight + " kg", pct: Trackly.round1(100 * wDiff / compareWeek.metrics.weight) } : null,
        Trackly.isTracked(client, "measurements") && compareWeek.metrics.waist != null ? { l: "Cintura", from: compareWeek.metrics.waist + " cm", to: cur.metrics.waist + " cm", pct: Trackly.round1(100 * (cur.metrics.waist - compareWeek.metrics.waist) / compareWeek.metrics.waist) } : null,
        Trackly.isTracked(client, "adherence") ? { l: "Aderência", from: compareWeek.metrics.adherence + "%", to: cur.metrics.adherence + "%", pct: Trackly.round1(cur.metrics.adherence - compareWeek.metrics.adherence) } : null
      ].filter(Boolean);
      if (!items.length) return "";
      return '<div class="compare-meta" id="evo-compare-meta">' + items.map(function (m) {
        return '<div class="cm-item"><div class="l">' + m.l + '</div><div class="v">' + m.from + ' → ' + m.to + '</div><div style="color:' + (m.pct <= 0 ? "var(--brand)" : "var(--coral)") + ';font-weight:600;">' + (m.pct > 0 ? "+" : "") + m.pct + '%</div></div>';
      }).join("") + '</div>';
    })();
```

Append `compareMetaHtml` right after `sliderHtml` in the returned template (still inside the same outer `<div style="margin-bottom:28px;">`).

- [ ] **Step 4: Make the metrics block update when "Comparar com" changes**

In the `compare-week-select` change handler (already updating the photo tag + weight delta), also rebuild the meta block:

```js
  var compareWeekSelectEl = document.getElementById("compare-week-select");
  if (compareWeekSelectEl) compareWeekSelectEl.addEventListener("change", function () {
    compareWeekState.weekNumber = parseInt(compareWeekSelectEl.value, 10);
    var compareWeek = client.weeks[compareWeekState.weekNumber - 1];
    document.getElementById("cs-before-tag").textContent = "Antes · S" + compareWeek.weekNumber;
    document.getElementById("evo-week-delta").innerHTML = moduleDeltaHtml(compareWeek);
    document.getElementById("evo-week-label").textContent = "peso · semana " + compareWeek.weekNumber + " → " + cur.weekNumber;
    var metaEl = document.getElementById("evo-compare-meta");
    if (metaEl) metaEl.outerHTML = buildCompareMeta(compareWeek);
  });
```

This requires factoring the meta-block builder into a named function `buildCompareMeta(compareWeek)` (same body as Step 3's IIFE, minus the outer `(function(){...})()` wrapper) so both the initial render and the change handler call the identical logic — no drift between first paint and after a selection change.

- [ ] **Step 5: Rewrite the confirmation screen to the §24 checklist**

Replace the `send-orientation` handler's confirmation markup:

```js
    el.innerHTML =
      '<div class="confirm-wrap"><div class="ring">' + ICONS.check + '</div>' +
      '<h2>Avaliação concluída</h2>' +
      '<div class="status-list" style="text-align:left;max-width:280px;margin:0 auto 20px;">' +
        '<div class="row"><span class="mark done">' + ICONS.check + '</span><span>Peso analisado</span></div>' +
        (Trackly.isTracked(client, "photos") ? '<div class="row"><span class="mark done">' + ICONS.check + '</span><span>Fotos comparadas</span></div>' : "") +
        '<div class="row"><span class="mark done">' + ICONS.check + '</span><span>Orientação enviada</span></div>' +
      '</div>' +
      '<p>' + client.name.split(" ")[0] + ' está atualizado' + (client.gender === "f" ? "a" : "") + '.</p>' +
      (client.phone ? '<a href="' + Trackly.whatsappUrl(client.phone, Trackly.orientationReadyMessageForStudent(client)) + '" target="_blank" rel="noopener" class="btn btn-ghost" style="margin-bottom:16px;">Avisar ' + client.name.split(" ")[0] + ' no WhatsApp</a><br>' : '') +
      '<a href="dashboard.html" class="btn btn-primary">Voltar ao acompanhamento</a></div>';
```

(Reuses the existing `.status-list`/`.row`/`.mark.done` classes already styled in `base.css` from earlier versions' Histórico checklists — no new CSS needed.)

- [ ] **Step 6: Verify in browser**

Open `coach/revisar.html?id=maria` (or any client with a pending, never-opened evaluation). Confirm the header shows a status pill reading "AGUARDANDO AVALIAÇÃO" (or "EM AVALIAÇÃO" if reloaded after this first open). Confirm the comparison module now shows a "Peso/Cintura/Aderência" meta row under the photo slider. Change "Comparar com" to an earlier week and confirm **all three** rows (peso/cintura/aderência) update together, plus the photo tag and hero delta — matching brief §17's explicit "não deixar uma parte mostrando Semana 5 e outra mostrando Semana 7." Send the orientation and confirm the new checklist confirmation screen renders with the correct items (photos row absent for a client with `photos: false`, though none currently exist — verify the conditional doesn't break for one that does).

- [ ] **Step 7: Commit**

```bash
git add prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V10: Avaliacao - opened-state wiring, status badge, unified comparison

markReviewOpened fires on mount so a re-visited evaluation reads "Em
avaliacao" instead of "Aguardando avaliacao" everywhere (dashboard,
Alunos list, this page's own header badge). The "Comparar com" module
now moves peso/cintura/aderencia together, not just weight - verified
switching the selector updates all three plus the photo tag and delta
in one change, never a mixed-week state. Confirmation screen rewritten
to the brief's checklist (peso analisado / fotos comparadas / orientacao
enviada) instead of a single sentence.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Alunos — rename, filter consolidation, state-driven row copy

**Files:**
- Modify: `prototype/coach/clientes.html`

- [ ] **Step 1: Page copy**

Change `<title>Clientes — Trackly</title>` → `<title>Alunos — Trackly</title>`; `<p class="eyebrow">Clientes</p>` → `<p class="eyebrow">Alunos</p>`; `<h1>Meus clientes</h1>` → `<h1>Alunos</h1>`.

- [ ] **Step 2: Filter chips — consolidate to Todos/Avaliação/Atenção/Em dia**

Replace:

```html
<button class="chip-filter active" data-filter="all">Todos</button>
<button class="chip-filter" data-filter="review">Aguardando revisão</button>
<button class="chip-filter" data-filter="late">Atrasados</button>
<button class="chip-filter" data-filter="warn">Atenção</button>
<button class="chip-filter" data-filter="ok">Em dia</button>
```

with:

```html
<button class="chip-filter active" data-filter="all">Todos</button>
<button class="chip-filter" data-filter="avaliacao">Avaliação</button>
<button class="chip-filter" data-filter="warn">Atenção</button>
<button class="chip-filter" data-filter="ok">Em dia</button>
```

In the `render()` function's filter logic, change the exact-match filter to also treat `"avaliacao"` as matching any of the three "needs coach or student action" codes:

```js
    var rows = clients.map(function (c) { return { c: c, s: Trackly.computeStatus(c) }; })
      .filter(function (x) { return state.filter === "all" || (state.filter === "avaliacao" ? ["late", "review", "progress"].indexOf(x.s.code) !== -1 : x.s.code === state.filter); })
      .filter(function (x) { return x.c.name.toLowerCase().indexOf(state.q.toLowerCase()) !== -1; });
```

- [ ] **Step 2b: Update `pillClass`/`nextAction` for the new `progress` code**

```js
      var pillClass = x.s.code === "ok" ? "pill-ok" : (x.s.code === "late" || x.s.code === "review" || x.s.code === "progress") ? "pill-late" : "pill-warn";
```

Wait — brief §11 says pendências should read neutral-with-small-highlight, not the coral "late" color, for "aguardando avaliação"/"em avaliação" (only "atrasado," i.e. waiting on the *student*, is the more urgent one). Use:

```js
      var pillClass = x.s.code === "ok" ? "pill-ok" : x.s.code === "late" ? "pill-late" : x.s.code === "warn" ? "pill-warn" : "pill-warn";
```

(`review`/`progress` both render with the existing gold "warn" pill — a neutral-with-highlight tone already in the design system — while `late` keeps the coral "late" pill for the one state that's actually time-sensitive on the student's side. `invite` also falls into the gold bucket, unchanged from before.)

Update `nextAction`'s map to add the `progress` code and reword `review`:

```js
  var nextAction = {
    invite: null,
    review: ["Avaliar agora", "revisar.html?id="], progress: ["Continuar avaliação", "revisar.html?id="],
    late: ["Cobrar check-in", "cliente.html?id="], warn: ["Analisar tendência", "cliente.html?id="], ok: ["Ver", "cliente.html?id="]
  };
```

- [ ] **Step 3: Verify in browser**

Open `coach/clientes.html`. Confirm title/heading read "Alunos." Confirm 4 filter chips (Todos/Avaliação/Atenção/Em dia). Click "Avaliação" — confirm it shows clients with `late`, `review`, or `progress` status together. Confirm each row's action link reads "Avaliar agora"/"Continuar avaliação"/"Cobrar check-in"/"Analisar tendência"/"Ver" per its actual state. Confirm a client whose evaluation was opened (Task 3 sets `reviewOpenedAt`) shows "Continuar avaliação" here too — same underlying `computeStatus`, so this should hold automatically once Task 3 is live.

- [ ] **Step 4: Commit**

```bash
git add prototype/coach/clientes.html
git commit -m "$(cat <<'EOF'
V10: Alunos - rename, filter consolidation, state-driven row actions

Clientes -> Alunos throughout. Five filter chips collapse to four
(Todos/Avaliacao/Atencao/Em dia) - Avaliacao now covers late+review+
progress together, since all three are "something needs to happen,"
distinct from Atencao's "a pattern is worth noting" (brief section 28).
Row action text now reads Avaliar agora / Continuar avaliacao / Cobrar
check-in / Analisar tendencia / Ver depending on the real state.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Perfil do aluno — "Avaliação" tab shortcut

**Files:**
- Modify: `prototype/coach/cliente.html`

- [ ] **Step 1: Add the tab**

In the tabs bar, insert a 5th button between "Visão geral" and "Evolução" that navigates directly instead of switching panels:

```html
<div class="tabs" style="margin-top:22px;">
  <button class="tab-btn active" data-tab="resumo">Visão geral</button>
  <button class="tab-btn" id="tab-avaliacao-link" type="button">Avaliação</button>
  <button class="tab-btn" data-tab="evolucao">Evolução</button>
  <button class="tab-btn" data-tab="fotos">Fotos</button>
  <button class="tab-btn" data-tab="historico">Histórico</button>
</div>
```

(No `data-tab` attribute — it deliberately falls outside the existing `document.querySelectorAll(".tab-btn").forEach(...)` click-switching logic, which only wires elements that have one, per how that loop reads `btn.getAttribute("data-tab")` and does nothing useful without it. Instead:)

```js
  var avalLink = document.getElementById("tab-avaliacao-link");
  if (avalLink) avalLink.addEventListener("click", function () { location.href = "revisar.html?id=" + client.id; });
```

Add this line alongside the existing tab-wiring block near the bottom of the script.

- [ ] **Step 2: Verify in browser**

Open `coach/cliente.html?id=joao`, click "Avaliação" in the tab bar, confirm it navigates to `revisar.html?id=joao` (the existing dedicated Avaliação page) — not a blank/broken panel. Confirm the other 4 tabs still switch panels normally (this button sits visually among them but behaves as a link, which is fine — its own hover/focus state is identical to the other tab buttons via the shared `.tab-btn` class).

- [ ] **Step 3: Commit**

```bash
git add prototype/coach/cliente.html
git commit -m "$(cat <<'EOF'
V10: "Avaliacao" tab on the profile jumps to the existing Avaliacao page

Per brief section 29's tab list, but implemented as a direct link to
revisar.html rather than a duplicated embedded panel - the dedicated
page already answers this question fully (brief section 41: a new
screen/panel should exist only when it answers something different).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final review — persistence, responsive, docs

**Files:** all HTML (version bump); `ARCHITECTURE.md`.

- [ ] **Step 1: Cache-bust**

```bash
cd prototype && grep -rl '?v=9' --include="*.html" . | xargs sed -i 's/?v=9/?v=10/g'
```

- [ ] **Step 2: Full state-transition regression (brief §45, in a fresh tab)**

1. Pick a client with a never-opened, submitted check-in. Confirm dashboard/Alunos both read "Aguardando avaliação."
2. Open `revisar.html?id=...` — confirm the header badge flips to reflect the open (verify via reload, not just in-memory).
3. Reload dashboard/Alunos — confirm both now read "Em avaliação" / "Continuar avaliação."
4. Change "Comparar com" to two different prior weeks in sequence — confirm photo tag, weight delta, and the new peso/cintura/aderência meta block all move together every time, never partially.
5. Send the orientation with a note — confirm the new checklist confirmation screen, then reload the dashboard — confirm the counter incremented, the client now shows under "Concluídos" with "✓ Avaliação concluída · [time]," and `client.weeks.slice(-1)[0].coachReview.note` still holds the typed note.
6. Clear test-induced localStorage.

- [ ] **Step 3: Responsive spot-check**

Re-open `coach/revisar.html` at 768 and 1280+ widths — confirm the new status pill and expanded compare-meta block don't overflow or wrap awkwardly. Student-side screens are untouched by V10, so no re-test needed there.

- [ ] **Step 4: Update `ARCHITECTURE.md`**

Document: `reviewOpenedAt`/`progress` status code, the nav rename, the unified multi-metric comparison module, the Avaliação-tab-as-link decision, and that Carteira was deliberately not built.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
V10: final review - cache-bust v10, state-transition regression, docs

Verified the full aguardando-avaliacao -> em-avaliacao -> concluido
transition survives reload at every step, and that changing "Comparar
com" moves peso/cintura/aderencia together, never partially. Documents
V10 in ARCHITECTURE.md, including the deliberate decision not to build
a Carteira/portfolio area this version.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:** §1 (problem statement) → the plan's whole rationale. §2 (nav rename) → Task 2 Step 1. §3 (no Comparações menu) → never built, nothing to flag. §4 (Carteira, optional) → deliberately not built, documented. §5, §12 (Acompanhamento header/counter) → Task 2 Steps 2. §6–7 (clear states, action-labeled CTAs) → Task 1 + Task 2 Step 3 + Task 4. §8–10 (dashboard sections) → Task 2 Steps 3–5. §11 (state colors, no red-for-everything) → Task 4 Step 2b (late keeps coral, review/progress/invite share the existing gold "warn" pill, ok stays green — no new color introduced). §13 (dynamic, no reload) → already true since V6 (`render()` re-runs after every mutation); unchanged. §14–19 (Avaliação header, comparison module, "comparar com" moving everything together) → Task 3. §20–23 (o que mudou / últimas semanas / nota / decisão) → already built (V7–V9), untouched. §24–25 (conclusion screen, dashboard reflects it) → Task 3 Step 5 + Task 2 (same counter logic already reactive). §26–28 (Alunos rename, filters, pendência-vs-atenção) → Task 4. §29 (profile tabs incl. Avaliação) → Task 5. §30–34 (Visão geral/Evolução/Fotos/Histórico content) → already correct since V6–V9, untouched. §35–39 (coach desktop/aluno mobile, app-not-site) → already the architecture; verified untouched, no aluno-side files modified in this plan. §40 (no-adds) → nothing added violates this list. §41 (no filler screens) → the explicit reasoning behind skipping Carteira and making Avaliação-tab a link, not a panel. §42–43 (10x, future-proofing) → already the architecture (`buildCoachMemory`, `trendLine` from V7); no new task needed. §44 (persistence) → Task 6 Step 2. §45–46 (test scenarios) → Task 6. §47 (delivery format) → this plan's execution + closing summary.

**Type consistency check:** `computeStatus`'s new `progress` code is threaded identically through `dashboard.html` (Task 2), `clientes.html` (Task 4), and `revisar.html`'s own badge (Task 3) — same code string, same `nextAction`/`pillClass` mapping logic pattern reused, not reinvented per file.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-12-v10-coach-workspace.md`. Continuing with **inline execution**, committing after each task with browser verification as specified.
