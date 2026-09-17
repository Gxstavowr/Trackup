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

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* localStorage indisponível — degrada pra sessão em memória */ }
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
