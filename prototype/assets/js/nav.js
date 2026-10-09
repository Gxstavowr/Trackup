/* Trackly — shell de navegação compartilhado (sidebar do coach, tab bar do portal,
   barra de demonstração). Protótipo estático: sem router, então cada função monta HTML
   e recebe o caminho relativo até assets/ para funcionar em qualquer profundidade de pasta. */
(function (global) {
  "use strict";
  var I = global.ICONS;

  function brandMark(root) {
    return (
      '<a href="' + root + 'index.html" class="brand">' +
      '<svg width="26" height="26" viewBox="0 0 26 26" fill="none">' +
      '<path d="M3 17l5.5-6.5L13 15l8.5-10.5" stroke="var(--brand)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="21.5" cy="4.8" r="2.1" fill="var(--brand)"/>' +
      '</svg><span>Trackly<small>Acompanhamento contínuo</small></span></a>'
    );
  }

  function demoBar(root, mode) {
    var other = mode === "coach"
      ? '<a href="' + root + 'portal/dashboard.html">ver como cliente (João)</a>'
      : '<a href="' + root + 'coach/dashboard.html">ver como coach</a>';
    return '<div class="demo-bar"><strong>Modo demonstração</strong><span class="db-hide">·</span><span class="db-hide">dados fictícios</span><span>·</span>' + other + '<span class="db-hide">·</span><a class="db-hide" href="' + root + 'index.html">sobre o Trackly</a></div>';
  }

  function coachShell(root, active, client) {
    // ordem fixa do fluxo principal (V18 §6): Acompanhamento -> Avaliações -> Alunos -> Financeiro.
    // Configurações fica fora daqui de propósito — só é alcançável pelo chip do coach no rodapé,
    // nunca como item deste grupo (não é fluxo operacional).
    var items = [
      { key: "dashboard", label: "Acompanhamento", href: root + "coach/dashboard.html", icon: I.grid },
      { key: "avaliacoes", label: "Avaliações", href: root + "coach/avaliacoes.html", icon: I.clipboard },
      { key: "clientes", label: "Alunos", href: root + "coach/clientes.html", icon: I.users },
      { key: "financeiro", label: "Financeiro", href: root + "coach/financeiro.html", icon: I.wallet }
    ];
    // badge de pendências de avaliação (V18 §7) — mesmo padrão visual do sino de notificações
    // (.notif-badge), só que ancorado no próprio item de nav em vez do botão do sino.
    var pendingAssessments = (global.Trackly && Trackly.pendingAssessmentsCount) ? Trackly.pendingAssessmentsCount() : 0;
    var nav = items.map(function (it) {
      var badge = "";
      if (it.key === "avaliacoes" && pendingAssessments > 0) {
        badge = '<span class="notif-badge" style="position:absolute;top:6px;right:8px;">' + (pendingAssessments > 9 ? "9+" : pendingAssessments) + '</span>';
      }
      return '<a href="' + it.href + '" class="nav-item' + (it.key === active ? " active" : "") + '" style="position:relative;">' + it.icon + "<span>" + it.label + "</span>" + badge + "</a>";
    }).join("");

    var clientJump = "";
    if (client) {
      clientJump = '<div class="nav-label">Cliente aberto</div><a href="' + root + 'coach/cliente.html?id=' + client.id + '" class="nav-item active">' +
        '<span class="avatar" style="width:22px;height:22px;font-size:10px;background:' + colorFor(client) + '">' + client.initials + "</span><span>" + client.name + "</span></a>";
    }

    return (
      '<aside class="sidebar" id="sidebar">' +
      '<div class="sidebar-top">' + brandMark(root) + notifBellHtml("notif-bell-coach") + '</div>' +
      '<div class="nav-group">' + nav + clientJump + "</div>" +
      // coach-chip virou link pra config do check-in (V14 §6) — não é um item de nav novo,
      // só torna clicável o que já era a "identidade do coach" na sidebar.
      '<div class="sidebar-footer"><a href="' + root + 'coach/checkin-config.html" class="coach-chip" style="text-decoration:none;color:inherit;"><span class="avatar">' + Trackly.COACH.initials + '</span><div><div class="who">' + Trackly.COACH.name + '</div><div class="role">' + Trackly.COACH.role + "</div></div></a></div>" +
      "</aside>"
    );
  }

  function colorFor(client) { return "var(" + client.colorVar + ")"; }

  function mountCoachShell(active, clientId) {
    var root = document.body.getAttribute("data-root") || "../";
    var client = clientId ? Trackly.getClient(clientId) : null;
    document.getElementById("shell-demo").innerHTML = demoBar(root, "coach");
    document.getElementById("shell-sidebar").innerHTML = coachShell(root, active, client);
    mountNotifBell("notif-bell-coach", "coach");
    var mm = document.getElementById("mobile-menu-btn");
    if (mm) mm.addEventListener("click", function () { document.getElementById("sidebar").classList.toggle("open"); });
  }

  function mountPortalNav(active, clientId) {
    var root = document.body.getAttribute("data-root") || "../";
    var client = Trackly.getClient(clientId || "joao");
    document.getElementById("shell-demo").innerHTML = demoBar(root, "portal");
    var items = [
      { key: "dashboard", label: "Início", href: "dashboard.html", icon: I.home },
      { key: "treino", label: "Treino", href: "treino.html", icon: I.dumbbell },
      { key: "nutricao", label: "Nutrição", href: "nutricao.html", icon: I.apple },
      { key: "evolucao", label: "Progresso", href: "evolucao.html", icon: I.trend }
    ];
    var qs = "?client=" + client.id;
    var nav = items.map(function (it) {
      return '<a href="' + it.href + qs + '" class="bn-item' + (it.key === active ? " active" : "") + '"><span class="bn-ic">' + it.icon + '</span><span class="bn-label">' + it.label + "</span></a>";
    }).join("");
    var top = document.getElementById("shell-portal-top");
    if (top) {
      top.innerHTML =
        '<div class="brand" style="font-size:16px;">' +
        '<svg width="20" height="20" viewBox="0 0 26 26" fill="none"><path d="M3 17l5.5-6.5L13 15l8.5-10.5" stroke="var(--brand)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.5" cy="4.8" r="2.1" fill="var(--brand)"/></svg>' +
        "<span>Trackly</span></div>" +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        notifBellHtml("notif-bell-portal") +
        '<a href="conta.html' + qs + '" class="avatar" style="background:' + colorFor(client) + '">' + client.initials + "</a>" +
        "</div>";
      mountNotifBell("notif-bell-portal", client.id);
    }
    document.getElementById("shell-bottom-nav").innerHTML = '<nav class="bottom-nav">' + nav + "</nav>";
  }

  // ---------------- drawer — lista compacta + detalhe sob demanda (V12 §28) ----------------
  function ensureDrawer() {
    var host = document.getElementById("trackly-drawer-host");
    if (host) return host;
    host = document.createElement("div");
    host.id = "trackly-drawer-host";
    host.innerHTML =
      '<div class="drawer-backdrop" id="trackly-drawer-backdrop"></div>' +
      '<div class="drawer-panel" id="trackly-drawer-panel" role="dialog" aria-modal="true">' +
        '<button class="drawer-close" id="trackly-drawer-close" aria-label="Fechar">' + (I.close || "&times;") + '</button>' +
        '<div id="trackly-drawer-content"></div>' +
      '</div>';
    // no portal do aluno, o host precisa ficar dentro de .portal pra herdar as custom
    // properties do tema claro (senão o drawer renderiza com o tema escuro do coach,
    // já que position:fixed não é afetado por onde o elemento mora na árvore) — TODO §30
    var portalRoot = document.querySelector(".portal");
    (portalRoot || document.body).appendChild(host);
    document.getElementById("trackly-drawer-backdrop").addEventListener("click", closeDrawer);
    document.getElementById("trackly-drawer-close").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
    return host;
  }
  function openDrawer(contentHtml) {
    ensureDrawer();
    document.getElementById("trackly-drawer-content").innerHTML = contentHtml;
    document.getElementById("trackly-drawer-backdrop").classList.add("open");
    document.getElementById("trackly-drawer-panel").classList.add("open");
  }
  function closeDrawer() {
    var backdrop = document.getElementById("trackly-drawer-backdrop");
    var panel = document.getElementById("trackly-drawer-panel");
    if (backdrop) backdrop.classList.remove("open");
    if (panel) panel.classList.remove("open");
  }

  // ---------------- toast — feedback discreto (V12 §79) ----------------
  function toast(message) {
    var host = document.getElementById("trackly-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "trackly-toast-host";
      host.className = "toast-host";
      // mesmo motivo do drawer acima: precisa herdar os tokens de tema de .portal, senão
      // o toast sai com as cores do tema escuro (quase invisível sobre o papel claro do aluno).
      var portalRoot = document.querySelector(".portal");
      (portalRoot || document.body).appendChild(host);
    }
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = (I.check || "✓") + "<span>" + message + "</span>";
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 220);
    }, 2200);
  }

  // ---------------- notificações — sino + badge, mesmo drawer pro coach e pro portal (TODO §21) ----------------
  // A UI não sabe nada sobre eventos/canais — só lê Trackly.getNotifications(who) e desenha.
  // Toda a decisão de "o que gera notificação e pra quem" mora em data.js (Trackly.notify).
  var NOTIF_TITLES = {
    checkin_received: "Check-in recebido",
    orientation_ready: "Nova orientação",
    checkin_overdue: "Cobrança de check-in",
    checkin_reminder: "Check-in chegando",
    payment_overdue: "Pagamento em atraso"
  };
  function notifTitle(eventType) { return NOTIF_TITLES[eventType] || "Notificação"; }

  function notifBellHtml(id) {
    return '<button type="button" class="notif-bell" id="' + id + '" aria-label="Notificações">' + I.bell +
      '<span class="notif-badge" id="' + id + '-badge" style="display:none;"></span></button>';
  }

  function notifItemHtml(n) {
    var time = (global.Trackly && Trackly.relativeLabel) ? Trackly.relativeLabel(new Date(n.createdAt)) : "";
    return (
      '<div class="list-row notif-item' + (n.read ? "" : " unread") + '" data-notif="' + n.id + '" tabindex="0" role="button">' +
        '<div class="lr-body"><strong>' + notifTitle(n.eventType) + '</strong><span class="lr-meta">' + n.message + '</span></div>' +
        '<div class="lr-actions"><span class="lr-meta">' + time + '</span></div>' +
      '</div>'
    );
  }

  function notifDrawerHtml(who) {
    var list = Trackly.getNotifications(who);
    var body = list.length ? list.map(notifItemHtml).join("") : '<div class="notif-empty">Nenhuma notificação por aqui ainda.</div>';
    var sub = list.length
      ? '<a href="#" id="notif-mark-all" style="color:var(--brand);font-weight:600;text-decoration:none;">Marcar todas como lidas</a>'
      : "Avisos de check-in, orientação e pagamento aparecem aqui.";
    return '<h2 class="drawer-title">Notificações</h2><p class="drawer-sub">' + sub + '</p>' + body;
  }

  function refreshNotifBadge(id, who) {
    var badge = document.getElementById(id + "-badge");
    if (!badge) return;
    var count = Trackly.unreadNotificationCount(who);
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.style.display = count ? "flex" : "none";
  }

  function openNotifDrawer(who, bellId) {
    openDrawer(notifDrawerHtml(who));
    var markAll = document.getElementById("notif-mark-all");
    if (markAll) {
      markAll.addEventListener("click", function (e) {
        e.preventDefault();
        Trackly.markAllNotificationsRead(who);
        openDrawer(notifDrawerHtml(who));
        refreshNotifBadge(bellId, who);
      });
    }
    document.querySelectorAll("[data-notif]").forEach(function (row) {
      function markThis() {
        Trackly.markNotificationRead(row.getAttribute("data-notif"));
        row.classList.remove("unread");
        refreshNotifBadge(bellId, who);
      }
      row.addEventListener("click", markThis);
      row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); markThis(); } });
    });
  }

  function mountNotifBell(id, who) {
    if (!global.Trackly || !Trackly.getNotifications) return; // proteção: nunca quebra páginas sem data.js carregado ainda
    refreshNotifBadge(id, who);
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", function () { openNotifDrawer(who, id); });
  }

  global.TracklyNav = {
    mountCoachShell: mountCoachShell, mountPortalNav: mountPortalNav, colorFor: colorFor,
    openDrawer: openDrawer, closeDrawer: closeDrawer, toast: toast,
    mountNotifBell: mountNotifBell, refreshNotifBadge: refreshNotifBadge
  };
})(window);
