/* Trackly — service worker do PORTAL DO ALUNO (TODO #33).
 * Escopo: registrado a partir de /portal/sw.js, então por padrão só controla
 * /portal/* (nunca /coach/ nem a landing) — é exatamente o escopo que
 * queremos para "o PWA do aluno".
 *
 * Protótipo estático, sem API/backend real: nada de workbox, background-sync
 * ou IndexedDB aqui — só um precache da shell do portal + estratégia
 * cache-first (com fallback de rede) pra abrir instantâneo, e um runtime
 * cache pra tudo que não foi precacheado explicitamente.
 *
 * Versionamento: segue o mesmo padrão manual de "?v=NN" já usado nos
 * <link>/<script> das páginas — bump o número abaixo quando os assets
 * mudarem de versão (hoje: css v15, storage.js v13, data.js v16, icons.js
 * v12, charts.js v13, nav.js v14). Lembrete pra próxima mudança: bumpar
 * CACHE_VERSION junto, senão o SW continua servindo os bytes antigos pro
 * navigator mesmo com o arquivo já atualizado no disco (foi exatamente o
 * que mascarou o bug do drawer/toast/tooltip com tema errado no portal
 * até essa auditoria — TODO §30).
 */
"use strict";

var CACHE_VERSION = "trackly-portal-v8";

/* Shell do portal — HTML, CSS, JS, manifest e ícones. Caminhos relativos a
 * este arquivo (portal/sw.js), incluindo as mesmas query strings "?v=NN"
 * usadas nas tags das páginas, pra já entrar em cache com a versão certa. */
var PRECACHE_URLS = [
  "./dashboard.html",
  "./checkin.html",
  "./treino.html",
  "./nutricao.html",
  "./evolucao.html",
  "./historico.html",
  "./conta.html",
  "./pagamento.html",
  "./manifest.json",
  "../assets/css/base.css?v=15",
  "../assets/css/portal.css?v=15",
  "../assets/js/storage.js?v=13",
  "../assets/js/data.js?v=16",
  "../assets/js/icons.js?v=12",
  "../assets/js/charts.js?v=13",
  "../assets/js/nav.js?v=14",
  "../assets/icons/icon-192.png",
  "../assets/icons/icon-512.png",
  "../assets/icons/icon-maskable-512.png",
  "../assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_VERSION; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Cache-first + fallback de rede: prioriza "parecer instantâneo" (TODO #33 —
 * "a experiência deve ser rápida"). Respostas de rede bem-sucedidas (GET,
 * mesma origem) alimentam o runtime cache pra próxima visita/offline. */
self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // deixa fonts/CDNs passarem direto pra rede

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        // offline e sem cache: para navegação, cai pro dashboard como shell básico
        if (request.mode === "navigate") return caches.match("./dashboard.html");
        return undefined;
      });
    })
  );
});

/* ---------------------------------------------------------------------
 * Estrutura para push notifications (TODO #33 — "preparar estrutura para
 * push notifications"). Não há backend real neste protótipo, então isto é
 * só o "encaixe" do lado do service worker: se um push chegasse com um
 * payload JSON { title, body, url }, exibiria uma notificação nativa.
 * Falta, para uma implementação real: subscrever via
 * self.registration.pushManager.subscribe(...) com uma VAPID key de um
 * backend de verdade, e enviar essa subscription pro servidor — fora de
 * escopo aqui (ver item 21 do task list, que fica simulado no client).
 * ------------------------------------------------------------------- */
self.addEventListener("push", function (event) {
  var data = { title: "Trackly", body: "Você tem uma novidade no seu acompanhamento." };
  if (event.data) {
    try { data = Object.assign(data, event.data.json()); } catch (e) { data.body = event.data.text() || data.body; }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "../assets/icons/icon-192.png",
      badge: "../assets/icons/icon-192.png",
      data: { url: data.url || "./dashboard.html" }
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "./dashboard.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf(target.replace("./", "")) !== -1 && "focus" in clients[i]) {
          return clients[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
