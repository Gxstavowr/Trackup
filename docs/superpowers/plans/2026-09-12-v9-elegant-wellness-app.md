# V9 — Elegant Wellness App Implementation Plan

> **For agentic workers:** Static HTML/CSS/JS prototype, no build step, no test framework. "Tests" here mean **browser verification** via the Claude Browser tool, same method as V1–V8. Execute inline in this session (see "Execution Handoff").

**Goal:** Consolidate coach (desktop-first tool) and student (mobile-first companion) as two clearly complementary experiences, replace the simulated WhatsApp buttons with real `wa.me` deep links carrying day-appropriate messages, add the light personal context (age/height) the brief asks for, and add a scoped "compare with" week picker inside the Avaliação photo module — without rebuilding anything V6–V8 already got right.

**Architecture:** Re-reading the brief against the current (post-V8) code, almost all of the desktop/mobile/minimalism/period-summary/photo-comparison/history requirements are already built (sidebar+desktop layout for coach since V1, bottom-nav mobile-first portal since V2, `.compare-slider`, unified period control, `buildCoachMemory`/`trendLine` from V7-V8). V9's real net-new work is narrow and concrete:
1. **Real WhatsApp deep links** (brief §42–49) — today "Enviar lembrete," "Avisar coach," and "Enviar também pelo WhatsApp" are either silent state changes or a button that just relabels itself. None of them actually open WhatsApp. This needs (a) phone numbers on the fixture clients and coach (don't exist yet — only manually-created clients have a `phone` field), and (b) day-dependent message builders.
2. **Age + height context** (brief §35, §72) — not in the data model at all today. Small addition to `CLIENTS`, displayed next to the name in two places.
3. **A "Comparar com" selector scoped to the Avaliação photo module** (brief §18) — today that module is hardcoded to previous-submitted-week vs current-week; needs a local dropdown that only affects that module, not the page's global state.

Everything else in this plan is verification (responsive check across 375/390/430/tablet/desktop) and small copy/empty-state polish, not new architecture.

**Tech Stack:** Vanilla HTML/CSS/JS, same as V1–V8. Cache-busting bumps to `?v=9`.

## Global Constraints

- `wa.me` links are `https://wa.me/<digits-only-phone>?text=<encodeURIComponent(message)>` opened via `target="_blank"` (or `window.open`) — never a fake/simulated button once this plan lands; a real link, even though the phone numbers are fictional demo data.
- Never send sensitive content in a WhatsApp message — only the short, human templates the brief itself specifies (§43–46, §48, §49), never QA answers, weight, or orientation text.
- Never auto-send anything — every WhatsApp action stays a user-initiated click that opens the app/link; no background automation.
- Age/height are display-only context, never gated by `trackingSettings` (they're identity facts, not tracked metrics) and never rendered as a card — inline text next to the name, per brief §35 ("não transformar em cards").
- The "Comparar com" selector inside Avaliação must never change `evoState.range` or any other page-level state — it is local to that one module, exactly like the brief insists (§18: "Não mudar o período global da página").
- Preserve `WeeklyCycle`/localStorage/invite/tracking/individual goals exactly as V8 left them — only additive changes.
- Bump `?v=8` → `?v=9` on every shared script tag, site-wide, same commit as the last JS/CSS change.

---

## File Structure

**Modify:**
- `prototype/assets/js/data.js` — add `age`, `heightCm`, `phone` to `COACH` and the four fixture `CLIENTS`; add `whatsappUrl(phone, message)` helper and three message builders: `checkinNudgeMessage(client)` (day-dependent, brief §43–46), `checkinReceivedMessageForCoach(client)` (brief §48), `orientationReadyMessageForStudent(client)` (brief §49).
- `prototype/coach/dashboard.html` — "Enviar lembrete" becomes "Cobrar check-in" opening a real `wa.me` link with the day-dependent nudge message (still calls `sendReminder` to record the timestamp).
- `prototype/portal/checkin.html` — "Avisar coach" (post-submit) becomes a real `wa.me` link to the coach's number with the fixed §48 message.
- `prototype/coach/revisar.html` — "Enviar também pelo WhatsApp" (post-orientation) becomes a real `wa.me` link to the client's number with the §49 message; the "Evolução desta semana" module gains a "Comparar com" week-select scoped to itself.
- `prototype/coach/cliente.html`, `prototype/coach/revisar.html` — show "32 anos · 1,78 m" next to the client's name.
- Every HTML file — cache-bust `?v=8` → `?v=9`.

**Create:** none.

---

### Task 1: Data layer — identity fields + WhatsApp message builders

**Files:**
- Modify: `prototype/assets/js/data.js`

**Interfaces:**
- Produces: `client.age` (number), `client.heightCm` (number), `client.phone` (string, digits only, no `+`/spaces — Brazilian mobile format `55DDXXXXXXXXX`), `COACH.phone`.
- Produces: `Trackly.whatsappUrl(phone, message) -> string`, `Trackly.checkinNudgeMessage(client) -> string`, `Trackly.checkinReceivedMessageForCoach(client) -> string`, `Trackly.orientationReadyMessageForStudent(client) -> string`.

- [ ] **Step 1: Add phone to `COACH` and age/height/phone to the four fixture clients**

```js
var COACH = { name: "Renata Prado", role: "Coach de nutrição e treino", initials: "RP", phone: "5511988887777" };
```

In each of the four client objects in `CLIENTS` (joao/maria/pedro/ana), add `age`, `heightCm`, `phone`:

```js
{ id: "joao", ..., age: 32, heightCm: 178, phone: "5511987654321", tracking: tracking() },
{ id: "maria", ..., age: 27, heightCm: 165, phone: "5511976543210", tracking: tracking({ ... }) },
{ id: "pedro", ..., age: 24, heightCm: 181, phone: "5511965432109", tracking: tracking({ ... }) },
{ id: "ana", ..., age: 35, heightCm: 168, phone: "5511954321098", tracking: tracking({ ... }) }
```

(Exact placement: add these three keys into each existing object literal in `CLIENTS`, right after `gender:`, without touching any other field — the array's structure otherwise stays identical.)

- [ ] **Step 2: Add the WhatsApp helpers**

Add near `getCheckinWindowStatus`/`nextOpenDate` (same section of the file, since the nudge message depends on the same day logic):

```js
  // ---------------- V9 — WhatsApp: canal complementar, nunca o centro do produto ----------------
  function whatsappUrl(phone, message) {
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
  }

  // mensagem de cobrança varia por dia (brief V9 §43-46) — nunca "check-in atrasado"
  function checkinNudgeMessage(client) {
    var first = client.name.split(" ")[0];
    var day = APP_DATE.getDay(); // 0=dom..6=sáb
    if (day === 5) return "Oi, " + first + "! Tudo bem? Seu check-in semanal está disponível no app. Quando puder, envia sua atualização 😊";
    if (day === 6) return "Oi, " + first + "! Ainda não recebemos sua atualização desta semana. Seu check-in fica disponível até amanhã. Quando puder, passa lá no app 😊";
    if (day === 0) return "Oi, " + first + "! Seu check-in termina hoje. Quando conseguir, envia sua atualização pelo app 😊";
    return "Oi, " + first + "! Tudo bem por aí? Não recebemos sua atualização nesta semana e queria saber se está tudo certo com o plano. Quando puder, me atualiza 😊";
  }

  function checkinReceivedMessageForCoach(client) {
    return client.name.split(" ")[0] + " enviou o check-in semanal pelo app.";
  }

  function orientationReadyMessageForStudent(client) {
    return "Oi, " + client.name.split(" ")[0] + "! Sua atualização já foi revisada. Sua nova orientação está disponível no app 😊";
  }
```

- [ ] **Step 3: Export the new functions**

In `global.Trackly = { ... }`, add:

```js
    whatsappUrl: whatsappUrl, checkinNudgeMessage: checkinNudgeMessage,
    checkinReceivedMessageForCoach: checkinReceivedMessageForCoach, orientationReadyMessageForStudent: orientationReadyMessageForStudent,
```

- [ ] **Step 4: Verify in browser (console-only)**

```js
JSON.stringify({
  coachPhone: Trackly.COACH.phone,
  joaoAge: Trackly.getClient("joao").age,
  joaoHeight: Trackly.getClient("joao").heightCm,
  nudge: Trackly.checkinNudgeMessage(Trackly.getClient("joao")),
  received: Trackly.checkinReceivedMessageForCoach(Trackly.getClient("joao")),
  ready: Trackly.orientationReadyMessageForStudent(Trackly.getClient("joao")),
  url: Trackly.whatsappUrl(Trackly.getClient("joao").phone, "teste")
})
```
Expected: all fields populated, `url` starts with `https://wa.me/5511987654321?text=`. Test `checkinNudgeMessage` under `?simDate=` for a Friday, Saturday, Sunday, and Monday to confirm all four message variants — use `Trackly.checkinNudgeMessage` directly (it reads the module-internal `APP_DATE`, so re-navigate with each `?simDate=` and re-check).

- [ ] **Step 5: Commit**

```bash
git add prototype/assets/js/data.js
git commit -m "$(cat <<'EOF'
V9: identity fields (age/height/phone) + WhatsApp message builders

Adds age/heightCm/phone to COACH and the four fixture clients (fictional
demo numbers), plus whatsappUrl() and three day-aware message builders
matching the brief's literal templates (checkin nudge varies Fri/Sat/Sun/
weekday, never says "atrasado"; coach-notified and orientation-ready are
fixed short messages). No UI wiring yet - pure data-layer addition.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Real WhatsApp deep links (dashboard, check-in, orientation)

**Files:**
- Modify: `prototype/coach/dashboard.html`
- Modify: `prototype/portal/checkin.html`
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes: `Trackly.whatsappUrl`, `Trackly.checkinNudgeMessage`, `Trackly.checkinReceivedMessageForCoach`, `Trackly.orientationReadyMessageForStudent` from Task 1.

- [ ] **Step 1: Dashboard's "Enviar lembrete" → "Cobrar check-in" real link**

In the "Aguardando resposta" row template, replace:

```js
(reminded ? '<span style="font-size:12px;color:var(--ink-faint);">Lembrete ' + Trackly.relativeLabel(reminded) + '</span>' : '<button class="btn btn-ghost" data-remind="' + c.id + '">Enviar lembrete</button>') +
```

with:

```js
(reminded ? '<span style="font-size:12px;color:var(--ink-faint);">Cobrado ' + Trackly.relativeLabel(reminded) + '</span>' : '<a href="' + Trackly.whatsappUrl(c.phone, Trackly.checkinNudgeMessage(c)) + '" target="_blank" rel="noopener" class="btn btn-ghost" data-remind="' + c.id + '">Cobrar check-in</a>') +
```

The existing `data-remind` click handler (`Trackly.sendReminder(...); render();`) still fires on this `<a>` exactly as it did on the `<button>` — an anchor click both navigates (opens the WhatsApp tab) and dispatches its own click listeners, so no handler change is needed there.

- [ ] **Step 2: Student check-in confirmation — "Avisar coach" becomes a real link**

In `portal/checkin.html`'s `submit()`, replace the `notify-coach` button and its `simulateNotify` wiring with a real anchor. Change:

```js
'<button class="btn btn-secondary" id="notify-coach">Avisar coach</button>' +
```

to:

```js
'<a href="' + Trackly.whatsappUrl(Trackly.COACH.phone, Trackly.checkinReceivedMessageForCoach(client)) + '" target="_blank" rel="noopener" class="btn btn-secondary" id="notify-coach">Avisar coach no WhatsApp</a>' +
```

Remove the `simulateNotify("notify-coach", "Coach avisada");` call (the anchor now genuinely opens WhatsApp — there's nothing to simulate). Keep `notify-whatsapp` — wait, re-check: the brief's §48 button is specifically "Avisar coach no WhatsApp" as one single action; the existing separate "Avisar no WhatsApp" button becomes redundant once "Avisar coach" itself is the WhatsApp action. Remove the second `notify-whatsapp` button and its `simulateNotify("notify-whatsapp", ...)` call entirely — one clear WhatsApp CTA, not two overlapping ones.

- [ ] **Step 3: Coach's orientation-sent confirmation — "Enviar também pelo WhatsApp" becomes a real link**

In `coach/revisar.html`'s `send-orientation` handler, replace:

```js
'<button class="btn btn-ghost" id="notify-whatsapp-coach" style="margin-bottom:16px;">Enviar também pelo WhatsApp</button>' +
```

with:

```js
'<a href="' + Trackly.whatsappUrl(client.phone, Trackly.orientationReadyMessageForStudent(client)) + '" target="_blank" rel="noopener" class="btn btn-ghost" style="margin-bottom:16px;">Avisar ' + client.name.split(" ")[0] + ' no WhatsApp</a>' +
```

Remove the now-obsolete `document.getElementById("notify-whatsapp-coach").addEventListener(...)` block (the label-flip simulation) — the anchor is the real action now.

- [ ] **Step 4: Verify in browser**

Dashboard: open with a client in "Aguardando resposta" (e.g. pedro on a date where he hasn't submitted), click "Cobrar check-in," confirm a new tab attempts to open `https://wa.me/<pedro's phone>?text=...` (check via `read_network_requests` or the new tab's URL — the Browser tool may block the actual WhatsApp site load, which is fine; confirm the URL is correct) and that the row updates to "Cobrado agora." Portal check-in: submit a check-in, click "Avisar coach no WhatsApp," confirm the URL targets `Trackly.COACH.phone` with the exact §48 message (no old second button present). Avaliação: send an orientation, click "Avisar <Nome> no WhatsApp," confirm the URL targets the client's phone with the §49 message. Confirm `checkinNudgeMessage` text changes correctly across `?simDate=` Friday/Saturday/Sunday/Tuesday for the dashboard link.

- [ ] **Step 5: Commit**

```bash
git add prototype/coach/dashboard.html prototype/portal/checkin.html prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V9: real WhatsApp deep links replace simulated buttons

"Enviar lembrete" -> "Cobrar check-in" (dashboard), "Avisar coach" (student
check-in confirm), and "Enviar tambem pelo WhatsApp" (orientation confirm)
now open real wa.me links with the brief's day-aware / fixed short
messages, instead of just relabeling a button. WhatsApp stays a
complementary channel - one click, one already-composed message, no
automation, no sensitive content sent. Verified all three links and the
four day-dependent nudge message variants.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Age + height context next to the client's name

**Files:**
- Modify: `prototype/coach/cliente.html`
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes: `client.age`, `client.heightCm` from Task 1.

- [ ] **Step 1: `cliente.html` profile header**

Right after `document.getElementById("p-name").textContent = client.name;`, add a small inline meta line reusing the existing `.profile-meta`-style pattern already in `#p-meta` — but since `#p-meta` already carries objective/foco, append age/height as a leading item instead of a new element:

```js
document.getElementById("p-meta").innerHTML =
  (client.age && client.heightCm ? '<span>' + client.age + ' anos · ' + (client.heightCm / 100).toFixed(2).replace(".", ",") + ' m</span><span>·</span>' : '') +
  '<span>' + client.objective + '</span><span>·</span><span>Foco: ' + Trackly.focusLabelFromOrientation(client, refWeek0) + '</span>';
```

(This replaces the existing assignment to `#p-meta` from V6/V7 — same element, just prepends the age/height span when present; absent for manual clients who don't have these fields yet, matching "não assumir padrão" — no fabricated age for clients we don't know.)

- [ ] **Step 2: `revisar.html` (Avaliação) header**

In the `review-head` block, right after the `<h1>` line, add the same age/height line under the client name:

```js
'<div class="review-head">' +
  '<p class="eyebrow">Avaliação</p>' +
  '<div class="who"><span class="avatar" style="background:' + color + '">' + client.initials + '</span><div><h1>' + client.name + '</h1>' +
    (client.age && client.heightCm ? '<p style="font-size:12.5px;color:var(--ink-faint);margin:2px 0 0;">' + client.age + ' anos · ' + (client.heightCm / 100).toFixed(2).replace(".", ",") + ' m</p>' : '') +
  '</div></div>' +
  '<div class="wk">Semana ' + cur.weekNumber + ' &nbsp;·&nbsp; recebido ' + Trackly.relativeLabel(cur.checkin.submittedAt) + '</div>' +
'</div>' +
```

(Wraps the `<h1>` in a `<div>` alongside the new age/height line so the avatar stays vertically centered against both lines — the existing `.who` flex rule already handles this since it's `align-items:center` on the outer row.)

- [ ] **Step 3: Verify in browser**

Open `coach/cliente.html?id=joao` — confirm "32 anos · 1,78 m ·" appears before "Emagrecimento" in the meta line. Open `coach/revisar.html?id=joao` — confirm the same line appears under "João Silva." Confirm it's plain inline text, not a card/pill.

- [ ] **Step 4: Commit**

```bash
git add prototype/coach/cliente.html prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V9: age + height context next to the client's name

Plain inline text under/beside the name in the profile header and
Avaliacao - never a card, absent when the data isn't known (manual
clients created via invite don't have it yet, and nothing is fabricated).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: "Comparar com" — scoped week selector in the Avaliação photo module

**Files:**
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes/extends: the `evoWeekModuleHtml` IIFE and `wireCompareInteraction`/`rerenderEvoModule` from V8 Task 3 — this task adds a **new local state variable** (`compareWeekState`), never touching `evoState` (which doesn't even exist in this file — confirming there's no global range state here to accidentally collide with).

- [ ] **Step 1: Add local compare-week state and a select control to the module**

Replace the fixed `prevSubmitted` reference inside `evoWeekModuleHtml` with a selectable one. Add, right before the `evoWeekModuleHtml` IIFE:

```js
  var compareWeekState = { weekNumber: prevSubmitted ? prevSubmitted.weekNumber : null };
```

Inside the IIFE, replace every use of `prevSubmitted` with a freshly-resolved `compareWeek` based on `compareWeekState.weekNumber`:

```js
  var evoWeekModuleHtml = (function () {
    var compareWeek = compareWeekState.weekNumber ? client.weeks[compareWeekState.weekNumber - 1] : null;
    var hasPhotoPair = Trackly.isTracked(client, "photos") && compareWeek;
    var priorSubmittedWeeks = weeksSoFar.slice(0, -1); // todas as semanas enviadas antes da atual — opções do seletor
    var pickerHtml = priorSubmittedWeeks.length > 1 ? (
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12.5px;color:var(--ink-faint);">' +
        '<span>Comparar com</span>' +
        '<select id="compare-week-select" style="border:1px solid var(--line-strong);border-radius:var(--radius-sm);padding:6px 10px;background:var(--surface);color:var(--ink);font-size:12.5px;font-family:var(--font-body);">' +
          priorSubmittedWeeks.map(function (w) { return '<option value="' + w.weekNumber + '"' + (w.weekNumber === compareWeekState.weekNumber ? " selected" : "") + '>Semana ' + w.weekNumber + '</option>'; }).join("") +
        '</select>' +
      '</div>'
    ) : "";
    var sliderHtml = !hasPhotoPair ? "" : (
      pickerHtml +
      '<div class="angle-tabs" id="angle-tabs" style="margin-bottom:14px;">' +
        ["front", "back", "side"].map(function (a) {
          var names = { front: "Frente", back: "Costas", side: "Lateral" };
          return '<button data-angle="' + a + '" class="' + (angleState.angle === a ? "active" : "") + '">' + names[a] + '</button>';
        }).join("") +
      '</div>' +
      '<div class="compare-slider" id="cs-photo">' +
        '<div class="cs-after" style="background:' + photoBg(1, angleState.angle) + ';"><span class="cs-tag after">Agora · S' + cur.weekNumber + '</span></div>' +
        '<div class="cs-before" id="cs-before-clip" style="width:50%;"><div style="background:' + photoBg(0, angleState.angle) + ';"><span class="cs-tag before">Antes · S' + compareWeek.weekNumber + '</span></div></div>' +
        '<div class="cs-handle" id="cs-handle" tabindex="0" role="slider" aria-label="Comparar antes e depois" aria-valuemin="4" aria-valuemax="96" aria-valuenow="50" style="left:50%;"></div>' +
      '</div>'
    );
    if (!sliderHtml && !Trackly.isTracked(client, "weight")) return "";
    var deltaVsCompare = compareWeek && Trackly.isTracked(client, "weight") ? Trackly.round1(cur.metrics.weight - compareWeek.metrics.weight) : null;
    var deltaHtmlForModule = deltaVsCompare == null ? weightDeltaForHero : ('<div class="delta" style="color:' + (deltaVsCompare === 0 ? "var(--ink-faint)" : (Trackly.isGoodWeightDelta(client, deltaVsCompare) ? "var(--brand)" : "var(--coral)")) + ';">' + (deltaVsCompare === 0 ? "" : (deltaVsCompare < 0 ? "↓ " : "↑ ")) + Math.abs(deltaVsCompare) + 'kg</div>');
    return (
      '<div style="margin-bottom:28px;">' +
        '<p class="section-label">Evolução desta semana</p>' +
        (Trackly.isTracked(client, "weight") ? '<div class="hero-stat" style="margin-bottom:16px;"><div class="value">' + cur.metrics.weight + '<span class="unit">kg</span></div>' + deltaHtmlForModule + '<div class="label">peso' + (compareWeek ? " · semana " + compareWeek.weekNumber + " → " + cur.weekNumber : "") + '</div></div>' : "") +
        sliderHtml +
      '</div>'
    );
  })();
```

Note: when the coach picks a different compare week, `weightDeltaForHero` (computed once against `prevSubmitted` at the top of the file, still used by the Resumo da Semana hero row) stays untouched — only this module's own `deltaHtmlForModule` reflects the selected comparison, per the brief's explicit rule that this selector affects only the comparison module, nothing else on the page.

- [ ] **Step 2: Wire the select's change event**

Where `angleTabsEl` is wired (right after `document.getElementById("review-body").innerHTML = ...`), add a handler that updates `compareWeekState` and re-renders just this module in place (reusing the pattern already used for the tab bar — full section replace is simplest here since the slider's fixed-pixel width and tag labels all depend on the new pair):

```js
  var compareWeekSelect = document.getElementById("compare-week-select");
  if (compareWeekSelect) compareWeekSelect.addEventListener("change", function () {
    compareWeekState.weekNumber = parseInt(compareWeekSelect.value, 10);
    var freshModule = evoWeekModuleHtmlBuilder();
    document.getElementById("evo-week-module").outerHTML = freshModule;
    if (document.getElementById("cs-photo")) wireCompareInteraction();
    wireAngleAndCompareControls();
  });
```

This requires two small refactors to keep the rebuild clean: wrap the module's template string in an identifiable container (`<div id="evo-week-module">...</div>`) instead of the current bare `'<div style="margin-bottom:28px;">'`, and factor the wiring (angle-tab listener + this select listener) into a named `wireAngleAndCompareControls()` function called both on initial render and after a rebuild, since `outerHTML` replacement invalidates all previously-attached listeners inside it. Rename the outer div's opening tag accordingly and extract the existing angle/notify wiring block (Task 3 of V8) into that function.

- [ ] **Step 3: Verify in browser**

Open `coach/revisar.html?id=joao` (16 weeks of history, several submitted). Confirm "Comparar com" shows a dropdown with prior weeks (S1..S15), defaulting to S15 (the immediately-previous week). Change it to an earlier week (e.g. S12) and confirm: the slider's "Antes" tag updates to "S12," the weight-delta line under "Evolução desta semana" recalculates against week 12 while the **top** Resumo da Semana hero-stat's own delta stays unchanged (still vs. the immediately-previous week) — this is the key behavior the brief insists on (§18: "Não mudar o período global da página"). Confirm dragging the slider and switching angle tabs still work after changing the compare week. Test a client with only 2 submitted weeks total (so `priorSubmittedWeeks.length` is 1) — confirm the picker itself is hidden (not enough options to be worth showing) but the fixed single-comparison slider still renders.

- [ ] **Step 4: Commit**

```bash
git add prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V9: "Comparar com" - scoped week selector in the Avaliacao photo module

Adds a small dropdown local to the Evolucao desta semana module letting
the coach pick which earlier submitted week to compare against, instead
of always the immediately-previous one. Only that module's slider/weight
delta changes - the Resumo da Semana hero-stat and everything else on
the page keeps representing the real previous week, per the brief's
explicit "don't change the page's global period" rule.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Responsive verification pass (375 / 390 / 430 / tablet / desktop)

**Files:** none pre-determined — verification plus any small fixes it surfaces.

- [ ] **Step 1: Student screens at 375×812, 390×844, 430×932 (`resize_window` custom width/height, and `preset: "mobile"` for the 375 baseline)**

For each width, open: `portal/dashboard.html?client=joao`, `portal/checkin.html?client=joao&simDate=2026-09-18` (step through all 4 steps), `portal/evolucao.html?client=joao` (including the compare-slider drag and angle tabs), `portal/historico.html?client=joao`. Confirm: no horizontal scroll, bottom nav touch targets are comfortably tappable, the compare-slider fits without overflow at all three widths, form inputs/buttons are full-width and easy to tap.

- [ ] **Step 2: Coach screens at tablet (768×1024) and desktop (1280+)**

Open `coach/dashboard.html`, `coach/clientes.html`, `coach/cliente.html?id=joao` (all 4 tabs), `coach/revisar.html?id=joao` (including the new "Comparar com" selector and age/height line). Confirm the sidebar collapses to the mobile-menu-button pattern below the existing breakpoint (unchanged from V1–V8) and that nothing introduced in V9 (age/height line, WhatsApp links, compare-week select) breaks that layout.

- [ ] **Step 3: Fix anything found, otherwise note "no regressions"**

If a real overflow/tap-target issue surfaces, fix it with a targeted CSS change (media query or flex-wrap adjustment) — do not restructure a screen that already passes.

- [ ] **Step 4: Commit** (only if fixes were needed; otherwise fold this verification into Task 6's commit)

```bash
git add -A
git commit -m "$(cat <<'EOF'
V9: responsive fixes from the 375/390/430/tablet/desktop pass

[Describe the specific fix(es) found, if any.]

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final review — cache-bust, persistence regression, docs

**Files:** all HTML files (version bump only); `ARCHITECTURE.md`.

- [ ] **Step 1: Bump cache-busting version site-wide**

```bash
cd prototype && grep -rl '?v=8' --include="*.html" . | xargs sed -i 's/?v=8/?v=9/g'
```

- [ ] **Step 2: Full persistence + WhatsApp-link regression (brief §64, §70)**

1. Submit a check-in as a pending client, reload student portal and coach dashboard — confirm state survives (same chain V8 already fixed; re-confirm V9's edits didn't reintroduce the bug).
2. Click "Cobrar check-in" on a client in "Aguardando resposta" — confirm the reminded state persists across reload (`sendReminder` already does this; confirm the new anchor markup didn't drop the `data-remind` wiring).
3. Send an orientation with a coach note, click "Avisar ... no WhatsApp," reload — confirm orientation + note persisted (already covered in V8, re-verify here since the button markup changed).
4. Grep for leftover AI-generic language and simulated-button remnants:
```bash
grep -rni "ask ai\|analyze with ai\|ai coach\|ai assistant\|chatbot\|simulateNotify" prototype/
```
Expect no matches (the `simulateNotify` helper should be fully removed from `checkin.html` and `revisar.html` by Task 2).
5. Clear test-induced localStorage afterward.

- [ ] **Step 3: Update `ARCHITECTURE.md` with a V9 section**

Document: the age/height/phone fields, the three real WhatsApp deep links (and that the prior "simulate" buttons are gone), the "Comparar com" scoped selector, and confirm the desktop/mobile responsive pass found no regressions (or lists what was fixed).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
V9: final review - cache-bust v9, WhatsApp/persistence regression, docs

Confirms no simulated-button remnants or AI-generic language remain,
re-verifies the check-in/orientation persistence chain with the new
markup, and documents V9 in ARCHITECTURE.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:** §1-8 (concept, visual direction, app>site, coach/aluno differentiation) → already true since V6-V8; this plan only verifies (Task 5), never rebuilds. §9-13 (check-in mobile flow, window messages) → already correct since V7-V8, re-verified in Task 5. §14-16 (dashboard) → unchanged since V6, re-verified. §17-24 (Avaliação) → age/height (Task 3) + Comparar com (Task 4); everything else (big photo module, O que mudou, Últimas semanas, Notas do coach, Decisão) already built in V8. §25-30 (Evolução, one chart, value+trend for secondary metrics) → already correct since V8's period-unification fix. §31-33 (Fotos) → already built in V8 (comparison slider, angle switch, week-pair selection). §34 (Histórico) → already minimal since V6/V8; "Nota do coach" in the expanded detail is a small gap — flagged below, not silently dropped. §35 (age/height) → Task 3. §36-39 (aluno home/mobile/touch) → already built since V6, re-verified Task 5. §40-41 (coach desktop/mobile) → already correct, re-verified. §42-49 (WhatsApp) → Task 1 + Task 2, the plan's core new work. §50-52 (memory/patterns) → already built in V7 (`buildCoachMemory`/`trendLine`); no new task needed. §53-54 (10x, gets-better-with-time) → already the architecture's design, not a new task. §55-58 (no gamification/generic AI, quiet UI, movement) → already the design system since V6; Task 6 greps for violations. §59-61 (empty/loading/error states) → existing empty states (Fotos "ainda não há fotos suficientes," Evolução period-summary gate) already match the brief's tone; no skeleton loaders added (a static prototype has no real async latency to skeleton over — would be decoration without function, which the brief itself warns against in §56). §62-63 (individual metrics/goals) → unchanged, re-verified Task 5. §64 (persistence) → Task 6. §65-73 (test scenarios) → covered by each task's verification plus Task 5/6. §74 (density) → enforced throughout, no new cards added. §75-77 (final feel, coach vs aluno) → the plan's overall shape. §78 (implement directly) → every task edits real files. §79-80 (final review + delivery) → Task 5/6 + closing summary.

**Gap flagged, not silently dropped:** brief §34 lists "Nota do coach" as one of the four things shown when a Histórico week is expanded (Check-in / Orientação / Metas / Nota do coach). The current expanded-week detail (both `coach/cliente.html`'s Histórico tab and `portal/historico.html`) shows check-in/orientação/metas but not the coach's note. This plan does **not** add it — out of scope for the tasks above, but worth a one-line fix if the user wants it next: display `w.coachReview.note` in the expanded `.wc-body` when present, gated the same way orientation already is.

**Type consistency check:** `Trackly.whatsappUrl(phone, message)` takes the same two-argument shape at all three call sites (Task 2). `client.age`/`client.heightCm` are read identically (same `(heightCm/100).toFixed(2).replace(".", ",")` formatting) in both places they're displayed (Task 3) — no divergent formatting between the profile and Avaliação.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-12-v9-elegant-wellness-app.md`. Continuing with **inline execution** in this session (same rationale as V6-V8), committing after each task with browser verification as specified.
