/* Trackly — dados de demonstração.
   Simula exatamente as tabelas do schema real (ver ARCHITECTURE.md):
   Client -> semanas -> { checkin, qa, metrics, goals, orientation }.
   Cada semana é o ciclo completo: check-in do cliente -> análise do coach -> orientação -> metas -> resultado.
   Mutações do usuário (orientação enviada, metas da próxima semana, lembretes, alunos criados)
   são persistidas via TracklyStore (localStorage) e reaplicadas por cima dos dados fictícios
   toda vez que o app carrega — ver applyStoredOverrides() no fim deste arquivo.
   Tudo fictício. Nenhuma dessas pessoas existe. */
(function (global) {
  "use strict";

  var ANCHOR = new Date(2026, 8, 7); // segunda-feira de referência (fecha/abre as semanas do histórico fictício)

  // ---------------- janela do check-in semanal (V5) ----------------
  // APP_DATE é "hoje" só pra decidir se o check-in do ALUNO está aberto — um conceito
  // separado do ANCHOR acima (que só organiza os limites das semanas do dado fictício).
  // Só existe aqui: nenhuma outra página guarda data — todas chamam getCheckinWindowStatus().
  // Suporta ?simDate=YYYY-MM-DD na URL só pra testar os 3 estados sem editar código.
  var APP_DATE = (function () {
    try {
      var q = new URLSearchParams(location.search).get("simDate");
      if (q) { var p = q.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
    } catch (e) {}
    return new Date(2026, 8, 11); // sexta-feira — check-in aberto por padrão na demo
  })();
  // quinta = lembrete · sexta/sábado/domingo = aberto · segunda a quarta = fechado
  function getCheckinWindowStatus() {
    var day = APP_DATE.getDay(); // 0=dom .. 6=sáb
    if (day === 4) return "reminder";
    if (day === 5 || day === 6 || day === 0) return "open";
    return "closed";
  }
  function nextOpenDate() {
    var d = new Date(APP_DATE);
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    if (d.getTime() === APP_DATE.getTime()) d.setDate(d.getDate() + 7);
    return d;
  }

  function addDays(date, n) { var d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function round1(n) { return Math.round(n * 10) / 10; }
  function fmtDate(d) { return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  function fmtShort(d) { return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
  function fmtTime(d) { return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }

  function weekWindow(n, i, anchor) {
    var end = addDays(anchor, -7 * (n - i));
    var start = addDays(end, -6);
    return { start: start, end: end };
  }

  // avalia resultado de uma meta: 'success' | 'partial' | 'fail'
  function goalStatus(actual, target, mode) {
    if (mode === "min") { // quanto maior melhor (água, sono, treinos, cardio, aderência)
      if (actual >= target) return "success";
      if (actual >= target * 0.75) return "partial";
      return "fail";
    }
    return "success";
  }

  function buildWeeks(cfg) {
    var n = cfg.weeks;
    var out = [];
    for (var i = 1; i <= n; i++) {
      var t = (i - 1) / Math.max(1, n - 1);
      var w = weekWindow(n, i, cfg.anchor || ANCHOR);
      var adherence = clamp(Math.round(cfg.adherence(i, t)), 40, 100);
      var lateOverride = (cfg.lateWeeks || []).indexOf(i) !== -1;
      var pendingOverride = (cfg.pendingWeeks || []).indexOf(i) !== -1;

      var weight = round1(cfg.weightStart + (cfg.weightEnd - cfg.weightStart) * t + (cfg.weightWobble ? cfg.weightWobble(i) : 0));
      var waist = cfg.waistStart != null ? Math.round(cfg.waistStart + (cfg.waistEnd - cfg.waistStart) * t) : null;
      var bodyFat = cfg.bfStart != null ? round1(cfg.bfStart + (cfg.bfEnd - cfg.bfStart) * t) : null;

      var workoutsGoal = cfg.workoutsGoal || 5;
      var cardioGoal = cfg.cardioGoal || 3;
      var waterGoal = cfg.waterGoal || 3;
      var sleepGoal = cfg.sleepGoal || 7.5;

      var perf = adherence / 100;
      var workouts = clamp(Math.round(workoutsGoal * clamp(perf + 0.05, 0, 1.15)), 0, workoutsGoal + 1);
      var cardio = clamp(Math.round(cardioGoal * clamp(perf - 0.02, 0, 1.2)), 0, cardioGoal + 1);
      var water = round1(clamp(waterGoal * clamp(0.8 + perf * 0.25, 0.5, 1.15), 1, 4));
      var sleep = round1(clamp(sleepGoal + (perf - 0.9) * 2.2 + (cfg.sleepWobble ? cfg.sleepWobble(i) : 0), 5, 9));
      var energy = clamp(Math.round(2 + perf * 3), 1, 5);
      var hunger = clamp(Math.round(4 - perf * 2.4), 1, 5);

      var status = pendingOverride ? "pending" : (lateOverride ? "late" : "submitted");
      var submittedAt = status === "submitted" ? addDays(w.end, -1) : null;

      var goals = [
        { key: "water", icon: "drop", label: "Água", unit: "L/dia", target: waterGoal, actual: water, mode: "min" },
        { key: "sleep", icon: "moon", label: "Sono", unit: "h", target: sleepGoal, actual: sleep, mode: "min" },
        { key: "workouts", icon: "dumbbell", label: "Treinos", unit: "sessões", target: workoutsGoal, actual: workouts, mode: "min" },
        { key: "cardio", icon: "run", label: "Cardio", unit: "sessões", target: cardioGoal, actual: cardio, mode: "min" },
        { key: "adherence", icon: "plate", label: "Aderência", unit: "%", target: cfg.adherenceGoal || 90, actual: adherence, mode: "min" }
      ];
      goals.forEach(function (g) { g.status = status === "submitted" ? goalStatus(g.actual, g.target, g.mode) : "pending"; });

      out.push({
        weekNumber: i,
        start: w.start, end: w.end,
        checkin: { status: status, submittedAt: submittedAt },
        metrics: { weight: weight, waist: waist, bodyFat: bodyFat, adherence: status === "submitted" ? adherence : null, workouts: workouts, workoutsGoal: workoutsGoal, cardio: cardio, cardioGoal: cardioGoal, water: water, waterGoal: waterGoal, sleep: sleep, sleepGoal: sleepGoal, energy: energy, hunger: hunger },
        goals: goals,
        orientation: (cfg.orientations || {})[i] || null,
        note: (cfg.notes || {})[i] || null
      });
    }
    return out;
  }

  function sinWobble(amp, period, phase) { return function (i) { return amp * Math.sin((i / period) * 2 * Math.PI + (phase || 0)); }; }

  // ---------------- respostas qualitativas do check-in ----------------
  // Gera as respostas em texto livre que o aluno "escreveu" naquela semana, a partir do
  // desempenho já calculado (determinístico — sem Math.random — pra manter o protótipo estável).
  var QA_BANK = {
    dieta: {
      great: ["Consegui seguir o plano à risca a semana inteira.", "Tranquilo, já virou rotina — sem vontade de fugir do combinado.", "Muito bem, nenhuma dificuldade real."],
      good: ["Fui bem na maior parte da semana, só escorreguei um pouco no fim de semana.", "Boa semana, um ou dois deslizes pequenos."],
      ok: ["Semana mediana — tive dificuldade em alguns dias no meio da semana.", "Consegui seguir uns 70% do combinado, não mais que isso."],
      poor: ["Semana difícil, fugi do plano várias vezes.", "Não consegui me organizar direito essa semana, a rotina bagunçou tudo."]
    },
    refeicaoLivre: [
      "Sim, no sábado à noite — pizza com os amigos.", "Sim, no domingo no almoço de família.",
      "Não tive refeição livre essa semana.", "Sim, na sexta à noite, um hambúrguer.", "Não, preferi manter tudo certinho essa semana."
    ],
    beliscos: {
      great: ["Não, me mantive dentro do combinado o tempo todo.", "Nenhum belisco fora de hora essa semana."],
      good: ["Um docinho à tarde em um ou dois dias, nada grave.", "Beliscos pequenos, mas controlei bem."],
      ok: ["Sim, belisquei doce à tarde algumas vezes.", "Tive vontade de beliscar mais que o normal nessa semana."],
      poor: ["Sim, beliscando bastante fora de hora, principalmente à noite.", "Perdi o controle dos beliscos em vários dias."]
    },
    performanceTreino: {
      great: ["Treinos fortes, consegui progredir carga em quase tudo.", "Ótima semana de treino, me senti forte e disposto(a)."],
      good: ["Treinos bons, só um dia mais fraco por cansaço.", "Consegui manter o ritmo, com uma leve queda no fim da semana."],
      ok: ["Treinos ok, mas senti falta de energia em alguns dias.", "Performance mediana, tive que reduzir carga em um ou dois treinos."],
      poor: ["Semana mais fraca, sem muita energia pros treinos.", "Difícil manter a intensidade essa semana."]
    },
    periodoMenstrual: ["Não.", "Não.", "Não.", "Sim, nos primeiros dias da semana — senti mais inchaço e menos disposição.", "Não."],
    digestao: [
      "Tudo normal, sem estufamento.", "Um pouco de estufamento depois das refeições maiores.",
      "Intestino um pouco preso essa semana.", "Normal, sem queixas.", "Leve desconforto em alguns dias, nada grave."
    ],
    emocional: {
      great: ["Semana leve, me senti bem disposto(a) o tempo todo.", "Ótimo humor essa semana, tudo tranquilo."],
      good: ["Semana cheia mas consegui equilibrar bem.", "Bom, com um dia ou outro mais estressante."],
      ok: ["Semana mais puxada emocionalmente, ansiedade um pouco mais alta.", "Cansaço mental no meio da semana."],
      poor: ["Semana difícil emocionalmente, estresse alto na maior parte dos dias.", "Ansiedade alta, afetou até o sono."]
    },
    substancias: ["Nenhum.", "Nenhum.", "Nenhum.", "Uso contínuo de vitamina D e ômega 3, sem alterações.", "Nenhum."]
  };

  function tierOf(adherence) { return adherence >= 90 ? "great" : adherence >= 78 ? "good" : adherence >= 65 ? "ok" : "poor"; }

  function attachQA(client) {
    client.weeks.forEach(function (w, idx) {
      if (w.checkin.status !== "submitted") return;
      var tier = tierOf(w.metrics.adherence);
      var qa = {
        dieta: pick(QA_BANK.dieta[tier], idx),
        refeicaoLivre: pick(QA_BANK.refeicaoLivre, idx + w.weekNumber),
        beliscos: pick(QA_BANK.beliscos[tier], idx + 1),
        cardioDetalhe: w.metrics.cardio + " sessão(ões) de " + (client.objective === "Hipertrofia" ? "bike leve" : "esteira/corrida") + ", cerca de 30min cada, intercaladas com os treinos.",
        performanceTreino: pick(QA_BANK.performanceTreino[tier], idx),
        agua: w.metrics.water + "L por dia, em média — " + (w.metrics.water >= w.metrics.waterGoal ? "consegui manter a garrafinha por perto." : "ainda esquecendo em alguns dias."),
        sono: w.metrics.sleep >= w.metrics.sleepGoal ? "Dormi bem, entre 7 e 8h na maioria das noites." : (w.metrics.sleep >= w.metrics.sleepGoal - 1 ? "Sono um pouco irregular, algumas noites mais curtas." : "Dormi mal essa semana, poucas horas em várias noites."),
        digestao: pick(QA_BANK.digestao, idx + w.weekNumber),
        emocional: pick(QA_BANK.emocional[tier], idx + 2),
        substancias: pick(QA_BANK.substancias, idx),
        exame: (w.weekNumber === 1) ? "Exame de sangue enviado no início do acompanhamento." : ((w.weekNumber % 12 === 0) ? "Novo exame de rotina enviado essa semana." : null)
      };
      if (client.gender === "f") qa.periodoMenstrual = pick(QA_BANK.periodoMenstrual, idx);
      w.qa = qa;
    });
  }

  // preenche orientação (texto do coach) pras semanas que não têm uma escrita à mão,
  // sem mexer nas semanas passadas em skipWeeks (usadas pra simular "aguardando revisão do coach")
  var ORIENTATION_BANK = {
    great: ["Excelente semana — manter tudo exatamente como está.", "Muito bom! Seguimos com o mesmo plano, sem mudanças.", "Semana sólida, sem necessidade de ajustes por agora."],
    good: ["Boa semana. Vamos manter o plano, só reforçando a atenção nos fins de semana.", "Indo bem — mantenha o ritmo, sem grandes mudanças."],
    ok: ["Semana intermediária. Vamos simplificar as refeições e reforçar a consistência dos treinos.", "Notei um pouco de oscilação — foco em manter a rotina essa semana."],
    poor: ["Semana mais difícil. Vamos voltar ao básico: hidratação, sono e presença nos treinos.", "Sem cobrança extra essa semana — o foco é retomar consistência aos poucos."]
  };
  function suggestOrientation(client) {
    var cur = currentWeek(client);
    var bank = ORIENTATION_BANK[tierOf(cur.metrics.adherence || 70)];
    return pick(bank, cur.weekNumber + 1);
  }

  // quando há um sinal específico e acionável (sono/água), a orientação auto-gerada responde
  // a ele — assim o foco da semana (derivado do mesmo sinal) nunca contradiz a mensagem do coach.
  var ORIENTATION_SPECIFIC = {
    sono: ["Reparei que o sono ficou abaixo do ideal — vamos priorizar isso essa semana, tente manter ao menos {sleepGoal}h por noite.", "Foco desta semana: sono. Tente antecipar o horário de dormir pra garantir {sleepGoal}h+ por noite."],
    agua: ["A hidratação ficou um pouco abaixo da meta — vamos reforçar isso essa semana.", "Foco em beber mais água essa semana, principalmente nos dias de treino."]
  };
  function autoFillOrientations(client, skipWeeks) {
    skipWeeks = skipWeeks || [];
    client.weeks.forEach(function (w) {
      if (w.orientation || w.checkin.status !== "submitted") return;
      if (skipWeeks.indexOf(w.weekNumber) !== -1) return;
      var insightText = checkInInsights(client, w.weekNumber).join(" ");
      if (client.tracking.sleep && /sono caiu significativamente|sono ficou abaixo/i.test(insightText)) {
        w.orientation = pick(ORIENTATION_SPECIFIC.sono, w.weekNumber).replace("{sleepGoal}", w.metrics.sleepGoal);
      } else if (client.tracking.water && /água abaixo/i.test(insightText)) {
        w.orientation = pick(ORIENTATION_SPECIFIC.agua, w.weekNumber);
      } else {
        w.orientation = pick(ORIENTATION_BANK[tierOf(w.metrics.adherence)], w.weekNumber);
      }
    });
  }

  // ---------------- clientes fictícios ----------------
  // Metas e métricas acompanhadas são individuais por aluno (ver seções 19-22 do brief V4) —
  // nunca um número universal. `tracking` decide o que aparece pra aquele aluno em toda a
  // interface (check-in, revisão, perfil, evolução, home do aluno).

  var joaoWeeks = buildWeeks({
    weeks: 16,
    weightStart: 87.2, weightEnd: 82.4, weightWobble: sinWobble(0.25, 3.3, 0.4),
    waistStart: 94, waistEnd: 87,
    workoutsGoal: 4, cardioGoal: 3, waterGoal: 3, sleepGoal: 7, adherenceGoal: 90,
    adherence: function (i) { return 88 + 6 * Math.sin(i / 2.4) + (i > 10 ? 2 : 0); },
    sleepWobble: sinWobble(0.3, 4, 1),
    orientations: {
      1: "Foco em consistência: 4 treinos, hidratação em dia.",
      4: "Boa resposta — manter estratégia atual.",
      9: "Reduzir carboidratos à noite nos dias sem treino.",
      13: "Introduzir 1 sessão extra de cardio de baixa intensidade."
    },
    notes: { 6: "Semana de viagem a trabalho, mantive treinos em hotel." }
  });

  var mariaWeeks = buildWeeks({
    weeks: 10,
    weightStart: 74.5, weightEnd: 71.4, weightWobble: sinWobble(0.2, 3, 0),
    waistStart: 82, waistEnd: 78,
    workoutsGoal: 5, cardioGoal: 2, waterGoal: 2.5, sleepGoal: 8, adherenceGoal: 85,
    adherence: function (i) { return i <= 7 ? 90 - i : 68 - (i - 7) * 2; },
    orientations: {
      1: "Início do acompanhamento — priorizar montar rotina de treino.",
      5: "Ótima evolução, seguir com o plano.",
      8: "Notei queda na aderência — vamos simplificar as refeições de fim de semana.",
      9: "Ajustar meta de água, está sendo difícil bater 2,5L — reduzir para 2,2L temporariamente."
    },
    notes: { 8: "Fim de semana difícil, tive um evento social e fugi do planejado.", 9: "Trabalho mais puxado essa semana, dormi mal." }
  });
  mariaWeeks[8].checkin.status = "submitted"; // semana 9 (index 8) ainda enviada, mas com números ruins

  var pedroWeeks = buildWeeks({
    weeks: 6,
    weightStart: 68.0, weightEnd: 70.6, weightWobble: sinWobble(0.15, 2, 0),
    waistStart: null, waistEnd: null,
    bfStart: null, bfEnd: null,
    workoutsGoal: 6, cardioGoal: 3, waterGoal: 3, sleepGoal: 8, adherenceGoal: 90,
    adherence: function (i) { return 82 + 4 * Math.sin(i / 2); },
    pendingWeeks: [6],
    anchor: addDays(ANCHOR, -2), // simula que o check-in desta semana já está 2 dias atrasado
    orientations: {
      1: "Superávit calórico moderado + treino de força 6x/semana.",
      3: "Progressão de carga consistente — manter dieta.",
      5: "Aumentar levemente a ingestão calórica, ganho de peso desacelerou."
    }
  });

  var anaWeeks = buildWeeks({
    weeks: 20,
    weightStart: 63.4, weightEnd: 61.7, weightWobble: sinWobble(0.2, 4, 0.6),
    waistStart: 71, waistEnd: 66,
    bfStart: 27.5, bfEnd: 21.2,
    workoutsGoal: 3, cardioGoal: 4, waterGoal: 3, sleepGoal: 8, adherenceGoal: 92,
    adherence: function (i) { return 90 + 5 * Math.sin(i / 3) + (i > 14 ? 1.5 : 0); },
    orientations: {
      1: "Objetivo: melhora de condicionamento e recomposição corporal.",
      6: "Excelente consistência — introduzir treino intervalado 1x/semana.",
      12: "Meio do programa: recomposição visível. Seguir estratégia.",
      18: "Últimas semanas do ciclo — manter tudo, sem mudanças.",
      20: "Ciclo de 20 semanas com resultado sólido — vamos manter o plano e reavaliar objetivos daqui a um mês."
    }
  });

  var TRACKING_DEFAULT = { weight: true, adherence: true, workouts: true, cardio: true, water: true, sleep: true, digestion: true, emotional: true, measurements: true, photos: true };
  function tracking(overrides) { return Object.assign({}, TRACKING_DEFAULT, overrides || {}); }

  // V5 — configurações de tracking bem distintas entre si (ver seção 53 do brief V5),
  // pra provar de forma óbvia que nada na interface assume um padrão universal.
  var CLIENTS = [
    {
      id: "joao", name: "João Silva", initials: "JS", colorVar: "--c1", gender: "m",
      objective: "Emagrecimento", startDate: joaoWeeks[0].start, weeks: joaoWeeks,
      clientStatus: "active", tracking: tracking() // treino + cardio + água + sono (+ tudo)
    },
    {
      id: "maria", name: "Maria Oliveira", initials: "MO", colorVar: "--c2", gender: "f",
      objective: "Emagrecimento", startDate: mariaWeeks[0].start, weeks: mariaWeeks,
      clientStatus: "active", tracking: tracking({ cardio: false, digestion: false, emotional: false, measurements: false }) // treino + água + sono
    },
    {
      id: "pedro", name: "Pedro Santos", initials: "PS", colorVar: "--c3", gender: "m",
      objective: "Hipertrofia", startDate: pedroWeeks[0].start, weeks: pedroWeeks,
      clientStatus: "active", tracking: tracking({ water: false, sleep: false, digestion: false, emotional: false, measurements: false }) // treino + cardio
    },
    {
      id: "ana", name: "Ana Costa", initials: "AC", colorVar: "--c4", gender: "f",
      objective: "Condicionamento físico", startDate: anaWeeks[0].start, weeks: anaWeeks,
      clientStatus: "active", tracking: tracking({ cardio: false, water: false, sleep: false, digestion: false, emotional: false, measurements: false }) // treino + aderência + fotos
    }
  ];

  CLIENTS.forEach(function (c) { attachQA(c); });
  autoFillOrientations(CLIENTS[0], [16]); // João: semana atual aguardando revisão do coach
  autoFillOrientations(CLIENTS[1], [10]); // Maria: semana atual aguardando revisão do coach
  autoFillOrientations(CLIENTS[2], []);   // Pedro: semana atual está pendente (nem chegou pro coach)
  autoFillOrientations(CLIENTS[3], []);   // Ana: tudo revisado, inclusive a semana atual

  var COACH = { name: "Renata Prado", role: "Coach de nutrição e treino", initials: "RP" };
  var COLOR_CYCLE = ["--c1", "--c2", "--c3", "--c4"];

  // ---------------- helpers derivados ----------------

  function getClient(id) { return CLIENTS.filter(function (c) { return c.id === id; })[0] || CLIENTS[0]; }

  function currentWeek(client) { return client.weeks.length ? client.weeks[client.weeks.length - 1] : null; }

  function isTracked(client, key) { return !!(client.tracking && client.tracking[key] !== false); }

  // metas do aluno filtradas pelo que ele realmente acompanha (nunca um número universal)
  function trackedGoals(week, client) {
    return week.goals.filter(function (g) { return g.key === "adherence" ? isTracked(client, "adherence") : isTracked(client, g.key); });
  }

  // true quando o check-in mais recente já chegou pro coach mas ainda não recebeu orientação
  function needsReview(client) {
    var cur = currentWeek(client);
    return !!cur && cur.checkin.status === "submitted" && !cur.orientation;
  }

  function isLate(client) {
    var cur = currentWeek(client);
    return !cur || cur.checkin.status !== "submitted";
  }

  function relativeLabel(date) {
    if (!date) return "—";
    var days = Math.round((ANCHOR - date) / 86400000);
    if (days <= 0) return "hoje";
    if (days === 1) return "ontem";
    return fmtShort(date);
  }

  // estado operacional da semana atual do aluno — nomes internos (awaiting_checkin /
  // checkin_received / completed) só existem aqui; a interface usa linguagem humana.
  function clientStage(client) {
    if (client.inviteStatus && client.inviteStatus !== "active") return client.inviteStatus; // 'pending' | 'invited'
    if (isLate(client)) return "awaiting_checkin";
    if (needsReview(client)) return "checkin_received";
    return "completed";
  }

  function computeStatus(client) {
    if (!client.weeks.length) {
      return client.inviteStatus === "invited"
        ? { code: "invite", label: "Convite enviado", reason: "Aguardando " + client.name.split(" ")[0] + " aceitar o convite." }
        : { code: "invite", label: "Convite pendente", reason: "Envie o convite pra " + client.name.split(" ")[0] + " começar o acompanhamento." };
    }
    var cur = currentWeek(client);
    if (isLate(client)) {
      return { code: "late", label: "Check-in atrasado", reason: "Check-in da semana " + cur.weekNumber + " ainda não foi enviado (previsto para " + fmtShort(cur.end) + ")." };
    }
    if (needsReview(client)) {
      return { code: "review", label: "Aguardando revisão", reason: "Check-in da semana " + cur.weekNumber + " recebido " + relativeLabel(cur.checkin.submittedAt) + " — ainda sem orientação enviada." };
    }
    var recent = client.weeks.slice(-4).filter(function (w) { return w.metrics.adherence != null; });
    if (recent.length >= 2) {
      var last = recent[recent.length - 1].metrics.adherence;
      var prevAvg = avg(recent.slice(0, -1).map(function (w) { return w.metrics.adherence; }));
      var missedGoals = last ? trackedGoals(recent[recent.length - 1], client).filter(function (g) { return g.status === "fail"; }).length : 0;
      var weightStall = client.weeks.slice(-3).every(function (w, idx, arr) { return idx === 0 || Math.abs(w.metrics.weight - arr[idx - 1].metrics.weight) < 0.15; });
      if ((prevAvg - last) >= 15 || missedGoals >= 2) {
        return { code: "warn", label: "Precisa de atenção", reason: missedGoals >= 2 ? "2 ou mais metas não foram batidas no último check-in." : "Aderência caiu " + Math.round(prevAvg - last) + " pontos vs. a média das últimas semanas." };
      }
      if (weightStall && client.objective === "Emagrecimento" && client.weeks.length >= 4) {
        return { code: "warn", label: "Precisa de atenção", reason: "Peso estável há 3 semanas apesar do objetivo de emagrecimento." };
      }
    }
    return { code: "ok", label: "Em dia", reason: "Sem pendências — check-ins em dia e metas sendo cumpridas." };
  }

  // objetivo de "hipertrofia" = ganhar peso é o progresso; os demais, perder/manter é o progresso
  function weightGoalDirection(client) { return client.objective === "Hipertrofia" ? "up" : "down"; }
  function isGoodWeightDelta(client, delta) { return weightGoalDirection(client) === "up" ? delta >= 0 : delta <= 0; }

  function avg(arr) { arr = arr.filter(function (v) { return v != null; }); if (!arr.length) return null; return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; }

  function computeKPIs(client) {
    var w = client.weeks;
    var first = w[0].metrics, curW = currentWeek(client), last = curW.metrics;
    var submitted = w.filter(function (x) { return x.metrics.adherence != null; });
    var adherenceAvg = Math.round(avg(submitted.map(function (x) { return x.metrics.adherence; })));
    var workoutsTotal = submitted.reduce(function (s, x) { return s + x.metrics.workouts; }, 0);
    var workoutsGoalTotal = submitted.reduce(function (s, x) { return s + x.metrics.workoutsGoal; }, 0);
    return {
      weightStart: first.weight, weightNow: last.weight, weightDelta: round1(last.weight - first.weight),
      waistStart: first.waist, waistNow: last.waist, waistDelta: first.waist != null ? (last.waist - first.waist) : null,
      bfStart: first.bodyFat, bfNow: last.bodyFat, bfDelta: first.bodyFat != null ? round1(last.bodyFat - first.bodyFat) : null,
      adherenceAvg: adherenceAvg,
      workoutsTotal: workoutsTotal, workoutsGoalTotal: workoutsGoalTotal, workoutsPct: Math.round(100 * workoutsTotal / workoutsGoalTotal),
      sleepAvg: round1(avg(submitted.map(function (x) { return x.metrics.sleep; }))),
      weeksElapsed: w.length
    };
  }

  function weeksInRange(client, range) {
    var w = client.weeks;
    if (range === "all") return w;
    var n = parseInt(range, 10);
    return w.slice(Math.max(0, w.length - n));
  }

  // "Resumo do período" — tendências em linguagem cautelosa, sem causalidade
  function buildPeriodSummary(client, range) {
    range = range || "8";
    var weeks = weeksInRange(client, range).filter(function (w) { return w.metrics.adherence != null; });
    if (weeks.length < 4) return null;

    var first = weeks[0].metrics, last = weeks[weeks.length - 1].metrics;
    var weightDelta = round1(last.weight - first.weight);
    var waistDelta = first.waist != null ? (last.waist - first.waist) : null;
    var adherenceAvg = Math.round(avg(weeks.map(function (w) { return w.metrics.adherence; })));
    var workoutsTotal = weeks.reduce(function (s, w) { return s + w.metrics.workouts; }, 0);
    var workoutsGoalTotal = weeks.reduce(function (s, w) { return s + w.metrics.workoutsGoal; }, 0);
    var sleepAvg = round1(avg(weeks.map(function (w) { return w.metrics.sleep; })));

    var half = Math.floor(weeks.length / 2);
    var adherenceRecent = avg(weeks.slice(half).map(function (w) { return w.metrics.adherence; }));
    var adherencePrior = avg(weeks.slice(0, half).map(function (w) { return w.metrics.adherence; }));
    var weightMidVal = (weeks[half] || weeks[0]).metrics.weight;
    var weightEarlyDelta = round1(weightMidVal - weeks[0].metrics.weight);
    var weightLateDelta = round1(last.weight - weightMidVal);

    var adherenceTrendUp = (adherenceRecent - adherencePrior) >= 4;
    var adherenceTrendDown = (adherenceRecent - adherencePrior) <= -4;
    var weightStalledEarly = Math.abs(weightEarlyDelta) < 0.4;
    var weightMovingLate = isGoodWeightDelta(client, weightLateDelta) && Math.abs(weightLateDelta) >= 0.4;

    var narrative;
    if (adherenceTrendUp && weightMovingLate && weightStalledEarly) {
      narrative = "A aderência melhorou nas últimas semanas, e o peso voltou a se mover na direção esperada depois de um período mais estável.";
    } else if (adherenceTrendUp && weightMovingLate) {
      narrative = "A aderência vem melhorando, associada a uma evolução mais consistente do peso nas últimas semanas.";
    } else if (adherenceTrendDown && !weightMovingLate) {
      narrative = "A aderência caiu nas últimas semanas — vale observar se isso está relacionado à estabilização do peso no mesmo período.";
    } else if (weightStalledEarly && weightMovingLate) {
      narrative = "O peso ficou estável por um tempo e voltou a se mover na direção esperada nas semanas mais recentes.";
    } else if (adherenceTrendUp) {
      narrative = "A aderência melhorou nas últimas semanas em relação ao início do período.";
    } else if (adherenceTrendDown) {
      narrative = "A aderência recuou um pouco nas últimas semanas em relação ao início do período.";
    } else {
      narrative = "Os indicadores se mantiveram relativamente estáveis ao longo do período, sem mudanças bruscas de tendência.";
    }

    return {
      weeksCount: weeks.length, weightDelta: weightDelta, waistDelta: waistDelta, adherenceAvg: adherenceAvg,
      workoutsTotal: workoutsTotal, workoutsGoalTotal: workoutsGoalTotal, sleepAvg: sleepAvg, narrative: narrative
    };
  }

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

  function daysSince(date) { return Math.round((ANCHOR - date) / 86400000); }

  // ---------------- "o que mudou" — regras simples de observação (sem IA, sem causalidade) ----------------
  function checkInInsights(client, uptoWeekNumber) {
    var weeks = client.weeks.filter(function (w) { return w.metrics.adherence != null && (uptoWeekNumber == null || w.weekNumber <= uptoWeekNumber); });
    var idx = weeks.length - 1;
    if (idx < 0) return [];
    var cur = weeks[idx];
    var prev = idx > 0 ? weeks[idx - 1] : null;
    var recentWindow = weeks.slice(Math.max(0, idx - 3), idx); // até 3 semanas antes da atual
    var out = [];

    var last4 = weeks.slice(Math.max(0, idx - 3), idx + 1);
    var weightStable = last4.length >= 4 && last4.every(function (w, i, arr) { return i === 0 || Math.abs(w.metrics.weight - arr[i - 1].metrics.weight) < 0.3; });
    if (weightStable) {
      out.push("Peso estável nas últimas " + last4.length + " semanas.");
    } else if (prev) {
      var wd = round1(cur.metrics.weight - prev.metrics.weight);
      if (Math.abs(wd) >= 0.2) out.push((wd < 0 ? "Peso caiu " : "Peso subiu ") + Math.abs(wd) + "kg em relação à semana anterior.");
    }

    if (prev) {
      var ad = cur.metrics.adherence - prev.metrics.adherence;
      if (ad >= 5) out.push("Aderência melhorou em relação à semana anterior.");
      else if (ad <= -10) out.push("Aderência abaixo das últimas semanas.");
      else if (ad <= -5) out.push("Aderência caiu em relação à semana anterior.");
    }

    if (isTracked(client, "sleep") && recentWindow.length) {
      var sleepAvgRecent = avg(recentWindow.map(function (w) { return w.metrics.sleep; }));
      if (sleepAvgRecent && cur.metrics.sleep <= sleepAvgRecent * 0.85) out.push("Sono caiu significativamente em relação à média recente.");
      else if (cur.metrics.sleep < cur.metrics.sleepGoal) out.push("Sono ficou abaixo da média recente.");
    }

    if (isTracked(client, "water") && cur.metrics.water < cur.metrics.waterGoal) out.push("Consumo de água abaixo da meta definida.");

    if (last4.length >= 3) {
      var last3 = last4.slice(-3);
      var allHit = last3.every(function (w) { return trackedGoals(w, client).filter(function (g) { return g.key !== "adherence"; }).every(function (g) { return g.status === "success"; }); });
      if (allHit) out.push("Meta consistente nas últimas 3 semanas.");
    }

    return out.slice(0, 4);
  }

  // ---------------- "últimas semanas" — contexto compacto pra revisão (V5) ----------------
  // últimas N semanas com check-in enviado, incluindo a atual, só com as métricas que o
  // aluno realmente acompanha — pra montar a mini-tabela de tendência na tela de revisão.
  function recentWeeksTable(client, n) {
    n = n || 3;
    var weeks = client.weeks.filter(function (w) { return w.metrics.adherence != null; }).slice(-n);
    var cols = [
      { key: "weight", label: "Peso", fmt: function (w) { return w.metrics.weight + "kg"; } },
      { key: "adherence", label: "Aderência", fmt: function (w) { return w.metrics.adherence + "%"; } },
      { key: "workouts", label: "Treinos", fmt: function (w) { return w.metrics.workouts + "/" + w.metrics.workoutsGoal; } },
      { key: "cardio", label: "Cardio", fmt: function (w) { return w.metrics.cardio + "/" + w.metrics.cardioGoal; } },
      { key: "water", label: "Água", fmt: function (w) { return w.metrics.water + "L"; } },
      { key: "sleep", label: "Sono", fmt: function (w) { return w.metrics.sleep + "h"; } }
    ].filter(function (c) { return isTracked(client, c.key); });
    return { weeks: weeks, cols: cols };
  }

  // frase curta de foco a partir dos insights da semana — usada na revisão (sugestão pro coach)
  // e na home do aluno (pra explicar o que já foi combinado). Prioriza um insight específico e
  // acionável (sono/água/aderência); na ausência de um, cai pro mesmo "tier" que gera a
  // orientação automática, pra nunca contradizer o tom da mensagem do coach.
  var FOCUS_BANK = { great: "Manter o que está funcionando", good: "Manter a consistência", ok: "Reforçar a rotina", poor: "Retomar consistência aos poucos" };
  function focusLabel(client, uptoWeekNumber) {
    var text = checkInInsights(client, uptoWeekNumber).join(" ");
    if (/sono caiu significativamente|sono ficou abaixo/i.test(text)) return "Melhorar consistência do sono";
    if (/água abaixo/i.test(text)) return "Aumentar a hidratação";
    if (/aderência (abaixo|caiu)/i.test(text)) return "Recuperar consistência na alimentação";
    var week = client.weeks.filter(function (w) { return w.metrics.adherence != null && (uptoWeekNumber == null || w.weekNumber <= uptoWeekNumber); }).pop();
    return week ? FOCUS_BANK[tierOf(week.metrics.adherence)] : "Manter consistência";
  }

  // deriva o título de foco a partir do texto da orientação já escrita (hoje pode ser autor
  // humano ou auto-gerada) — usado sempre que existe uma orientação em vigor, pra garantir que
  // o título nunca contradiga a mensagem do coach mostrada logo abaixo dele.
  function focusLabelFromOrientation(client, week) {
    if (week && week.focusOverride) return week.focusOverride; // o coach escreveu um foco explícito — sempre prevalece
    var text = week && week.orientation;
    if (!text) return focusLabel(client, week ? week.weekNumber : null);
    if (/sono/i.test(text)) return "Melhorar consistência do sono";
    if (/água|hidrata/i.test(text)) return "Aumentar a hidratação";
    if (/cardio/i.test(text)) return "Aumentar o cardio";
    if (/carboidrat|refeiç|beliscos|alimenta|dieta|calóri|ingestão|superávit/i.test(text)) return "Ajustar a alimentação";
    if (/treino|carga|força/i.test(text)) return "Evoluir nos treinos";
    if (/manter|excelente|sólid|consistência|resultado sólido/i.test(text)) return "Manter o que está funcionando";
    return focusLabel(client, week.weekNumber);
  }

  // frase curta e pessoal pra abrir a home do aluno — sempre no mesmo tom do foco/orientação da semana
  var INTRO_BANK = {
    great: "Você está indo muito bem — vamos manter o ritmo.",
    good: "Você está indo bem. Vamos manter o foco e ajustar pequenos detalhes.",
    ok: "Essa semana pede um pouco mais de consistência — vamos ajustar juntos.",
    poor: "Semana mais difícil, tudo bem. Vamos simplificar e retomar aos poucos."
  };
  function focusIntro(client, uptoWeekNumber) {
    var week = client.weeks.filter(function (w) { return w.metrics.adherence != null && (uptoWeekNumber == null || w.weekNumber <= uptoWeekNumber); }).pop();
    return week ? INTRO_BANK[tierOf(week.metrics.adherence)] : "Vamos começar sua jornada.";
  }

  // ---------------- atualização do aluno (dashboard do coach) ----------------
  function studentUpdate(client) {
    var cur = currentWeek(client);
    if (!cur || cur.checkin.status !== "submitted") {
      var d = cur ? daysSince(cur.end) : 0;
      return { late: true, label: d <= 0 ? "Check-in previsto para hoje" : "Sem check-in há " + d + " dia" + (d === 1 ? "" : "s") };
    }
    var weeks = client.weeks.filter(function (w) { return w.metrics.adherence != null; });
    var idx = weeks.length - 1, prev = idx > 0 ? weeks[idx - 1] : null;
    var weightDelta = prev ? round1(cur.metrics.weight - prev.metrics.weight) : null;
    var adherenceTrend = prev ? (cur.metrics.adherence - prev.metrics.adherence >= 3 ? "up" : (cur.metrics.adherence - prev.metrics.adherence <= -3 ? "down" : "flat")) : "flat";
    var sleepTrend = (prev && isTracked(client, "sleep")) ? (cur.metrics.sleep - prev.metrics.sleep <= -0.8 ? "down" : (cur.metrics.sleep - prev.metrics.sleep >= 0.8 ? "up" : "flat")) : "flat";
    return {
      late: false, reviewed: !!cur.orientation,
      label: (needsReview(client) ? "Check-in recebido " : "Concluído ") + relativeLabel(cur.orientationSentAt || cur.checkin.submittedAt),
      completedAtLabel: cur.orientationSentAt ? ("Orientação enviada " + relativeLabel(cur.orientationSentAt) + (cur.orientationSentTime ? (" às " + cur.orientationSentTime) : "")) : null,
      weightDelta: weightDelta, weightGood: weightDelta != null ? isGoodWeightDelta(client, weightDelta) : true,
      adherenceNow: cur.metrics.adherence, adherenceTrend: adherenceTrend, sleepTrend: sleepTrend
    };
  }

  // ---------------- resumo da carteira (dashboard do coach) ----------------
  // "completed" = já concluiu o ciclo desta semana (orientação enviada); todo o resto (aguardando
  // check-in ou check-in recebido mas ainda sem orientação) conta como "pendente" — é a mesma
  // distinção binária que o coach realmente usa pra saber "quanto falta pra terminar minha rodada".
  function buildWeeklySnapshot() {
    var active = CLIENTS.filter(function (c) { return c.weeks.length > 0; });
    var received = 0, review = 0, completed = 0, late = 0;
    var improvedAdherence = 0, droppedAdherence = 0, droppedSleep = 0, metGoals = 0;
    active.forEach(function (c) {
      var cur = currentWeek(c);
      if (cur.checkin.status !== "submitted") { late++; return; }
      received++;
      if (cur.orientation) completed++; else review++;

      var weeks = c.weeks.filter(function (w) { return w.metrics.adherence != null; });
      var idx = weeks.length - 1, prev = idx > 0 ? weeks[idx - 1] : null;
      if (prev) {
        var ad = cur.metrics.adherence - prev.metrics.adherence;
        if (ad >= 0) improvedAdherence++; else droppedAdherence++;
        if (isTracked(c, "sleep") && cur.metrics.sleep - prev.metrics.sleep <= -0.8) droppedSleep++;
      } else {
        improvedAdherence++;
      }
      if (trackedGoals(cur, c).filter(function (g) { return g.key !== "adherence"; }).every(function (g) { return g.status === "success"; })) metGoals++;
    });
    return {
      total: active.length, received: received, review: review, completed: completed, late: late, pending: active.length - completed,
      improvedAdherence: improvedAdherence, droppedAdherence: droppedAdherence, droppedSleep: droppedSleep, metGoals: metGoals
    };
  }

  // ---------------- template do check-in (estrutura pronta pra futura configuração por coach) ----------------
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
  // perguntas do template que fazem sentido pra este aluno — filtra por `tracks` (quando a
  // pergunta pertence a uma métrica) e por gênero (periodoMenstrual).
  function checkinTemplateFor(client) {
    return CHECKIN_TEMPLATE.filter(function (q) {
      if (!q.active) return false;
      if (q.genderOnly && q.genderOnly !== client.gender) return false;
      if (q.tracks && !isTracked(client, q.tracks)) return false;
      return true;
    });
  }

  // ================================================================
  // Ações do usuário: persistem via TracklyStore e mutam o estado em memória na hora,
  // pra tela reagir sem precisar de reload — e sobreviver ao reload quando ele acontecer.
  // ================================================================

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

  function sendReminder(clientId) {
    var now = new Date();
    var client = getClient(clientId);
    client.remindedAt = now; client.remindedTime = fmtTime(now);
    if (global.TracklyStore) TracklyStore.patchClient(clientId, { remindedAt: now.toISOString(), remindedTime: client.remindedTime });
  }

  function slugify(name) {
    var base = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    var id = base, n = 1;
    while (CLIENTS.some(function (c) { return c.id === id; })) { id = base + "-" + (++n); }
    return id;
  }

  function createClient(data) {
    var id = slugify(data.name || "aluno");
    var initials = (data.name || "?").trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join("");
    var manual = {
      id: id, name: data.name, email: data.email || "", phone: data.phone || "",
      initials: initials, colorVar: COLOR_CYCLE[CLIENTS.length % COLOR_CYCLE.length], gender: data.gender || "m",
      inviteStatus: "pending", createdAt: new Date().toISOString()
    };
    if (global.TracklyStore) TracklyStore.addManualClient(manual);
    CLIENTS.push(instantiateManualClient(manual));
    return getClient(id);
  }

  function sendInvite(clientId) {
    var client = getClient(clientId);
    client.inviteStatus = "invited";
    client.invitedAt = new Date();
    if (global.TracklyStore) TracklyStore.updateManualClient(clientId, { inviteStatus: "invited", invitedAt: client.invitedAt.toISOString() });
  }

  // aceitar o convite ativa o vínculo e — pra fins de demonstração — já simula a chegada do
  // primeiro check-in (ver seção 50 do brief: "simular chegada de check-in" é o próximo passo
  // natural depois de ativar, e reaproveitar toda a máquina de semanas existente é bem mais
  // simples e robusto do que manter um cliente "vazio" em todas as telas).
  function acceptInvite(clientId) {
    var client = getClient(clientId);
    var now = new Date();
    client.inviteStatus = "active";
    client.activatedAt = now;
    if (!client.weeks.length) {
      client.startDate = now;
      client.weeks = buildWeeks({
        weeks: 1, anchor: now,
        weightStart: 75, weightEnd: 75,
        waistStart: client.tracking.measurements ? 90 : null, waistEnd: client.tracking.measurements ? 90 : null,
        workoutsGoal: 4, cardioGoal: 2, waterGoal: 3, sleepGoal: 7.5, adherenceGoal: 85,
        adherence: function () { return 80; }
      });
      attachQA(client);
    }
    if (global.TracklyStore) {
      TracklyStore.updateManualClient(clientId, { inviteStatus: "active", activatedAt: now.toISOString(), startDate: now.toISOString() });
    }
  }

  function instantiateManualClient(m) {
    var client = {
      id: m.id, name: m.name, initials: m.initials, colorVar: m.colorVar, gender: m.gender,
      email: m.email, phone: m.phone,
      objective: "A definir", startDate: m.startDate ? new Date(m.startDate) : null, weeks: [],
      clientStatus: "active", tracking: tracking(), manual: true,
      inviteStatus: m.inviteStatus, invitedAt: m.invitedAt ? new Date(m.invitedAt) : null, activatedAt: m.activatedAt ? new Date(m.activatedAt) : null,
      remindedAt: m.remindedAt ? new Date(m.remindedAt) : null, remindedTime: m.remindedTime || null
    };
    if (client.inviteStatus === "active") {
      var now = client.activatedAt || new Date();
      client.weeks = buildWeeks({
        weeks: 1, anchor: now,
        weightStart: 75, weightEnd: 75,
        waistStart: null, waistEnd: null,
        workoutsGoal: 4, cardioGoal: 2, waterGoal: 3, sleepGoal: 7.5, adherenceGoal: 85,
        adherence: function () { return 80; }
      });
      attachQA(client);
    }
    return client;
  }

  // reaplica por cima dos dados fictícios tudo o que o usuário já fez nesta sessão/navegador —
  // orientações enviadas, lembretes, alunos criados na hora. Roda uma vez, no carregamento.
  function applyStoredOverrides() {
    if (!global.TracklyStore) return;
    var s = TracklyStore.get();
    CLIENTS.forEach(function (c) {
      var patch = s.clients[c.id];
      if (!patch || !c.weeks.length) return;
      var cur = currentWeek(c);
      if (patch.orientation && !cur.orientation) {
        cur.orientation = patch.orientation;
        cur.focusOverride = patch.focus || null;
        if (patch.completedAt) { cur.orientationSentAt = new Date(patch.completedAt); cur.orientationSentTime = patch.completedTime || fmtTime(cur.orientationSentAt); }
        if (patch.coachNote) cur.coachReview = { note: patch.coachNote };
      }
      if (patch.nextGoals) c._nextGoals = patch.nextGoals;
      if (patch.remindedAt) { c.remindedAt = new Date(patch.remindedAt); c.remindedTime = patch.remindedTime; }
    });
    (s.manualClients || []).forEach(function (m) {
      if (CLIENTS.some(function (c) { return c.id === m.id; })) return;
      CLIENTS.push(instantiateManualClient(m));
    });
  }
  applyStoredOverrides();

  // metas "em vigor" pra próxima semana: usa o que o coach acabou de definir na revisão mais
  // recente (se houver), senão cai pros targets da semana atual — mesmo comportamento de antes.
  function effectiveGoals(client, week) {
    week = week || currentWeek(client);
    if (!week) return [];
    var base = trackedGoals(week, client).filter(function (g) { return g.key !== "adherence"; });
    if (client._nextGoals && week === currentWeek(client)) {
      return base.map(function (g) { return Object.assign({}, g, { target: client._nextGoals[g.key] != null ? client._nextGoals[g.key] : g.target }); });
    }
    return base;
  }

  global.Trackly = {
    ANCHOR: ANCHOR, COACH: COACH, CLIENTS: CLIENTS,
    fmtDate: fmtDate, fmtShort: fmtShort, fmtTime: fmtTime, relativeLabel: relativeLabel, round1: round1, clamp: clamp, avg: avg,
    getClient: getClient,
    currentWeek: currentWeek, needsReview: needsReview, isLate: isLate, suggestOrientation: suggestOrientation,
    computeStatus: computeStatus, computeKPIs: computeKPIs, isGoodWeightDelta: isGoodWeightDelta,
    weeksInRange: weeksInRange, buildPeriodSummary: buildPeriodSummary, recentWeeksTable: recentWeeksTable,
    buildCoachMemory: buildCoachMemory, trendLine: trendLine,
    getCheckinWindowStatus: getCheckinWindowStatus, nextOpenDate: nextOpenDate,
    checkInInsights: checkInInsights, focusLabel: focusLabel, focusLabelFromOrientation: focusLabelFromOrientation, focusIntro: focusIntro,
    studentUpdate: studentUpdate, buildWeeklySnapshot: buildWeeklySnapshot, clientStage: clientStage,
    isTracked: isTracked, trackedGoals: trackedGoals, effectiveGoals: effectiveGoals,
    CHECKIN_TEMPLATE: CHECKIN_TEMPLATE, CHECKIN_STEPS: CHECKIN_STEPS, checkinTemplateFor: checkinTemplateFor,
    completeOrientation: completeOrientation, sendReminder: sendReminder,
    createClient: createClient, sendInvite: sendInvite, acceptInvite: acceptInvite
  };
})(window);
