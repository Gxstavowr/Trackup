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
    var items = [
      { key: "dashboard", label: "Acompanhamento", href: root + "coach/dashboard.html", icon: I.grid },
      { key: "clientes", label: "Alunos", href: root + "coach/clientes.html", icon: I.users }
    ];
    var nav = items.map(function (it) {
      return '<a href="' + it.href + '" class="nav-item' + (it.key === active ? " active" : "") + '">' + it.icon + "<span>" + it.label + "</span></a>";
    }).join("");

    var clientJump = "";
    if (client) {
      clientJump = '<div class="nav-label">Cliente aberto</div><a href="' + root + 'coach/cliente.html?id=' + client.id + '" class="nav-item active">' +
        '<span class="avatar" style="width:22px;height:22px;font-size:10px;background:' + colorFor(client) + '">' + client.initials + "</span><span>" + client.name + "</span></a>";
    }

    return (
      '<aside class="sidebar" id="sidebar">' +
      brandMark(root) +
      '<div class="nav-group">' + nav + clientJump + "</div>" +
      '<div class="sidebar-footer"><div class="coach-chip"><span class="avatar">' + Trackly.COACH.initials + '</span><div><div class="who">' + Trackly.COACH.name + '</div><div class="role">' + Trackly.COACH.role + "</div></div></div></div>" +
      "</aside>"
    );
  }

  function colorFor(client) { return "var(" + client.colorVar + ")"; }

  function mountCoachShell(active, clientId) {
    var root = document.body.getAttribute("data-root") || "../";
    var client = clientId ? Trackly.getClient(clientId) : null;
    document.getElementById("shell-demo").innerHTML = demoBar(root, "coach");
    document.getElementById("shell-sidebar").innerHTML = coachShell(root, active, client);
    var mm = document.getElementById("mobile-menu-btn");
    if (mm) mm.addEventListener("click", function () { document.getElementById("sidebar").classList.toggle("open"); });
  }

  function mountPortalNav(active, clientId) {
    var root = document.body.getAttribute("data-root") || "../";
    var client = Trackly.getClient(clientId || "joao");
    document.getElementById("shell-demo").innerHTML = demoBar(root, "portal");
    var items = [
      { key: "dashboard", label: "Início", href: "dashboard.html", icon: I.home },
      { key: "checkin", label: "Check-in", href: "checkin.html", icon: I.clipboard },
      { key: "evolucao", label: "Evolução", href: "evolucao.html", icon: I.trend },
      { key: "historico", label: "Histórico", href: "historico.html", icon: I.clock }
    ];
    var qs = "?client=" + client.id;
    var nav = items.map(function (it) {
      return '<a href="' + it.href + qs + '" class="bn-item' + (it.key === active ? " active" : "") + '">' + it.icon + "<span>" + it.label + "</span></a>";
    }).join("");
    var top = document.getElementById("shell-portal-top");
    if (top) {
      top.innerHTML =
        '<div class="brand" style="font-size:16px;">' +
        '<svg width="20" height="20" viewBox="0 0 26 26" fill="none"><path d="M3 17l5.5-6.5L13 15l8.5-10.5" stroke="var(--brand)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.5" cy="4.8" r="2.1" fill="var(--brand)"/></svg>' +
        "<span>Trackly</span></div>" +
        '<span class="avatar" style="background:' + colorFor(client) + '">' + client.initials + "</span>";
    }
    document.getElementById("shell-bottom-nav").innerHTML = '<nav class="bottom-nav">' + nav + "</nav>";
  }

  global.TracklyNav = { mountCoachShell: mountCoachShell, mountPortalNav: mountPortalNav, colorFor: colorFor };
})(window);
