/* Shared chart engine for the progress dashboard and the health archive.
   Plain canvas, no dependencies, works offline. Exposes window.HealthCharts. */

(function () {
  "use strict";

  var DAY = 86400000;
  var EPOCH = Date.UTC(2000, 0, 1);
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ------------------------------------------------------------- formatting */

  function dayToDate(day) { return new Date(EPOCH + day * DAY); }
  function dayFromIso(iso) { return Math.round((Date.parse(iso + "T00:00:00Z") - EPOCH) / DAY); }
  function isoOf(day) { return dayToDate(day).toISOString().slice(0, 10); }
  function longDate(iso) {
    if (!iso) return "";
    return +iso.slice(8, 10) + " " + MONTHS[+iso.slice(5, 7) - 1] + " " + iso.slice(0, 4);
  }
  function shortDate(iso) {
    if (!iso) return "";
    return +iso.slice(8, 10) + " " + MONTHS[+iso.slice(5, 7) - 1];
  }
  function clockOf(iso) {
    if (!iso || iso.length < 16) return "";
    return iso.slice(11, 16);
  }
  function int(n) { return Math.round(n).toLocaleString("en-US"); }
  function one(n, digits) { return (n === null || n === undefined || isNaN(n)) ? "-" : Number(n).toFixed(digits); }
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
  function hoursText(minutes) {
    if (minutes === null || minutes === undefined) return "-";
    var h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return h + "h " + (m < 10 ? "0" : "") + m + "m";
  }
  function durationText(seconds) {
    var h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
    return h ? h + "h " + (m < 10 ? "0" : "") + m + "m" : m + "m";
  }
  function minutesToClock(minutes) {
    var m = ((minutes % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = Math.round(m % 60);
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  /* ------------------------------------------------------------------ theme */

  function readStored(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStored(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  var themeMode = readStored("health-theme") || "auto";
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var charts = [];
  var colourCache = {};

  function resolvedTheme() {
    return themeMode === "auto" ? (media.matches ? "dark" : "light") : themeMode;
  }
  function cssv(name) {
    var key = resolvedTheme() + name;
    if (colourCache[key]) return colourCache[key];
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    colourCache[key] = value || "#000";
    return colourCache[key];
  }
  function applyTheme() {
    document.documentElement.dataset.theme = resolvedTheme();
    document.dispatchEvent(new CustomEvent("themechange"));
  }
  function initTheme() {
    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        themeMode = themeMode === "auto" ? "light" : themeMode === "light" ? "dark" : "auto";
        writeStored("health-theme", themeMode);
        applyTheme();
      });
    }
    if (media.addEventListener) {
      media.addEventListener("change", function () { if (themeMode === "auto") applyTheme(); });
    }
    applyTheme();
  }

  /* ---------------------------------------------------------------- tooltip */

  var tipEl = null;
  function tip(html, x, y) {
    if (!tipEl) tipEl = document.getElementById("tip");
    if (!tipEl) return;
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    var rect = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.min(window.innerWidth - rect.width - 12, Math.max(8, x + 14)) + "px";
    tipEl.style.top = Math.max(8, y - rect.height - 12) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  /* ----------------------------------------------------------- chart plumbing */

  function createChart(host, spec) {
    host.innerHTML = "";
    var canvas = document.createElement("canvas");
    host.appendChild(canvas);
    var chart = { host: host, canvas: canvas, spec: spec, pointer: null };
    charts.push(chart);
    canvas.addEventListener("mousemove", function (event) {
      var rect = canvas.getBoundingClientRect();
      chart.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, px: event.clientX, py: event.clientY };
      render(chart);
    });
    canvas.addEventListener("mouseleave", function () {
      chart.pointer = null;
      hideTip();
      render(chart);
    });
    render(chart);
    return chart;
  }

  function render(chart) {
    var rect = chart.host.getBoundingClientRect();
    var w = Math.max(60, rect.width);
    var h = Math.max(50, rect.height);
    var dpr = window.devicePixelRatio || 1;
    chart.canvas.width = Math.round(w * dpr);
    chart.canvas.height = Math.round(h * dpr);
    var ctx = chart.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    chart.points = chart.spec.draw(ctx, w, h, chart) || [];
  }

  function redrawAll() { charts.forEach(render); }
  function clearCharts() { charts.length = 0; }

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 140);
  });
  document.addEventListener("themechange", function () {
    colourCache = {};
    redrawAll();
  });

  /* ------------------------------------------------------------------ scales */

  function axes(ctx, w, h, x0, x1, y0, y1, opts) {
    opts = opts || {};
    var pad = { l: opts.padLeft || 46, r: 12, t: 12, b: 24 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    if (x1 === x0) x1 = x0 + 1;
    if (y1 === y0) y1 = y0 + 1;
    var x = function (v) { return pad.l + (v - x0) / (x1 - x0) * iw; };
    var y = function (v) { return pad.t + ih - (v - y0) / (y1 - y0) * ih; };
    ctx.lineWidth = 1;
    var ticks = opts.yTicks || 4;
    for (var i = 0; i <= ticks; i++) {
      var value = y0 + (y1 - y0) * (i / ticks);
      var py = Math.round(y(value)) + 0.5;
      ctx.strokeStyle = cssv("--grid");
      ctx.beginPath();
      ctx.moveTo(pad.l, py);
      ctx.lineTo(w - pad.r, py);
      ctx.stroke();
      ctx.fillStyle = cssv("--muted");
      ctx.textAlign = "right";
      ctx.fillText(opts.formatY ? opts.formatY(value) : compact(value), pad.l - 7, py);
    }
    var span = x1 - x0;
    var marks = [];
    if (span > 800) {
      for (var year = dayToDate(x0).getUTCFullYear() + 1; year <= dayToDate(x1).getUTCFullYear(); year++) {
        marks.push({ day: dayFromIso(year + "-01-01"), label: String(year) });
      }
    } else if (span > 150) {
      for (var cursor = dayToDate(x0); cursor <= dayToDate(x1); cursor = new Date(cursor.getTime() + 30 * DAY)) {
        marks.push({ day: dayFromIso(cursor.toISOString().slice(0, 10)), label: MONTHS[cursor.getUTCMonth()] });
      }
    } else {
      for (var d = Math.ceil(x0 / 7) * 7; d <= x1; d += 7) marks.push({ day: d, label: isoOf(d).slice(5) });
    }
    ctx.textAlign = "center";
    marks.forEach(function (mark) {
      var px = x(mark.day);
      if (px < pad.l - 1 || px > w - pad.r + 1) return;
      ctx.fillStyle = cssv("--muted");
      ctx.fillText(mark.label, px, h - pad.b + 11);
      ctx.strokeStyle = cssv("--grid");
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, pad.t);
      ctx.lineTo(Math.round(px) + 0.5, pad.t + ih);
      ctx.stroke();
    });
    return { x: x, y: y, iw: iw, ih: ih, pad: pad, x0: x0, x1: x1, y0: y0, y1: y1 };
  }

  function niceTop(value) {
    if (value <= 0) return 1;
    var magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    var norm = value / magnitude;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * magnitude;
  }

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
      if (mode === "max") value = slice.reduce(function (s, p) { return Math.max(s, p.v); }, -Infinity);
      else if (mode === "total") value = slice.reduce(function (s, p) { return s + p.v; }, 0);
      else value = slice.reduce(function (s, p) { return s + p.v; }, 0) / slice.length;
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

  function drawEmpty(ctx, w, h, text) {
    ctx.fillStyle = cssv("--muted");
    ctx.textAlign = "center";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(text, w / 2, h / 2);
    ctx.strokeStyle = cssv("--grid");
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    return [];
  }

  /* ------------------------------------------------------------------ charts */

  function lineChart(host, opts) {
    var points = opts.points || [];
    var kind = opts.kind || "line";
    var showDots = opts.dots !== false && points.length <= 260;
    return createChart(host, {
      draw: function (ctx, w, h, chart) {
        if (!points.length) return drawEmpty(ctx, w, h, opts.emptyText || "no data yet");
        var values = points.map(function (p) { return p.v; });
        var lo = opts.yMin !== undefined ? opts.yMin : Math.min.apply(null, values);
        var hi = opts.yMax !== undefined ? opts.yMax : Math.max.apply(null, values);
        if (opts.band) { lo = Math.min(lo, opts.band[0]); hi = Math.max(hi, opts.band[1]); }
        var span = hi - lo || Math.abs(hi) || 1;
        lo = opts.yZero ? Math.min(0, lo) : lo - span * 0.12;
        hi = hi + span * 0.12;
        if (opts.yZero) hi = Math.max(hi, niceTop(Math.max.apply(null, values)) * 1.05);
        var g = axes(ctx, w, h, points[0].d, points[points.length - 1].d || points[0].d + 1, lo, hi, { formatY: opts.formatY });
        var accent = opts.colour || cssv("--accent");
        if (opts.band) {
          ctx.fillStyle = cssv("--accent-soft");
          ctx.globalAlpha = 0.5;
          ctx.fillRect(g.pad.l, g.y(opts.band[1]), g.iw, Math.max(1, g.y(opts.band[0]) - g.y(opts.band[1])));
          ctx.globalAlpha = 1;
        }
        var visible = binPoints(points, Math.max(2, Math.floor(g.iw / 2)), kind === "bar" ? "total" : "mean");
        if (kind === "bar") {
          var barWidth = Math.max(1, g.iw / visible.length - 1);
          ctx.fillStyle = accent;
          visible.forEach(function (p) {
            var px = g.x(p.d), py = g.y(p.v), base = g.y(Math.max(0, lo));
            ctx.fillRect(px - barWidth / 2, py, barWidth, Math.max(1, base - py));
          });
        } else {
          if (opts.area !== false) {
            var gradient = ctx.createLinearGradient(0, g.pad.t, 0, g.pad.t + g.ih);
            gradient.addColorStop(0, accent + "44");
            gradient.addColorStop(1, accent + "06");
            ctx.fillStyle = gradient;
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
        if (chart.pointer) {
          var hit = nearest(points, chart.pointer.x, g.x);
          if (hit) {
            ctx.strokeStyle = cssv("--ink");
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(g.x(hit.d), g.pad.t);
            ctx.lineTo(g.x(hit.d), g.pad.t + g.ih);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(g.x(hit.d), g.y(hit.v), 3.4, 0, 6.284);
            ctx.fill();
            tip(opts.tip ? opts.tip(hit, g) : "<b>" + longDate(isoOf(hit.d)) + "</b><br>" + smart(hit.v), chart.pointer.px, chart.pointer.py);
          } else {
            hideTip();
          }
        }
        return visible;
      }
    });
  }

  function barChart(host, opts) {
    var items = opts.items || [];
    return createChart(host, {
      draw: function (ctx, w, h, chart) {
        if (!items.length) return drawEmpty(ctx, w, h, opts.emptyText || "no data yet");
        var values = items.map(function (i) { return i.value; });
        var hi = niceTop(Math.max.apply(null, values.concat([0])) * 1.08) || 1;
        var pad = { l: opts.padLeft || 46, r: 10, t: 12, b: 26 };
        var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
        ctx.lineWidth = 1;
        for (var t = 0; t <= 3; t++) {
          var value = hi * (t / 3);
          var py = Math.round(pad.t + ih - (value / hi) * ih) + 0.5;
          ctx.strokeStyle = cssv("--grid");
          ctx.beginPath();
          ctx.moveTo(pad.l, py);
          ctx.lineTo(w - pad.r, py);
          ctx.stroke();
          ctx.fillStyle = cssv("--muted");
          ctx.textAlign = "right";
          ctx.fillText(opts.formatY ? opts.formatY(value) : compact(value), pad.l - 7, py);
        }
        var slot = iw / items.length;
        var barWidth = Math.max(2, slot - Math.max(2, slot * 0.28));
        var points = [];
        items.forEach(function (item, i) {
          var cx = pad.l + slot * (i + 0.5);
          var py = pad.t + ih - (item.value / hi) * ih;
          var hovered = chart.pointer && Math.abs(chart.pointer.x - cx) < slot / 2 && chart.pointer.y > pad.t - 6;
          ctx.fillStyle = item.colour || (hovered ? cssv("--ink") : cssv("--accent"));
          ctx.globalAlpha = item.muted ? 0.4 : 1;
          ctx.fillRect(cx - barWidth / 2, py, barWidth, Math.max(1, pad.t + ih - py));
          ctx.globalAlpha = 1;
          if (opts.goal !== undefined) {
            var goalY = pad.t + ih - (opts.goal / hi) * ih;
            ctx.strokeStyle = cssv("--amber");
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(pad.l, goalY);
            ctx.lineTo(w - pad.r, goalY);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (item.label) {
            ctx.fillStyle = cssv("--muted");
            ctx.textAlign = "center";
            ctx.fillText(item.label, cx, h - pad.b + 12);
          }
          points.push({ x: cx, y: py, item: item });
        });
        if (chart.pointer) {
          var best = null, dist = Infinity;
          points.forEach(function (p) {
            var dd = Math.abs(p.x - chart.pointer.x);
            if (dd < dist) { dist = dd; best = p; }
          });
          if (best && dist < slot / 2 + 4) {
            tip(opts.tip ? opts.tip(best.item) : "<b>" + best.item.label + "</b><br>" + smart(best.item.value), chart.pointer.px, chart.pointer.py);
          } else {
            hideTip();
          }
        }
        return points;
      }
    });
  }

  function histogramChart(host, opts) {
    var bins = opts.bins || [];
    var lo = opts.lo, hi = opts.hi;
    return createChart(host, {
      draw: function (ctx, w, h, chart) {
        if (!bins.length) return drawEmpty(ctx, w, h, opts.emptyText || "no data yet");
        var max = Math.max.apply(null, bins) || 1;
        var pad = { l: 46, r: 10, t: 12, b: 24 };
        var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
        ctx.lineWidth = 1;
        for (var t = 0; t <= 3; t++) {
          var value = max * (t / 3);
          var py = Math.round(pad.t + ih - (value / max) * ih) + 0.5;
          ctx.strokeStyle = cssv("--grid");
          ctx.beginPath();
          ctx.moveTo(pad.l, py);
          ctx.lineTo(w - pad.r, py);
          ctx.stroke();
          ctx.fillStyle = cssv("--muted");
          ctx.textAlign = "right";
          ctx.fillText(compact(value), pad.l - 7, py);
        }
        var slot = iw / bins.length;
        bins.forEach(function (count, i) {
          var px = pad.l + slot * i;
          var py = pad.t + ih - (count / max) * ih;
          var from = lo + (hi - lo) * (i / bins.length);
          var hovered = chart.pointer && chart.pointer.x >= px && chart.pointer.x < px + slot;
          ctx.fillStyle = opts.colourFor ? opts.colourFor(from) : cssv("--accent");
          ctx.globalAlpha = hovered ? 1 : 0.82;
          ctx.fillRect(px + 0.5, py, Math.max(1, slot - 1), Math.max(1, pad.t + ih - py));
          ctx.globalAlpha = 1;
        });
        ctx.fillStyle = cssv("--muted");
        ctx.textAlign = "center";
        for (var k = 0; k <= 5; k++) {
          var value2 = lo + (hi - lo) * (k / 5);
          ctx.fillText(opts.formatX ? opts.formatX(value2) : smart(value2), pad.l + iw * (k / 5), h - pad.b + 11);
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
        if (chart.pointer) {
          var index = Math.floor((chart.pointer.x - pad.l) / slot);
          if (index >= 0 && index < bins.length && chart.pointer.y >= pad.t - 6) {
            var from2 = lo + (hi - lo) * (index / bins.length);
            var to2 = lo + (hi - lo) * ((index + 1) / bins.length);
            tip("<b>" + smart(from2) + " to " + smart(to2) + "</b><br>" + int(bins[index]) + " readings", chart.pointer.px, chart.pointer.py);
          } else {
            hideTip();
          }
        }
        return [];
      }
    });
  }

  function stackedChart(host, opts) {
    var rows = opts.rows || [];
    var keys = opts.keys || [];
    return createChart(host, {
      draw: function (ctx, w, h, chart) {
        if (!rows.length) return drawEmpty(ctx, w, h, opts.emptyText || "no data yet");
        var totals = rows.map(function (row) {
          return keys.reduce(function (s, k) { return s + (row[k] || 0); }, 0) / 60;
        });
        var hi = niceTop(Math.max.apply(null, totals.concat([1])) * 1.08);
        var g = axes(ctx, w, h, rows[0].day, rows[rows.length - 1].day + 1, 0, hi, {
          formatY: function (v) { return v.toFixed(0) + "h"; }
        });
        var slot = g.iw / rows.length;
        var barWidth = Math.max(1, slot - Math.max(0.6, slot * 0.18));
        var bars = [];
        rows.forEach(function (row, i) {
          var x = g.pad.l + slot * i + slot / 2;
          var base = g.pad.t + g.ih;
          keys.forEach(function (k) {
            var minutes = row[k] || 0;
            if (minutes <= 0) return;
            var height = (minutes / 60) / hi * g.ih;
            ctx.fillStyle = opts.colourFor ? opts.colourFor(k) : cssv("--accent");
            ctx.fillRect(x - barWidth / 2, base - height, barWidth, height);
            base -= height;
          });
          bars.push({ x: x, row: row });
        });
        if (chart.pointer) {
          var best = null, dist = Infinity;
          bars.forEach(function (b) {
            var dd = Math.abs(b.x - chart.pointer.x);
            if (dd < dist) { dist = dd; best = b; }
          });
          if (best && dist < Math.max(6, slot)) {
            tip(opts.tip ? opts.tip(best.row) : "", chart.pointer.px, chart.pointer.py);
          } else {
            hideTip();
          }
        }
        return bars;
      }
    });
  }

  function scatterChart(host, opts) {
    var points = opts.points || [];
    return createChart(host, {
      draw: function (ctx, w, h, chart) {
        if (!points.length) return drawEmpty(ctx, w, h, opts.emptyText || "no data yet");
        var values = points.map(function (p) { return p.v; });
        var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
        var span = (hi - lo) || Math.abs(hi) || 1;
        lo -= span * 0.15;
        hi += span * 0.15;
        if (opts.yMin !== undefined) lo = opts.yMin;
        if (opts.yMax !== undefined) hi = opts.yMax;
        var g = axes(ctx, w, h, points[0].d, points[points.length - 1].d || points[0].d + 1, lo, hi, { formatY: opts.formatY });
        var accent = opts.colour || cssv("--accent");
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
        if (opts.goal !== undefined) {
          ctx.strokeStyle = cssv("--amber");
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(g.pad.l, g.y(opts.goal));
          ctx.lineTo(w - g.pad.r, g.y(opts.goal));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (chart.pointer) {
          var hit = nearest(points, chart.pointer.x, g.x);
          if (hit) {
            ctx.strokeStyle = cssv("--ink");
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.moveTo(g.x(hit.d), g.pad.t);
            ctx.lineTo(g.x(hit.d), g.pad.t + g.ih);
            ctx.stroke();
            ctx.globalAlpha = 1;
            tip(opts.tip ? opts.tip(hit) : "<b>" + longDate(isoOf(hit.d)) + "</b><br>" + smart(hit.v), chart.pointer.px, chart.pointer.py);
          } else {
            hideTip();
          }
        }
        return points;
      }
    });
  }

  window.HealthCharts = {
    // formatting
    int: int, one: one, compact: compact, smart: smart, hoursText: hoursText,
    durationText: durationText, minutesToClock: minutesToClock,
    // dates
    DAY: DAY, EPOCH: EPOCH, dayToDate: dayToDate, dayFromIso: dayFromIso, isoOf: isoOf,
    longDate: longDate, shortDate: shortDate, clockOf: clockOf, months: MONTHS,
    // theme and drawing
    initTheme: initTheme, applyTheme: applyTheme, cssv: cssv, resolvedTheme: resolvedTheme,
    themeMode: function () { return themeMode; },
    tip: tip, hideTip: hideTip, clearCharts: clearCharts, redrawAll: redrawAll,
    axes: axes, niceTop: niceTop, binPoints: binPoints, nearest: nearest, drawEmpty: drawEmpty,
    lineChart: lineChart, barChart: barChart, histogramChart: histogramChart,
    stackedChart: stackedChart, scatterChart: scatterChart
  };
})();
