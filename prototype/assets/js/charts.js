/* Trackly — motor de gráficos SVG.
   Assinatura visual do produto: a "linha de trajetória" — uma linha fina que sobe/desce
   com um ponto sólido na leitura mais recente. Aparece em miniatura (sparkline, nas listas)
   e em escala grande (gráfico de evolução, no perfil do cliente). Sem libs externas:
   dá controle total sobre esse traço e evita dependência de CDN.
   V5: desenho progressivo da linha (CSS, respeita prefers-reduced-motion), pontos com
   entrada suave, e um tooltip flutuante único (delegado por evento) pra qualquer elemento
   com [data-tip] — mais rápido e mais bonito que o title nativo do navegador. */
(function (global) {
  "use strict";

  function el(tag, attrs, selfClose) {
    var s = '<' + tag;
    for (var k in attrs) if (attrs[k] != null) s += ' ' + k + '="' + attrs[k] + '"';
    s += selfClose === false ? ">" : "/>";
    return s;
  }

  function pathFromPoints(pts, smooth) {
    if (!pts.length) return "";
    if (!smooth || pts.length < 3) {
      return pts.map(function (p, i) { return (i === 0 ? "M" : "L") + p.x.toFixed(2) + "," + p.y.toFixed(2); }).join(" ");
    }
    var d = "M" + pts[0].x.toFixed(2) + "," + pts[0].y.toFixed(2);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += " C" + c1x.toFixed(2) + "," + c1y.toFixed(2) + " " + c2x.toFixed(2) + "," + c2y.toFixed(2) + " " + p2.x.toFixed(2) + "," + p2.y.toFixed(2);
    }
    return d;
  }

  // mini sparkline — usado nas listas de clientes
  function sparkline(values, opts) {
    opts = opts || {};
    var w = opts.width || 72, h = opts.height || 26, pad = 3;
    var color = opts.color || "var(--brand)";
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) { min -= 1; max += 1; }
    var pts = values.map(function (v, i) {
      return { x: pad + (i / (values.length - 1)) * (w - pad * 2), y: h - pad - ((v - min) / (max - min)) * (h - pad * 2) };
    });
    var d = pathFromPoints(pts, true);
    var last = pts[pts.length - 1];
    var uid = "spk" + Math.random().toString(36).slice(2, 9);
    return (
      '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" class="sparkline">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.15"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.95"/></linearGradient></defs>' +
      el("path", { d: d, fill: "none", stroke: "url(#" + uid + ")", "stroke-width": 1.6 }) +
      el("circle", { cx: last.x.toFixed(2), cy: last.y.toFixed(2), r: 2.4, fill: color }) +
      "</svg>"
    );
  }

  // gráfico de linha em escala grande, com grid, eixo, área de preenchimento, desenho
  // progressivo e tooltip
  function lineChart(opts) {
    var w = opts.width || 640, h = opts.height || 260;
    var margin = { top: 16, right: 18, bottom: 26, left: 40 };
    var iw = w - margin.left - margin.right, ih = h - margin.top - margin.bottom;
    var data = opts.data; // [{label, value}]
    var color = opts.color || "var(--brand)";
    var vals = data.map(function (d) { return d.value; }).filter(function (v) { return v != null; });
    var min = opts.min != null ? opts.min : Math.min.apply(null, vals);
    var max = opts.max != null ? opts.max : Math.max.apply(null, vals);
    if (min === max) { min -= 1; max += 1; }
    if (!(opts.min != null && opts.max != null)) {
      var pad = (max - min) * 0.12;
      min -= pad; max += pad;
    }

    function xAt(i) { return margin.left + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw); }
    function yAt(v) { return margin.top + ih - ((v - min) / (max - min)) * ih; }

    var pts = [];
    data.forEach(function (d, i) { if (d.value != null) pts.push({ x: xAt(i), y: yAt(d.value), i: i, v: d.value, label: d.label }); });
    var d = pathFromPoints(pts, true);
    var uidArea = "area" + Math.random().toString(36).slice(2, 9);

    var gridLines = "", n = 4;
    for (var g = 0; g <= n; g++) {
      var gy = margin.top + (ih / n) * g;
      var gv = max - ((max - min) / n) * g;
      gridLines += el("line", { x1: margin.left, x2: margin.left + iw, y1: gy.toFixed(1), y2: gy.toFixed(1), stroke: "var(--line)", "stroke-width": 1 });
      gridLines += el("text", { x: margin.left - 8, y: (gy + 3.5).toFixed(1), "text-anchor": "end", class: "chart-axis" }, false) + (opts.yFormat ? opts.yFormat(gv) : Math.round(gv)) + "</text>";
    }

    var xLabels = "";
    var step = Math.ceil(data.length / (opts.maxXLabels || 6));
    data.forEach(function (d, i) {
      if (i % step === 0 || i === data.length - 1) {
        xLabels += el("text", { x: xAt(i).toFixed(1), y: h - 6, "text-anchor": "middle", class: "chart-axis" }, false) + d.label + "</text>";
      }
    });

    var goalLine = "";
    if (opts.goalValue != null) {
      var gy2 = yAt(opts.goalValue);
      goalLine = el("line", { x1: margin.left, x2: margin.left + iw, y1: gy2.toFixed(1), y2: gy2.toFixed(1), stroke: "var(--gold)", "stroke-width": 1.3, "stroke-dasharray": "3 4" });
    }

    var dots = pts.map(function (p, idx) {
      var isLast = idx === pts.length - 1;
      var tip = p.label + ": " + p.v + (opts.unit || "");
      return el("circle", {
        cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: isLast ? 3.6 : 2.6,
        fill: isLast ? color : "var(--surface)", stroke: color, "stroke-width": 1.6,
        class: "chart-dot", style: "animation-delay:" + (idx * 25) + "ms", "data-tip": tip
      });
    }).join("");

    var areaPath = pts.length ? d + " L" + pts[pts.length - 1].x.toFixed(2) + "," + (margin.top + ih) + " L" + pts[0].x.toFixed(2) + "," + (margin.top + ih) + " Z" : "";
    var pathLen = Math.round(iw + ih) * 3 + 200; // limite seguro de comprimento pro traço progressivo

    return (
      '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="' + uidArea + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.16"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      gridLines + xLabels + goalLine +
      (opts.showArea !== false ? el("path", { d: areaPath, fill: "url(#" + uidArea + ")", stroke: "none", class: "chart-area" }) : "") +
      el("path", { d: d, fill: "none", stroke: color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round", class: "chart-line-draw", style: "stroke-dasharray:" + pathLen + ";stroke-dashoffset:" + pathLen + ";" }) +
      dots +
      "</svg>"
    );
  }

  // gráfico de barras — usado para treinos/cardio realizados por semana
  function barChart(opts) {
    var w = opts.width || 640, h = opts.height || 200;
    var margin = { top: 14, right: 12, bottom: 26, left: 30 };
    var iw = w - margin.left - margin.right, ih = h - margin.top - margin.bottom;
    var data = opts.data;
    var max = opts.max || Math.max.apply(null, data.map(function (d) { return Math.max(d.value, d.goal || 0); }));
    var bw = (iw / data.length) * 0.5;

    function xAt(i) { return margin.left + (i + 0.5) * (iw / data.length); }
    function yAt(v) { return margin.top + ih - (v / max) * ih; }

    var bars = data.map(function (d, i) {
      var x = xAt(i) - bw / 2, y = yAt(d.value), bh = margin.top + ih - y;
      var hit = d.goal ? (d.value >= d.goal) : true;
      var tip = d.label + ": " + d.value + (d.goal ? ("/" + d.goal) : "");
      return el("rect", {
        x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: Math.max(0, bh).toFixed(1), rx: 3,
        fill: hit ? "var(--brand)" : "var(--gold)", class: "chart-bar", style: "animation-delay:" + (i * 30) + "ms", "data-tip": tip
      });
    }).join("");

    var goalLines = data.map(function (d, i) {
      if (d.goal == null) return "";
      var gy = yAt(d.goal), x = xAt(i) - bw / 2 - 3;
      return el("line", { x1: x.toFixed(1), x2: (x + bw + 6).toFixed(1), y1: gy.toFixed(1), y2: gy.toFixed(1), stroke: "var(--ink-faint)", "stroke-width": 1.2, "stroke-dasharray": "2 3" });
    }).join("");

    var xLabels = data.map(function (d, i) {
      return el("text", { x: xAt(i).toFixed(1), y: h - 6, "text-anchor": "middle", class: "chart-axis" }, false) + d.label + "</text>";
    }).join("");

    return '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" preserveAspectRatio="xMidYMid meet">' + bars + goalLines + xLabels + "</svg>";
  }

  // ---------------- tooltip flutuante único, delegado (funciona pra qualquer [data-tip]) ----------------
  var tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "chart-tooltip";
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(target, x, y) {
    var t = ensureTip();
    t.textContent = target.getAttribute("data-tip");
    t.style.left = x + "px"; t.style.top = y + "px";
    t.classList.add("show");
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("show"); }

  document.addEventListener("pointerover", function (e) {
    var target = e.target.closest && e.target.closest("[data-tip]");
    if (target) showTip(target, e.clientX, e.clientY);
  });
  document.addEventListener("pointermove", function (e) {
    if (!tipEl || !tipEl.classList.contains("show")) return;
    var target = e.target.closest && e.target.closest("[data-tip]");
    if (target) { tipEl.style.left = e.clientX + "px"; tipEl.style.top = e.clientY + "px"; } else hideTip();
  });
  document.addEventListener("pointerout", function (e) {
    var target = e.target.closest && e.target.closest("[data-tip]");
    if (target) hideTip();
  });
  document.addEventListener("scroll", hideTip, true);

  global.Charts = { sparkline: sparkline, lineChart: lineChart, barChart: barChart };
})(window);
