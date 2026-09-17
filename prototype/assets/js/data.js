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
    // limite explícito: um ?simDate= inválido gera Invalid Date e não pode travar a página
    for (var i = 0; i < 7 && d.getDay() !== 5; i++) d.setDate(d.getDate() + 1);
    if (d.getTime() === APP_DATE.getTime()) d.setDate(d.getDate() + 7);
    return d;
  }

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

  // aviso de quinta-feira — janela ainda não abriu, então NUNCA é a mesma mensagem de cobrança
  // de um check-in já disponível/atrasado (brief TODO §20: "quinta: Seu check-in abre amanhã.")
  function checkinReminderMessage(client) {
    return "Oi, " + client.name.split(" ")[0] + "! Passando pra avisar: seu check-in abre amanhã. Já pode ir se organizando pra registrar sua semana 😊";
  }

  function checkinReceivedMessageForCoach(client) {
    return client.name.split(" ")[0] + " enviou o check-in semanal pelo app.";
  }

  function orientationReadyMessageForStudent(client) {
    return "Oi, " + client.name.split(" ")[0] + "! Sua atualização já foi revisada. Sua nova orientação está disponível no app 😊";
  }

  function addDays(date, n) { var d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function addHours(date, n) { return new Date(new Date(date).getTime() + n * 3600000); }
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

  // ---------------- V13 — o ciclo semanal como estado explícito (brief TODO §5) ----------------
  // Antes, o estado da semana era sempre RE-DERIVADO (checkin.status + orientation + reviewOpenedAt).
  // Agora cada semana guarda o estado de verdade em `cycleStatus`, e TODA transição é registrada em
  // `cycleStatusHistory` (append-only — a trilha de auditoria que faltava: `orientation_sent`
  // continua sendo um fato inspecionável mesmo com a semana já em repouso como `completed`).
  // clientStage()/computeStatus()/needsReview()/isLate() passaram a LER esse campo em vez de
  // recalcular — os valores que elas devolvem continuam exatamente os mesmos de antes.
  var CYCLE_STATUS = {
    AWAITING_CHECKIN: "awaiting_checkin",   // semana criada; o aluno ainda não enviou o check-in
    CHECKIN_RECEIVED: "checkin_received",   // o aluno enviou (submitCheckin)
    UNDER_REVIEW: "under_review",           // o coach abriu a avaliação (markUnderReview)
    ORIENTATION_DRAFT: "orientation_draft", // o coach salvou rascunho sem enviar (saveOrientationDraft)
    ORIENTATION_SENT: "orientation_sent",   // o instante do envio (completeOrientation)
    COMPLETED: "completed"                  // estado de repouso, no mesmo envio
  };
  // ordem canônica do ciclo — serve só pra nunca REBAIXAR uma semana que já passou de um ponto
  var CYCLE_ORDER = [
    CYCLE_STATUS.AWAITING_CHECKIN, CYCLE_STATUS.CHECKIN_RECEIVED, CYCLE_STATUS.UNDER_REVIEW,
    CYCLE_STATUS.ORIENTATION_DRAFT, CYCLE_STATUS.ORIENTATION_SENT, CYCLE_STATUS.COMPLETED
  ];
  function cycleRank(status) { return CYCLE_ORDER.indexOf(status); }

  // única forma de mudar o estado de uma semana: muda o campo E registra na trilha.
  function stampCycleStatus(week, status, at) {
    if (!week) return null;
    if (!week.cycleStatusHistory) week.cycleStatusHistory = [];
    week.cycleStatus = status;
    week.cycleStatusHistory.push({ status: status, at: at || new Date() });
    return week;
  }
  // compatibilidade: semana vinda de um estado salvo antigo (sem cycleStatus) ainda responde certo
  function deriveCycleStatus(week) {
    if (!week || !week.checkin || week.checkin.status !== "submitted") return CYCLE_STATUS.AWAITING_CHECKIN;
    if (week.orientation) return CYCLE_STATUS.COMPLETED;
    if (week.orientationDraft) return CYCLE_STATUS.ORIENTATION_DRAFT;
    if (week.reviewOpenedAt) return CYCLE_STATUS.UNDER_REVIEW;
    return CYCLE_STATUS.CHECKIN_RECEIVED;
  }
  function cycleStatusOf(week) { return week ? (week.cycleStatus || deriveCycleStatus(week)) : CYCLE_STATUS.AWAITING_CHECKIN; }
  function weekByNumber(client, n) { return client.weeks.filter(function (w) { return w.weekNumber === n; })[0] || null; }

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
        note: (cfg.notes || {})[i] || null,
        // toda semana nasce aguardando o check-in — o resto da trilha é completado por
        // backfillCycleHistory() depois que as orientações fictícias já foram preenchidas.
        cycleStatus: CYCLE_STATUS.AWAITING_CHECKIN,
        cycleStatusHistory: [{ status: CYCLE_STATUS.AWAITING_CHECKIN, at: w.start }]
      });
    }
    return out;
  }

  // ---------------- nascimento de uma semana fora do gerador de dados fictícios ----------------
  // Única fonte de verdade pra criar um registro de semana em branco (usada pelo ciclo, quando a
  // semana anterior é concluída, e pela reidratação do localStorage).
  function seedWeekRecord(weekNumber, start, end, prevWeek, goalTargets) {
    var prevMetrics = (prevWeek && prevWeek.metrics) || {};
    function targetFor(key, fallback) {
      if (goalTargets && goalTargets[key] != null) return goalTargets[key];
      return fallback != null ? fallback : null;
    }
    var goals = ((prevWeek && prevWeek.goals) || []).map(function (g) {
      return { key: g.key, icon: g.icon, label: g.label, unit: g.unit, target: targetFor(g.key, g.target), actual: null, mode: g.mode, status: "pending" };
    });
    var week = {
      weekNumber: weekNumber, start: start, end: end,
      checkin: { status: "pending", submittedAt: null },
      metrics: {
        // medidas continuam valendo até o aluno reportar de novo; o que é "feito na semana" zera
        weight: prevMetrics.weight != null ? prevMetrics.weight : null,
        waist: prevMetrics.waist != null ? prevMetrics.waist : null,
        bodyFat: prevMetrics.bodyFat != null ? prevMetrics.bodyFat : null,
        adherence: null, // null = semana ainda não entra em nenhuma análise/gráfico de aderência
        workouts: 0, workoutsGoal: targetFor("workouts", prevMetrics.workoutsGoal),
        cardio: 0, cardioGoal: targetFor("cardio", prevMetrics.cardioGoal),
        water: 0, waterGoal: targetFor("water", prevMetrics.waterGoal),
        sleep: 0, sleepGoal: targetFor("sleep", prevMetrics.sleepGoal),
        energy: null, hunger: null
      },
      goals: goals,
      orientation: null, note: null
    };
    stampCycleStatus(week, CYCLE_STATUS.AWAITING_CHECKIN, start);
    return week;
  }

  // "a próxima semana nasce naturalmente do ciclo": chamada quando uma semana chega a `completed`.
  // Idempotente — só a última semana gera a próxima, e só se ela ainda não existir.
  function ensureNextWeek(client, week, goalTargets) {
    var last = currentWeek(client);
    if (!last || last.weekNumber !== week.weekNumber) return null;
    var start = addDays(week.end, 1);
    var next = seedWeekRecord(week.weekNumber + 1, start, addDays(start, 6), week, goalTargets);
    next._userAuthored = true; // nasceu de uma ação do coach: as metas dela precisam ser persistidas
    client.weeks.push(next);
    return next;
  }

  // config da PRIMEIRA semana de um aluno criado à mão (aceite de convite / instanciação).
  // Um lugar só, em vez das duas cópias que o audit apontou (§9.8) — e sem uma terceira:
  // a criação da próxima semana do ciclo usa seedWeekRecord(), acima.
  function firstWeekSeedConfig(anchor, opts) {
    opts = opts || {};
    return {
      weeks: 1, anchor: anchor,
      weightStart: 75, weightEnd: 75,
      waistStart: opts.waist ? 90 : null, waistEnd: opts.waist ? 90 : null,
      workoutsGoal: 4, cardioGoal: 2, waterGoal: 3, sleepGoal: 7.5, adherenceGoal: 85,
      adherence: function () { return 80; }
    };
  }

  // dados fictícios: completa a trilha de estados a partir do que cada semana já implica
  // (check-in enviado -> recebido; orientação escrita -> enviada/concluída), com horários
  // plausíveis e em ordem. Roda uma vez por aluno, depois de attachQA/autoFillOrientations.
  function backfillCycleHistory(client) {
    client.weeks.forEach(function (w) {
      if (!w.cycleStatusHistory || !w.cycleStatusHistory.length) {
        w.cycleStatus = CYCLE_STATUS.AWAITING_CHECKIN;
        w.cycleStatusHistory = [{ status: CYCLE_STATUS.AWAITING_CHECKIN, at: w.start }];
      }
      if (w.cycleStatusHistory.length > 1) return; // já tem trilha — nunca sobrescreve
      if (w.checkin.status !== "submitted") return;
      var received = w.checkin.submittedAt || addDays(w.end, -1);
      stampCycleStatus(w, CYCLE_STATUS.CHECKIN_RECEIVED, received);
      if (!w.orientation) {
        if (w.reviewOpenedAt) stampCycleStatus(w, CYCLE_STATUS.UNDER_REVIEW, w.reviewOpenedAt);
        return;
      }
      var opened = w.reviewOpenedAt || addHours(received, 12);
      stampCycleStatus(w, CYCLE_STATUS.UNDER_REVIEW, opened);
      var sent = w.orientationSentAt || addHours(opened, 2);
      stampCycleStatus(w, CYCLE_STATUS.ORIENTATION_SENT, sent);
      stampCycleStatus(w, CYCLE_STATUS.COMPLETED, sent);
    });
    return client;
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
      age: 32, heightCm: 178, phone: "5511987654321",
      objective: "Emagrecimento", startDate: joaoWeeks[0].start, weeks: joaoWeeks,
      clientStatus: "active", tracking: tracking() // treino + cardio + água + sono (+ tudo)
    },
    {
      id: "maria", name: "Maria Oliveira", initials: "MO", colorVar: "--c2", gender: "f",
      age: 27, heightCm: 165, phone: "5511976543210",
      objective: "Emagrecimento", startDate: mariaWeeks[0].start, weeks: mariaWeeks,
      clientStatus: "active", tracking: tracking({ cardio: false, digestion: false, emotional: false, measurements: false }) // treino + água + sono
    },
    {
      id: "pedro", name: "Pedro Santos", initials: "PS", colorVar: "--c3", gender: "m",
      age: 24, heightCm: 181, phone: "5511965432109",
      objective: "Hipertrofia", startDate: pedroWeeks[0].start, weeks: pedroWeeks,
      clientStatus: "active", tracking: tracking({ water: false, sleep: false, digestion: false, emotional: false, measurements: false }) // treino + cardio
    },
    {
      id: "ana", name: "Ana Costa", initials: "AC", colorVar: "--c4", gender: "f",
      age: 35, heightCm: 168, phone: "5511954321098",
      objective: "Condicionamento físico", startDate: anaWeeks[0].start, weeks: anaWeeks,
      clientStatus: "active", tracking: tracking({ cardio: false, water: false, sleep: false, digestion: false, emotional: false, measurements: false }) // treino + aderência + fotos
    }
  ];

  CLIENTS.forEach(function (c) { attachQA(c); });
  autoFillOrientations(CLIENTS[0], [16]); // João: semana atual aguardando revisão do coach
  autoFillOrientations(CLIENTS[1], [10]); // Maria: semana atual aguardando revisão do coach
  autoFillOrientations(CLIENTS[2], []);   // Pedro: semana atual está pendente (nem chegou pro coach)
  autoFillOrientations(CLIENTS[3], []);   // Ana: tudo revisado, inclusive a semana atual
  CLIENTS.forEach(function (c) { backfillCycleHistory(c); }); // estado/trilha do ciclo dos dados fictícios

  var COACH = { name: "Renata Prado", role: "Coach de nutrição e treino", initials: "RP", phone: "5511988887777" };
  var COLOR_CYCLE = ["--c1", "--c2", "--c3", "--c4"];

  // ================================================================
  // V11 — Treino: biblioteca base + protocolo por aluno. Nada de vídeo real
  // (mesma honestidade das fotos-placeholder): só nome + categoria + instrução curta.
  // ================================================================
  var EXERCISE_LIBRARY = [
    { id: "supino-reto", name: "Supino reto", category: "Peito", instructions: "Barra na altura do peito, cotovelos a 45°." },
    { id: "supino-inclinado", name: "Supino inclinado", category: "Peito", instructions: "Banco a 30-45°, foco na porção superior." },
    { id: "crucifixo", name: "Crucifixo", category: "Peito", instructions: "Movimento em arco, cotovelos levemente flexionados." },
    { id: "flexao", name: "Flexão de braço", category: "Peito", instructions: "Corpo alinhado, descida controlada." },
    { id: "puxada-frente", name: "Puxada frente", category: "Costas", instructions: "Puxar até a altura do queixo, controlar a subida." },
    { id: "remada-curvada", name: "Remada curvada", category: "Costas", instructions: "Tronco a 45°, puxar em direção ao umbigo." },
    { id: "remada-unilateral", name: "Remada unilateral", category: "Costas", instructions: "Apoio no banco, puxar com cotovelo próximo ao corpo." },
    { id: "pulldown", name: "Pull-down", category: "Costas", instructions: "Puxar a barra até a altura do peito." },
    { id: "agachamento", name: "Agachamento livre", category: "Pernas", instructions: "Quadril abaixo da linha do joelho, core firme." },
    { id: "leg-press", name: "Leg press", category: "Pernas", instructions: "Amplitude completa, sem travar o joelho." },
    { id: "cadeira-extensora", name: "Cadeira extensora", category: "Pernas", instructions: "Extensão controlada, pausa no topo." },
    { id: "mesa-flexora", name: "Mesa flexora", category: "Pernas", instructions: "Flexão controlada, evitar impulso." },
    { id: "panturrilha", name: "Panturrilha em pé", category: "Pernas", instructions: "Amplitude completa, pausa no topo." },
    { id: "desenvolvimento", name: "Desenvolvimento", category: "Ombro", instructions: "Barra ou halteres, evitar hiperextensão lombar." },
    { id: "elevacao-lateral", name: "Elevação lateral", category: "Ombro", instructions: "Cotovelos levemente flexionados, subir até a linha do ombro." },
    { id: "elevacao-frontal", name: "Elevação frontal", category: "Ombro", instructions: "Movimento controlado, sem balanço." },
    { id: "rosca-direta", name: "Rosca direta", category: "Braço", instructions: "Cotovelos fixos, sem balançar o tronco." },
    { id: "triceps-corda", name: "Tríceps corda", category: "Braço", instructions: "Extensão completa, cotovelos próximos ao corpo." },
    { id: "rosca-martelo", name: "Rosca martelo", category: "Braço", instructions: "Pegada neutra, movimento controlado." },
    { id: "prancha", name: "Prancha", category: "Core", instructions: "Corpo alinhado, abdômen contraído." },
    { id: "abdominal-supra", name: "Abdominal supra", category: "Core", instructions: "Movimento curto, sem puxar o pescoço." },
    { id: "elevacao-pernas", name: "Elevação de pernas", category: "Core", instructions: "Lombar apoiada, descida controlada." },
    { id: "esteira", name: "Esteira", category: "Cardio", instructions: "Ritmo constante conforme orientação." },
    { id: "bike", name: "Bike ergométrica", category: "Cardio", instructions: "Cadência constante, resistência moderada." }
  ];
  function getExercise(id) { return EXERCISE_LIBRARY.filter(function (e) { return e.id === id; })[0] || null; }

  function ex(exerciseId, sets, reps, restSec, rir, notes) {
    return { exerciseId: exerciseId, sets: sets, reps: reps, restSec: restSec, rir: rir || null, notes: notes || "" };
  }

  var WORKOUTS = {
    joao: {
      protocolName: "Emagrecimento — full body 2x",
      days: [
        { id: "a", name: "Treino A", durationMin: 45, exercises: [ex("agachamento", 3, 12, 60, 2), ex("supino-reto", 3, 12, 60, 2), ex("remada-curvada", 3, 12, 60, 2), ex("prancha", 3, 40, 45, null, "40s por série")] },
        { id: "b", name: "Treino B", durationMin: 45, exercises: [ex("leg-press", 3, 15, 60, 2), ex("puxada-frente", 3, 12, 60, 2), ex("desenvolvimento", 3, 12, 60, 2), ex("esteira", 1, 20, 0, null, "20min ritmo moderado")] }
      ]
    },
    maria: {
      protocolName: "Emagrecimento — full body 3x",
      days: [
        { id: "a", name: "Treino A", durationMin: 40, exercises: [ex("agachamento", 3, 15, 45, 2), ex("remada-unilateral", 3, 12, 45, 2), ex("elevacao-lateral", 3, 15, 45, 1), ex("abdominal-supra", 3, 20, 30)] },
        { id: "b", name: "Treino B", durationMin: 40, exercises: [ex("cadeira-extensora", 3, 15, 45, 2), ex("pulldown", 3, 12, 45, 2), ex("rosca-direta", 3, 12, 45, 1), ex("prancha", 3, 30, 30)] }
      ]
    },
    pedro: {
      protocolName: "Hipertrofia — push/pull/legs",
      days: [
        { id: "push", name: "Push", durationMin: 60, exercises: [ex("supino-reto", 4, 8, 90, 1), ex("supino-inclinado", 3, 10, 90, 2), ex("desenvolvimento", 3, 10, 75, 2), ex("triceps-corda", 3, 12, 60, 1)] },
        { id: "pull", name: "Pull", durationMin: 60, exercises: [ex("puxada-frente", 4, 8, 90, 1), ex("remada-curvada", 3, 10, 90, 2), ex("remada-unilateral", 3, 10, 75, 2), ex("rosca-direta", 3, 12, 60, 1)] },
        { id: "legs", name: "Legs", durationMin: 65, exercises: [ex("agachamento", 4, 8, 120, 1), ex("leg-press", 3, 12, 90, 2), ex("mesa-flexora", 3, 12, 75, 2), ex("panturrilha", 4, 15, 45)] }
      ]
    },
    ana: {
      protocolName: "Condicionamento — full body + cardio",
      days: [
        { id: "a", name: "Treino A", durationMin: 35, exercises: [ex("agachamento", 3, 15, 45, 2), ex("flexao", 3, 12, 45, 2), ex("prancha", 3, 40, 30), ex("bike", 1, 15, 0, null, "15min intervalado")] }
      ]
    }
  };

  function seedWorkoutHistory(clientId, exerciseId, load, reps, daysAgo) {
    return { lastLoad: load, lastReps: reps, lastDate: addDays(ANCHOR, -daysAgo) };
  }
  var WORKOUT_HISTORY = {
    joao: { "agachamento": seedWorkoutHistory("joao", "agachamento", 40, 12, 6), "supino-reto": seedWorkoutHistory("joao", "supino-reto", 20, 12, 6) },
    maria: { "agachamento": seedWorkoutHistory("maria", "agachamento", 25, 15, 5) },
    pedro: { "supino-reto": seedWorkoutHistory("pedro", "supino-reto", 60, 8, 3), "puxada-frente": seedWorkoutHistory("pedro", "puxada-frente", 55, 8, 5) },
    ana: { "agachamento": seedWorkoutHistory("ana", "agachamento", 20, 15, 4) }
  };

  // registra uma sessão executada pelo aluno — autosave, alimenta o histórico de carga
  // e o contador semanal que o check-in vai LER (nunca pedir pra digitar de novo, brief §26)
  function logWorkoutSession(clientId, dayId, entries) {
    var client = getClient(clientId);
    if (!client.workoutHistory) client.workoutHistory = {};
    var now = new Date();
    entries.forEach(function (entry) {
      if (entry.load == null && entry.reps == null) return;
      client.workoutHistory[entry.exerciseId] = { lastLoad: entry.load, lastReps: entry.reps, lastDate: now };
    });
    client._weekWorkoutsDone = (client._weekWorkoutsDone || 0) + 1;
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        workoutHistory: client.workoutHistory,
        weekWorkoutsDone: client._weekWorkoutsDone
      });
    }
  }
  // autosave do builder do coach — sobrescreve o protocolo inteiro (mesmo padrão de
  // mutate-then-patch; o objeto é pequeno o bastante pra não precisar de merge por campo).
  function saveWorkoutProtocol(clientId, workout) {
    var client = getClient(clientId);
    client.workout = workout;
    if (global.TracklyStore) TracklyStore.patchClient(clientId, { workoutProtocol: workout });
  }
  // V16 — item 8 do TODO: cada aluno tem seu próprio client.tracking (flags por métrica, ver
  // TRACKING_DEFAULT acima), mas até aqui só era definido na criação do aluno e ficava congelado
  // pra sempre. Isso dá ao coach um jeito de editar depois — mesmo padrão mutate-then-patch de
  // saveWorkoutProtocol/saveCheckinTemplate.
  function saveTrackingSettings(clientId, trackingSettings) {
    var client = getClient(clientId);
    client.tracking = trackingSettings;
    if (global.TracklyStore) TracklyStore.patchClient(clientId, { tracking: trackingSettings });
  }
  function todaysWorkoutDay(client) {
    if (!client.workout || !client.workout.days.length) return null;
    var idx = (Trackly_currentWeekNumberSafe(client) - 1) % client.workout.days.length;
    return client.workout.days[idx];
  }
  function Trackly_currentWeekNumberSafe(client) { return client.weeks.length ? client.weeks[client.weeks.length - 1].weekNumber : 1; }

  CLIENTS.forEach(function (c) {
    c.workout = WORKOUTS[c.id] || null;
    c.workoutHistory = WORKOUT_HISTORY[c.id] || {};
    c._weekWorkoutsDone = 0;
  });

  // ================================================================
  // V11 — Nutrição: plano visual por refeição, não "planilha". Substituições
  // equivalentes ficam junto do item (mesma ideia de contexto-no-lugar-certo
  // do resto do produto — brief §33/§34).
  // ================================================================
  function meal(id, name, time, items, substitutes, macros) {
    return { id: id, name: name, time: time, items: items, substitutes: substitutes || [], macros: macros };
  }
  var NUTRITION_PLANS = {
    joao: {
      planName: "Emagrecimento — déficit moderado",
      meals: [
        meal("cafe", "Café da manhã", "07:00",
          [{ food: "Ovos mexidos", qty: "3 unid." }, { food: "Pão integral", qty: "1 fatia" }, { food: "Mamão", qty: "1 fatia" }],
          [["Pão integral", "Tapioca (2 col.)"]], { protein: 24, carbs: 30, fat: 14, kcal: 340 }),
        meal("almoco", "Almoço", "12:30",
          [{ food: "Frango grelhado", qty: "150g" }, { food: "Arroz integral", qty: "4 col." }, { food: "Salada verde", qty: "à vontade" }, { food: "Feijão", qty: "2 col." }],
          [["Arroz integral", "Batata doce (100g)"]], { protein: 42, carbs: 45, fat: 10, kcal: 460 }),
        meal("lanche", "Lanche da tarde", "16:00",
          [{ food: "Iogurte natural", qty: "1 pote" }, { food: "Granola", qty: "1 col." }],
          [["Iogurte natural", "Whey protein (1 dose)"]], { protein: 14, carbs: 20, fat: 6, kcal: 190 }),
        meal("jantar", "Jantar", "20:00",
          [{ food: "Tilápia grelhada", qty: "150g" }, { food: "Legumes no vapor", qty: "1 prato" }],
          [["Tilápia grelhada", "Patinho moído (120g)"]], { protein: 38, carbs: 15, fat: 8, kcal: 290 })
      ]
    },
    maria: {
      planName: "Emagrecimento — foco em saciedade",
      meals: [
        meal("cafe", "Café da manhã", "07:30",
          [{ food: "Omelete de claras", qty: "3 unid." }, { food: "Aveia", qty: "2 col." }, { food: "Banana", qty: "1 unid." }],
          [["Aveia", "Tapioca (2 col.)"]], { protein: 22, carbs: 35, fat: 8, kcal: 300 }),
        meal("almoco", "Almoço", "12:00",
          [{ food: "Peito de frango", qty: "130g" }, { food: "Quinoa", qty: "3 col." }, { food: "Salada colorida", qty: "à vontade" }],
          [["Quinoa", "Arroz integral (3 col.)"]], { protein: 36, carbs: 38, fat: 9, kcal: 380 }),
        meal("lanche", "Lanche da tarde", "16:30",
          [{ food: "Whey protein", qty: "1 dose" }, { food: "Maçã", qty: "1 unid." }],
          [], { protein: 26, carbs: 22, fat: 3, kcal: 220 }),
        meal("jantar", "Jantar", "19:30",
          [{ food: "Salmão grelhado", qty: "120g" }, { food: "Aspargos", qty: "1 prato" }],
          [["Salmão grelhado", "Tilápia (140g)"]], { protein: 30, carbs: 10, fat: 14, kcal: 290 })
      ]
    },
    pedro: {
      planName: "Hipertrofia — superávit calórico",
      meals: [
        meal("cafe", "Café da manhã", "06:30",
          [{ food: "Ovos inteiros", qty: "4 unid." }, { food: "Pão francês", qty: "2 unid." }, { food: "Aveia", qty: "3 col." }],
          [["Pão francês", "Tapioca (3 col.)"]], { protein: 34, carbs: 55, fat: 18, kcal: 520 }),
        meal("almoco", "Almoço", "12:00",
          [{ food: "Carne vermelha magra", qty: "200g" }, { food: "Arroz branco", qty: "6 col." }, { food: "Feijão", qty: "3 col." }, { food: "Salada", qty: "à vontade" }],
          [["Carne vermelha magra", "Frango (220g)"]], { protein: 55, carbs: 70, fat: 16, kcal: 680 }),
        meal("pos-treino", "Pós-treino", "17:00",
          [{ food: "Whey protein", qty: "2 doses" }, { food: "Banana", qty: "1 unid." }, { food: "Batata doce", qty: "150g" }],
          [], { protein: 48, carbs: 50, fat: 4, kcal: 420 }),
        meal("jantar", "Jantar", "20:30",
          [{ food: "Frango grelhado", qty: "200g" }, { food: "Arroz integral", qty: "5 col." }, { food: "Legumes", qty: "1 prato" }],
          [["Frango grelhado", "Carne vermelha magra (180g)"]], { protein: 52, carbs: 48, fat: 12, kcal: 520 })
      ]
    },
    ana: {
      planName: "Condicionamento — equilíbrio energético",
      meals: [
        meal("cafe", "Café da manhã", "07:00",
          [{ food: "Iogurte natural", qty: "1 pote" }, { food: "Granola", qty: "2 col." }, { food: "Frutas vermelhas", qty: "1 punhado" }],
          [["Granola", "Aveia (2 col.)"]], { protein: 18, carbs: 40, fat: 9, kcal: 320 }),
        meal("almoco", "Almoço", "12:30",
          [{ food: "Peito de frango", qty: "140g" }, { food: "Arroz integral", qty: "4 col." }, { food: "Salada", qty: "à vontade" }],
          [["Arroz integral", "Quinoa (4 col.)"]], { protein: 38, carbs: 42, fat: 10, kcal: 420 }),
        meal("lanche", "Lanche da tarde", "16:00",
          [{ food: "Mix de castanhas", qty: "1 punhado" }, { food: "Maçã", qty: "1 unid." }],
          [], { protein: 8, carbs: 24, fat: 14, kcal: 250 }),
        meal("jantar", "Jantar", "20:00",
          [{ food: "Peixe grelhado", qty: "150g" }, { food: "Legumes no vapor", qty: "1 prato" }],
          [["Peixe grelhado", "Frango grelhado (150g)"]], { protein: 34, carbs: 16, fat: 9, kcal: 300 })
      ]
    }
  };
  CLIENTS.forEach(function (c) { c.nutritionPlan = NUTRITION_PLANS[c.id] || null; });
  function todaysMeals(client) { return client.nutritionPlan ? client.nutritionPlan.meals : []; }
  function saveNutritionPlan(clientId, plan) {
    var client = getClient(clientId);
    client.nutritionPlan = plan;
    if (global.TracklyStore) TracklyStore.patchClient(clientId, { nutritionPlan: plan });
  }

  // ================================================================
  // V11 — Pagamentos: abstração de provedor (nunca chamado de verdade — só
  // documenta o encaixe pra Mercado Pago/Asaas/Stripe quando integrar).
  // ================================================================
  var paymentProvider = {
    name: "simulado",
    note: "abstração — trocar por Mercado Pago/Asaas/Stripe quando integrar de verdade",
    charge: function (clientId, method) { return { ok: true, method: method, simulated: true }; },
    // estorno — mesmo padrão do charge acima: nunca chamado de verdade, só documenta o encaixe
    // (Mercado Pago/Asaas/Stripe expõem uma chamada de estorno equivalente a trocar aqui dentro).
    refund: function (clientId, paymentId) { return { ok: true, paymentId: paymentId, simulated: true }; }
  };

  var PLANS = {
    joao: { name: "Plano Mensal", priceCents: 24900, period: "monthly" },
    maria: { name: "Plano Trimestral", priceCents: 64900, period: "quarterly" },
    pedro: { name: "Plano Mensal", priceCents: 24900, period: "monthly" },
    ana: { name: "Plano Semestral", priceCents: 119900, period: "semiannual" }
  };
  function fmtBRL(cents) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  // só pra deixar o log de eventos legível — a UI (cliente.html) tem sua própria cópia pro <select>,
  // mesmo padrão de duplicação já usado por statusLabel/statusPill entre cliente.html e pagamento.html.
  var PERIOD_LABELS_FOR_LOG = { monthly: "mensal", quarterly: "trimestral", semiannual: "semestral", annual: "anual" };
  function paymentHistoryFor(clientId, currentStatus) {
    var price = PLANS[clientId].priceCents;
    var hist = [
      { id: clientId + "-p3", dueDate: addDays(ANCHOR, -60), paidDate: addDays(ANCHOR, -61), amountCents: price, status: "paid", method: "pix" },
      { id: clientId + "-p2", dueDate: addDays(ANCHOR, -30), paidDate: addDays(ANCHOR, -30), amountCents: price, status: "paid", method: "cartao" }
    ];
    if (currentStatus === "paid") {
      hist.push({ id: clientId + "-p1", dueDate: addDays(ANCHOR, -1), paidDate: addDays(ANCHOR, -1), amountCents: price, status: "paid", method: "pix" });
    } else if (currentStatus === "pending") {
      hist.push({ id: clientId + "-p1", dueDate: addDays(ANCHOR, 4), paidDate: null, amountCents: price, status: "pending", method: null });
    } else if (currentStatus === "overdue") {
      hist.push({ id: clientId + "-p1", dueDate: addDays(ANCHOR, -6), paidDate: null, amountCents: price, status: "overdue", method: null });
    }
    return hist;
  }
  var PAYMENT_STATE = { joao: "paid", maria: "pending", pedro: "overdue", ana: "paid" };
  CLIENTS.forEach(function (c) {
    c.plan = PLANS[c.id];
    c.paymentsHistory = paymentHistoryFor(c.id, PAYMENT_STATE[c.id]);
    // situação da ASSINATURA (ativa/pausada/cancelada) — não confundir com o status de UMA cobrança
    // (pago/pendente/atrasado/estornado), que vive em cada item de paymentsHistory.
    c.subscriptionStatus = "active";
    // TODO §22 — log leve de pagamentos: plano criado/editado, pagamento marcado, reembolso, mudança
    // de status. Mesmo formato id/type/timestamp/detail das NOTIFICATIONS, sem virar um framework
    // de auditoria — só o suficiente pra "registrar pagamentos, eventos, reembolsos e mudanças de estado".
    c.paymentsEvents = [];
  });
  function paymentEventId() { return "pev" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function logPaymentEvent(client, type, detail) {
    client.paymentsEvents.unshift({ id: paymentEventId(), type: type, timestamp: new Date(), detail: detail || "" });
  }
  function serializePaymentsEvents(client) {
    return client.paymentsEvents.map(function (e) { return Object.assign({}, e, { timestamp: toISO(e.timestamp) }); });
  }
  function currentPayment(client) {
    var h = client.paymentsHistory || []; // aluno sem plano ainda: nenhuma cobrança existe (TODO §34)
    return h.length ? h[h.length - 1] : null;
  }
  // "Cobrar pagamento" pelo WhatsApp — mesmo padrão do checkinNudgeMessage (V9): mensagem
  // contextual, nunca genérica, nunca soa como cobrança de robô.
  function overduePaymentMessage(client) {
    var first = client.name.split(" ")[0];
    var pay = currentPayment(client);
    var value = pay ? (pay.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
    return "Oi, " + first + "! Tudo bem? Vi aqui que o pagamento do seu plano (" + value + ") está em atraso. Quando puder, regulariza pelo app — qualquer dúvida me chama 😊";
  }
  // registra o pagamento simulado — mesmo padrão de mutate-then-patch do submitCheckin.
  function simulatePayment(clientId, method) {
    var client = getClient(clientId);
    var pay = currentPayment(client);
    if (!pay || pay.status === "paid") return;
    var now = new Date();
    pay.status = "paid";
    pay.paidDate = now;
    pay.method = method || "pix";
    paymentProvider.charge(clientId, method);
    logPaymentEvent(client, "payment_paid", fmtBRL(pay.amountCents) + " via " + pay.method);
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        paymentSettled: { paymentId: pay.id, paidDate: now.toISOString(), method: pay.method },
        paymentsEvents: serializePaymentsEvents(client)
      });
    }
  }

  // TODO §22 — coach edita nome/valor/periodicidade do plano. Mesmo padrão mutate-then-patch do
  // saveNutritionPlan: mescla por cima do plano atual e persiste o objeto inteiro (não é dado
  // volátil como as datas de paymentsHistory, então dá pra sobrescrever direto no reload).
  function savePlan(clientId, planPatch) {
    var client = getClient(clientId);
    client.plan = Object.assign({}, client.plan, planPatch);
    logPaymentEvent(client, "plan_edited", client.plan.name + " · " + fmtBRL(client.plan.priceCents) + " · " + (PERIOD_LABELS_FOR_LOG[client.plan.period] || client.plan.period));
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, { plan: client.plan, paymentsEvents: serializePaymentsEvents(client) });
    }
  }

  // TODO §22 — "situação da assinatura" (ativa/pausada/cancelada): estado do VÍNCULO coach-aluno,
  // nunca confundir com o status de uma cobrança específica (pago/pendente/atrasado/estornado).
  function setSubscriptionStatus(clientId, status) {
    var client = getClient(clientId);
    if (client.subscriptionStatus === status) return;
    client.subscriptionStatus = status;
    logPaymentEvent(client, "subscription_status_changed", status);
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, { subscriptionStatus: status, paymentsEvents: serializePaymentsEvents(client) });
    }
  }

  // TODO §22 — reembolso: só um pagamento já PAGO pode ser estornado. Passa pela mesma abstração de
  // gateway do simulatePayment (paymentProvider.refund) — nunca chamado de verdade, mesmo padrão.
  function refundPayment(clientId, paymentId) {
    var client = getClient(clientId);
    var pay = client.paymentsHistory.filter(function (p) { return p.id === paymentId; })[0];
    if (!pay || pay.status !== "paid") return;
    var now = new Date();
    pay.status = "refunded";
    pay.refundedAt = now;
    paymentProvider.refund(clientId, paymentId);
    logPaymentEvent(client, "refund", fmtBRL(pay.amountCents) + " · venc. " + fmtShort(pay.dueDate));
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        // grava a lista inteira dos que já estão marcados refunded em memória — mesmo padrão
        // "reconstrói do estado atual" do saveNotifications, evita precisar de merge por id.
        paymentsRefunded: client.paymentsHistory.filter(function (p) { return p.status === "refunded"; })
          .map(function (p) { return { paymentId: p.id, refundedAt: toISO(p.refundedAt) }; }),
        paymentsEvents: serializePaymentsEvents(client)
      });
    }
  }

  // ================================================================
  // V17 — item 21 do TODO: camada de notificações multicanal.
  // O EVENTO é a fonte de verdade, nunca o canal — "separar o evento da forma como ele é
  // entregue". notify(eventType, clientId) decide, a partir só do tipo de evento: quem recebe
  // (o coach ou o próprio aluno), a mensagem (sempre reaproveitando as funções de mensagem que já
  // existiam acima — nunca duplica o texto) e em quais canais aquele evento pode circular. Hoje só
  // in-app e WhatsApp de fato "saem" (o protótipo não tem backend pra disparar push/e-mail de
  // verdade) — push e e-mail ficam DECLARADOS na notificação (channels.push/channels.email
  // = "declared"), mesmo padrão do paymentProvider simulado acima: documenta o encaixe sem fingir
  // que existe. Isso é o que deixa "checkin_available pode gerar push, WhatsApp ou e-mail depois"
  // verdadeiro sem reescrever nenhum call site — só troca o que acontece dentro de notify().
  // ================================================================
  var NOTIFICATION_EVENTS = {
    // aluno enviou o check-in -> avisa o COACH (mesma mensagem do botão "Avisar coach no
    // WhatsApp" em portal/checkin.html — nunca duplicada aqui).
    checkin_received: { recipient: "coach", messageFn: checkinReceivedMessageForCoach, whatsapp: true },
    // orientação enviada -> avisa o ALUNO (mesma mensagem do "Avisar <nome> no WhatsApp").
    orientation_ready: { recipient: "client", messageFn: orientationReadyMessageForStudent, whatsapp: true },
    // cobrança de check-in atrasado -> avisa o ALUNO (mesma mensagem do "Cobrar check-in").
    checkin_overdue: { recipient: "client", messageFn: checkinNudgeMessage, whatsapp: true },
    // lembrete de quinta-feira (janela abre amanhã) -> avisa o ALUNO (mesma mensagem do "Lembrar").
    checkin_reminder: { recipient: "client", messageFn: checkinReminderMessage, whatsapp: true },
    // pagamento em atraso -> avisa o ALUNO (mesma mensagem do "Cobrar no WhatsApp" do financeiro).
    payment_overdue: { recipient: "client", messageFn: overduePaymentMessage, whatsapp: true }
  };

  // lista achatada — não é parte do CLIENTS que data.js reconstrói do zero a cada load, então é
  // persistida e reidratada à parte (restoreNotifications, chamada de dentro de applyStoredOverrides).
  var NOTIFICATIONS = [];

  function notifId() { return "ntf" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function persistNotifications() {
    if (!global.TracklyStore) return;
    TracklyStore.saveNotifications(NOTIFICATIONS.map(function (n) {
      return Object.assign({}, n, { createdAt: toISO(n.createdAt) });
    }));
  }

  // dispatcher: um evento -> mensagem certa (reaproveitada, nunca reescrita) + registro in-app +
  // canais declarados. `clientId` é sempre o ALUNO a que o evento se refere (mesmo quando quem
  // recebe é o coach) — é o mesmo client que toda função de mensagem acima já espera.
  function notify(eventType, clientId) {
    var def = NOTIFICATION_EVENTS[eventType];
    var client = getClient(clientId);
    if (!def || !client) return null;
    var record = {
      id: notifId(),
      eventType: eventType,
      clientId: clientId,
      recipient: def.recipient === "coach" ? "coach" : clientId,
      message: def.messageFn(client),
      channels: {
        inApp: true,
        whatsapp: !!(def.whatsapp && client.phone),
        // "declaradas": o TODO pede a FORMA, não o disparo de verdade — sem backend aqui pra
        // enviar push/e-mail. Ligar de verdade é trocar só isto dentro de notify(), nunca os
        // call sites que já chamam Trackly.notify(...).
        push: "declared", email: "declared"
      },
      createdAt: new Date(),
      read: false
    };
    NOTIFICATIONS.unshift(record); // mais recente primeiro
    persistNotifications();
    return record;
  }

  // who: "coach" ou o id de um aluno — a mesma chave usada em `recipient` acima.
  function getNotifications(who) {
    return NOTIFICATIONS.filter(function (n) { return n.recipient === who; });
  }
  function unreadNotificationCount(who) {
    return getNotifications(who).filter(function (n) { return !n.read; }).length;
  }
  function markNotificationRead(id) {
    var n = NOTIFICATIONS.filter(function (x) { return x.id === id; })[0];
    if (n && !n.read) { n.read = true; persistNotifications(); }
    return n;
  }
  function markAllNotificationsRead(who) {
    var changed = false;
    NOTIFICATIONS.forEach(function (n) { if (n.recipient === who && !n.read) { n.read = true; changed = true; } });
    if (changed) persistNotifications();
  }
  function restoreNotifications(stored) {
    if (!stored || !stored.length) return;
    NOTIFICATIONS = stored.map(function (n) { return Object.assign({}, n, { createdAt: n.createdAt ? new Date(n.createdAt) : new Date() }); });
  }

  // ---------------- helpers derivados ----------------

  function getClient(id) { return CLIENTS.filter(function (c) { return c.id === id; })[0] || CLIENTS[0]; }

  function currentWeek(client) { return client.weeks.length ? client.weeks[client.weeks.length - 1] : null; }

  // última semana cujo ciclo o coach fechou de fato (orientação enviada por ele, com carimbo)
  function lastSentWeek(client) {
    for (var i = client.weeks.length - 1; i >= 0; i--) if (client.weeks[i].orientationSentAt) return client.weeks[i];
    return null;
  }

  function isTracked(client, key) { return !!(client.tracking && client.tracking[key] !== false); }

  // metas do aluno filtradas pelo que ele realmente acompanha (nunca um número universal)
  function trackedGoals(week, client) {
    return week.goals.filter(function (g) { return g.key === "adherence" ? isTracked(client, "adherence") : isTracked(client, g.key); });
  }

  // true quando o check-in mais recente já chegou pro coach mas ainda não recebeu orientação.
  // V13: lê o estado guardado da semana em vez de re-derivar — o valor de retorno é o mesmo.
  function needsReview(client) {
    var st = cycleStatusOf(currentWeek(client));
    return st === CYCLE_STATUS.CHECKIN_RECEIVED || st === CYCLE_STATUS.UNDER_REVIEW || st === CYCLE_STATUS.ORIENTATION_DRAFT;
  }

  function isLate(client) {
    return cycleStatusOf(currentWeek(client)) === CYCLE_STATUS.AWAITING_CHECKIN;
  }

  // a sexta-feira que cai dentro desta semana — é o dia em que o check-in dela abre
  // (mesma régua de getCheckinWindowStatus: quinta = lembrete, sexta/sábado/domingo = aberto).
  function checkinOpensOn(week) {
    var d = new Date(week.start);
    // limite explícito: uma data inválida (localStorage corrompido) não pode travar a página
    for (var i = 0; i < 7 && d.getDay() !== 5; i++) d.setDate(d.getDate() + 1);
    return d;
  }
  // "Atrasado" é só depois que o PRAZO da semana (week.end) passou. Uma semana que ainda está
  // correndo — inclusive a que acabou de nascer do ciclo — está aguardando, não atrasada.
  function isCheckinOverdue(client) {
    var cur = currentWeek(client);
    if (!cur || cycleStatusOf(cur) !== CYCLE_STATUS.AWAITING_CHECKIN) return false;
    return APP_DATE > cur.end;
  }

  // Derivado, nunca guardado: o 7º estado do brief ("next_checkin_due") não é o estado de nenhuma
  // semana — é a antecedência. Vale quando a semana atual ainda aguarda o check-in, a janela dela
  // ainda não abriu, e hoje já está no dia de lembrete (quinta). Só pra mensagem
  // ("o check-in da semana está chegando"), nunca pra liberar/bloquear tela.
  function isNextCheckinDue(client) {
    var cur = currentWeek(client);
    if (!cur || cycleStatusOf(cur) !== CYCLE_STATUS.AWAITING_CHECKIN) return false;
    var opensAt = checkinOpensOn(cur);
    if (APP_DATE >= opensAt) return false; // a janela já abriu: não é mais "está chegando"
    var daysUntil = Math.round((opensAt - APP_DATE) / 86400000);
    return daysUntil <= 1 && getCheckinWindowStatus() === "reminder";
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
    var st = cycleStatusOf(currentWeek(client));
    if (st === CYCLE_STATUS.AWAITING_CHECKIN) return "awaiting_checkin";
    if (st === CYCLE_STATUS.ORIENTATION_SENT || st === CYCLE_STATUS.COMPLETED) return "completed";
    return "checkin_received"; // checkin_received | under_review | orientation_draft — a fila do coach é a mesma
  }

  function computeStatus(client) {
    if (!client.weeks.length) {
      return client.inviteStatus === "invited"
        ? { code: "invite", label: "Convite enviado", reason: "Aguardando " + client.name.split(" ")[0] + " aceitar o convite." }
        : { code: "invite", label: "Convite pendente", reason: "Envie o convite pra " + client.name.split(" ")[0] + " começar o acompanhamento." };
    }
    var cur = currentWeek(client);
    if (isLate(client)) {
      if (isCheckinOverdue(client)) {
        return { code: "late", label: "Check-in atrasado", reason: "Check-in da semana " + cur.weekNumber + " ainda não foi enviado (previsto para " + fmtShort(cur.end) + ")." };
      }
      // semana ainda correndo (inclusive a que nasceu agora do ciclo): não é atraso, não se cobra.
      // `code` próprio pra que nenhuma tela pinte de vermelho nem ofereça "Cobrar check-in".
      var opensAt = checkinOpensOn(cur);
      return {
        code: "waiting", label: "Aguardando check-in",
        reason: APP_DATE < opensAt
          ? ("Check-in da semana " + cur.weekNumber + " abre " + fmtShort(opensAt) + ".")
          : ("Check-in da semana " + cur.weekNumber + " está aberto até " + fmtShort(cur.end) + ".")
      };
    }
    if (needsReview(client)) {
      var st = cycleStatusOf(cur);
      if (st === CYCLE_STATUS.UNDER_REVIEW || st === CYCLE_STATUS.ORIENTATION_DRAFT) {
        return { code: "progress", label: "Em avaliação", reason: "Avaliação de " + client.name.split(" ")[0] + " em andamento — ainda não enviada." };
      }
      return { code: "review", label: "Aguardando avaliação", reason: "Check-in da semana " + cur.weekNumber + " recebido " + relativeLabel(cur.checkin.submittedAt) + " — ainda sem avaliação." };
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
    var submitted = w.filter(function (x) { return x.metrics.adherence != null; });
    // "esta semana" precisa ser a última semana com check-in de verdade, não a semana mais
    // recente do array — quando o ciclo já avançou (nova semana criada, ainda pendente), essa
    // semana só tem placeholders (peso copiado, aderência/treinos/água/sono zerados ou nulos),
    // e usá-la aqui produzia "null%" e deltas negativos do tamanho do valor inteiro anterior
    // (achado ao vivo na validação do item 36, com um cliente real recém-criado avançando de
    // semana). Cai pra semana atual só no caso (sem check-in nenhum ainda) que não deveria
    // acontecer na prática, já que a semana 1 sempre nasce com metrics preenchidos.
    var first = w[0].metrics, lastWeek = submitted.length ? submitted[submitted.length - 1] : currentWeek(client), last = lastWeek.metrics;
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
  // range opcional: mesmo período selecionado no seletor da Evolução (brief TODO §11 — "o resumo
  // deve refletir apenas o período selecionado"). Sem range, mantém o comportamento antigo
  // (até as últimas 8 semanas) — é o que a legenda rápida do Resumo do coach ainda usa.
  function trendLine(client, range) {
    var weeks = (range ? weeksInRange(client, range) : client.weeks).filter(function (w) { return w.metrics.adherence != null; });
    if (weeks.length < 3) return null;
    var n = range ? weeks.length : Math.min(weeks.length, 8);
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
      var overdue = isCheckinOverdue(client);
      var d = cur ? daysSince(cur.end) : 0;
      // semana ainda correndo: o coach precisa ver quando ela abre, não "há N dias sem check-in".
      // E o "concluído em" continua vindo do último ciclo fechado, que é o trabalho que ele fez.
      var lastSent = lastSentWeek(client);
      return {
        late: overdue, upcoming: !overdue && !!cur,
        label: overdue
          ? (d <= 0 ? "Check-in previsto para hoje" : "Sem check-in há " + d + " dia" + (d === 1 ? "" : "s"))
          : (APP_DATE < checkinOpensOn(cur) ? "Check-in abre " + fmtShort(checkinOpensOn(cur)) : "Check-in aberto até " + fmtShort(cur.end)),
        completedAtLabel: lastSent ? ("Orientação enviada " + relativeLabel(lastSent.orientationSentAt) + (lastSent.orientationSentTime ? (" às " + lastSent.orientationSentTime) : "")) : null
      };
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

  // ================================================================
  // V14 — o check-in como formulário flexível (TODO §6)
  // Este é o ÚNICO lugar onde o questionário existe. Antes ele era uma constante morta: a página
  // do aluno tinha a própria cópia em HTML e a revisão do coach uma terceira cópia dos rótulos —
  // três listas que só podiam divergir. Agora o template é uma CONFIGURAÇÃO DO COACH
  // (COACH.checkinTemplate/checkinSteps), editável em coach/checkin-config.html e persistida em
  // coachSettings. Hoje existe um coach só (multi-coach é outro item do TODO) — a estrutura já
  // está no formato certo pra virar "por coach" sem retrabalho, mesma ideia do paymentProvider.
  //
  // Campos de uma pergunta:
  //   key/label/type/step/active/required — o que é e onde aparece (step = id do passo)
  //   tracks      — métrica que a resposta alimenta (opcional; sem isso é pergunta livre)
  //   genderOnly  — restrição de gênero (opcional)
  //   apresentação (opcional, só o formulário do aluno lê): formLabel, optionalNote,
  //   placeholder, textPlaceholder, hint, multiline
  // ================================================================
  var METRIC_KEYS = ["weight", "adherence", "workouts", "cardio", "water", "sleep", "digestion", "emotional"];
  var DEFAULT_CHECKIN_TEMPLATE = [
    { key: "peso", label: "Peso atual", type: "number", step: 1, active: true, required: true, tracks: "weight", placeholder: "ex.: 81.5", hint: "em quilos, medido em jejum se possível" },
    { key: "fotos", label: "Fotos de evolução", type: "photos", step: 1, active: true, required: false, tracks: "photos", hint: "Use sempre o mesmo local e roupa — facilita comparar sua evolução." },
    { key: "dieta", label: "Como foi a dieta?", type: "scale+text", step: 2, active: true, required: true, tracks: "adherence", placeholder: "Em uma frase, como foi seguir o plano essa semana?" },
    { key: "refeicaoLivre", label: "Fez a refeição livre? Se sim, qual dia e o que comeu?", type: "text", step: 2, active: true, required: false, tracks: "adherence", placeholder: "Ex.: sim, sábado à noite — pizza." },
    { key: "beliscos", label: "Houve beliscos de comida fora do plano?", type: "text", step: 2, active: true, required: false, tracks: "adherence", placeholder: "Ex.: não / sim, doce à tarde em dois dias." },
    { key: "treinos", label: "Treinos realizados", type: "stepper", step: 3, active: true, required: true, tracks: "workouts" },
    { key: "performanceTreino", label: "Como foi sua performance nos treinos?", type: "text", step: 3, active: true, required: false, tracks: "workouts", placeholder: "Força, disposição, evolução de carga..." },
    { key: "cardio", label: "Sessões de cardio", type: "stepper", step: 3, active: true, required: true, tracks: "cardio" },
    { key: "cardioDetalhe", label: "Como foi o cardio? Tempo, dias e tipo.", type: "text", step: 3, active: true, required: false, tracks: "cardio", placeholder: "Ex.: 3x, 30min, esteira." },
    { key: "periodoMenstrual", label: "Está no período menstrual?", type: "yesno", step: 4, active: true, required: false, genderOnly: "f" },
    { key: "agua", label: "Quantos litros de água você tomou por dia, em média?", type: "number", step: 4, active: true, required: true, tracks: "water", placeholder: "ex.: 2.8" },
    { key: "sono", label: "Como foi seu sono?", type: "number+text", step: 4, active: true, required: true, tracks: "sleep", placeholder: "média de horas por noite, ex.: 7.2", textPlaceholder: "Regular? Alguma noite mal dormida?" },
    { key: "digestao", label: "Como foi sua digestão? Idas ao banheiro e estufamento.", type: "text", step: 4, active: true, required: false, tracks: "digestion" },
    { key: "emocional", label: "Como está seu emocional?", type: "text", step: 4, active: true, required: false, tracks: "emotional" },
    { key: "substancias", label: "Uso de substâncias/medicamentos, quando aplicável.", type: "text", step: 4, active: true, required: false, formLabel: "Uso de substâncias/medicamentos", optionalNote: "(quando aplicável)" },
    { key: "exame", label: "Último exame enviado, quando aplicável.", type: "text", step: 4, active: true, required: false, multiline: false, formLabel: "Último exame enviado", optionalNote: "(quando aplicável)", placeholder: "Ex.: exame de sangue, semana 12" }
  ];
  var DEFAULT_CHECKIN_STEPS = [
    { n: 1, label: "Peso e fotos" },
    { n: 2, label: "Alimentação" },
    { n: 3, label: "Treino" },
    { n: 4, label: "Bem-estar" }
  ];
  function cloneJSON(v) { return JSON.parse(JSON.stringify(v)); }
  COACH.checkinTemplate = cloneJSON(DEFAULT_CHECKIN_TEMPLATE);
  COACH.checkinSteps = cloneJSON(DEFAULT_CHECKIN_STEPS);

  // perguntas do template que fazem sentido pra este aluno — filtra por `tracks` (quando a
  // pergunta pertence a uma métrica) e por gênero (periodoMenstrual). Mesmo comportamento de antes,
  // só que lendo a configuração do coach em vez de uma constante.
  function checkinTemplateFor(client) {
    return (COACH.checkinTemplate || []).filter(function (q) {
      if (!q.active) return false;
      if (q.genderOnly && q.genderOnly !== client.gender) return false;
      if (q.tracks && !isTracked(client, q.tracks)) return false;
      return true;
    });
  }

  // grava o template editado pelo coach. Recusa (sem persistir nada) quando duas perguntas ATIVAS
  // apontam pra mesma métrica — isso faria duas respostas gravarem em cima do mesmo número.
  function saveCheckinTemplate(template, steps) {
    if (!template || !template.length) return { ok: false, error: "O check-in precisa de pelo menos uma pergunta." };
    var byTracks = {}, byKey = {}, err = null;
    template.forEach(function (q) {
      if (!q.key) err = err || "Toda pergunta precisa de uma chave.";
      if (byKey[q.key]) err = err || ('Existe mais de uma pergunta com a chave "' + q.key + '".');
      byKey[q.key] = true;
      if (!q.active || !q.tracks) return;
      if (byTracks[q.tracks]) {
        err = err || ('Duas perguntas ativas estão vinculadas à métrica "' + q.tracks + '" (' + byTracks[q.tracks] + ' e ' + q.label + '). Cada métrica só pode ser alimentada por uma pergunta.');
      }
      byTracks[q.tracks] = q.label;
    });
    if (err) return { ok: false, error: err };
    COACH.checkinTemplate = cloneJSON(template);
    if (steps && steps.length) COACH.checkinSteps = cloneJSON(steps);
    if (global.TracklyStore) {
      TracklyStore.saveCoachSettings({ checkinTemplate: COACH.checkinTemplate, checkinSteps: COACH.checkinSteps });
    }
    return { ok: true };
  }

  // ---------------- respostas de uma semana, prontas pra leitura ----------------
  // Registro histórico, não formulário: mostra TUDO que foi respondido naquela semana, sem filtrar
  // por tracking/gênero/ativo. Uma pergunta desativada — ou apagada do template depois — continua
  // legível; sem rótulo no template, humaniza a própria chave. Ordem = a ordem atual do template
  // (com o que não está mais no template no fim).
  function humanizeKey(key) {
    return String(key).split(/[-_]+/).filter(Boolean).map(function (p) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(" ");
  }
  function qaAnswerRows(client, week) {
    var qa = (week && week.qa) || {};
    var rows = [], seen = {};
    function usable(v) { return v != null && String(v).trim() !== ""; }
    (COACH.checkinTemplate || []).forEach(function (q) {
      if (q.type === "photos" || seen[q.key] || !usable(qa[q.key])) return;
      seen[q.key] = true;
      rows.push({ key: q.key, label: q.label, value: qa[q.key] });
    });
    Object.keys(qa).forEach(function (k) {
      if (seen[k] || !usable(qa[k])) return;
      seen[k] = true;
      rows.push({ key: k, label: humanizeKey(k), value: qa[k] });
    });
    return rows;
  }

  // ================================================================
  // Ações do usuário: persistem via TracklyStore e mutam o estado em memória na hora,
  // pra tela reagir sem precisar de reload — e sobreviver ao reload quando ele acontecer.
  // ================================================================

  // V8 §33 — bug de persistência corrigido: o wizard de check-in só mostrava a tela de
  // sucesso, sem gravar nada. Agora atualiza status/metrics/qa da semana e persiste.
  // V14 §6 — generalizado: o wizard não manda mais campos fixos (weight/adherence/...), manda
  // `payload.metrics` (o que cada pergunta do template escreveu, pela sua própria `tracks`) e
  // `payload.qa` (todo o resto). Este função não sabe mais quais perguntas existem — só aplica
  // o que chegou. cur.metrics só ganha as chaves que o template realmente escreveu essa semana;
  // o resto da semana (ex.: peso, quando "peso" está desativado) continua com o valor anterior.
  function submitCheckin(clientId, payload) {
    var client = getClient(clientId);
    var cur = currentWeek(client);
    if (!cur) return;
    var now = new Date();
    cur.checkin.status = "submitted";
    cur.checkin.submittedAt = now;
    var metrics = payload.metrics || {};
    Object.keys(metrics).forEach(function (k) {
      if (metrics[k] != null) cur.metrics[k] = metrics[k];
    });
    var actualMap = { water: cur.metrics.water, sleep: cur.metrics.sleep, workouts: cur.metrics.workouts, cardio: cur.metrics.cardio, adherence: cur.metrics.adherence };
    cur.goals.forEach(function (g) {
      if (actualMap[g.key] != null) { g.actual = actualMap[g.key]; g.status = goalStatus(g.actual, g.target, g.mode); }
    });
    cur.qa = Object.assign({}, cur.qa, payload.qa || {});
    cur._userAuthored = true; cur._userCheckin = true;
    // transição do ciclo: aguardando -> recebido. Com guarda de ordem, como toda transição:
    // reenviar o check-in de uma semana que o coach já abriu não pode devolvê-la pra "recebido".
    if (cycleRank(cycleStatusOf(cur)) < cycleRank(CYCLE_STATUS.CHECKIN_RECEIVED)) {
      stampCycleStatus(cur, CYCLE_STATUS.CHECKIN_RECEIVED, now);
    }
    notify("checkin_received", clientId); // TODO §21 — avisa o coach in-app (+ WhatsApp declarado)

    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        weekContent: weekContentPatchFor(client), // por semana — um 2º check-in não apaga o 1º
        cycles: cyclePatchFor(client)
      });
    }
  }

  // fotografia completa da máquina de estados do aluno — é o que vai pro localStorage em toda
  // mutação que mexe no ciclo (mesmo padrão "muta em memória e grava a mesma forma" das outras).
  function toISO(d) { return d instanceof Date ? d.toISOString() : (d || null); }
  function cyclePatchFor(client) {
    var out = {};
    client.weeks.forEach(function (w) {
      out[w.weekNumber] = {
        status: cycleStatusOf(w),
        start: toISO(w.start), end: toISO(w.end),
        history: (w.cycleStatusHistory || []).map(function (h) { return { status: h.status, at: toISO(h.at) }; })
      };
    });
    return out;
  }
  function goalTargetsOf(week) {
    var out = {};
    (week.goals || []).forEach(function (g) { if (g.target != null) out[g.key] = g.target; });
    return out;
  }
  // Conteúdo escrito pelo coach, POR SEMANA. Como o ciclo agora pode fechar várias semanas na
  // mesma sessão, guardar "a orientação" como campo único do aluno sobrescrevia a anterior e a
  // semana antiga voltava vazia no reload — cada semana precisa do seu próprio registro.
  // Só entram semanas tocadas pelo usuário (`_userAuthored`): o texto fictício continua sendo
  // gerado por data.js, nunca congelado no localStorage.
  function weekContentPatchFor(client) {
    var out = {};
    client.weeks.forEach(function (w) {
      if (!w._userAuthored) return;
      out[w.weekNumber] = {
        // check-in enviado pelo aluno NESTA semana (só o que o usuário mandou; o check-in
        // fictício continua sendo gerado). Guardar um "último envio" por aluno fazia a semana
        // anterior voltar do reload como se ninguém tivesse respondido.
        checkin: w._userCheckin ? {
          submittedAt: toISO(w.checkin.submittedAt),
          metrics: { weight: w.metrics.weight, adherence: w.metrics.adherence, workouts: w.metrics.workouts, cardio: w.metrics.cardio, water: w.metrics.water, sleep: w.metrics.sleep },
          qa: w.qa || {}
        } : null,
        orientation: w.orientation || null,
        focus: w.focusOverride || null,
        coachNote: w.coachReview ? w.coachReview.note : null,
        completedAt: toISO(w.orientationSentAt),
        completedTime: w.orientationSentTime || null,
        goals: goalTargetsOf(w), // metas em vigor NESTA semana (não "as da última revisão")
        draft: w.orientationDraft ? {
          orientation: w.orientationDraft.orientation,
          focusOverride: w.orientationDraft.focusOverride,
          nextGoals: w.orientationDraft.nextGoals,
          note: w.orientationDraft.note,
          savedAt: toISO(w.orientationDraft.savedAt)
        } : null
      };
    });
    return out;
  }

  // Fecha o ciclo da semana em uma única ação: conteúdo da orientação -> `orientation_sent`
  // (fato registrado na trilha) -> `completed` (estado de repouso) -> próxima semana nasce.
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
    cur.orientationDraft = null; // o rascunho virou orientação enviada
    cur._userAuthored = true;
    stampCycleStatus(cur, CYCLE_STATUS.ORIENTATION_SENT, now);
    stampCycleStatus(cur, CYCLE_STATUS.COMPLETED, now);
    notify("orientation_ready", clientId); // TODO §21 — avisa o aluno in-app (+ WhatsApp declarado)
    var next = ensureNextWeek(client, cur, nextGoals); // as metas recém-definidas já valem pra ela
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        weekContent: weekContentPatchFor(client), // por semana — nunca sobrescreve um ciclo anterior
        cycles: cyclePatchFor(client),
        nextGoals: nextGoals // legado: só usado quando não existe semana seguinte pra carregar as metas
      });
    }
    return next;
  }

  // NOVO (V13) — o coach salva o que escreveu sem enviar pro aluno.
  // Guarda os MESMOS campos que completeOrientation grava (orientation, focusOverride, nextGoals),
  // só que dentro de `week.orientationDraft`: enquanto não for enviado, `week.orientation` PRECISA
  // continuar null — é ele que o aluno vê na home e que needsReview()/clientStage() usam pra saber
  // que o ciclo ainda está aberto. Não carimba orientationSentAt e não cria a próxima semana.
  function saveOrientationDraft(clientId, weekNumber, payload) {
    var client = getClient(clientId);
    var week = weekNumber != null ? weekByNumber(client, weekNumber) : currentWeek(client);
    if (!week || week.orientation) return null; // semana já concluída não volta a ser rascunho
    payload = payload || {};
    var now = new Date();
    week.orientationDraft = {
      orientation: payload.orientation || "",
      focusOverride: payload.focusOverride || null,
      nextGoals: payload.nextGoals || {},
      note: payload.note != null ? payload.note : (week.orientationDraft ? week.orientationDraft.note : null),
      savedAt: now
    };
    week._userAuthored = true;
    // só é transição na primeira vez que o rascunho aparece; salvar de novo não polui a trilha
    if (cycleRank(cycleStatusOf(week)) < cycleRank(CYCLE_STATUS.ORIENTATION_DRAFT)) {
      stampCycleStatus(week, CYCLE_STATUS.ORIENTATION_DRAFT, now);
    }
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        weekContent: weekContentPatchFor(client),
        cycles: cyclePatchFor(client)
      });
    }
    return week;
  }

  function sendReminder(clientId) {
    var now = new Date();
    var client = getClient(clientId);
    client.remindedAt = now; client.remindedTime = fmtTime(now);
    notify("checkin_overdue", clientId); // TODO §21 — avisa o aluno in-app (+ WhatsApp declarado)
    if (global.TracklyStore) TracklyStore.patchClient(clientId, { remindedAt: now.toISOString(), remindedTime: client.remindedTime });
  }

  // V10 — registra que o coach abriu a avaliação (mas ainda não enviou), pra diferenciar
  // "Avaliar agora" de "Continuar avaliação" em toda a interface.
  // V13 — é também a transição checkin_received -> under_review. Idempotente: só transiciona
  // quando a semana está exatamente em `checkin_received`, então reabrir a revisão de uma semana
  // que já tem rascunho/orientação enviada NUNCA a rebaixa pra "em avaliação".
  function markUnderReview(clientId, weekNumber) {
    var client = getClient(clientId);
    var week = weekNumber != null ? weekByNumber(client, weekNumber) : currentWeek(client);
    if (!week) return null;
    if (cycleStatusOf(week) !== CYCLE_STATUS.CHECKIN_RECEIVED) return week;
    var now = new Date();
    if (!week.reviewOpenedAt) week.reviewOpenedAt = now;
    stampCycleStatus(week, CYCLE_STATUS.UNDER_REVIEW, now);
    if (global.TracklyStore) {
      TracklyStore.patchClient(clientId, {
        reviewOpenedAt: week.reviewOpenedAt.toISOString(), reviewOpenedWeek: week.weekNumber,
        cycles: cyclePatchFor(client)
      });
    }
    return week;
  }
  function markReviewOpened(clientId) { return markUnderReview(clientId, null); } // nome antigo, mesmo efeito

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
      client.weeks = buildWeeks(firstWeekSeedConfig(now, { waist: client.tracking.measurements }));
      attachQA(client);
      backfillCycleHistory(client);
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
      remindedAt: m.remindedAt ? new Date(m.remindedAt) : null, remindedTime: m.remindedTime || null,
      // aluno criado manualmente ainda não tem plano/cobrança — nunca `undefined`, pra todo código
      // que lê paymentsHistory (dashboard do aluno, financeiro, cliente.html) enxergar um estado
      // "sem plano ainda" em vez de estourar (TODO §34: estado vazio, não exceção).
      plan: null, paymentsHistory: [], paymentsEvents: [], subscriptionStatus: null
    };
    if (client.inviteStatus === "active") {
      var now = client.activatedAt || new Date();
      client.weeks = buildWeeks(firstWeekSeedConfig(now));
      attachQA(client);
      backfillCycleHistory(client);
    }
    return client;
  }

  // reaplica por cima dos dados fictícios tudo o que o usuário já fez nesta sessão/navegador —
  // orientações enviadas, lembretes, alunos criados na hora. Roda uma vez, no carregamento.
  // recria as semanas que nasceram do ciclo em outra sessão (completeOrientation -> próxima semana):
  // o gerador fictício só conhece as semanas originais, então elas precisam voltar na reidratação.
  function restoreSeededWeeks(client, cycles, weekContent, legacyGoals) {
    if (!cycles) return;
    Object.keys(cycles).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      if (weekByNumber(client, n)) return;
      var prev = weekByNumber(client, n - 1);
      if (!prev) return; // nunca inventa buraco no histórico
      var meta = cycles[n] || {};
      var start = meta.start ? new Date(meta.start) : addDays(prev.end, 1);
      var end = meta.end ? new Date(meta.end) : addDays(start, 6);
      // metas DAQUELA semana — usar um único conjunto pra todas as semanas restauradas
      // regravava os alvos errados e remexia no resultado (success/partial/fail) já apurado.
      var content = weekContent && weekContent[n];
      var targets = content && content.goals ? content.goals : legacyGoals;
      var week = seedWeekRecord(n, start, end, prev, targets);
      week._userAuthored = true;
      client.weeks.push(week);
    });
  }

  // reaplica um check-in enviado pelo aluno numa semana — um lugar só, usado tanto pelo formato
  // por semana quanto pelo campo único antigo.
  function applyStoredCheckin(week, stored) {
    week.checkin.status = "submitted";
    week.checkin.submittedAt = new Date(stored.submittedAt);
    Object.assign(week.metrics, stored.metrics);
    var actualMap = { water: week.metrics.water, sleep: week.metrics.sleep, workouts: week.metrics.workouts, cardio: week.metrics.cardio, adherence: week.metrics.adherence };
    week.goals.forEach(function (g) {
      if (actualMap[g.key] != null) { g.actual = actualMap[g.key]; g.status = goalStatus(g.actual, g.target, g.mode); }
    });
    week.qa = Object.assign({}, week.qa, stored.qa || {});
    week._userAuthored = true; week._userCheckin = true;
    if (cycleRank(cycleStatusOf(week)) < cycleRank(CYCLE_STATUS.CHECKIN_RECEIVED)) {
      stampCycleStatus(week, CYCLE_STATUS.CHECKIN_RECEIVED, week.checkin.submittedAt);
    }
    return week;
  }

  // conteúdo do coach por semana (orientação, foco, nota, metas, rascunho) + check-in do aluno
  function restoreWeekContent(client, weekContent) {
    if (!weekContent) return;
    Object.keys(weekContent).forEach(function (n) {
      var week = weekByNumber(client, Number(n));
      var stored = weekContent[n];
      if (!week || !stored) return;
      week._userAuthored = true;
      if (stored.goals) {
        // antes da restauração do check-in, pra que goalStatus() seja recalculado contra o alvo certo
        week.goals.forEach(function (g) { if (stored.goals[g.key] != null) g.target = stored.goals[g.key]; });
      }
      if (stored.checkin && week.checkin.status !== "submitted") {
        applyStoredCheckin(week, stored.checkin);
      }
      if (stored.orientation && !week.orientation) {
        week.orientation = stored.orientation;
        week.focusOverride = stored.focus || null;
        if (stored.completedAt) {
          week.orientationSentAt = new Date(stored.completedAt);
          week.orientationSentTime = stored.completedTime || fmtTime(week.orientationSentAt);
        }
        week.orientationDraft = null;
        if (cycleRank(cycleStatusOf(week)) < cycleRank(CYCLE_STATUS.COMPLETED)) {
          var sentAt = week.orientationSentAt || new Date();
          stampCycleStatus(week, CYCLE_STATUS.ORIENTATION_SENT, sentAt);
          stampCycleStatus(week, CYCLE_STATUS.COMPLETED, sentAt);
        }
      }
      if (stored.coachNote && !week.coachReview) week.coachReview = { note: stored.coachNote };
      if (stored.draft && !week.orientation) {
        week.orientationDraft = {
          orientation: stored.draft.orientation || "",
          focusOverride: stored.draft.focusOverride || null,
          nextGoals: stored.draft.nextGoals || {},
          note: stored.draft.note || null,
          savedAt: stored.draft.savedAt ? new Date(stored.draft.savedAt) : null
        };
        if (cycleRank(cycleStatusOf(week)) < cycleRank(CYCLE_STATUS.ORIENTATION_DRAFT)) {
          stampCycleStatus(week, CYCLE_STATUS.ORIENTATION_DRAFT, week.orientationDraft.savedAt || new Date());
        }
      }
    });
  }
  // reaplica estado + trilha guardados, sem nunca rebaixar uma semana
  function restoreCycles(client, cycles) {
    if (!cycles) return;
    Object.keys(cycles).forEach(function (n) {
      var week = weekByNumber(client, Number(n));
      var stored = cycles[n];
      if (!week || !stored || !stored.status) return;
      if (cycleRank(stored.status) < cycleRank(cycleStatusOf(week))) return;
      week.cycleStatus = stored.status;
      if (stored.history && stored.history.length) {
        week.cycleStatusHistory = stored.history.map(function (h) { return { status: h.status, at: new Date(h.at) }; });
      }
    });
  }

  function applyStoredOverrides() {
    if (!global.TracklyStore) return;
    var s = TracklyStore.get();
    restoreNotifications(s.notifications); // lista achatada — não passa pelo loop de CLIENTS abaixo
    // template do check-in editado pelo coach (coach/checkin-config.html) — sobrescreve o
    // default só quando existe algo salvo; senão COACH.checkinTemplate/checkinSteps ficam
    // no default já atribuído acima.
    if (s.coachSettings) {
      if (s.coachSettings.checkinTemplate && s.coachSettings.checkinTemplate.length) COACH.checkinTemplate = cloneJSON(s.coachSettings.checkinTemplate);
      if (s.coachSettings.checkinSteps && s.coachSettings.checkinSteps.length) COACH.checkinSteps = cloneJSON(s.coachSettings.checkinSteps);
    }
    // alunos criados manualmente precisam existir em CLIENTS ANTES do loop de patches abaixo —
    // senão todo patch salvo pra eles (treino, nutrição, orientação, pagamento...) é lido de
    // `s.clients[c.id]` mas nunca aplicado, porque `c` ainda não existia em CLIENTS nesse momento
    // (bug real encontrado na validação do item 36: sobrevivia o check-in seed inicial porque
    // acceptInvite regenera as semanas do zero a cada load, mas qualquer mutação incremental —
    // protocolo de treino montado, orientação enviada, plano editado — sumia a cada reload).
    (s.manualClients || []).forEach(function (m) {
      if (CLIENTS.some(function (c) { return c.id === m.id; })) return;
      CLIENTS.push(instantiateManualClient(m));
    });
    CLIENTS.forEach(function (c) {
      var patch = s.clients[c.id];
      if (!patch || !c.weeks.length) return;
      if (patch.nextGoals) c._nextGoals = patch.nextGoals;
      var baseWeek = currentWeek(c); // última semana gerada — a que os patches ANTIGOS (sem weekNumber) descrevem
      restoreSeededWeeks(c, patch.cycles, patch.weekContent, patch.nextGoals); // pode empurrar a semana atual pra frente
      restoreWeekContent(c, patch.weekContent); // metas/orientação por semana, antes de reapurar o check-in
      var legacy = !patch.weekContent; // estado salvo antes do conteúdo por semana — migra no próximo save
      var checkinWeek = (legacy && patch.checkinSubmitted) ? weekByNumber(c, patch.checkinSubmitted.weekNumber) : null;
      if (checkinWeek && checkinWeek.checkin.status !== "submitted") {
        applyStoredCheckin(checkinWeek, patch.checkinSubmitted);
      }
      // --- compatibilidade: estados salvos antes do conteúdo por semana (campos únicos no aluno).
      // Ao restaurar, a semana é marcada como _userAuthored, então o próximo save já migra
      // esse conteúdo pro mapa weekContent e ele deixa de ser sobrescrito por ciclos seguintes.
      var orientationWeek = weekByNumber(c, patch.orientationWeek) || baseWeek;
      if (legacy && patch.orientation && orientationWeek && !orientationWeek.orientation) {
        orientationWeek.orientation = patch.orientation;
        orientationWeek.focusOverride = patch.focus || null;
        if (patch.completedAt) { orientationWeek.orientationSentAt = new Date(patch.completedAt); orientationWeek.orientationSentTime = patch.completedTime || fmtTime(orientationWeek.orientationSentAt); }
        if (patch.coachNote) orientationWeek.coachReview = { note: patch.coachNote };
        orientationWeek.orientationDraft = null;
        orientationWeek._userAuthored = true;
        if (cycleRank(cycleStatusOf(orientationWeek)) < cycleRank(CYCLE_STATUS.COMPLETED)) {
          var sentAt = orientationWeek.orientationSentAt || new Date();
          stampCycleStatus(orientationWeek, CYCLE_STATUS.ORIENTATION_SENT, sentAt);
          stampCycleStatus(orientationWeek, CYCLE_STATUS.COMPLETED, sentAt);
        }
      }
      if (legacy && patch.orientationDraft) {
        var draftWeek = weekByNumber(c, patch.orientationDraft.weekNumber) || baseWeek;
        if (draftWeek && !draftWeek.orientation) {
          draftWeek._userAuthored = true;
          draftWeek.orientationDraft = {
            orientation: patch.orientationDraft.orientation || "",
            focusOverride: patch.orientationDraft.focusOverride || null,
            nextGoals: patch.orientationDraft.nextGoals || {},
            note: patch.orientationDraft.note || null,
            savedAt: patch.orientationDraft.savedAt ? new Date(patch.orientationDraft.savedAt) : null
          };
          if (cycleRank(cycleStatusOf(draftWeek)) < cycleRank(CYCLE_STATUS.ORIENTATION_DRAFT)) {
            stampCycleStatus(draftWeek, CYCLE_STATUS.ORIENTATION_DRAFT, draftWeek.orientationDraft.savedAt || new Date());
          }
        }
      }
      if (patch.reviewOpenedAt) {
        var reviewWeek = weekByNumber(c, patch.reviewOpenedWeek) || baseWeek;
        if (reviewWeek && !reviewWeek.orientation) {
          reviewWeek.reviewOpenedAt = new Date(patch.reviewOpenedAt);
          if (cycleRank(cycleStatusOf(reviewWeek)) < cycleRank(CYCLE_STATUS.UNDER_REVIEW)) {
            stampCycleStatus(reviewWeek, CYCLE_STATUS.UNDER_REVIEW, reviewWeek.reviewOpenedAt);
          }
        }
      }
      restoreCycles(c, patch.cycles); // estado/trilha completos por último — nunca rebaixam
      if (patch.remindedAt) { c.remindedAt = new Date(patch.remindedAt); c.remindedTime = patch.remindedTime; }
      if (patch.workoutHistory) {
        Object.keys(patch.workoutHistory).forEach(function (exId) {
          var h = patch.workoutHistory[exId];
          c.workoutHistory[exId] = { lastLoad: h.lastLoad, lastReps: h.lastReps, lastDate: new Date(h.lastDate) };
        });
      }
      if (patch.weekWorkoutsDone != null) c._weekWorkoutsDone = patch.weekWorkoutsDone;
      if (patch.workoutProtocol) c.workout = patch.workoutProtocol;
      if (patch.tracking) c.tracking = patch.tracking;
      if (patch.nutritionPlan) c.nutritionPlan = patch.nutritionPlan;
      if (patch.paymentSettled) {
        var pay = c.paymentsHistory.filter(function (p) { return p.id === patch.paymentSettled.paymentId; })[0];
        if (pay && pay.status !== "paid") {
          pay.status = "paid";
          pay.paidDate = new Date(patch.paymentSettled.paidDate);
          pay.method = patch.paymentSettled.method;
        }
      }
      // TODO §22 — plano editado, situação da assinatura, reembolsos e o log de eventos.
      if (patch.plan) c.plan = patch.plan;
      if (patch.subscriptionStatus) c.subscriptionStatus = patch.subscriptionStatus;
      if (patch.paymentsRefunded) {
        patch.paymentsRefunded.forEach(function (r) {
          var refundedPay = c.paymentsHistory.filter(function (p) { return p.id === r.paymentId; })[0];
          if (refundedPay && refundedPay.status !== "refunded") {
            refundedPay.status = "refunded";
            refundedPay.refundedAt = r.refundedAt ? new Date(r.refundedAt) : new Date();
          }
        });
      }
      if (patch.paymentsEvents) {
        c.paymentsEvents = patch.paymentsEvents.map(function (e) {
          return Object.assign({}, e, { timestamp: e.timestamp ? new Date(e.timestamp) : new Date() });
        });
      }
    });
  }
  applyStoredOverrides();

  // metas "em vigor" pra próxima semana: usa o que o coach acabou de definir na revisão mais
  // recente (se houver), senão cai pros targets da semana atual — mesmo comportamento de antes.
  function effectiveGoals(client, week) {
    week = week || currentWeek(client);
    if (!week) return [];
    // Quando o ciclo daquela semana já foi fechado, as metas em vigor são as da semana SEGUINTE —
    // ela nasceu justamente com os alvos definidos na revisão. Sem isso, a home do aluno mostrava
    // as metas antigas ao lado da orientação nova (a semana de referência já não é a atual).
    var source = week;
    var next = weekByNumber(client, week.weekNumber + 1);
    if (next && cycleStatusOf(week) === CYCLE_STATUS.COMPLETED) source = next;
    var base = trackedGoals(source, client).filter(function (g) { return g.key !== "adherence"; });
    if (client._nextGoals && source === currentWeek(client)) {
      return base.map(function (g) { return Object.assign({}, g, { target: client._nextGoals[g.key] != null ? client._nextGoals[g.key] : g.target }); });
    }
    return base;
  }

  global.Trackly = {
    ANCHOR: ANCHOR, COACH: COACH, CLIENTS: CLIENTS,
    fmtDate: fmtDate, fmtShort: fmtShort, fmtTime: fmtTime, relativeLabel: relativeLabel, round1: round1, clamp: clamp, avg: avg,
    getClient: getClient,
    currentWeek: currentWeek, needsReview: needsReview, isLate: isLate, suggestOrientation: suggestOrientation,
    CYCLE_STATUS: CYCLE_STATUS, cycleStatusOf: cycleStatusOf, isNextCheckinDue: isNextCheckinDue, seedWeekRecord: seedWeekRecord,
    isCheckinOverdue: isCheckinOverdue, checkinOpensOn: checkinOpensOn,
    computeStatus: computeStatus, computeKPIs: computeKPIs, isGoodWeightDelta: isGoodWeightDelta,
    weeksInRange: weeksInRange, buildPeriodSummary: buildPeriodSummary, recentWeeksTable: recentWeeksTable,
    buildCoachMemory: buildCoachMemory, trendLine: trendLine,
    getCheckinWindowStatus: getCheckinWindowStatus, nextOpenDate: nextOpenDate,
    whatsappUrl: whatsappUrl, checkinNudgeMessage: checkinNudgeMessage, checkinReminderMessage: checkinReminderMessage,
    checkinReceivedMessageForCoach: checkinReceivedMessageForCoach, orientationReadyMessageForStudent: orientationReadyMessageForStudent,
    checkInInsights: checkInInsights, focusLabel: focusLabel, focusLabelFromOrientation: focusLabelFromOrientation, focusIntro: focusIntro,
    studentUpdate: studentUpdate, buildWeeklySnapshot: buildWeeklySnapshot, clientStage: clientStage,
    isTracked: isTracked, trackedGoals: trackedGoals, effectiveGoals: effectiveGoals, TRACKING_DEFAULT: TRACKING_DEFAULT,
    checkinTemplateFor: checkinTemplateFor, saveCheckinTemplate: saveCheckinTemplate,
    completeOrientation: completeOrientation, submitCheckin: submitCheckin, sendReminder: sendReminder,
    markReviewOpened: markReviewOpened, markUnderReview: markUnderReview, saveOrientationDraft: saveOrientationDraft,
    createClient: createClient, sendInvite: sendInvite, acceptInvite: acceptInvite,
    EXERCISE_LIBRARY: EXERCISE_LIBRARY, getExercise: getExercise,
    logWorkoutSession: logWorkoutSession, todaysWorkoutDay: todaysWorkoutDay, saveWorkoutProtocol: saveWorkoutProtocol,
    saveTrackingSettings: saveTrackingSettings,
    todaysMeals: todaysMeals, saveNutritionPlan: saveNutritionPlan,
    paymentProvider: paymentProvider, currentPayment: currentPayment,
    overduePaymentMessage: overduePaymentMessage, simulatePayment: simulatePayment,
    savePlan: savePlan, setSubscriptionStatus: setSubscriptionStatus, refundPayment: refundPayment,
    notify: notify, getNotifications: getNotifications, unreadNotificationCount: unreadNotificationCount,
    markNotificationRead: markNotificationRead, markAllNotificationsRead: markAllNotificationsRead
  };
})(window);
