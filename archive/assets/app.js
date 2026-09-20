/* Apple Health archive - rendering layer.
   Reads ../data/archive.json, which is rebuilt by tools/build-data.mjs.
   No libraries and no third-party requests. */

(function () {
  "use strict";

  function start(D) {

  var DAY = 86400000;
  var EPOCH = Date.UTC(2000, 0, 1);
  var METRICS = Object.keys(D.metrics).map(function (k) { return D.metrics[k]; });
  var BY_ID = {};
  METRICS.forEach(function (m) { BY_ID[m.id] = m; });

  var ALL_DAYS = METRICS.reduce(function (acc, m) {
    var d = m.daily.d;
    if (!d.length) return acc;
    if (acc.min === null || d[0] < acc.min) acc.min = d[0];
    if (acc.max === null || d[d.length - 1] > acc.max) acc.max = d[d.length - 1];
    return acc;
  }, { min: null, max: null });

  var WORKOUT_DAYS = D.activity.map(function (a) { return dayFromIso(a.date); });
  if (WORKOUT_DAYS.length) {
    var amax = Math.max.apply(null, WORKOUT_DAYS);
    var amin = Math.min.apply(null, WORKOUT_DAYS);
    if (ALL_DAYS.max === null || amax > ALL_DAYS.max) ALL_DAYS.max = amax;
    if (ALL_DAYS.min === null || amin < ALL_DAYS.min) ALL_DAYS.min = amin;
  }

  var state = { range: "all", bucket: "day", category: "all", sort: "count", query: "", workoutType: "all", workoutYear: "all" };
  var appReady = false;

  /* ------------------------------------------------------------ utilities */

  function dayToDate(d) { return new Date(EPOCH + d * DAY); }
  function dayFromIso(iso) { return Math.round((Date.parse(iso + "T00:00:00Z") - EPOCH) / DAY); }
  function isoOf(d) { return dayToDate(d).toISOString().slice(0, 10); }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function longDate(iso) {
    if (!iso) return "";
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    return d + " " + MONTHS[m - 1] + " " + y;
  }
  function clockOf(iso) {
    if (!iso || iso.length < 16) return "";
    return iso.slice(11, 16);
  }
  function int(n) { return Math.round(n).toLocaleString("en-US"); }
  function compact(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1) + "b";
    if (a >= 1e6) return (n / 1e6).toFixed(1) + "m";
    if (a >= 10000) return int(n / 1000) + "k";
    if (a >= 1000) return (n / 1000).toFixed(1) + "k";
    if (a >= 10) return n.toFixed(0);
    if (a >= 1) return n.toFixed(1);
    if (a === 0) return "0";
    return n.toFixed(2);
  }
  function smart(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    var a = Math.abs(n);
    if (a >= 10000) return int(n);
    if (a >= 100) return n.toFixed(0);
    if (a >= 10) return n.toFixed(1);
    if (a >= 1) return n.toFixed(2);
    return n.toFixed(3);
  }
  function pct(n) { return (n * 100).toFixed(1) + "%"; }

  var UNIT_SHORT = {
    "count/min": "bpm",
    "count/hr": "/hr",
    "count": "",
    "kcal": "kcal",
    "kJ": "kJ",
    "km": "km",
    "mi": "mi",
    "m": "m",
    "cm": "cm",
    "kg": "kg",
    "lb": "lb",
    "ms": "ms",
    "min": "min",
    "hr": "h",
    "s": "s",
    "%": "%",
    "mg/dL": "mg/dL",
    "mmol/L": "mmol/L",
    "km/hr": "km/h",
    "m/s": "m/s",
    "dBASPL": "dB",
    "dBHL": "dBHL",
    "degC": "\u00b0C",
    "degF": "\u00b0F",
    "kcal/hr\u00b7kg": "kcal/kg/h",
    "cm/s": "cm/s",
    "mL/min\u00b7kg": "ml/kg/min",
    "L": "L",
    "g": "g",
    "mg": "mg",
    "index": ""
  };
  function unitShort(m) {
    if (m.base === "BodyMassIndex") return "kg/m\u00b2";
    return UNIT_SHORT[m.unit] !== undefined ? UNIT_SHORT[m.unit] : m.unit;
  }
  function withUnit(m, v, digits) {
    var text = digits === undefined ? smart(v) : Number(v).toFixed(digits);
    var u = unitShort(m);
    return u ? text + " " + u : text;
  }
  function categoryOf(id) { return BY_ID[id] ? BY_ID[id].category : "other"; }
  function catLabel(c) { return D.categoryLabels[c] || c; }

  function clock(minutesFromMidnight) {
    var m = ((minutesFromMidnight % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = Math.round(m % 60);
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }
  function hoursText(minutes) {
    if (minutes === null || minutes === undefined) return "-";
    var h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return h + "h " + (m < 10 ? "0" : "") + m + "m";
  }
  function durationText(seconds) {
    var h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
    return h ? h + "h " + (m < 10 ? "0" : "") + m + "m" : m + "m";
  }

  /* --------------------------------------------------------------- theme */

  /* Some browsers block storage on file:// URLs, so never let it throw. */
  function readStored(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStored(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  var themeMode = readStored("health-theme") || "auto";
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function resolvedTheme() {
    return themeMode === "auto" ? (media.matches ? "dark" : "light") : themeMode;
  }
  function applyTheme() {
    document.documentElement.dataset.theme = resolvedTheme();
    document.getElementById("theme-value").textContent =
      themeMode === "auto" ? "Auto" : (themeMode === "dark" ? "Dark" : "Light");
    document.dispatchEvent(new CustomEvent("themechange"));
  }
  document.getElementById("theme-toggle").addEventListener("click", function () {
    themeMode = themeMode === "auto" ? "light" : themeMode === "light" ? "dark" : "auto";
    writeStored("health-theme", themeMode);
    applyTheme();
  });
  if (media.addEventListener) media.addEventListener("change", function () { if (themeMode === "auto") applyTheme(); });

  var colourCache = {};
  function cssv(name) {
    var theme = resolvedTheme();
    var key = theme + name;
    if (colourCache[key]) return colourCache[key];
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    colourCache[key] = value || "#000";
    return colourCache[key];
  }

  var SLEEP_COLOURS = { deep: "#2c7563", core: "#5fae95", rem: "#9fd2c1", awake: "#a9701f", inBed: "#c3c9c3" };
  function sleepColour(stage) {
    if (resolvedTheme() === "dark") {
      return { deep: "#2f8f74", core: "#5cc4a4", rem: "#a7e0cd", awake: "#d9a354", inBed: "#4c5654" }[stage];
    }
    return SLEEP_COLOURS[stage];
  }

  /* -------------------------------------------------------------- tooltip */

  var tip = document.getElementById("tip");
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    var rect = tip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - rect.width - 12, Math.max(8, x + 14));
    var top = Math.max(8, y - rect.height - 12);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ---------------------------------------------------------------- charts */

  var registry = [];

  function createChart(host, spec) {
    host.innerHTML = "";
    var canvas = document.createElement("canvas");
    host.appendChild(canvas);
    var c = { host: host, canvas: canvas, spec: spec, pointer: null };
    registry.push(c);
    canvas.addEventListener("mousemove", function (ev) {
      var r = canvas.getBoundingClientRect();
      c.pointer = { x: ev.clientX - r.left, y: ev.clientY - r.top, px: ev.clientX, py: ev.clientY };
      renderChart(c);
    });
    canvas.addEventListener("mouseleave", function () {
      c.pointer = null;
      hideTip();
      renderChart(c);
    });
    renderChart(c);
    return c;
  }

  function renderChart(c) {
    var rect = c.host.getBoundingClientRect();
    var w = Math.max(60, rect.width);
    var h = Math.max(50, rect.height);
    var dpr = window.devicePixelRatio || 1;
    c.canvas.width = Math.round(w * dpr);
    c.canvas.height = Math.round(h * dpr);
    var ctx = c.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    c.points = c.spec.draw(ctx, w, h, c) || [];
  }

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { registry.forEach(renderChart); }, 140);
  });
  document.addEventListener("themechange", function () {
    if (!appReady) return;
    rebuild();
  });

  function rangeStart() {
    if (state.range === "all" || ALL_DAYS.max === null) return -Infinity;
    var days = { "5y": 1827, "1y": 366, "90d": 90, "30d": 30 }[state.range];
    return ALL_DAYS.max - days + 1;
  }

  function axes(ctx, w, h, x0, x1, y0, y1, opts) {
    opts = opts || {};
    var pad = { l: opts.padLeft || 46, r: 12, t: 12, b: 24 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    if (x1 === x0) x1 = x0 + 1;
    if (y1 === y0) y1 = y0 + 1;
    var x = function (v) { return pad.l + (v - x0) / (x1 - x0) * iw; };
    var y = function (v) { return pad.t + ih - (v - y0) / (y1 - y0) * ih; };

    ctx.strokeStyle = cssv("--grid");
    ctx.fillStyle = cssv("--muted");
    ctx.lineWidth = 1;
    var ticks = opts.yTicks || 4;
    for (var i = 0; i <= ticks; i++) {
      var value = y0 + (y1 - y0) * (i / ticks);
      var py = Math.round(y(value)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, py);
      ctx.lineTo(w - pad.r, py);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(opts.formatY ? opts.formatY(value) : compact(value), pad.l - 7, py);
    }

    var span = x1 - x0;
    var marks = [];
    if (span > 800) {
      var yStart = dayToDate(x0).getUTCFullYear() + 1;
      var yEnd = dayToDate(x1).getUTCFullYear();
      for (var yr = yStart; yr <= yEnd; yr++) marks.push({ day: dayFromIso(yr + "-01-01"), label: String(yr) });
    } else if (span > 150) {
      for (var cursor = dayToDate(x0); cursor <= dayToDate(x1); cursor = new Date(cursor.getTime() + 30 * DAY)) {
        marks.push({ day: dayFromIso(cursor.toISOString().slice(0, 10)), label: MONTHS[cursor.getUTCMonth()] });
      }
    } else {
      for (var d2 = Math.ceil(x0 / 7) * 7; d2 <= x1; d2 += 7) {
        marks.push({ day: d2, label: isoOf(d2).slice(5) });
      }
    }
    ctx.textAlign = "center";
    marks.forEach(function (mk) {
      var px = x(mk.day);
      if (px < pad.l - 1 || px > w - pad.r + 1) return;
      ctx.fillStyle = cssv("--muted");
      ctx.fillText(mk.label, px, h - pad.b + 11);
      ctx.strokeStyle = cssv("--grid");
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, pad.t);
      ctx.lineTo(Math.round(px) + 0.5, pad.t + ih);
      ctx.stroke();
    });
    return { x: x, y: y, iw: iw, ih: ih, pad: pad, x0: x0, x1: x1, y0: y0, y1: y1 };
  }

  function niceTop(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var norm = v / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  /* Binning: many metrics hold years of days, far more than pixels. */
  function binPoints(points, width, mode) {
    if (!points.length) return [];
    if (points.length <= width) {
      return points.map(function (p) { return { d: p.d, v: p.v, n: p.n || 1, days: 1 }; });
    }
    var out = [];
    var per = points.length / width;
    for (var i = 0; i < width; i++) {
      var a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per));
      var slice = points.slice(a, b);
      if (!slice.length) continue;
      var value;
      if (mode === "max") {
        value = slice.reduce(function (s, p) { return Math.max(s, p.v); }, -Infinity);
      } else if (mode === "total") {
        value = slice.reduce(function (s, p) { return s + p.v; }, 0);
      } else {
        value = slice.reduce(function (s, p) { return s + p.v; }, 0) / slice.length;
      }
      out.push({
        d: slice[Math.floor(slice.length / 2)].d,
        v: value,
        n: slice.reduce(function (s, p) { return s + (p.n || 1); }, 0),
        days: slice.length
      });
    }
    return out;
  }

  function nearest(points, px, xscale) {
    var best = null, bestDist = Infinity;
    for (var i = 0; i < points.length; i++) {
      var dx = Math.abs(xscale(points[i].d) - px);
      if (dx < bestDist) { bestDist = dx; best = points[i]; }
    }
    return bestDist <= 14 ? best : null;
  }

  /* Empty states: a range can hold no readings for a sparse metric. */
  function drawEmpty(ctx, w, h, text) {
    ctx.fillStyle = cssv("--muted");
    ctx.textAlign = "center";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(text, w / 2, h / 2);
    ctx.strokeStyle = cssv("--grid");
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return [];
  }

  /* Line and area chart over days. */
  function lineChart(host, opts) {
    var points = opts.points;
    var kind = opts.kind || "line";
    var showDots = opts.dots !== false && points.length <= 260;
    return createChart(host, {
      draw: function (ctx, w, h, c) {
        if (!points.length) return drawEmpty(ctx, w, h, "no readings in this range");
        var values = points.map(function (p) { return p.v; });
        var lo = opts.yMin !== undefined ? opts.yMin : Math.min.apply(null, values);
        var hi = opts.yMax !== undefined ? opts.yMax : Math.max.apply(null, values);
        if (opts.band) { lo = Math.min(lo, opts.band[0]); hi = Math.max(hi, opts.band[1]); }
        var span = hi - lo || Math.abs(hi) || 1;
        lo = opts.yZero ? Math.min(0, lo) : lo - span * 0.12;
        hi = hi + span * 0.12;
        if (opts.yZero) hi = Math.max(hi, niceTop(Math.max.apply(null, values)) * 1.05);
        var g = axes(ctx, w, h, points[0].d, points[points.length - 1].d || points[0].d + 1, lo, hi, {
          formatY: opts.formatY
        });
        var accent = cssv("--accent");

        if (opts.band) {
          ctx.fillStyle = cssv("--accent-soft");
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.rect(g.pad.l, g.y(opts.band[1]), g.iw, Math.max(1, g.y(opts.band[0]) - g.y(opts.band[1])));
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        var visible = binPoints(points, Math.max(2, Math.floor(g.iw / 2)), kind === "bar" ? "total" : "mean");

        if (kind === "bar") {
          var bw = Math.max(1, g.iw / visible.length - 1);
          ctx.fillStyle = accent;
          visible.forEach(function (p) {
            var px = g.x(p.d), py = g.y(p.v), base = g.y(Math.max(0, lo));
            ctx.fillRect(px - bw / 2, py, bw, Math.max(1, base - py));
          });
        } else {
          if (opts.area !== false) {
            var grad = ctx.createLinearGradient(0, g.pad.t, 0, g.pad.t + g.ih);
            grad.addColorStop(0, accent + "44");
            grad.addColorStop(1, accent + "06");
            ctx.fillStyle = grad;
            ctx.beginPath();
            visible.forEach(function (p, i) {
              var px = g.x(p.d), py = g.y(p.v);
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            });
            ctx.lineTo(g.x(visible[visible.length - 1].d), g.y(Math.max(0, lo)));
            ctx.lineTo(g.x(visible[0].d), g.y(Math.max(0, lo)));
            ctx.closePath();
            ctx.fill();
          }
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          visible.forEach(function (p, i) {
            var px = g.x(p.d), py = g.y(p.v);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.stroke();
          if (showDots) {
            ctx.fillStyle = accent;
            points.forEach(function (p) {
              ctx.beginPath();
              ctx.arc(g.x(p.d), g.y(p.v), 2.1, 0, 6.284);
              ctx.fill();
            });
          }
        }

        if (opts.reference !== undefined) {
          ctx.strokeStyle = cssv("--muted");
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(g.pad.l, g.y(opts.reference));
          ctx.lineTo(w - g.pad.r, g.y(opts.reference));
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (c.pointer) {
          var hit = nearest(points, c.pointer.x, g.x);
          if (hit) {
            ctx.strokeStyle = cssv("--ink");
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(g.x(hit.d), g.pad.t);
            ctx.lineTo(g.x(hit.d), g.pad.t + g.ih);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = cssv("--accent");
            ctx.beginPath();
            ctx.arc(g.x(hit.d), g.y(hit.v), 3.4, 0, 6.284);
            ctx.fill();
            showTip(opts.tip ? opts.tip(hit, g) :
              "<b>" + longDate(isoOf(hit.d)) + "</b><br>" + smart(hit.v) + " " + (opts.unit || ""),
              c.pointer.px, c.pointer.py);
          } else {
            hideTip();
          }
        }
        return visible;
      }
    });
  }

  /* Bars for a fixed set of categories (weekday, hour, source). */
  function barChart(host, opts) {
    var items = opts.items;
    return createChart(host, {
      draw: function (ctx, w, h, c) {
        var values = items.map(function (i) { return i.value; });
        var hi = niceTop(Math.max.apply(null, values.concat([0])) * 1.08) || 1;
        var pad = { l: opts.padLeft || 46, r: 10, t: 12, b: 26 };
        var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
        ctx.strokeStyle = cssv("--grid");
        ctx.fillStyle = cssv("--muted");
        for (var t = 0; t <= 3; t++) {
          var value = hi * (t / 3);
          var py = Math.round(pad.t + ih - (value / hi) * ih) + 0.5;
          ctx.beginPath();
          ctx.moveTo(pad.l, py);
          ctx.lineTo(w - pad.r, py);
          ctx.stroke();
          ctx.textAlign = "right";
          ctx.fillText(opts.formatY ? opts.formatY(value) : compact(value), pad.l - 7, py);
        }
        var slot = iw / items.length;
        var bw = Math.max(2, slot - Math.max(2, slot * 0.28));
        var points = [];
        items.forEach(function (item, i) {
          var cx = pad.l + slot * (i + 0.5);
          var py = pad.t + ih - (item.value / hi) * ih;
          var hovered = c.pointer && Math.abs(c.pointer.x - cx) < slot / 2 && c.pointer.y > pad.t - 6;
          ctx.fillStyle = item.colour || (hovered ? cssv("--ink") : cssv("--accent"));
          ctx.globalAlpha = item.muted ? 0.45 : 1;
          ctx.fillRect(cx - bw / 2, py, bw, Math.max(1, pad.t + ih - py));
          ctx.globalAlpha = 1;
          if (item.label) {
            ctx.fillStyle = cssv("--muted");
            ctx.textAlign = "center";
            ctx.fillText(item.label, cx, h - pad.b + 12);
          }
          points.push({ x: cx, y: py, item: item });
        });
        if (c.pointer) {
          var best = null, dist = Infinity;
          points.forEach(function (p) {
            var dd = Math.abs(p.x - c.pointer.x);
            if (dd < dist) { dist = dd; best = p; }
          });
          if (best && dist < slot / 2 + 4) {
            showTip(opts.tip ? opts.tip(best.item, best) : "<b>" + best.item.label + "</b><br>" + smart(best.item.value), c.pointer.px, c.pointer.py);
          } else {
            hideTip();
          }
        }
        return points;
      }
    });
  }

  /* Distribution of every raw reading. */
  function histogramChart(host, opts) {
    var bins = opts.bins, lo = opts.lo, hi = opts.hi;
    return createChart(host, {
      draw: function (ctx, w, h, c) {
        var max = Math.max.apply(null, bins) || 1;
        var pad = { l: 46, r: 10, t: 12, b: 24 };
        var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
        ctx.strokeStyle = cssv("--grid");
        ctx.fillStyle = cssv("--muted");
        for (var t = 0; t <= 3; t++) {
          var value = max * (t / 3);
          var py = Math.round(pad.t + ih - (value / max) * ih) + 0.5;
          ctx.beginPath();
          ctx.moveTo(pad.l, py);
          ctx.lineTo(w - pad.r, py);
          ctx.stroke();
          ctx.textAlign = "right";
          ctx.fillText(compact(value), pad.l - 7, py);
        }
        var slot = iw / bins.length;
        bins.forEach(function (count, i) {
          var px = pad.l + slot * i;
          var py = pad.t + ih - (count / max) * ih;
          var from = lo + (hi - lo) * (i / bins.length);
          var hovered = c.pointer && c.pointer.x >= px && c.pointer.x < px + slot;
          ctx.fillStyle = opts.colourFor ? opts.colourFor(from) : cssv("--accent");
          ctx.globalAlpha = hovered ? 1 : 0.82;
          ctx.fillRect(px + 0.5, py, Math.max(1, slot - 1), Math.max(1, pad.t + ih - py));
          ctx.globalAlpha = 1;
        });
        var ticks = 5;
        ctx.fillStyle = cssv("--muted");
        ctx.textAlign = "center";
        for (var k = 0; k <= ticks; k++) {
          var value2 = lo + (hi - lo) * (k / ticks);
          ctx.fillText(opts.formatX ? opts.formatX(value2) : smart(value2), pad.l + iw * (k / ticks), h - pad.b + 11);
        }
        if (opts.marker !== undefined) {
          var mx = pad.l + (opts.marker - lo) / (hi - lo) * iw;
          ctx.strokeStyle = cssv("--amber");
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(mx, pad.t);
          ctx.lineTo(mx, pad.t + ih);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (c.pointer) {
          var index = Math.floor((c.pointer.x - pad.l) / slot);
          if (index >= 0 && index < bins.length && c.pointer.y >= pad.t - 6) {
            var from2 = lo + (hi - lo) * (index / bins.length);
            var to2 = lo + (hi - lo) * ((index + 1) / bins.length);
            showTip("<b>" + (opts.formatX ? opts.formatX(from2) + " to " + opts.formatX(to2) : smart(from2) + " to " + smart(to2)) +
              "</b><br>" + int(bins[index]) + " readings", c.pointer.px, c.pointer.py);
          } else {
            hideTip();
          }
        }
        return [];
      }
    });
  }

  /* Stacked nightly bars, used for sleep stages. */
  function stackedChart(host, opts) {
    var nights = opts.nights;
    var keys = opts.keys;
    return createChart(host, {
      draw: function (ctx, w, h, c) {
        var totals = nights.map(function (n) {
          return keys.reduce(function (s, k) { return s + (n[k] || 0); }, 0) / 60;
        });
        if (!nights.length) return drawEmpty(ctx, w, h, "no nights in this range");
        var hi = niceTop(Math.max.apply(null, totals.concat([1])) * 1.08);
        var g = axes(ctx, w, h, nights[0].day, nights[nights.length - 1].day + 1, 0, hi, {
          formatY: function (v) { return v.toFixed(0) + "h"; }
        });
        var slot = g.iw / nights.length;
        var bw = Math.max(1, slot - Math.max(0.6, slot * 0.18));
        var bars = [];
        nights.forEach(function (n, i) {
          var x = g.pad.l + slot * i + slot / 2;
          var base = g.pad.t + g.ih;
          keys.forEach(function (k) {
            var minutes = n[k] || 0;
            if (minutes <= 0) return;
            var height = (minutes / 60) / hi * g.ih;
            ctx.fillStyle = sleepColour(k);
            ctx.fillRect(x - bw / 2, base - height, bw, height);
            base -= height;
          });
          bars.push({ x: x, night: n, index: i });
        });
        if (c.pointer) {
          var best = null, dist = Infinity;
          bars.forEach(function (b) {
            var dd = Math.abs(b.x - c.pointer.x);
            if (dd < dist) { dist = dd; best = b; }
          });
          if (best && dist < Math.max(6, slot)) {
            var n = best.night;
            showTip("<b>" + longDate(n.date) + "</b><br>" +
              "Asleep " + hoursText(n.asleep) + "<br>" +
              "Deep " + hoursText(n.deep) + " &nbsp; REM " + hoursText(n.rem) + "<br>" +
              "Core " + hoursText(n.core) + " &nbsp; Awake " + hoursText(n.awake) +
              (n.start ? "<br>" + clockOf(n.start) + " to " + clockOf(n.end) : ""),
              c.pointer.px, c.pointer.py);
          } else {
            hideTip();
          }
        }
        return bars;
      }
    });
  }

  /* Scatter with an optional connecting line, for sparse measurements. */
  function scatterChart(host, opts) {
    var points = opts.points;
    return createChart(host, {
      draw: function (ctx, w, h, c) {
        if (!points.length) return drawEmpty(ctx, w, h, "no readings in this range");
        var values = points.map(function (p) { return p.v; });
        var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
        var span = (hi - lo) || Math.abs(hi) || 1;
        lo -= span * 0.15; hi += span * 0.15;
        var g = axes(ctx, w, h, points[0].d, points[points.length - 1].d || points[0].d + 1, lo, hi, {
          formatY: opts.formatY
        });
        var accent = cssv("--accent");
        if (opts.connect !== false) {
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          points.forEach(function (p, i) {
            var px = g.x(p.d), py = g.y(p.v);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = accent;
        points.forEach(function (p) {
          ctx.beginPath();
          ctx.arc(g.x(p.d), g.y(p.v), points.length > 300 ? 1.6 : 3, 0, 6.284);
          ctx.fill();
        });
        if (c.pointer) {
          var hit = nearest(points, c.pointer.x, g.x);
          if (hit) {
            ctx.strokeStyle = cssv("--ink");
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.moveTo(g.x(hit.d), g.pad.t);
            ctx.lineTo(g.x(hit.d), g.pad.t + g.ih);
            ctx.stroke();
            ctx.globalAlpha = 1;
            showTip("<b>" + longDate(isoOf(hit.d)) + "</b><br>" +
              (opts.tip ? opts.tip(hit) : smart(hit.v) + " " + (opts.unit || "")), c.pointer.px, c.pointer.py);
          } else {
            hideTip();
          }
        }
        return points;
      }
    });
  }

  /* ------------------------------------------------------- metric helpers */

  function dailyPoints(metric, transform) {
    var d = metric.daily.d, s = metric.daily.s, n = metric.daily.n, out = [];
    for (var i = 0; i < d.length; i++) {
      var value = transform === "sum" ? s[i] : (n[i] ? s[i] / n[i] : 0);
      out.push({ d: d[i], v: value, n: n[i] });
    }
    return out;
  }

  function isNumeric(metric) { return metric.min !== null; }

  /* Categorical metrics (sleep stages, stand hours) have no number of their
     own, so their series is the count of recorded segments per day. */
  function seriesFor(metric) {
    if (isNumeric(metric)) return dailyPoints(metric, metric.aggregation);
    return metric.daily.d.map(function (d, i) {
      return { d: d, v: metric.daily.n[i], n: metric.daily.n[i], countOnly: true };
    });
  }

  function metricPoints(metric) {
    var points = seriesFor(metric);
    var start = rangeStart();
    return points.filter(function (p) { return p.d >= start; });
  }

  function bucketPoints(points, bucket) {
    if (bucket === "day") return points.map(function (p) { return { d: p.d, v: p.v }; });
    var groups = {};
    points.forEach(function (p) {
      var date = dayToDate(p.d);
      var key;
      if (bucket === "week") {
        var monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY);
        key = monday.toISOString().slice(0, 10);
      } else {
        key = isoOf(p.d).slice(0, 7) + "-01";
      }
      if (!groups[key]) groups[key] = { d: dayFromIso(key), v: 0, n: 0, days: 0 };
      groups[key].v += p.v * (bucket === "week" ? 1 : 1);
      groups[key].n += p.n;
      groups[key].days += 1;
    });
    return Object.keys(groups).sort().map(function (k) {
      var g = groups[k];
      return { d: g.d, v: g.v, n: g.n, days: g.days };
    });
  }

  var weekBucketPending = null;

  function statGrid(host, items) {
    host.innerHTML = items.map(function (i) {
      return "<div><dt>" + i[0] + "</dt><dd>" + i[1] + (i[2] ? "<small>" + i[2] + "</small>" : "") + "</dd></div>";
    }).join("");
  }

  function fill(host, text) { host.textContent = text; }

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function tableHtml(rows, head) {
    return "<table><thead><tr>" + head.map(function (h, i) {
      return "<th" + (i === 0 ? "" : " class=\"num\"") + ">" + h + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
      return "<tr>" + r.map(function (cell, i) {
        return "<td" + (i === 0 ? "" : " class=\"num\"") + ">" + cell + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }

  /* ------------------------------------------------------------ opening */

  function renderOpening() {
    var step = BY_ID["HKQuantityTypeIdentifierStepCount"];
    var steps = step ? step.daily.s.reduce(function (s, v) { return s + v; }, 0) : 0;
    var stepDays = step ? step.daily.d.length : 0;
    var firstIso = isoOf(ALL_DAYS.min), lastIso = isoOf(ALL_DAYS.max);
    var years = (ALL_DAYS.max - ALL_DAYS.min) / 365.25;

    document.getElementById("opening-kicker").textContent =
      "Apple Health export, read locally. " + longDate(D.meta.exportDate.slice(0, 10));
    document.getElementById("opening-headline").textContent =
      "Every reading your devices kept, " + firstIso.slice(0, 4) + " to " + lastIso.slice(0, 4) + ".";
    document.getElementById("opening-lede").innerHTML =
      "This is the whole export opened up: " + int(D.meta.records) + " individual readings across " +
      D.meta.metricCount + " health metrics, kept by an Apple Watch, two phones, a Huawei band and a handful of apps. " +
      "Every daily series is drawn in full, sparse metrics list every raw entry, and nothing has been smoothed away. " +
      "Charts show daily values unless a wider bucket is chosen.";

    var specimen = [
      [int(D.meta.records), "readings", "in the export"],
      [D.meta.metricCount, "metrics", "with at least one value"],
      [(years).toFixed(1) + " yr", "of history", longDate(firstIso) + " to " + longDate(lastIso)],
      [int(stepDays), "days with steps", int(steps) + " steps counted"],
      [D.meta.workoutCount, "workouts", D.meta.routeCount + " with a mapped route"],
      [D.meta.ecgCount, "ECGs", "recorded on the watch"]
    ];
    document.getElementById("specimen").innerHTML = specimen.map(function (s) {
      return "<div><dt>" + s[1] + "</dt><dd>" + s[0] + "<small>" + s[2] + "</small></dd></div>";
    }).join("");

    var sections = [
      ["coverage", "What exists, and when", D.meta.metricCount + " metrics"],
      ["activity", "Steps, distance and energy", int(steps) + " steps"],
      ["heart", "Heart", int(BY_ID["HKQuantityTypeIdentifierHeartRate"].count) + " readings"],
      ["sleep", "Sleep", D.nights.length + " nights"],
      ["body", "Body", (BY_ID["HKQuantityTypeIdentifierBodyMass"] || { count: 0 }).count + " weights"],
      ["mobility", "Walking and mobility", "8 measures"],
      ["vitals", "Vitals and load", "5 measures"],
      ["hearing", "Sound exposure", int(BY_ID["HKQuantityTypeIdentifierHeadphoneAudioExposure"].count) + " readings"],
      ["catalog", "Every metric in the export", D.meta.metricCount + " metrics"],
      ["workouts", "Workouts", D.meta.workoutCount + " sessions"],
      ["routes", "Mapped routes", D.meta.routeCount + " tracks"],
      ["ecg", "Electrocardiograms", D.meta.ecgCount + " traces"],
      ["sources", "Devices and apps", Object.keys(D.meta.sources).length + " writers"],
      ["notes", "How to read this", ""]
    ];
    document.getElementById("contents-list").innerHTML = sections.map(function (s) {
      return "<li><a href=\"#" + s[0] + "\"><span>" + s[1] + "</span><span class=\"c-count\">" + s[2] + "</span></a></li>";
    }).join("");

    document.getElementById("footer-line").innerHTML =
      "Built from " + (D.meta.records).toLocaleString("en-US") + " HealthKit records exported " +
      D.meta.exportDate.slice(0, 16) + ". Rendered locally in your browser, " + D.generated + ".";
  }

  /* ----------------------------------------------------------- coverage */

  function renderCoverage() {
    var host = document.getElementById("coverage-lanes");
    var categories = ["activity", "heart", "sleep", "body", "vitals", "respiratory", "mobility", "hearing", "nutrition", "mindfulness", "hygiene", "symptoms", "other"];
    var y0 = dayToDate(ALL_DAYS.min).getUTCFullYear();
    var y1 = dayToDate(ALL_DAYS.max).getUTCFullYear();
    var totalDays = ALL_DAYS.max - ALL_DAYS.min + 1;

    var html = "";
    categories.forEach(function (cat) {
      var list = METRICS.filter(function (m) { return m.category === cat && m.daily.d.length; })
        .sort(function (a, b) { return b.count - a.count; });
      if (!list.length) return;
      html += "<div class=\"lane-category\">" + catLabel(cat) + " &nbsp; " + list.length + "</div>";
      list.forEach(function (m) {
        var first = m.daily.d[0], last = m.daily.d[m.daily.d.length - 1];
        var years = {};
        m.daily.d.forEach(function (d) {
          var y = dayToDate(d).getUTCFullYear();
          years[y] = (years[y] || 0) + 1;
        });
        var cells = "";
        for (var y = y0; y <= y1; y++) {
          var daysInYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
          var density = Math.min(1, (years[y] || 0) / daysInYear);
          cells += "<rect x=\"" + ((y - y0) * 100 / (y1 - y0 + 1)) + "%\" y=\"0\" width=\"" +
            (100 / (y1 - y0 + 1)) + "%\" height=\"16\" fill=\"" + (density ? cssv("--accent") : "transparent") +
            "\" fill-opacity=\"" + (density ? Math.max(0.16, Math.min(1, density * 1.1)).toFixed(2) : 0) + "\"/>";
        }
        html += "<button class=\"lane\" data-metric=\"" + m.id + "\">" +
          "<span class=\"lane-name\">" + m.name + "</span>" +
          "<span class=\"lane-track\"><svg width=\"100%\" height=\"16\" preserveAspectRatio=\"none\">" + cells + "</svg></span>" +
          "<span class=\"lane-meta\">" + int(m.count) + " \u00b7 " + isoOf(first).slice(2, 7) + " to " + isoOf(last).slice(2, 7) + "</span>" +
          "</button>";
      });
    });
    host.innerHTML = html;
    host.querySelectorAll(".lane").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openMetric(btn.dataset.metric);
      });
    });

    var legend = document.getElementById("coverage-legend");
    var squares = [0.15, 0.4, 0.7, 1].map(function (o) {
      return "<i style=\"background:" + cssv("--accent") + ";opacity:" + o + "\"></i>";
    }).join("");
    legend.innerHTML =
      "<span>Nothing recorded</span><span>" + squares + " Fewer days &rarr; nearly every day</span>" +
      "<span>Columns are calendar years, " + y0 + " to " + y1 + "</span>";
  }

  /* ----------------------------------------------------------- activity */

  function renderActivity() {
    var steps = BY_ID["HKQuantityTypeIdentifierStepCount"];
    var distance = BY_ID["HKQuantityTypeIdentifierDistanceWalkingRunning"];
    var active = BY_ID["HKQuantityTypeIdentifierActiveEnergyBurned"];
    var basal = BY_ID["HKQuantityTypeIdentifierBasalEnergyBurned"];
    var exercise = BY_ID["HKQuantityTypeIdentifierAppleExerciseTime"];
    var flights = BY_ID["HKQuantityTypeIdentifierFlightsClimbed"];

    var allPoints = dailyPoints(steps, "sum");
    var first = allPoints[0], last = allPoints[allPoints.length - 1];
    var total = allPoints.reduce(function (s, p) { return s + p.v; }, 0);
    var activeDays = allPoints.filter(function (p) { return p.v >= 1000; }).length;

    fill(document.getElementById("activity-note"),
      "Steps run from " + longDate(isoOf(first.d)) + " to " + longDate(isoOf(last.d)) +
      ", first from a Huawei band and later from the Apple Watch. " + int(activeDays) +
      " of the " + int(allPoints.length) + " recorded days cleared 1,000 steps, and " +
      int(allPoints.filter(function (p) { return p.v >= 10000; }).length) + " cleared 10,000.");

    var host = document.querySelector('[data-chart="activity-main"]');
    function drawActivity() {
      var points = bucketPoints(metricPoints(steps), state.bucket);
      document.getElementById("activity-title").textContent =
        "Steps per " + state.bucket;
      lineChart(host, {
        points: points, kind: "bar", yZero: true, unit: "steps",
        formatY: function (v) { return compact(v); },
        tip: function (p) {
          var label = state.bucket === "day" ? longDate(isoOf(p.d)) :
            (state.bucket === "week" ? "Week of " + longDate(isoOf(p.d)) : isoOf(p.d).slice(0, 7));
          if (state.bucket === "day" && p.days > 1) {
            return "<b>" + label + "</b><br>" + int(p.v) + " steps over " + p.days + " days<br>" +
              int(p.v / p.days) + " steps a day";
          }
          return "<b>" + label + "</b><br>" + int(p.v) + " steps" +
            (p.days > 1 ? "<br>" + int(p.v / p.days) + " a day across " + p.days + " days" : "");
        }
      });
    }
    drawActivity();
    document.querySelectorAll('[data-bucket]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.bucket = btn.dataset.bucket;
        document.querySelectorAll('[data-bucket]').forEach(function (b) { b.classList.toggle("is-on", b === btn); });
        drawActivity();
      });
    });
    weekBucketPending = drawActivity;

    var hours = steps.hours.slice(), hourN = steps.hourN.slice();
    var hourItems = [];
    for (var h = 0; h < 24; h++) {
      hourItems.push({
        label: h % 3 === 0 ? (h + "h") : "",
        value: hourN[h] ? hours[h] / hourN[h] : 0,
        full: h
      });
    }
    barChart(document.querySelector('[data-chart="activity-hours"]'), {
      items: hourItems,
      formatY: function (v) { return compact(v); },
      tip: function (item) { return "<b>" + clock(item.full * 60) + "</b><br>average " + smart(item.value) + " steps per reading"; }
    });

    var weekdaySums = [0, 0, 0, 0, 0, 0, 0], weekdayDays = [0, 0, 0, 0, 0, 0, 0];
    allPoints.forEach(function (p) {
      var wd = (dayToDate(p.d).getUTCDay() + 6) % 7;
      weekdaySums[wd] += p.v; weekdayDays[wd] += 1;
    });
    var names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    barChart(document.querySelector('[data-chart="activity-weekday"]'), {
      items: names.map(function (n, i) { return { label: n, value: weekdaySums[i] / (weekdayDays[i] || 1) }; }),
      formatY: function (v) { return compact(v); },
      tip: function (item) { return "<b>" + item.label + "</b><br>average " + int(item.value) + " steps"; }
    });

    var best = allPoints.reduce(function (a, b) { return b.v > a.v ? b : a; }, allPoints[0]);
    var worst = allPoints.reduce(function (a, b) { return b.v < a.v ? b : a; }, allPoints[0]);
    var streaks = { best: 0, current: 0 };
    allPoints.forEach(function (p) { if (p.v >= 10000) { streaks.current++; streaks.best = Math.max(streaks.best, streaks.current); } else streaks.current = 0; });

    statGrid(document.getElementById("activity-stats"), [
      [int(total), "steps counted", "over " + int(allPoints.length) + " recorded days"],
      [int(total / allPoints.length), "steps on an average day", "median " + int(allPoints.map(function (p) { return p.v; }).sort(function (a, b) { return a - b; })[Math.floor(allPoints.length / 2)])],
      [int(best.v), "busiest day", longDate(isoOf(best.d))],
      [int(worst.v), "quietest day", longDate(isoOf(worst.d))],
      [streaks.best + " days", "longest run over 10,000", "days above 10,000: " + int(allPoints.filter(function (p) { return p.v >= 10000; }).length)],
      [smart(distance.daily.s.reduce(function (s, v) { return s + v; }, 0)) + " km", "walked and run", "since " + longDate(distance.first.slice(0, 10))],
      [int(active ? active.daily.s.reduce(function (s, v) { return s + v; }, 0) : 0) + " kcal", "active energy", "plus " + int(basal ? basal.daily.s.reduce(function (s, v) { return s + v; }, 0) : 0) + " kcal resting"],
      [int(exercise ? exercise.daily.s.reduce(function (s, v) { return s + v; }, 0) : 0) + " min", "exercise minutes", "tracked by the watch"],
      [int(flights ? flights.daily.s.reduce(function (s, v) { return s + v; }, 0) : 0), "flights climbed", "since " + longDate(flights.first.slice(0, 10))]
    ]);

    var months = {};
    allPoints.forEach(function (p) {
      var key = isoOf(p.d).slice(0, 7);
      if (!months[key]) months[key] = { steps: 0, days: 0, max: 0 };
      months[key].steps += p.v; months[key].days += 1; months[key].max = Math.max(months[key].max, p.v);
    });
    var distByMonth = {}, energyByMonth = {};
    dailyPoints(distance, "sum").forEach(function (p) {
      var k = isoOf(p.d).slice(0, 7); distByMonth[k] = (distByMonth[k] || 0) + p.v;
    });
    dailyPoints(active, "sum").forEach(function (p) {
      var k = isoOf(p.d).slice(0, 7); energyByMonth[k] = (energyByMonth[k] || 0) + p.v;
    });
    var rows = Object.keys(months).sort().reverse().map(function (k) {
      var m = months[k];
      return [k, int(m.steps), int(m.steps / m.days), int(m.max), m.days, smart(distByMonth[k] || 0) + " km", int(energyByMonth[k] || 0) + " kcal"];
    });
    document.getElementById("activity-months").innerHTML =
      tableHtml(rows, ["Month", "Steps", "Per day", "Best day", "Days", "Distance", "Active energy"]);
  }

  /* -------------------------------------------------------------- heart */

  function renderHeart() {
    var hr = BY_ID["HKQuantityTypeIdentifierHeartRate"];
    var resting = BY_ID["HKQuantityTypeIdentifierRestingHeartRate"];
    var hrv = BY_ID["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"];
    var vo2 = BY_ID["HKQuantityTypeIdentifierVo2Max"] || BY_ID["HKQuantityTypeIdentifierVO2Max"];
    var walkHr = BY_ID["HKQuantityTypeIdentifierWalkingHeartRateAverage"];
    var recovery = BY_ID["HKQuantityTypeIdentifierHeartRateRecoveryOneMinute"];
    var high = BY_ID["HKQuantityTypeIdentifierHighHeartRateEvent"];

    fill(document.getElementById("heart-note"),
      "The watch sampled " + int(hr.count) + " heart rates between " + longDate(hr.first.slice(0, 10)) +
      " and " + longDate(hr.last.slice(0, 10)) + ". Resting heart rate, variability and VO2 max are the three " +
      "long running measures of how the system is adapting.");

    var restingPoints = metricPoints(resting);
    lineChart(document.querySelector('[data-chart="heart-resting"]'), {
      points: restingPoints, dots: false, yZero: false, unit: "bpm",
      formatY: function (v) { return v.toFixed(0); },
      tip: function (p) {
        return "<b>" + longDate(isoOf(p.d)) + "</b><br>" + smart(p.v) + " bpm resting" +
          (p.n > 1 ? "<br>" + p.n + " readings averaged" : "");
      }
    });
    var recent = restingPoints.slice(-30).map(function (p) { return p.v; });
    var overall = restingPoints.reduce(function (s, p) { return s + p.v; }, 0) / restingPoints.length;
    document.querySelector('[data-figure="resting"]').innerHTML =
      "last 30 days <b>" + smart(recent.reduce(function (s, v) { return s + v; }, 0) / recent.length) + " bpm</b> \u00b7 lifetime <b>" +
      smart(overall) + " bpm</b>";

    histogramChart(document.querySelector('[data-chart="heart-histogram"]'), {
      bins: hr.hist, lo: hr.histMin, hi: hr.histMax,
      formatX: function (v) { return v.toFixed(0); }
    });

    var hourItems = [];
    for (var h = 0; h < 24; h++) {
      hourItems.push({
        label: h % 3 === 0 ? (h + "h") : "",
        value: hr.hourN[h] ? hr.hours[h] / hr.hourN[h] : 0,
        full: h
      });
    }
    barChart(document.querySelector('[data-chart="heart-hours"]'), {
      items: hourItems,
      formatY: function (v) { return v.toFixed(0); },
      tip: function (item) { return "<b>" + clock(item.full * 60) + "</b><br>average " + smart(item.value) + " bpm"; }
    });

    var trio = document.getElementById("heart-trio");
    trio.innerHTML = [hrv, vo2, walkHr].map(function (m) {
      return "<div class=\"panel\"><h3>" + m.name + "</h3>" +
        "<p class=\"panel-note\">" + int(m.count) + " readings \u00b7 " + longDate(m.first.slice(0, 10)) + " to " + longDate(m.last.slice(0, 10)) + "</p>" +
        "<div class=\"chart\" data-chart=\"trio-" + m.base + "\"></div></div>";
    }).join("");
    [hrv, vo2, walkHr].forEach(function (m) {
      lineChart(document.querySelector('[data-chart="trio-' + m.base + '"]'), {
        points: metricPoints(m), dots: false, yZero: false, unit: unitShort(m),
        formatY: function (v) { return v.toFixed(0); },
        tip: function (p) { return "<b>" + longDate(isoOf(p.d)) + "</b><br>" + smart(p.v) + " " + unitShort(m); }
      });
    });

    var events = [];
    if (high) {
      Object.keys(high.categories).forEach(function (k) {
        events.push([high.name, int(high.categories[k]), k.replace("HKCategoryValue", "").replace(/([a-z])([A-Z])/g, "$1 $2")]);
      });
    }
    var restingSorted = restingPoints.slice().sort(function (a, b) { return a.v - b.v; });
    statGrid(document.getElementById("heart-stats"), [
      [int(hr.count), "heart rate readings", "range " + smart(hr.min) + " to " + smart(hr.max) + " bpm"],
      [smart(hr.mean) + " bpm", "average across everything", "median of daily averages " + smart(restingSorted.length ? restingPoints.map(function (p) { return p.v; }).sort(function (a, b) { return a - b; })[Math.floor(restingPoints.length / 2)] : 0)],
      [smart(resting.min) + " to " + smart(resting.max), "resting heart rate range", int(resting.count) + " daily readings"],
      [smart(hrv.mean) + " ms", "average variability", "range " + smart(hrv.min) + " to " + smart(hrv.max)],
      [vo2 ? smart(vo2.mean) + " " + unitShort(vo2) : "-", "VO2 max average", vo2 ? int(vo2.count) + " estimates, latest " + smart(vo2.values.length ? vo2.values[vo2.values.length - 1][1] : vo2.mean) : ""],
      [recovery ? smart(recovery.mean) + " bpm" : "-", "one minute recovery", recovery ? int(recovery.count) + " sessions, best " + smart(recovery.max) : ""],
      [high ? int(high.count) : "0", "high heart rate alerts", high ? "highest " + smart(high.max || 0) + " bpm" : ""]
    ]);
  }

  /* -------------------------------------------------------------- sleep */

  function renderSleep() {
    var nights = D.nights.map(function (n) {
      return Object.assign({}, n, { day: dayFromIso(n.date) });
    }).filter(function (n) { return n.day >= (rangeStart() === -Infinity ? -Infinity : rangeStart()); });

    var stageTotals = { deep: 0, core: 0, rem: 0, awake: 0 };
    var asleep = 0, withStages = 0, bedtimes = [], wakes = [];
    nights.forEach(function (n) {
      if (n.asleep > 0) { asleep += n.asleep; withStages++; }
      stageTotals.deep += n.deep; stageTotals.core += n.core; stageTotals.rem += n.rem; stageTotals.awake += n.awake;
      if (n.start) {
        var parts = n.start.slice(11, 16).split(":");
        var minutes = +parts[0] * 60 + +parts[1];
        if (minutes < 720) minutes += 1440;
        bedtimes.push({ d: n.day, v: minutes });
      }
      if (n.end) {
        var endParts = n.end.slice(11, 16).split(":");
        wakes.push({ d: n.day, v: +endParts[0] * 60 + +endParts[1] });
      }
    });
    var avgAsleep = withStages ? asleep / withStages : 0;

    fill(document.getElementById("sleep-note"),
      int(D.nights.length) + " nights are on record. " + int(withStages) +
      " carry full stage data from the watch (core, deep, REM). The rest come from a phone or band and only " +
      "record time in bed, so they are shown as an outline rather than invented detail.");

    document.getElementById("sleep-legend").innerHTML = [
      ["deep", "Deep"], ["core", "Core"], ["rem", "REM"], ["awake", "Awake"], ["inBed", "In bed"]
    ].map(function (p) {
      return "<span style=\"display:inline-flex;align-items:center;gap:0.35rem;font-size:0.74rem;color:var(--muted)\">" +
        "<i style=\"width:10px;height:10px;background:" + sleepColour(p[0]) + "\"></i>" + p[1] + "</span>";
    }).join("&nbsp;&nbsp;");

    stackedChart(document.querySelector('[data-chart="sleep-nights"]'), {
      nights: nights,
      keys: ["deep", "core", "rem", "awake", "inBed"]
    });

    lineChart(document.querySelector('[data-chart="sleep-duration"]'), {
      points: nights.map(function (n) { return { d: n.day, v: n.asleep ? n.asleep / 60 : n.inBed / 60 }; }),
      kind: "line", dots: false, yZero: true, unit: "hours",
      formatY: function (v) { return v.toFixed(0) + "h"; },
      reference: 8,
      tip: function (p) {
        var n = nights.filter(function (x) { return x.day === p.d; })[0];
        return "<b>" + longDate(isoOf(p.d)) + "</b><br>" + smart(p.v) + " h" +
          (n && n.asleep ? "" : " (time in bed only)");
      }
    });

    scatterChart(document.querySelector('[data-chart="sleep-clock"]'), {
      points: bedtimes, unit: "clock", connect: false,
      formatY: function (v) { return clock(v); },
      tip: function (p) { return "<b>" + longDate(isoOf(p.d)) + "</b><br>asleep at " + clock(p.v); }
    });

    var goal = 8 * 60;
    var debt = nights.reduce(function (s, n) { return s + (n.asleep ? (goal - n.asleep) : 0); }, 0);
    var staged = nights.filter(function (n) { return n.asleep > 0; });
    var best = staged.reduce(function (a, b) { return b.asleep > a.asleep ? b : a; }, staged[0] || { asleep: 0 });
    var worst = staged.reduce(function (a, b) { return b.asleep < a.asleep ? b : a; }, staged[0] || { asleep: 0 });
    var bedMinutes = bedtimes.map(function (b) { return b.v; });
    var bedAvg = bedMinutes.reduce(function (s, v) { return s + v; }, 0) / (bedMinutes.length || 1);
    var wakeAvg = wakes.reduce(function (s, p) { return s + p.v; }, 0) / (wakes.length || 1);

    statGrid(document.getElementById("sleep-stats"), [
      [int(nights.length), "nights recorded", int(withStages) + " with full stages"],
      [hoursText(avgAsleep), "average time asleep", "across staged nights"],
      [(stageTotals.deep / 60 / (withStages || 1)).toFixed(2) + " h", "average deep sleep", pct(stageTotals.deep / (stageTotals.deep + stageTotals.core + stageTotals.rem || 1)) + " of staged sleep"],
      [(stageTotals.rem / 60 / (withStages || 1)).toFixed(2) + " h", "average REM", pct(stageTotals.rem / (stageTotals.deep + stageTotals.core + stageTotals.rem || 1)) + " of staged sleep"],
      [clock(bedAvg), "average bedtime", "from " + int(bedtimes.length) + " nights"],
      [clock(wakeAvg), "average wake time", "from " + int(wakes.length) + " nights"],
      [(debt / 60).toFixed(0) + " h", "shortfall against 8 h", debt > 0 ? "cumulative across staged nights" : "ahead of the 8 h mark"]
    ]);

    document.getElementById("sleep-extremes").innerHTML =
      "<li><span class=\"n-date\">" + longDate(best.date) + "</span><span class=\"n-text\">Longest night on record</span><span class=\"n-value\">" + hoursText(best.asleep) + "</span></li>" +
      "<li><span class=\"n-date\">" + longDate(worst.date) + "</span><span class=\"n-text\">Shortest staged night</span><span class=\"n-value\">" + hoursText(worst.asleep) + "</span></li>" +
      "<li><span class=\"n-date\">" + int(staged.filter(function (n) { return n.asleep >= goal; }).length) + " nights</span><span class=\"n-text\">Reached eight hours asleep</span><span class=\"n-value\">" +
      pct(staged.filter(function (n) { return n.asleep >= goal; }).length / (staged.length || 1)) + " of staged nights</span></li>";
  }

  /* --------------------------------------------------------------- body */

  function renderBody() {
    var weight = BY_ID["HKQuantityTypeIdentifierBodyMass"];
    var bmi = BY_ID["HKQuantityTypeIdentifierBodyMassIndex"];
    var fat = BY_ID["HKQuantityTypeIdentifierBodyFatPercentage"];
    var lean = BY_ID["HKQuantityTypeIdentifierLeanBodyMass"];
    var height = BY_ID["HKQuantityTypeIdentifierHeight"];

    fill(document.getElementById("body-note"),
      int(weight.count) + " weight entries between " + longDate(weight.first.slice(0, 10)) + " and " +
      longDate(weight.last.slice(0, 10)) + ". Sparse measurements are plotted one dot at a time, so no smoothing hides a gap.");

    var weightPoints = weight.values.map(function (v) { return { d: dayFromIso(v[0].slice(0, 10)), v: v[1] }; });
    scatterChart(document.querySelector('[data-chart="body-weight"]'), {
      points: weightPoints, unit: "kg",
      tip: function (p) { return "<b>" + longDate(isoOf(p.d)) + "</b><br>" + smart(p.v) + " kg"; }
    });
    var bmiPoints = bmi.values.map(function (v) { return { d: dayFromIso(v[0].slice(0, 10)), v: v[1] }; });
    scatterChart(document.querySelector('[data-chart="body-bmi"]'), {
      points: bmiPoints, unit: "kg/m\u00b2",
      tip: function (p) { return "<b>" + longDate(isoOf(p.d)) + "</b><br>BMI " + smart(p.v); }
    });
    var fatPoints = fat.values.map(function (v) { return { d: dayFromIso(v[0].slice(0, 10)), v: v[1] }; });
    scatterChart(document.querySelector('[data-chart="body-fat"]'), {
      points: fatPoints, unit: "%",
      tip: function (p) { return "<b>" + longDate(isoOf(p.d)) + "</b><br>" + smart(p.v) + "% body fat"; }
    });

    var first = weightPoints[0], last = weightPoints[weightPoints.length - 1];
    var delta = last.v - first.v;
    document.getElementById("body-other").innerHTML =
      "<li><span>Height</span><span class=\"v\">" + (height ? smart(height.max) + " cm" : "-") + "</span></li>" +
      (lean ? "<li><span>Lean body mass</span><span class=\"v\">" + smart(lean.mean) + " kg</span></li>" : "") +
      "<li><span>First weight on record</span><span class=\"v\">" + smart(first.v) + " kg</span></li>" +
      "<li><span>Most recent</span><span class=\"v\">" + smart(last.v) + " kg</span></li>";

    var lightest = weightPoints.reduce(function (a, b) { return b.v < a.v ? b : a; }, weightPoints[0]);
    var heaviest = weightPoints.reduce(function (a, b) { return b.v > a.v ? b : a; }, weightPoints[0]);
    statGrid(document.getElementById("body-stats"), [
      [smart(weight.mean) + " kg", "average weight", int(weight.count) + " entries"],
      [smart(weight.min) + " to " + smart(weight.max) + " kg", "range",
        "lowest on " + longDate(isoOf(lightest.d)) + ", highest on " + longDate(isoOf(heaviest.d))],
      [(delta > 0 ? "+" : "") + smart(delta) + " kg", "from first to last entry", longDate(isoOf(first.d)) + " to " + longDate(isoOf(last.d))],
      [smart(bmi.mean), "average BMI", int(bmi.count) + " entries, " + smart(bmi.min) + " to " + smart(bmi.max)],
      [smart(fat.mean) + "%", "average body fat", int(fat.count) + " entries from a connected scale"],
      [int(weight.sources ? Object.keys(weight.sources).length : 1), "sources writing weight", Object.keys(weight.sources || {}).join(", ")]
    ]);
  }

  /* ---------------------------------------------------- small multiples */

  function renderMultiples(hostId, ids) {
    var host = document.getElementById(hostId);
    host.innerHTML = "";
    ids.forEach(function (id) {
      var m = BY_ID[id];
      if (!m) return;
      var card = el("div", { "class": "multiple" });
      card.innerHTML = "<div class=\"multiple-head\"><h3>" + m.name + "</h3>" +
        "<span class=\"m-value\">" + smart(m.mean) + " " + unitShort(m) + "</span></div>" +
        "<p class=\"multiple-note\">" + int(m.count) + " readings \u00b7 range " + smart(m.min) + " to " + smart(m.max) +
        " " + unitShort(m) + " \u00b7 " + longDate(m.first.slice(0, 10)) + " to " + longDate(m.last.slice(0, 10)) + "</p>" +
        "<div class=\"chart\"></div>";
      host.appendChild(card);
      lineChart(card.querySelector(".chart"), {
        points: metricPoints(m), dots: false, yZero: false, unit: unitShort(m),
        area: false,
        formatY: function (v) { return compact(v); },
        tip: function (p) { return "<b>" + longDate(isoOf(p.d)) + "</b><br>" + smart(p.v) + " " + unitShort(m); }
      });
    });
  }

  /* ------------------------------------------------------------- hearing */

  function renderHearing() {
    var phones = BY_ID["HKQuantityTypeIdentifierHeadphoneAudioExposure"];
    var env = BY_ID["HKQuantityTypeIdentifierEnvironmentalAudioExposure"];
    var events = BY_ID["HKQuantityTypeIdentifierAudioExposureEvent"];
    var highHr = BY_ID["HKQuantityTypeIdentifierHighHeartRateEvent"];

    fill(document.getElementById("hearing-note"),
      int(phones.count) + " headphone readings and " + int(env.count) +
      " environmental readings. Apple counts anything sustained above 80 dB as loud enough to matter over time, and the watch flags distinct loud events.");

    histogramChart(document.querySelector('[data-chart="hearing-headphone"]'), {
      bins: phones.hist, lo: phones.histMin, hi: phones.histMax, marker: 80,
      formatX: function (v) { return v.toFixed(0) + " dB"; },
      colourFor: function (from) { return from >= 80 ? cssv("--amber") : cssv("--accent"); }
    });
    histogramChart(document.querySelector('[data-chart="hearing-environment"]'), {
      bins: env.hist, lo: env.histMin, hi: env.histMax, marker: 80,
      formatX: function (v) { return v.toFixed(0); },
      colourFor: function (from) { return from >= 80 ? cssv("--amber") : cssv("--accent"); }
    });

    var loud = 0;
    if (phones.hist) {
      var span = (phones.histMax - phones.histMin) || 1;
      phones.hist.forEach(function (count, i) {
        var from = phones.histMin + span * (i / phones.hist.length);
        if (from >= 80) loud += count;
      });
    }
    document.getElementById("hearing-events").innerHTML =
      "<li><span>Readings above 80 dB (headphones)</span><span class=\"v\">" + int(loud) + " of " + int(phones.count) + "</span></li>" +
      (events ? "<li><span>Loud environment events</span><span class=\"v\">" + int(events.count) + "</span></li>" : "") +
      (highHr ? "<li><span>High heart rate alerts</span><span class=\"v\">" + int(highHr.count) + "</span></li>" : "") +
      "<li><span>Peak headphone level</span><span class=\"v\">" + smart(phones.max) + " dB</span></li>";

    statGrid(document.getElementById("hearing-stats"), [
      [smart(phones.mean) + " dB", "average headphone level", int(phones.count) + " readings"],
      [smart(env.mean) + " dB", "average environment level", int(env.count) + " readings"],
      [smart(phones.min) + " to " + smart(phones.max) + " dB", "headphone range", "quietest to loudest"],
      [longDate(phones.first.slice(0, 10)), "first headphone reading", "earliest in the archive"],
      [int(loud), "readings above 80 dB", loud ? pct(loud / phones.count) + " of headphone samples" : "none"],
      [D.meta.sources["dB Meter"] ? int(D.meta.sources["dB Meter"]) : "0", "readings from dB Meter", "a separate sound level app"]
    ]);
  }

  /* ------------------------------------------------------------- catalog */

  function sparkline(host, metric) {
    var points = binPoints(seriesFor(metric), 60, "mean");
    createChart(host, {
      draw: function (ctx, w, h) {
        if (!points.length) return [];
        if (points.length === 1) {
          ctx.strokeStyle = cssv("--accent");
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(2, h / 2);
          ctx.lineTo(w - 2, h / 2);
          ctx.stroke();
          return [];
        }
        var values = points.map(function (p) { return p.v; });
        var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
        if (hi === lo) { lo -= 0.5; hi += 0.5; }
        var x = function (i) { return 2 + i / Math.max(1, points.length - 1) * (w - 4); };
        var y = function (v) { return h - 3 - (v - lo) / (hi - lo) * (h - 6); };
        ctx.strokeStyle = cssv("--accent");
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        points.forEach(function (p, i) {
          if (i === 0) ctx.moveTo(x(i), y(p.v)); else ctx.lineTo(x(i), y(p.v));
        });
        ctx.stroke();
        return [];
      }
    });
  }

  function metricDetail(container, metric) {
    container.innerHTML =
      "<div class=\"chart\"></div>" +
      "<div class=\"metric-sources\"></div>" +
      "<div class=\"detail-cols\">" +
      "<div><h4>Summary</h4><ul class=\"stat-list\"></ul></div>" +
      "<div class=\"daily-col\"><h4>Complete daily record</h4><div class=\"scroll\"></div></div>" +
      "</div>";

    var numeric = isNumeric(metric);
    var points = metricPoints(metric);
    lineChart(container.querySelector(".chart"), {
      points: points,
      kind: numeric && metric.aggregation === "sum" ? "bar" : "line",
      dots: points.length <= 260,
      yZero: numeric && metric.aggregation === "sum",
      unit: numeric ? unitShort(metric) : "segments",
      formatY: function (v) { return compact(v); },
      tip: function (p) {
        return "<b>" + longDate(isoOf(p.d)) + "</b><br>" +
          (numeric
            ? smart(p.v) + " " + unitShort(metric) + (metric.aggregation === "sum" ? " (daily total)" : " (daily average)")
            : int(p.v) + " segments recorded") +
          (p.days > 1 ? "<br>" + int(p.v) + " over " + p.days + " days shown as one column" : "<br>" + p.n + " readings");
      }
    });

    container.querySelector(".metric-sources").innerHTML = Object.keys(metric.sources).map(function (s) {
      return "<span class=\"source-pill\">" + s + " \u00b7 " + int(metric.sources[s]) + "</span>";
    }).join("");

    var summary = [
      ["Readings", int(metric.count)],
      ["First", longDate(metric.first.slice(0, 10))],
      ["Last", longDate(metric.last.slice(0, 10))],
      ["Days with data", int(metric.daily.d.length)],
      ["Unit", metric.unit || "category values"]
    ];
    if (numeric && metric.aggregation === "sum") summary.push(["Total", smart(metric.sum) + " " + unitShort(metric)]);
    else if (numeric) summary.push(["Average", smart(metric.mean) + " " + unitShort(metric)]);
    if (numeric && metric.min !== null) summary.push(["Lowest", smart(metric.min) + " " + unitShort(metric)]);
    if (numeric && metric.max !== null) summary.push(["Highest", smart(metric.max) + " " + unitShort(metric)]);
    if (metric.sd !== null) summary.push(["Standard deviation", smart(metric.sd) + " " + unitShort(metric)]);
    if (!numeric) summary.push(["Segments recorded", int(metric.count)]);
    Object.keys(metric.categories).slice(0, 8).forEach(function (k) {
      summary.push([k.replace("HKCategoryValue", "").replace(/([a-z])([A-Z])/g, "$1 $2"), int(metric.categories[k]) + " times"]);
    });
    container.querySelector(".stat-list").innerHTML = summary.map(function (row) {
      return "<li><span>" + row[0] + "</span><span class=\"v\">" + row[1] + "</span></li>";
    }).join("");

    var rows = metric.daily.d.map(function (d, i) {
      var value = !numeric ? metric.daily.n[i]
        : (metric.aggregation === "sum" ? metric.daily.s[i] : (metric.daily.n[i] ? metric.daily.s[i] / metric.daily.n[i] : 0));
      return [longDate(isoOf(d)), smart(value), metric.daily.n[i], metric.daily.mn[i] === null ? "-" : smart(metric.daily.mn[i]), metric.daily.mx[i] === null ? "-" : smart(metric.daily.mx[i])];
    }).reverse();
    var scroll = container.querySelector(".scroll");
    var shown = 0;
    function drawRows(count) {
      scroll.innerHTML = tableHtml(rows.slice(0, count), [
        "Day",
        !numeric ? "Segments" : (metric.aggregation === "sum" ? "Total" : "Average"),
        "Readings", "Lowest", "Highest"
      ]);
      if (count < rows.length) {
        var btn = el("button", { "class": "more-button" }, "Show " + Math.min(200, rows.length - count) + " more of " + int(rows.length) + " days");
        btn.addEventListener("click", function () { drawRows(count + 200); });
        scroll.parentNode.insertBefore(btn, scroll.nextSibling);
      }
    }
    function redrawRows() {
      var old = container.querySelector(".more-button");
      if (old) old.remove();
      shown = Math.min(60, rows.length);
      drawRows(shown);
    }
    redrawRows();

    if (metric.values && metric.values.length) {
      var col = container.querySelector(".daily-col");
      var head = el("h4", null, "Every raw entry (" + int(metric.count) + ")");
      col.insertBefore(head, col.firstChild);
      var rawScroll = el("div", { "class": "scroll" });
      rawScroll.innerHTML = tableHtml(metric.values.map(function (v) {
        return [v[0].replace("T", " ").replace(" ", " \u00b7 "), typeof v[1] === "number" ? smart(v[1]) : String(v[1]).replace("HKCategoryValue", ""), v[2]];
      }), ["Timestamp", "Value", "Source"]);
      col.appendChild(rawScroll);
    } else if (metric.valueSample && metric.valueSample.length) {
      var col2 = container.querySelector(".daily-col");
      col2.insertBefore(el("h4", null, "Sample of raw entries"), col2.firstChild);
      var sampleScroll = el("div", { "class": "scroll" });
      sampleScroll.innerHTML = tableHtml(metric.valueSample.map(function (v) {
        return [v[0].replace("T", " ").replace(" ", " \u00b7 "), typeof v[1] === "number" ? smart(v[1]) : String(v[1]), v[2]];
      }), ["Timestamp", "Value", "Source"]);
      col2.appendChild(sampleScroll);
      col2.appendChild(el("p", { "class": "table-note" },
        "Showing 300 of " + int(metric.count) + " readings. The daily record on the left covers every day this metric was captured."));
    }
  }

  function renderCatalog() {
    var cats = {};
    METRICS.forEach(function (m) { cats[m.category] = (cats[m.category] || 0) + 1; });
    var chips = document.getElementById("catalog-categories");
    chips.innerHTML = "<button class=\"is-on\" data-cat=\"all\">All " + METRICS.length + "</button>" +
      Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (c) {
        return "<button data-cat=\"" + c + "\">" + catLabel(c) + " " + cats[c] + "</button>";
      }).join("");
    chips.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.category = btn.dataset.cat;
        chips.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-on", b === btn); });
        paintCatalog();
      });
    });
    document.getElementById("catalog-sort").addEventListener("change", function (e) {
      state.sort = e.target.value;
      paintCatalog();
    });
    document.getElementById("catalog-count").textContent = METRICS.length;
    paintCatalog();
  }

  function paintCatalog() {
    var host = document.getElementById("catalog-list");
    var list = METRICS.filter(function (m) {
      if (state.category !== "all" && m.category !== state.category) return false;
      if (state.query && m.name.toLowerCase().indexOf(state.query) === -1) return false;
      return true;
    });
    var sorters = {
      count: function (a, b) { return b.count - a.count; },
      name: function (a, b) { return a.name.localeCompare(b.name); },
      recent: function (a, b) { return b.last < a.last ? -1 : 1; },
      range: function (a, b) { return b.daily.d.length - a.daily.d.length; }
    };
    list.sort(sorters[state.sort] || sorters.count);

    document.getElementById("catalog-empty").hidden = list.length > 0;
    host.innerHTML = "";
    list.forEach(function (m) {
      var row = el("div", { "class": "metric", id: "metric-" + m.base });
      var button = el("button", { "class": "metric-row", type: "button" },
        "<span><span class=\"metric-name\">" + m.name + "</span><br>" +
        "<span class=\"metric-sub\">" + catLabel(m.category) + " \u00b7 " + (m.unit ? m.unit : "categorical") + " \u00b7 " + (m.aggregation === "sum" ? "daily totals" : "daily averages") + "</span></span>" +
        "<span class=\"metric-spark\"></span>" +
        "<span class=\"metric-num m-count\">" + int(m.count) + "<br><span class=\"metric-sub\">readings</span></span>" +
        "<span class=\"metric-num m-range\">" + isoOf(m.daily.d[0]).slice(2) + "<br>" + isoOf(m.daily.d[m.daily.d.length - 1]).slice(2) + "</span>" +
        "<span class=\"metric-num\">" + (m.mean !== null ? smart(m.mean) : "-") + "<br><span class=\"metric-sub\">" + unitShort(m) + "</span></span>");
      var detail = el("div", { "class": "metric-detail" });
      detail.hidden = true;
      row.appendChild(button);
      row.appendChild(detail);
      host.appendChild(row);
      sparkline(button.querySelector(".metric-spark"), m);

      var loaded = false;
      button.addEventListener("click", function () {
        var open = detail.hidden;
        detail.hidden = !open;
        button.classList.toggle("is-open", open);
        if (open && !loaded) {
          metricDetail(detail, m);
          loaded = true;
        }
        if (open) {
          registry.forEach(function (c) { if (detail.contains(c.host)) renderChart(c); });
        }
      });
    });
  }

  function openMetric(id) {
    var m = BY_ID[id];
    if (!m) return;
    state.category = "all";
    state.query = "";
    document.querySelectorAll("#catalog-categories button").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.cat === "all");
    });
    paintCatalog();
    var row = document.getElementById("metric-" + m.base);
    if (!row) return;
    var button = row.querySelector(".metric-row");
    var detail = row.querySelector(".metric-detail");
    if (detail.hidden) button.click();
    row.scrollIntoView({ block: "center" });
    row.style.outline = "1px solid var(--accent)";
    setTimeout(function () { row.style.outline = ""; }, 1600);
  }

  /* ------------------------------------------------------------ workouts */

  function renderWorkouts() {
    var types = {};
    D.workouts.forEach(function (w) { types[w.name] = (types[w.name] || 0) + 1; });
    var chips = document.getElementById("workout-types");
    var ordered = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; });
    chips.innerHTML = "<button class=\"is-on\" data-type=\"all\">All " + D.workouts.length + "</button>" +
      ordered.map(function (t) { return "<button data-type=\"" + t + "\">" + t + " " + types[t] + "</button>"; }).join("");

    var years = {};
    D.workouts.forEach(function (w) { years[w.start.slice(0, 4)] = true; });
    document.getElementById("workout-years").innerHTML = "<option value=\"all\">Every year</option>" +
      Object.keys(years).sort().reverse().map(function (y) { return "<option value=\"" + y + "\">" + y + "</option>"; }).join("");

    chips.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.workoutType = btn.dataset.type;
        chips.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-on", b === btn); });
        paintWorkouts();
      });
    });
    document.getElementById("workout-years").addEventListener("change", function (e) {
      state.workoutYear = e.target.value;
      paintWorkouts();
    });

    var totalMinutes = D.workouts.reduce(function (s, w) { return s + (w.duration || 0); }, 0);
    fill(document.getElementById("workouts-note"),
      int(D.workouts.length) + " sessions totalling " + Math.round(totalMinutes / 60) + " hours. Walking dominates: " +
      (types["Walking"] || 0) + " of them. Strength, running and cycling make up most of the rest. " +
      "The watch logged heart rate inside each session, so average and peak effort are included per workout.");
    paintWorkouts();
  }

  function paintWorkouts() {
    var list = D.workouts.filter(function (w) {
      if (state.workoutType !== "all" && w.name !== state.workoutType) return false;
      if (state.workoutYear !== "all" && w.start.slice(0, 4) !== state.workoutYear) return false;
      return true;
    });
    var order = list.slice().reverse();
    var totalMin = list.reduce(function (s, w) { return s + (w.duration || 0); }, 0);
    var totalKm = list.reduce(function (s, w) { return s + ((w.distanceUnit === "km" ? w.distance : 0) || 0); }, 0);
    var totalKcal = list.reduce(function (s, w) { return s + ((w.energyUnit === "kcal" ? w.energy : 0) || 0); }, 0);
    var byType = {};
    list.forEach(function (w) {
      if (!byType[w.name]) byType[w.name] = { count: 0, minutes: 0, km: 0 };
      byType[w.name].count++;
      byType[w.name].minutes += w.duration || 0;
      byType[w.name].km += (w.distanceUnit === "km" ? w.distance : 0) || 0;
    });

    document.getElementById("workout-summary").innerHTML =
      "<div class=\"stat-grid\">" +
      [["Sessions", int(list.length), "filtered"],
       ["Time", durationText(totalMin * 60), int(totalMin / (list.length || 1)) + " min average"],
       ["Distance", smart(totalKm) + " km", "across all sessions"],
       ["Energy", int(totalKcal) + " kcal", "active energy burned"],
       ["Types", int(Object.keys(byType).length), orderedTypes(byType).slice(0, 3).join(", ")]]
        .map(function (i) { return "<div><dt>" + i[0] + "</dt><dd>" + i[1] + (i[2] ? "<small>" + i[2] + "</small>" : "") + "</dd></div>"; })
        .join("") + "</div>";

    function orderedTypes(map) {
      return Object.keys(map).sort(function (a, b) { return map[b].count - map[a].count; });
    }

    var routeByDate = {};
    D.routes.forEach(function (r) { routeByDate[r.date] = r; });

    var rows = order.map(function (w) {
      var avgHr = w.hrAvg, maxHr = w.hrMax;
      if (avgHr === undefined) {
        w.stats.forEach(function (s) {
          if (s.type === "HKQuantityTypeIdentifierHeartRate") {
            avgHr = s.average; maxHr = s.maximum;
          }
        });
      }
      var route = routeByDate[w.start.slice(0, 10)];
      return [
        "<span class=\"wk-date\">" + longDate(w.start.slice(0, 10)) + "</span> <span class=\"metric-sub\">" + clockOf(w.start) + "</span>",
        (route ? "<a href=\"#routes\">" + w.name + "</a>" : w.name),
        durationText((w.duration || 0) * 60),
        w.distance ? smart(w.distance) + " " + (w.distanceUnit || "") : "-",
        w.energy ? int(w.energy) + " kcal" : "-",
        avgHr ? smart(avgHr) + " bpm" : "-",
        maxHr ? smart(maxHr) + " bpm" : "-",
        w.source
      ];
    });
    document.getElementById("workout-table").innerHTML =
      tableHtml(rows, ["Date", "Activity", "Duration", "Distance", "Energy", "Avg HR", "Peak HR", "Recorded by"]);
  }

  /* -------------------------------------------------------------- routes */

  function renderRoutes() {
    var host = document.getElementById("route-grid");
    var total = D.routes.reduce(function (s, r) { return s + r.distance; }, 0);
    fill(document.getElementById("routes-note"),
      int(D.routes.length) + " GPS tracks covering " + (total / 1000).toFixed(1) + " km, exported alongside the workouts. " +
      "Each shape is drawn from the recorded track with its starting point removed, so the cards show the shape of a walk without publishing where it happened.");

    var sorted = D.routes.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    host.innerHTML = sorted.map(function (r) {
      var xs = r.path.map(function (p) { return p[0]; });
      var ys = r.path.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var w = 100, h = 108, pad = 8;
      var scale = Math.min((w - pad * 2) / ((x1 - x0) || 1), (h - pad * 2) / ((y1 - y0) || 1));
      var offx = pad + ((w - pad * 2) - (x1 - x0) * scale) / 2;
      var offy = pad + ((h - pad * 2) - (y1 - y0) * scale) / 2;
      var d = r.path.map(function (p, i) {
        var px = offx + (p[0] - x0) * scale;
        var py = h - (offy + (p[1] - y0) * scale);
        return (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
      }).join(" ");
      var seconds = r.start && r.end ? (Date.parse(r.end) - Date.parse(r.start)) / 1000 : null;
      var shape = r.degenerate
        ? "<circle cx=\"50\" cy=\"54\" r=\"4\" fill=\"none\" stroke=\"" + cssv("--accent") + "\" stroke-width=\"1.6\"/>"
        : "<path d=\"" + d + "\" fill=\"none\" stroke=\"" + cssv("--accent") + "\" stroke-width=\"1.4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>";
      return "<div class=\"route-card\">" +
        "<svg class=\"route-svg\" viewBox=\"0 0 100 108\" preserveAspectRatio=\"xMidYMid meet\">" +
        shape +
        "</svg>" +
        "<div class=\"route-meta\"><div class=\"r-top\"><span>" + longDate(r.date) + "</span><span>" + (seconds ? durationText(seconds) : "") + "</span></div>" +
        "<div class=\"r-dist\">" + (r.degenerate ? "single fix" : (r.distance / 1000).toFixed(2) + " km") +
        " <span class=\"metric-sub\">\u00b7 " + int(r.points) + (r.points === 1 ? " point" : " points") +
        (r.degenerate ? " \u00b7 no track recorded" : " \u00b7 +" + int(r.gain) + " m") + "</span></div>" +
        "</div></div>";
    }).join("");
  }

  /* ----------------------------------------------------------------- ecg */

  function renderEcg() {
    var host = document.getElementById("ecg-list");
    fill(document.getElementById("ecg-note"),
      D.ecgs.length + " single lead recordings, each about thirty seconds at " +
      (D.ecgs[0] ? D.ecgs[0].rate : "512 hertz") + ". These are the raw " +
      (D.ecgs[0] && D.ecgs[0].lead ? D.ecgs[0].lead : "Lead I") +
      " signals from the watch, stored in microvolts and drawn here in millivolts at full resolution.");
    host.innerHTML = D.ecgs.map(function (e) {
      var samples = e.trace;
      var lo = Math.min.apply(null, samples), hi = Math.max.apply(null, samples);
      var span = (hi - lo) || 1;
      var w = 1000, h = 150;
      var path = samples.map(function (v, i) {
        var x = i / (samples.length - 1) * w;
        var y = (h / 2) - ((v - (lo + hi) / 2) / span) * (h * 0.78);
        return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      }).join(" ");
      return "<div class=\"ecg\">" +
        "<div class=\"ecg-head\"><h3>" + longDate(e.recorded.slice(0, 10)) + " \u00b7 " + clockOf(e.recorded) + "</h3>" +
        "<span class=\"ecg-class\">" + e.classification + "</span></div>" +
        "<svg class=\"ecg-svg\" viewBox=\"0 0 1000 150\" preserveAspectRatio=\"none\">" +
        "<line x1=\"0\" y1=\"75\" x2=\"1000\" y2=\"75\" stroke=\"" + cssv("--grid") + "\" stroke-width=\"1\"/>" +
        "<path d=\"" + path + "\" fill=\"none\" stroke=\"" + cssv("--accent") + "\" stroke-width=\"0.9\" stroke-linejoin=\"round\"/>" +
        "</svg>" +
        "<div class=\"ecg-meta\"><span>Recorded by " + e.device + "</span><span>" + e.rate + "</span>" +
        "<span>" + int(e.samples) + " samples</span><span>Software " + e.software + "</span>" +
        (e.symptoms ? "<span>Symptoms: " + e.symptoms + "</span>" : "<span>No symptoms recorded</span>") +
        "<span>Range " + lo.toFixed(3) + " to " + hi.toFixed(3) + " mV</span></div>" +
        "</div>";
    }).join("");
  }

  /* -------------------------------------------------------------- sources */

  function renderSources() {
    var entries = Object.keys(D.meta.sources).map(function (k) { return { label: k, value: D.meta.sources[k] }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 12);
    var note = document.getElementById("sources-note");
    if (note) {
      note.textContent = "Which software wrote the " + int(D.meta.records) + " readings in this export.";
    }
    var max = entries.length ? entries[0].value : 1;
    document.getElementById("sources-bars").innerHTML = entries.map(function (e) {
      return "<div class=\"source-bar\"><span class=\"sb-name\">" + e.label + "</span>" +
        "<span class=\"sb-track\"><i style=\"width:" + Math.max(0.4, e.value / max * 100).toFixed(1) + "%\"></i></span>" +
        "<span class=\"sb-value\">" + int(e.value) + "</span></div>";
    }).join("") + "<p class=\"table-note\">Readings written by each source. The watch supplies most of the volume " +
      "because heart rate and audio exposure are sampled every few minutes.</p>";
    var list = document.getElementById("export-details");
    var me = D.meta.me;
    list.innerHTML = [
      ["Exported", D.meta.exportDate.slice(0, 16)],
      ["Records in file", int(D.meta.records)],
      ["Biological sex", (me.sex || "").replace("HKBiologicalSex", "") || "not set"],
      ["Blood type", (me.blood || "").replace("HKBloodType", "") || "not set"],
      ["Fitzpatrick skin type", (me.skin || "").replace("HKFitzpatrickSkinType", "") || "not set"],
      ["Cardio fitness medication", me.meds || "not set"],
      ["Sources that wrote data", int(Object.keys(D.meta.sources).length)],
      ["Mapped routes", int(D.meta.routeCount)],
      ["ECG files", int(D.meta.ecgCount)]
    ].map(function (row) {
      return "<li><span>" + row[0] + "</span><span class=\"v\">" + row[1] + "</span></li>";
    }).join("");
  }

  /* -------------------------------------------------------------- methods */

  function renderNotes() {
    var days = ALL_DAYS.max - ALL_DAYS.min + 1;
    document.getElementById("method-notes").innerHTML =
      "<div><h3>What you are looking at</h3>" +
      "<p>Everything here comes from one HealthKit export, read on your own machine. " + int(D.meta.records) +
      " raw readings were collapsed into daily values per metric: sums where the metric accumulates through a day (steps, distance, energy, exercise minutes) and averages where a day has many readings of one state (heart rate, variability, weight).</p>" +
      "<p>Accumulating metrics use one device per day. The watch and the phone both recorded every walk, and adding them together roughly doubled that day, so each day takes its values from a single source in priority order: Apple Watch, then iPhone, then the Huawei band. That decision rebuilt 3,051 metric-days here. The band sometimes read several times higher than both carried devices on the same day, and those days follow the watch instead.</p>" +
      "<p>The full daily series is drawn for every metric, which is " + int(METRICS.reduce(function (s, m) { return s + m.daily.d.length; }, 0)) +
      " metric-days. Sparse metrics also list every individual raw entry. Dense metrics such as heart rate keep a 300 reading sample in the page and their complete daily history.</p></div>" +
      "<div><h3>Where the numbers come from</h3>" +
      "<p>Data spans " + int(days) + " days, but not evenly. Steps and distance start in January 2018 from a Huawei band; the Apple Watch begins on 8 November 2023 and everything from heart rate variability to sleep stages starts there. Early sleep entries record only time in bed, so they are labelled that way rather than being counted as sleep.</p>" +
      "<p>Percentages are stored by Apple both as 0 to 1 fractions and as 0 to 100 values depending on the metric. Blood oxygen, body fat, walking asymmetry and steadiness were converted to 0 to 100 so every percentage reads the same way.</p></div>" +
      "<div><h3>Limits worth knowing</h3>" +
      "<p>Sleep is attributed to the night it began, using a midday boundary, so a session that starts at 5am is counted as the previous night. Bedtime and wake times are drawn from the earliest start and latest end in each night.</p>" +
      "<p>The export also contains a 263 MB clinical document archive and this page does not read it, because it duplicates the same records in a different format. No clinical records were present in this export.</p>" +
      "<p>Nothing on this page is medical advice. It is a faithful reading of what your devices recorded, which is not the same as what your body did.</p></div>";
  }

  /* ---------------------------------------------------------------- wiring */

  document.querySelectorAll(".range button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.range = btn.dataset.range;
      document.querySelectorAll(".range button").forEach(function (b) { b.classList.toggle("is-on", b === btn); });
      rebuild();
    });
  });

  var searchInput = document.getElementById("search");
  var searchResults = document.getElementById("search-results");
  searchInput.addEventListener("input", function () {
    var q = searchInput.value.trim().toLowerCase();
    state.query = q;
    if (!q) {
      searchResults.hidden = true;
      paintCatalog();
      return;
    }
    var matches = METRICS.filter(function (m) {
      return m.name.toLowerCase().indexOf(q) !== -1 || m.base.toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
    searchResults.innerHTML = matches.map(function (m) {
      return "<button type=\"button\" data-id=\"" + m.id + "\"><span>" + m.name + "</span><span class=\"r-count\">" + int(m.count) + "</span></button>";
    }).join("") || "<button type=\"button\" disabled><span>No metric matches</span></button>";
    searchResults.hidden = false;
    searchResults.querySelectorAll("button[data-id]").forEach(function (b) {
      b.addEventListener("click", function () {
        searchResults.hidden = true;
        openMetric(b.dataset.id);
      });
    });
    paintCatalog();
  });
  searchInput.addEventListener("blur", function () { setTimeout(function () { searchResults.hidden = true; }, 160); });
  document.addEventListener("click", function (e) {
    if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.hidden = true;
  });

  function rebuild() {
    registry.length = 0;
    renderCoverage();
    renderActivity();
    renderHeart();
    renderSleep();
    renderBody();
    renderMultiples("mobility-multiples", [
      "HKQuantityTypeIdentifierWalkingSpeed",
      "HKQuantityTypeIdentifierWalkingStepLength",
      "HKQuantityTypeIdentifierWalkingDoubleSupportPercentage",
      "HKQuantityTypeIdentifierWalkingAsymmetryPercentage",
      "HKQuantityTypeIdentifierStairAscentSpeed",
      "HKQuantityTypeIdentifierStairDescentSpeed",
      "HKQuantityTypeIdentifierAppleWalkingSteadiness",
      "HKQuantityTypeIdentifierSixMinuteWalkTestDistance"
    ]);
    renderMultiples("vitals-multiples", [
      "HKQuantityTypeIdentifierRespiratoryRate",
      "HKQuantityTypeIdentifierOxygenSaturation",
      "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute",
      "HKQuantityTypeIdentifierPhysicalEffort",
      "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
      "HKQuantityTypeIdentifierSleepingWristTemperature"
    ]);
    renderHearing();
    paintCatalog();
    paintWorkouts();
    renderRoutes();
    renderEcg();
    renderSources();
  }

  applyTheme();
  renderOpening();
  renderCatalog();
  renderWorkouts();
  renderNotes();
  rebuild();
  appReady = true;
  }

  fetch("../data/archive.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(start)
    .catch(function (error) {
      document.body.innerHTML = "<p style=\"padding:2rem;font-family:system-ui\">" +
        "Could not load ../data/archive.json (" + error.message + "). " +
        "It is generated by tools/build-data.mjs.</p>";
    });
})();
