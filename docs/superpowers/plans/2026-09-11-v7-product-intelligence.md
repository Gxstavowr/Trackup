# V7 — Product Intelligence + Premium App Implementation Plan

> **For agentic workers:** Static HTML/CSS/JS prototype, no build step, no test framework. "Tests" here mean **browser verification** via the Claude Browser tool, the same method used for V1–V6. Execute inline in this session (see "Execution Handoff").

**Goal:** Turn the accumulated per-client weekly history into simple, rule-based "product intelligence" for the coach (patterns, trends, a compact "memory" block) — and close the remaining gaps that keep a few screens from reading as a finished premium app — without touching the data model, localStorage schema, or adding features beyond what the brief asks.

**Architecture:** Almost all of V7's UI scaffolding (tabs, hero-stats, list-rows, comparison slider, minimal charts, big-counter dashboard) already exists from V6 — confirmed by re-reading every V6-touched file. V7's real net-new work is two things: (1) a small set of **pure, rule-based derivation functions** added to `assets/js/data.js` — `buildCoachMemory(client)`, `detectPatterns(client)`, `trendLine(client)` — that only read existing `client.weeks` data and never fabricate a metric that isn't tracked; and (2) surfacing their output in a few precise, minimal spots (Visão Geral, Evolução, Revisar), plus a check-in step reorder and two simulated-notification buttons. No new screens, no new nav items, no new persisted fields.

**Tech Stack:** Vanilla HTML/CSS/JS, same as V1–V6. Cache-busting bumps to `?v=7`.

## Global Constraints

- Never invent a pattern/trend without enough data — hard gate: **< 3 submitted weeks → show nothing** pattern-related; **3–5 weeks → simple two-window comparisons only**; **6+ weeks → consistency stats** (streaks, hit-rate); **8+ weeks → also compute the longitudinal weight-range/stability stat**. These thresholds live in one place (`buildCoachMemory`) so every caller inherits them automatically.
- Never state causality. Every generated sentence follows the brief's §25 pattern: "X caiu enquanto Y ficou abaixo da meta" / "X melhorou nas últimas N semanas" — never "porque".
- Never show a metric the client doesn't track (`Trackly.isTracked` gates every new block exactly like it gates existing ones).
- No new fabricated composite score ("saúde geral: 82%", "evolução corporal: +17%") — only the same real metrics (weight/adherence/workouts/etc.) already in the data model.
- No gamification (no badges/points/confetti/ranking) — milestones computed internally may inform copy, but never render as an achievement widget.
- No real WhatsApp/API integration — the two notification buttons are simulated (local UI state change only), clearly a stand-in for future work.
- Preserve `WeeklyCycle`/localStorage/invite flow/individualized tracking+goals exactly as V6 left them; only additive changes to `data.js`'s public `Trackly` object (no renamed/removed exports).
- Bump `?v=6` → `?v=7` on every shared script tag, site-wide, in the same commit as any JS/CSS change (browser cache bug documented in `ARCHITECTURE.md`).

---

## File Structure

**Modify:**
- `prototype/assets/js/data.js` — add `buildCoachMemory`, `detectPatterns` (used internally by `buildCoachMemory`), `trendLine`; reorder `CHECKIN_TEMPLATE` step numbers and `CHECKIN_STEPS` labels so Peso+Fotos is step 1; export the three new functions.
- `prototype/coach/cliente.html` — Visão Geral gets a "Memória do acompanhamento" block + "O que está funcionando / Merece atenção" block (both from `buildCoachMemory`); Evolução gets the one-line trend sentence near the weight hero.
- `prototype/portal/evolucao.html` — same one-line trend sentence near the weight hero.
- `prototype/coach/revisar.html` — "O que mudou" becomes compact before→after metric rows (matching the brief's literal example) instead of prose bullets; add "Enviar também pelo WhatsApp" simulated toggle next to "Enviar orientação".
- `prototype/portal/checkin.html` — reorder `stepPanels` content so Peso+Fotos renders as step 1 (content unchanged, only position); add "Avisar coach" / "Avisar no WhatsApp" simulated buttons on the post-submit confirmation screen.
- Every HTML file — cache-bust `?v=6` → `?v=7`.

**Create:** none.

---

### Task 1: Data layer — coach memory, pattern detection, trend line

**Files:**
- Modify: `prototype/assets/js/data.js`

**Interfaces:**
- Produces: `Trackly.buildCoachMemory(client) -> { weeksTracked, weightDelta, adherenceAvg, weeksWithinGoal, totalScoredWeeks, strengths: string[], attentionPoints: string[], milestoneNote: string|null }` (returns `null` if `weeksTracked < 3`).
- Produces: `Trackly.trendLine(client) -> string|null` (returns `null` if fewer than 3 submitted weeks; otherwise one cautious sentence).
- Consumes: `client.weeks`, `isTracked`, `trackedGoals`, `avg`, `round1`, `isGoodWeightDelta` (all already defined above in the same closure — no new helpers needed for those).

- [ ] **Step 1: Write `buildCoachMemory`**

Add this function right after `buildPeriodSummary` in `data.js` (it deliberately reuses the same submitted-weeks filtering convention as that function):

```js
  // ---------------- V7 — memória do acompanhamento: DADO -> HISTÓRICO -> PADRÃO -> CONTEXTO ----------------
  // Regra de dados mínimos (brief V7 §42): <3 semanas = nada; 3-5 = comparação simples;
  // 6+ = consistência; 8+ = também a faixa de estabilidade do peso. Tudo em um só lugar
  // pra que qualquer tela que chame isto herde a mesma régua.
  function buildCoachMemory(client) {
    var weeks = client.weeks.filter(function (w) { return w.metrics.adherence != null; });
    if (weeks.length < 3) return null;

    var first = weeks[0].metrics, last = weeks[weeks.length - 1].metrics;
    var weightDelta = isTracked(client, "weight") ? round1(last.weight - first.weight) : null;
    var adherenceAvg = isTracked(client, "adherence") ? Math.round(avg(weeks.map(function (w) { return w.metrics.adherence; }))) : null;

    var scorable = weeks.filter(function (w) { return trackedGoals(w, client).filter(function (g) { return g.key !== "adherence"; }).length > 0; });
    var weeksWithinGoal = scorable.filter(function (w) {
      return trackedGoals(w, client).filter(function (g) { return g.key !== "adherence"; }).every(function (g) { return g.status === "success"; });
    }).length;

    var strengths = [], attentionPoints = [];

    // treino: taxa de acerto nas últimas 6 (ou todas, se houver menos) — só com 6+ semanas de dado
    if (weeks.length >= 6 && isTracked(client, "workouts")) {
      var last6 = weeks.slice(-6);
      var hits = last6.filter(function (w) {
        var g = trackedGoals(w, client).filter(function (x) { return x.key === "workouts"; })[0];
        return g && g.status === "success";
      }).length;
      if (hits >= last6.length - 1 && hits >= 4) strengths.push("Meta de treino atingida em " + hits + " das últimas " + last6.length + " semanas.");
    }

    // aderência consistentemente alta — só com 6+ semanas
    if (weeks.length >= 6 && isTracked(client, "adherence")) {
      var last6a = weeks.slice(-6);
      var highCount = last6a.filter(function (w) { return w.metrics.adherence >= 90; }).length;
      if (highCount >= 4) strengths.push("Aderência acima de 90% em " + highCount + " das últimas " + last6a.length + " semanas.");
    }

    // sono abaixo da meta nas últimas 2 — funciona a partir de 3 semanas
    if (isTracked(client, "sleep")) {
      var last2 = weeks.slice(-2);
      if (last2.length === 2 && last2.every(function (w) { return w.metrics.sleep < w.metrics.sleepGoal; })) {
        attentionPoints.push("Sono abaixo da meta nas últimas 2 semanas.");
      }
    }

    // aderência caindo nas últimas semanas vs. o resto do período — a partir de 3 semanas
    if (weeks.length >= 3 && isTracked(client, "adherence")) {
      var half = Math.floor(weeks.length / 2) || 1;
      var recentAvg = avg(weeks.slice(-half).map(function (w) { return w.metrics.adherence; }));
      var priorAvg = avg(weeks.slice(0, weeks.length - half).map(function (w) { return w.metrics.adherence; }));
      if (priorAvg != null && recentAvg != null && (priorAvg - recentAvg) >= 8) {
        attentionPoints.push("Aderência caiu nas últimas semanas em relação ao início do período.");
      }
    }

    // faixa de estabilidade do peso — só com 8+ semanas (brief §42: "preparar memória longitudinal")
    var milestoneNote = null;
    if (weeks.length >= 8 && isTracked(client, "weight")) {
      var last8 = weeks.slice(-8).map(function (w) { return w.metrics.weight; });
      var range = round1(Math.max.apply(null, last8) - Math.min.apply(null, last8));
      if (range <= 0.6) milestoneNote = "Peso permaneceu dentro de uma faixa de " + range + "kg nas últimas 8 semanas.";
    }
    if (!milestoneNote && isTracked(client, "weight") && weightDelta != null) {
      var allWeights = client.weeks.map(function (w) { return w.metrics.weight; });
      var isLowest = last.weight === Math.min.apply(null, allWeights) && isGoodWeightDelta(client, -1);
      if (isLowest && weeks.length >= 4) milestoneNote = "Novo menor peso do acompanhamento.";
    }

    return {
      weeksTracked: weeks.length,
      weightDelta: weightDelta,
      adherenceAvg: adherenceAvg,
      weeksWithinGoal: weeksWithinGoal,
      totalScoredWeeks: scorable.length,
      strengths: strengths,
      attentionPoints: attentionPoints,
      milestoneNote: milestoneNote
    };
  }
```

- [ ] **Step 2: Write `trendLine`**

Add directly after `buildCoachMemory`:

```js
  // frase única de tendência (brief V7 §24) — nunca um bloco de análise, só uma linha cautelosa
  function trendLine(client) {
    var weeks = client.weeks.filter(function (w) { return w.metrics.adherence != null; });
    if (weeks.length < 3) return null;
    var n = Math.min(weeks.length, 8);
    var recent = weeks.slice(-n);
    var first = recent[0].metrics, last = recent[recent.length - 1].metrics;

    if (isTracked(client, "weight")) {
      var wd = round1(last.weight - first.weight);
      if (Math.abs(wd) >= 0.5) {
        var verb = wd < 0 ? "caiu" : "subiu";
        return "Peso " + verb + " " + Math.abs(wd) + "kg nas últimas " + n + " semanas.";
      }
    }
    if (isTracked(client, "adherence")) {
      var ad = last.adherence - first.adherence;
      if (Math.abs(ad) >= 6) {
        return ad > 0
          ? "Aderência subiu de " + first.adherence + "% para " + last.adherence + "% nas últimas " + n + " semanas."
          : "Aderência caiu de " + first.adherence + "% para " + last.adherence + "% nas últimas " + n + " semanas.";
      }
    }
    return "Indicadores estáveis nas últimas " + n + " semanas.";
  }
```

- [ ] **Step 3: Reorder check-in steps — Peso e fotos first**

In `CHECKIN_TEMPLATE`, change every `step:` value: items currently `step: 1` (dieta, refeicaoLivre, beliscos) → `step: 2`; `step: 2` (treinos, performanceTreino, cardio, cardioDetalhe) → `step: 3`; `step: 3` (periodoMenstrual, agua, sono, digestao, emocional, substancias, exame) → `step: 4`; `step: 4` (peso, fotos) → `step: 1`. Concretely, replace the whole array with:

```js
  var CHECKIN_TEMPLATE = [
    { key: "peso", label: "Peso atual", type: "number", step: 1, active: true, required: true, tracks: "weight" },
    { key: "fotos", label: "Fotos de evolução", type: "photos", step: 1, active: true, required: false, tracks: "photos" },
    { key: "dieta", label: "Como foi a dieta?", type: "scale+text", step: 2, active: true, required: true, tracks: "adherence" },
    { key: "refeicaoLivre", label: "Fez a refeição livre? Se sim, qual dia e o que comeu?", type: "text", step: 2, active: true, required: false, tracks: "adherence" },
    { key: "beliscos", label: "Houve beliscos de comida fora do plano?", type: "text", step: 2, active: true, required: false, tracks: "adherence" },
    { key: "treinos", label: "Treinos realizados", type: "stepper", step: 3, active: true, required: true, tracks: "workouts" },
    { key: "performanceTreino", label: "Como foi sua performance nos treinos?", type: "text", step: 3, active: true, required: false, tracks: "workouts" },
    { key: "cardio", label: "Sessões de cardio", type: "stepper", step: 3, active: true, required: true, tracks: "cardio" },
    { key: "cardioDetalhe", label: "Como foi o cardio? Tempo, dias e tipo.", type: "text", step: 3, active: true, required: false, tracks: "cardio" },
    { key: "periodoMenstrual", label: "Está no período menstrual?", type: "yesno", step: 4, active: true, required: false, genderOnly: "f" },
    { key: "agua", label: "Quantos litros de água você tomou por dia, em média?", type: "number", step: 4, active: true, required: true, tracks: "water" },
    { key: "sono", label: "Como foi seu sono?", type: "number+text", step: 4, active: true, required: true, tracks: "sleep" },
    { key: "digestao", label: "Como foi sua digestão? Idas ao banheiro e estufamento.", type: "text", step: 4, active: true, required: false, tracks: "digestion" },
    { key: "emocional", label: "Como está seu emocional?", type: "text", step: 4, active: true, required: false, tracks: "emotional" },
    { key: "substancias", label: "Uso de substâncias/medicamentos, quando aplicável.", type: "text", step: 4, active: true, required: false },
    { key: "exame", label: "Último exame enviado, quando aplicável.", type: "text", step: 4, active: false, required: false }
  ];
  var CHECKIN_STEPS = [
    { n: 1, label: "Peso e fotos" },
    { n: 2, label: "Alimentação" },
    { n: 3, label: "Treino" },
    { n: 4, label: "Bem-estar" }
  ];
```

- [ ] **Step 4: Export the new functions**

In the `global.Trackly = { ... }` object at the end of the file, add after `buildPeriodSummary: buildPeriodSummary,`:

```js
    buildPeriodSummary: buildPeriodSummary, buildCoachMemory: buildCoachMemory, trendLine: trendLine,
```

(Remove the old standalone `buildPeriodSummary: buildPeriodSummary,` line so it isn't duplicated.)

- [ ] **Step 5: Verify in browser (console-only check, no UI depends on this yet)**

Open any page, then in the Browser tool run via `javascript_tool`:

```js
JSON.stringify(Trackly.buildCoachMemory(Trackly.getClient("joao")))
JSON.stringify(Trackly.trendLine(Trackly.getClient("joao")))
JSON.stringify(Trackly.buildCoachMemory(Trackly.getClient("pedro"))) // pedro has 6 weeks, some pending — confirm it still returns a sane object or null, never throws
```
Expected: no exceptions; `joao` (16 weeks) returns a populated object with at least one strength or attention point; `pedro` (6 weeks, 1 pending) returns based on however many are actually submitted.

- [ ] **Step 6: Commit**

```bash
git add prototype/assets/js/data.js
git commit -m "$(cat <<'EOF'
V7: coach-memory and trend-line derivation functions

Adds buildCoachMemory (strengths/attention points/weight-range milestone,
gated by weeks of real data: <3 nothing, 3-5 simple comparison, 6+
consistency, 8+ stability check) and trendLine (one cautious sentence,
never causal). Both are pure reads over client.weeks — no fabricated
metrics, no new persisted fields. Also reorders CHECKIN_TEMPLATE/STEPS
so Peso e fotos is step 1 (brief V7 section 33-35).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Visão Geral — "Memória do acompanhamento" + "O que está funcionando"

**Files:**
- Modify: `prototype/coach/cliente.html` (`renderResumo` only)

**Interfaces:**
- Consumes: `Trackly.buildCoachMemory(client)` from Task 1.

- [ ] **Step 1: Append the memory + patterns blocks to `renderResumo`**

After the existing weight-chart block in `renderResumo`'s returned HTML string (the one built in V6), append (still inside the same `document.getElementById("tab-resumo").innerHTML = ... +` chain):

```js
      (function () {
        var mem = Trackly.buildCoachMemory(client);
        if (!mem) return "";
        var rows = [];
        if (mem.weightDelta != null) rows.push('<div class="hero-stat sm"><div class="value">' + (mem.weightDelta > 0 ? "+" : "") + mem.weightDelta + '<span class="unit">kg</span></div><div class="label">peso no período</div></div>');
        if (mem.adherenceAvg != null) rows.push('<div class="hero-stat sm"><div class="value">' + mem.adherenceAvg + '<span class="unit">%</span></div><div class="label">aderência média</div></div>');
        if (mem.totalScoredWeeks > 0) rows.push('<div class="hero-stat sm"><div class="value">' + mem.weeksWithinGoal + '<span class="unit">/' + mem.totalScoredWeeks + '</span></div><div class="label">semanas na meta</div></div>');

        var obs = "";
        if (mem.strengths.length || mem.attentionPoints.length) {
          obs = '<div style="margin-top:24px;">' +
            (mem.strengths.length ? '<div class="section-label" style="color:var(--brand);">O que está funcionando</div><div class="insight-list" style="margin-bottom:16px;">' + mem.strengths.map(function (s) { return '<div class="row"><span class="dot" style="background:var(--brand);"></span>' + s + '</div>'; }).join("") + '</div>' : "") +
            (mem.attentionPoints.length ? '<div class="section-label" style="color:var(--gold);">Merece atenção</div><div class="insight-list">' + mem.attentionPoints.map(function (s) { return '<div class="row"><span class="dot" style="background:var(--gold);"></span>' + s + '</div>'; }).join("") + '</div>' : "") +
          '</div>';
        }
        var milestone = mem.milestoneNote ? '<p style="font-size:12.5px;color:var(--ink-faint);margin:14px 0 0;">' + mem.milestoneNote + '</p>' : "";

        return (
          '<div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--line);">' +
            '<div class="section-label">' + mem.weeksTracked + ' semanas de acompanhamento</div>' +
            '<div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:4px;">' + rows.join("") + '</div>' +
            milestone + obs +
          '</div>'
        );
      })()
```

Note: this is a self-invoking function appended to the string-concatenation chain — make sure the preceding line in the existing `renderResumo` ends with `+` before this block, and that this block's own return value is a string (already guaranteed — every branch returns a string, including `""`).

- [ ] **Step 2: Verify in browser**

Open `coach/cliente.html?id=joao` (16 weeks — should show weight-in-period, adherence avg, weeks-within-goal, at least one strength/attention line). Open `coach/cliente.html?id=pedro` (6 weeks, one pending — confirm the block still renders sanely or is appropriately sparse, never throws). Confirm no metric appears for a client who doesn't track it (test `?id=ana`, who doesn't track sleep — "Sono abaixo da meta" must never appear for her).

- [ ] **Step 3: Commit**

```bash
git add prototype/coach/cliente.html
git commit -m "$(cat <<'EOF'
V7: Visao Geral — Memoria do acompanhamento + O que esta funcionando

Surfaces buildCoachMemory as a compact block at the bottom of the
client's Visao Geral tab: period weight/adherence/goal-hit summary,
plus up to a few rule-based strength/attention observations. Nothing
renders below 3 weeks of data; gating is entirely inherited from
buildCoachMemory.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Evolução — one-line trend summary (coach + portal)

**Files:**
- Modify: `prototype/coach/cliente.html` (`renderEvolucao` only)
- Modify: `prototype/portal/evolucao.html` (`render` only)

**Interfaces:**
- Consumes: `Trackly.trendLine(client)` from Task 1.

- [ ] **Step 1: Add the trend line under the weight hero-stat in `coach/cliente.html`'s `renderEvolucao`**

Right after the weight hero-stat markup (the `<div class="hero-stat">...</div>` built in V6, before the `Charts.lineChart(...)` call), insert:

```js
        (function () { var t = Trackly.trendLine(client); return t ? '<p style="font-size:13px;color:var(--ink-muted);margin:0 0 16px;">' + t + '</p>' : ""; })() +
```

- [ ] **Step 2: Same insertion in `portal/evolucao.html`'s weight-hero block**

Right after `document.getElementById("weight-hero").innerHTML = ...` finishes building its string (after the closing `'</div>'` for `.hero-stat`), append a sibling line into the same container or a new one directly below it. Concretely, change the `weight-hero` assignment to also include the trend line inside the same div:

```js
    document.getElementById("weight-hero").innerHTML =
      '<div class="hero-stat"><div class="value">' + lastW.metrics.weight + '<span class="unit">kg</span></div>' +
      (prevW ? '<div class="delta" style="color:' + (Trackly.isGoodWeightDelta(client, wkDelta) ? "var(--brand)" : "var(--coral)") + ';">' + (wkDelta <= 0 ? "↓" : "↑") + ' ' + Math.abs(wkDelta) + 'kg esta semana</div>' : '') +
      '</div>' +
      (function () { var t = Trackly.trendLine(client); return t ? '<p style="font-size:13px;color:var(--ink-muted);margin:8px 0 0;">' + t + '</p>' : ""; })();
```

- [ ] **Step 3: Verify in browser**

Open `coach/cliente.html?id=joao` → Evolução tab, and `portal/evolucao.html?client=joao` — confirm a sentence like "Peso caiu Xkg nas últimas N semanas." appears directly under the weight hero-stat in both. Confirm it does **not** appear for a client with fewer than 3 submitted weeks (there are none in the current fixture set below 3, so this is a logic-level guarantee from Task 1, not separately re-tested here beyond confirming no console error on every client).

- [ ] **Step 4: Commit**

```bash
git add prototype/coach/cliente.html prototype/portal/evolucao.html
git commit -m "$(cat <<'EOF'
V7: one-line trend summary under the weight hero (coach + portal)

Adds Trackly.trendLine() output directly under the weight hero-stat in
both Evolucao views — a single cautious sentence, never a causal claim,
gated at 3+ submitted weeks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Revisar — "O que mudou" as compact before→after rows

**Files:**
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes: existing `cur`/`prevSubmitted` (already computed in V6's revisar.html for the weight-delta hero-stat) — reused, not recomputed.

- [ ] **Step 1: Replace the prose-based "O que mudou" block with metric before→after rows**

Currently this section renders `insights.map(...)` (sentences from `checkInInsights`). Replace it with a structured comparison against `prevSubmitted` (already computed in V6 Task 8), matching the brief's literal example (`Peso 83,0 → 82,4 kg ↓0,6`, `Aderência 87% → 92% ↑5 pts`, `Sono 7h → 6h30 ↓`):

```js
  var whatChangedRows = (function () {
    if (!prevSubmitted) return [];
    var rows = [];
    if (Trackly.isTracked(client, "weight")) {
      var wd2 = Trackly.round1(cur.metrics.weight - prevSubmitted.metrics.weight);
      if (Math.abs(wd2) >= 0.1) rows.push({ label: "Peso", from: prevSubmitted.metrics.weight + "kg", to: cur.metrics.weight + "kg", arrow: wd2 < 0 ? "↓" : "↑", good: Trackly.isGoodWeightDelta(client, wd2) });
    }
    if (Trackly.isTracked(client, "adherence")) {
      var adDelta = cur.metrics.adherence - prevSubmitted.metrics.adherence;
      if (Math.abs(adDelta) >= 2) rows.push({ label: "Aderência", from: prevSubmitted.metrics.adherence + "%", to: cur.metrics.adherence + "%", arrow: adDelta > 0 ? "↑" : "↓", good: adDelta > 0, extra: Math.abs(adDelta) + " pts" });
    }
    if (Trackly.isTracked(client, "sleep")) {
      var slDelta = Trackly.round1(cur.metrics.sleep - prevSubmitted.metrics.sleep);
      if (Math.abs(slDelta) >= 0.4) rows.push({ label: "Sono", from: prevSubmitted.metrics.sleep + "h", to: cur.metrics.sleep + "h", arrow: slDelta < 0 ? "↓" : "↑", good: slDelta >= 0 });
    }
    return rows;
  })();
```

Add this block right after `weightDeltaForHero` is computed (same spot `prevSubmitted` already exists from V6). Then replace the `(insights.length ? ... : "")` section in the big `review-body` template with:

```js
    (whatChangedRows.length ? (
    '<div style="margin-bottom:26px;">' +
      '<p class="section-label">O que mudou</p>' +
      '<div class="stack" style="gap:10px;">' + whatChangedRows.map(function (r) {
        return '<div style="display:flex;align-items:baseline;justify-content:space-between;font-size:13.5px;"><span style="color:var(--ink-muted);">' + r.label + '</span><span>' + r.from + ' → ' + r.to + ' <strong style="color:' + (r.good ? "var(--brand)" : "var(--coral)") + ';">' + r.arrow + (r.extra ? " " + r.extra : "") + '</strong></span></div>';
      }).join("") + '</div>' +
    '</div>'
    ) : "")
```

Keep `insights` (from `checkInInsights`) computed but unused-here is fine only if nothing else references it — check: `insights` was only used in this one block in V6. If nothing else in the file reads `insights`, remove its declaration entirely (it becomes dead code otherwise); if `focusLabel`/`suggestedFocus` internally depend on `checkInInsights` via `data.js` (they call it internally, not via this file's `insights` variable), removing the file-local `var insights = ...` line is safe.

- [ ] **Step 2: Verify in browser**

Open `coach/revisar.html?id=joao`. Confirm "O que mudou" now shows metric rows like "Peso 83.3kg → 82.3kg ↓" instead of prose bullets, colored green/coral by whether the change is favorable. Confirm a client whose current-vs-previous change is negligible on all fronts shows an empty (absent) section rather than a stale placeholder. Re-run the send-orientation flow once more to confirm nothing else broke.

- [ ] **Step 3: Commit**

```bash
git add prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V7: revisar.html "O que mudou" as before->after metric rows

Replaces the prose-insight bullets with compact peso/aderencia/sono
before->after rows (brief V7 section 14's literal example), colored by
whether the change is favorable for this client's goal direction.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Check-in step reorder (portal) + simulated notifications

**Files:**
- Modify: `prototype/portal/checkin.html`

**Interfaces:**
- Consumes: `Trackly.CHECKIN_STEPS` (now reordered by Task 1) — this file already renders steps generically by iterating `steps.map(...)`, so the **only** required change is moving the step-1..4 HTML content in `stepPanels` to match the new numbering; no loop logic changes.

- [ ] **Step 1: Reassign `stepPanels` content to the new step numbers**

The current `stepPanels` object has keys `1` (Alimentação), `2` (Treino), `3` (Bem-estar), `4` (Peso e fotos). Renumber so the **same HTML content** moves to: `1` = old `4`'s content (peso + fotos), `2` = old `1`'s content (dieta/refeição livre/beliscos), `3` = old `2`'s content (treinos/cardio), `4` = old `3`'s content (período/água/sono/digestão/emocional/substâncias/exame). This is a pure key-relabeling of the existing object — no HTML string changes, only which number each block is filed under.

- [ ] **Step 2: Add simulated notification buttons to the post-submit confirmation screen**

In the `submit()` function, extend the confirmation markup:

```js
  function submit() {
    document.getElementById("ci-form").style.display = "none";
    var el = document.getElementById("ci-confirm");
    el.style.display = "block";
    el.innerHTML =
      '<div class="confirm-wrap"><div class="ring">' + ICONS.check + '</div>' +
      '<h2>Check-in enviado!</h2>' +
      '<p>Seu coach vai revisar suas respostas e enviar a orientação da próxima semana em breve.</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;max-width:260px;margin:0 auto 20px;">' +
        '<button class="btn btn-secondary" id="notify-coach">Avisar coach</button>' +
        '<button class="btn btn-ghost" id="notify-whatsapp">Avisar no WhatsApp</button>' +
      '</div>' +
      '<a href="dashboard.html?client=' + client.id + '" class="btn btn-primary">Voltar ao início</a></div>';

    function simulateNotify(btnId, sentLabel) {
      var btn = document.getElementById(btnId);
      btn.addEventListener("click", function () {
        btn.textContent = "✓ " + sentLabel;
        btn.disabled = true;
      });
    }
    simulateNotify("notify-coach", "Coach avisada");
    simulateNotify("notify-whatsapp", "Enviado no WhatsApp");
  }
```

This is a pure local UI simulation (no network call, no new persisted field) — matches brief §37–38's "não precisa implementar API real, apenas simular."

- [ ] **Step 3: Verify in browser**

Open `portal/checkin.html?client=pedro&simDate=2026-09-18` (open window, pending client). Confirm step 1 is now "Peso e fotos" (shows peso input + upload slots), step 2 "Alimentação" (dieta scale + textareas), step 3 "Treino", step 4 "Bem-estar" — step count label reads "1 de 4" through "4 de 4" in the new order. Complete all 4 steps and submit; on the confirmation screen, click "Avisar coach" and confirm it flips to "✓ Coach avisada" and disables; click "Avisar no WhatsApp" and confirm the same pattern independently. Clear the test-induced localStorage entry afterward (`localStorage.removeItem("trackly_v4_state")`) so the demo stays clean.

- [ ] **Step 4: Commit**

```bash
git add prototype/portal/checkin.html
git commit -m "$(cat <<'EOF'
V7: check-in Peso e fotos as step 1 + simulated notify buttons

Relabels stepPanels so Peso e fotos leads the wizard (brief V7 section
33-35 — the real workflow order). Adds "Avisar coach" / "Avisar no
WhatsApp" on the post-submit screen as local UI simulations only (no
API, no new persisted state) per section 37-38.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Coach-side simulated WhatsApp notify on orientation send

**Files:**
- Modify: `prototype/coach/revisar.html`

**Interfaces:**
- Consumes: existing `send-orientation` click handler and its confirmation screen (V6).

- [ ] **Step 1: Add the "Enviar também pelo WhatsApp" toggle to the confirmation screen**

In the `send-orientation` click handler, extend the confirmation markup (append inside the `.confirm-wrap` div, before the closing tag):

```js
    el.innerHTML =
      '<div class="confirm-wrap"><div class="ring">' + ICONS.check + '</div>' +
      '<h2>Orientação enviada</h2>' +
      '<p>' + client.name.split(" ")[0] + ' vai ver o foco da semana e sua mensagem assim que abrir o app. ✓ Atualizado hoje às ' + Trackly.fmtTime(new Date()) + '.</p>' +
      '<button class="btn btn-ghost" id="notify-whatsapp-coach" style="margin-bottom:16px;">Enviar também pelo WhatsApp</button>' +
      '<br><a href="dashboard.html" class="btn btn-primary">Voltar ao dashboard</a></div>';
    document.getElementById("notify-whatsapp-coach").addEventListener("click", function () {
      this.textContent = "✓ Enviado no WhatsApp";
      this.disabled = true;
    });
```

- [ ] **Step 2: Verify in browser**

Open `coach/revisar.html?id=joao`, send an orientation, confirm the success screen now shows "Enviar também pelo WhatsApp" and clicking it flips to "✓ Enviado no WhatsApp" and disables, without affecting the "Voltar ao dashboard" link. Clear test-induced localStorage afterward.

- [ ] **Step 3: Commit**

```bash
git add prototype/coach/revisar.html
git commit -m "$(cat <<'EOF'
V7: simulated "Enviar tambem pelo WhatsApp" on orientation-sent screen

Local UI simulation only, per brief V7 section 39 — no automation, no
new persisted state.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final review — cache-bust, consistency, persistence, full regression

**Files:** all HTML files (version bump only); no other pre-determined files — this task is verification plus targeted fixes.

- [ ] **Step 1: Bump cache-busting version site-wide**

```bash
cd prototype && grep -rl '?v=6' --include="*.html" . | xargs sed -i 's/?v=6/?v=7/g'
```

- [ ] **Step 2: Re-run `dataviz` mental check on the two new pieces of text-as-data (memory block, trend line)**

Confirm: no color is the sole carrier of meaning (the strength/attention dot always sits next to a full sentence, not a bare colored dot); the memory block's three `hero-stat sm` numbers don't duplicate the same three numbers already visible in the tab's own hero-stats immediately above (compare against Task 2's placement — the period numbers are explicitly labeled "peso no período" / "aderência média" / "semanas na meta", distinct from the current-week numbers at the very top of the page, so no duplication of meaning even though values can be numerically close).

- [ ] **Step 3: `web-design-guidelines` pass on the new interactive elements**

Check the two new "simulate notify" buttons (Task 5/6): they're real `<button>` elements (not divs), so keyboard/focus behavior is native — no fix needed. Confirm `aria-disabled`/`disabled` state after click reads correctly to a screen reader (native `disabled` attribute already communicates this).

- [ ] **Step 4: Full-flow regression (webapp-testing / Browser tool)**

1. **Coach review → orientation → WhatsApp-simulate → dashboard reflects it.**
2. **Student check-in (new step order) → submit → notify-coach/notify-whatsapp simulate → dashboard shows "Para revisar".**
3. **Reload persistence:** after step 1, hard-reload `coach/dashboard.html` and confirm the client still shows completed (state survived via localStorage).
4. **Cross-client tracking gating spot-check:** open Visão Geral for `ana` (no sleep/cardio/water tracking) and confirm the memory block never mentions sono/cardio/água; open `pedro` (6 weeks, one pending) and confirm nothing throws and the memory block reflects only submitted weeks.
5. Clear any test-induced localStorage state at the end (`localStorage.removeItem("trackly_v4_state")`) so the repo's demo starts clean for the user.

- [ ] **Step 5: Update `ARCHITECTURE.md` with a V7 section**

Append a "V7" section documenting: `buildCoachMemory`/`trendLine` and their data-minimum gating rule, the check-in step reorder, and the two simulated-notification buttons (explicitly noting they are UI-only stand-ins for a future real integration).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
V7: final review pass — cache-bust v7, regression checks, docs

Confirms the three core flows (review, check-in submit with new step
order, invite) plus tracking-gating on reduced-tracking clients and
reload persistence. Documents the V7 additions in ARCHITECTURE.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:** §1-2 (product vision/10x) → realized entirely through Task 1's data functions, not a new screen. §3-5, §50-55 (minimalism/app-feel/nav/design system) → already satisfied by V6; this plan only adds, never re-adds cards. §6-9 (dashboard) → already done in V6, unchanged here. §10-11 (profile) → Task 2. §12-13 (memory/patterns) → Tasks 1-2. §14-15 (o que mudou / últimas semanas) → Task 4 (últimas semanas table already existed from V6, untouched). §16-19 (fotos/histórico) → already done in V6, unchanged. §20-24 (charts/trend) → Task 3 (chart engine itself untouched, already V6). §25 (no causality) → enforced in every new sentence in Tasks 1/3/4. §26-27 (individual metrics/goals) → unchanged, verified in Task 7 step 4. §28-32 (check-in window) → already done in V6, unchanged. §33-35 (check-in order) → Task 1 Step 3 + Task 5. §36 (home aluno) → already done in V6, unchanged. §37-39 (notifications) → Tasks 5-6. §40-43 (coachMemory/patterns/min-data/milestones) → Task 1 (`buildCoachMemory` return shape matches §40's structure conceptually: `strengths`≈strengths, `attentionPoints`≈attentionPoints, `milestoneNote`≈one `milestones` entry surfaced, `consistency`≈weeksWithinGoal/totalScoredWeeks — no separate `patterns` array since strengths/attentionPoints already are the patterns). §44-45 (no gamification/no generic AI) → enforced by Global Constraints, verified nothing chatbot-like was added. §46 (10x concept) → this is the plan's rationale for Tasks 1-4, not a separate task. §47 (weekly workflow) → unchanged, already correct. §48-49 (persistence/consistency) → Task 7 Step 4. §56-65 (test scenarios) → covered by Task 7 Step 4's regression list plus the per-task verification steps. §66 (implement directly) → every task edits real files. §67-68 (final review + delivery format) → Task 7 + the end-of-session summary this plan's execution will produce.

**Gaps flagged, not silently dropped:** the brief's `coachMemory` shape (§40) names a `patterns: []` array separate from `strengths`/`attentionPoints`; this plan intentionally collapses those into the two rule-based lists rather than adding a third empty-in-practice array, since every "pattern" this version can honestly detect is already one of those two categories — a bare `patterns: []` that's always empty would be dead structure. This is a deliberate simplification, worth mentioning in the delivery summary, not an oversight.

**Type consistency check:** `buildCoachMemory`'s return keys (`weeksTracked`, `weightDelta`, `adherenceAvg`, `weeksWithinGoal`, `totalScoredWeeks`, `strengths`, `attentionPoints`, `milestoneNote`) are used identically in Task 2's consuming code — no renamed field between definition and use.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-11-v7-product-intelligence.md`. Continuing with **inline execution** in this session (same rationale as V6: one continuous agent keeps the whole derivation-logic + copy-tone consistent across the touched files better than fragmenting across fresh subagents), committing after each task with browser verification as specified.
