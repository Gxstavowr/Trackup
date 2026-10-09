/* Trackly — persistência local do protótipo.
   Guarda só o que muta por interação do usuário (check-in enviado, avaliação aberta, rascunho de
   orientação, orientação enviada, estado/trilha do ciclo semanal em `cycles`, metas da próxima
   semana, lembretes, alunos criados na hora) — os dados fictícios de base continuam gerados por
   data.js, que reaplica estes patches por cima no load (applyStoredOverrides).
   Isso é o suficiente pra simular um backend real sem precisar de um: a ação do coach sobrevive
   à navegação e ao reload, exatamente como aconteceria com um servidor de verdade. */
(function (global) {
  "use strict";
  var KEY = "trackly_v4_state";

  // Dados que NUNCA vão pro localStorage (regra do projeto): dados pessoais (e-mail/telefone) e
  // histórico de transações financeiras. Removidos aqui, na única porta de escrita/leitura — vale
  // pra qualquer chamador e também limpa o que já estava salvo antes desta regra.
  var PERSONAL_FIELDS = ["email", "phone", "cpf", "address"];
  var FINANCIAL_FIELDS = ["paymentSettled", "paymentsRefunded", "paymentsEvents", "paymentsHistory"];

  function omit(obj, fields) {
    if (!obj || typeof obj !== "object") return obj;
    var out = Object.assign({}, obj);
    fields.forEach(function (f) { delete out[f]; });
    return out;
  }
  function sanitize(state) {
    var s = Object.assign({}, state);
    if (Array.isArray(s.manualClients)) {
      s.manualClients = s.manualClients.map(function (c) { return omit(c, PERSONAL_FIELDS); });
    }
    if (s.clients && typeof s.clients === "object") {
      var clients = {};
      Object.keys(s.clients).forEach(function (id) {
        clients[id] = omit(s.clients[id], PERSONAL_FIELDS.concat(FINANCIAL_FIELDS));
      });
      s.clients = clients;
    }
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      var clean = sanitize(parsed);
      if (JSON.stringify(clean) !== raw) localStorage.setItem(KEY, JSON.stringify(clean)); // limpa dado antigo
      return clean;
    } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(sanitize(state))); } catch (e) { /* localStorage indisponível — degrada pra sessão em memória */ }
  }

  function get() {
    var s = load();
    s.clients = s.clients || {};
    s.manualClients = s.manualClients || [];
    s.coachSettings = s.coachSettings || null;
    s.notifications = s.notifications || [];
    return s;
  }

  function patchClient(id, patch) {
    var s = get();
    s.clients[id] = Object.assign({}, s.clients[id] || {}, patch);
    save(s);
    return s.clients[id];
  }

  function addManualClient(client) {
    var s = get();
    s.manualClients.push(client);
    save(s);
    return client;
  }

  function updateManualClient(id, patch) {
    var s = get();
    s.manualClients = s.manualClients.map(function (c) { return c.id === id ? Object.assign({}, c, patch) : c; });
    save(s);
    return s.manualClients.filter(function (c) { return c.id === id; })[0];
  }

  // V14 — configuração do check-in (COACH.checkinTemplate/checkinSteps), mesmo padrão de
  // patchClient: mescla por cima do que já existir e persiste o objeto inteiro.
  function saveCoachSettings(patch) {
    var s = get();
    s.coachSettings = Object.assign({}, s.coachSettings || {}, patch);
    save(s);
    return s.coachSettings;
  }

  // V17 — camada de notificações (TODO §21): lista achatada, independente de client/manualClients
  // (não é dado reconstruído por data.js a cada load, então não passa por patchClient). Grava a
  // lista inteira, mesmo padrão de saveCoachSettings — pequena o bastante pra não precisar de merge.
  function saveNotifications(list) {
    var s = get();
    s.notifications = list || [];
    save(s);
    return s.notifications;
  }

  function clearAll() { try { localStorage.removeItem(KEY); } catch (e) {} }

  global.TracklyStore = {
    get: get, save: save, patchClient: patchClient, addManualClient: addManualClient, updateManualClient: updateManualClient,
    saveCoachSettings: saveCoachSettings, saveNotifications: saveNotifications, clearAll: clearAll
  };
})(window);
