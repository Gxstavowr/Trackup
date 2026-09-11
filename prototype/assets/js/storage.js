/* Trackly — persistência local do protótipo.
   Guarda só o que muta por interação do usuário (orientação enviada, metas da próxima semana,
   lembretes, alunos criados na hora) — os dados fictícios de base continuam gerados por data.js.
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

  function clearAll() { try { localStorage.removeItem(KEY); } catch (e) {} }

  global.TracklyStore = { get: get, save: save, patchClient: patchClient, addManualClient: addManualClient, updateManualClient: updateManualClient, clearAll: clearAll };
})(window);
