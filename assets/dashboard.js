/* Progress dashboard. Reads data/progress.json (Apple Health, rebuilt locally)
   and data/logbook.json (Notion, synced nightly). Bilingual: English and
   Traditional Chinese (Hong Kong). */

(function () {
  "use strict";

  var C = window.HealthCharts;
  var I = window.I18N;
  var t = function (key, vars) { return I.t(key, vars); };
  var dateText = function (iso, short) { return I.date(iso, short); };
  var $ = function (id) { return document.getElementById(id); };

  var data = { progress: null, logbook: null, logbookError: null, bodyRange: "1y" };

  var RUN_PLAN = [
    [["1 min jog / 2 min walk x 8", "跑 1 分鐘 / 行 2 分鐘 × 8"],
     ["30 min walk + 4 x 1 min jog", "行 30 分鐘 + 跑 1 分鐘 × 4"],
     ["60 min walk", "行 60 分鐘"]],
    [["2 min jog / 2 min walk x 7", "跑 2 分鐘 / 行 2 分鐘 × 7"],
     ["30 min walk + 6 x 1 min jog", "行 30 分鐘 + 跑 1 分鐘 × 6"],
     ["60-70 min walk", "行 60-70 分鐘"]],
    [["3 min jog / 2 min walk x 6", "跑 3 分鐘 / 行 2 分鐘 × 6"],
     ["6 x 30 s uphill, walk down", "上斜快走 30 秒 × 6，落斜步行"],
     ["40 min easy walk-run", "輕鬆跑走 40 分鐘"]],
    [["5 min jog / 2 min walk x 4", "跑 5 分鐘 / 行 2 分鐘 × 4"],
     ["25 min brisk walk", "急步 25 分鐘"],
     ["40 min easy walk-run", "輕鬆跑走 40 分鐘"]],
    [["8 min jog / 2 min walk x 3", "跑 8 分鐘 / 行 2 分鐘 × 3"],
     ["6 x 45 s faster, 90 s walk", "快跑 45 秒 × 6，中間行 90 秒"],
     ["45 min easy", "輕鬆 45 分鐘"]],
    [["10 min jog / 2 min walk x 2", "跑 10 分鐘 / 行 2 分鐘 × 2"],
     ["20 min continuous", "連續跑 20 分鐘"],
     ["45 min easy", "輕鬆 45 分鐘"]],
    [["4 x 3 min hard, 2 min walk", "快跑 3 分鐘 × 4，中間行 2 分鐘"],
     ["20 min continuous", "連續跑 20 分鐘"],
     ["50 min easy", "輕鬆 50 分鐘"]],
    [["15 min continuous + 5 min walk", "連續跑 15 分鐘 + 行 5 分鐘"],
     ["22 min continuous", "連續跑 22 分鐘"],
     ["50 min easy", "輕鬆 50 分鐘"]],
    [["5 x 3 min hard, 90 s walk", "快跑 3 分鐘 × 5，中間行 90 秒"],
     ["25 min continuous", "連續跑 25 分鐘"],
     ["3 km easy", "輕鬆 3 公里"]],
    [["3 km time trial", "3 公里計時"],
     ["20 min easy", "輕鬆 20 分鐘"],
     ["30 min easy", "輕鬆 30 分鐘"]]
  ];
  var PLAN_START = "2026-09-21";

  /* --------------------------------------------------------------- helpers */

  function toDay(iso) { return C.dayFromIso(iso); }
  function last(arr) { return arr && arr.length ? arr[arr.length - 1] : null; }
  function mean(values) {
    var clean = values.filter(function (v) { return typeof v === "number" && !isNaN(v); });
    return clean.length ? clean.reduce(function (a, b) { return a + b; }, 0) / clean.length : null;
  }
  function daysBetween(a, b) { return Math.round((toDay(b) - toDay(a))); }
  function addDays(iso, days) { return C.isoOf(toDay(iso) + days); }
  function today() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
  function weekStart(iso) {
    var date = C.dayToDate(toDay(iso));
    return C.isoOf(toDay(iso) - ((date.getUTCDay() + 6) % 7));
  }
  function withinDays(list, days, key) {
    var cutoff = addDays(today(), -days);
    return (list || []).filter(function (row) { return (row[key || "date"] || "") >= cutoff; });
  }
  function statGrid(items) {
    return items.map(function (item) {
      return "<div><dt>" + item[0] + "</dt><dd>" + item[1] + (item[2] ? "<small>" + item[2] + "</small>" : "") + "</dd></div>";
    }).join("");
  }
  function tableHtml(rows, head) {
    return "<table class=\"data\"><thead><tr>" + head.map(function (h, i) {
      return "<th" + (i === 0 ? "" : " class=\"num\"") + ">" + h + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (row) {
      return "<tr>" + row.map(function (cell, i) {
        return "<td" + (i === 0 ? "" : " class=\"num\"") + ">" + cell + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }
  function emptyBlock(title, body) {
    return "<div class=\"empty\"><b>" + title + "</b>" + body + "</div>";
  }
  function progressBar(value, goal) {
    var pct = goal > 0 ? Math.max(0, Math.min(100, (value / goal) * 100)) : 0;
    return "<span class=\"bar\"><i style=\"width:" + pct.toFixed(1) + "%\"></i></span>";
  }
  function slopePerWeek(rows) {
    if (rows.length < 4) return null;
    var xs = rows.map(function (r) { return toDay(r.date); });
    var ys = rows.map(function (r) { return r.kg; });
    var mx = mean(xs), my = mean(ys);
    var denom = xs.reduce(function (s, x) { return s + (x - mx) * (x - mx); }, 0);
    if (!denom) return null;
    var cov = xs.reduce(function (s, x, i) { return s + (x - mx) * (ys[i] - my); }, 0);
    return (cov / denom) * 7;
  }
  function applyStaticText() {
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      element.textContent = t(element.dataset.i18n);
    });
    var archive = document.getElementById("nav-archive");
    if (archive) archive.setAttribute("href", I.lang === "zh" ? "zh/archive/" : "archive/");
    document.title = I.lang === "zh" ? "健康進度記錄" : "Health progress log";
    var themeLabel = document.getElementById("theme-value");
    if (themeLabel) themeLabel.textContent = t("common." + C.themeMode());
  }

  /* ------------------------------------------------------------------ hero */

  function renderHero() {
    var p = data.progress;
    var targets = p.targets;
    var body = (data.logbook && data.logbook.body) || [];
    var latest = last(p.body.filter(function (r) { return r.kg; }));
    var current = latest ? latest.kg : targets.startWeightKg;

    var daysLeft = daysBetween(today(), targets.deadline);
    $("countdown-days").textContent = daysLeft > 0 ? daysLeft : 0;
    $("countdown-label").textContent = daysLeft > 0
      ? t("hero.daysTo", { date: dateText(targets.deadline) })
      : t("hero.reached");

    var toGo = current - targets.weightKg;
    var rate = slopePerWeek(withinDays(p.body.filter(function (r) { return r.kg; }), 28));
    var projection = t("target.notEnough");
    if (rate && rate < -0.05) {
      projection = t("target.onTrend", { date: dateText(addDays(today(), Math.round((toGo / Math.abs(rate)) * 7))) });
    } else if (rate !== null && toGo <= 0) {
      projection = t("target.done");
    } else if (rate !== null) {
      projection = t("target.flat");
    }

    var bodyFat = latest && latest.bodyFat ? latest.bodyFat : null;
    var bmi = latest && latest.bmi ? latest.bmi : (latest ? latest.kg / Math.pow(p.profile.heightCm / 100, 2) : null);
    var gym = (data.logbook && data.logbook.gymSessions) || [];
    var gymThisWeek = gym.filter(function (s) { return weekStart(s.date) === weekStart(today()); }).length;
    var waist = last(body.filter(function (r) { return r.waistCm; }));

    var items = [
      [t("target.weight"), current.toFixed(1) + " kg",
        toGo > 0 ? t("target.toGo", { kg: toGo.toFixed(1) + " kg" }) : t("target.reachedNote"),
        Math.max(0, Math.min(100, ((targets.startWeightKg - current) / (targets.startWeightKg - targets.weightKg)) * 100))],
      [t("target.bodyFat"), (bodyFat ? bodyFat.toFixed(1) : "-") + " %",
        t("target.range", { low: targets.bodyFatLow, high: targets.bodyFatHigh }),
        bodyFat ? Math.max(0, Math.min(100, ((26.5 - bodyFat) / (26.5 - targets.bodyFatHigh)) * 100)) : 0],
      [t("target.bmi"), bmi ? bmi.toFixed(1) : "-",
        t("target.normalUnder", { max: targets.bmiMax }),
        bmi ? Math.max(0, Math.min(100, ((28.2 - bmi) / (28.2 - targets.bmiMax)) * 100)) : 0],
      [t("target.gymWeek"), gymThisWeek + " / " + targets.gymSessionsPerWeek,
        gym.length ? t("target.sessionsLogged", { n: gym.length }) : t("target.noSessions"),
        Math.min(100, (gymThisWeek / targets.gymSessionsPerWeek) * 100)],
      [t("target.waist"), waist ? waist.waistCm.toFixed(1) + " cm" : "-",
        waist ? t("target.loggedOn", { date: dateText(waist.date) }) : t("target.logWaist"),
        waist ? 60 : 0],
      [t("target.projection"), toGo <= 0 ? t("target.done") : projection, t("target.atRate")]
    ];

    $("targets").innerHTML = items.map(function (item) {
      return "<div class=\"target\"><dt>" + item[0] + "</dt><dd>" + item[1] +
        "<small>" + item[2] + "</small>" + progressBar(item[3], 100) + "</div>";
    }).join("");
  }

  /* ------------------------------------------------------------------ body */

  function renderBody() {
    var p = data.progress;
    var weights = p.body.filter(function (r) { return r.kg; });
    var fats = p.body.filter(function (r) { return r.bodyFat; });
    var waist = ((data.logbook && data.logbook.body) || []).filter(function (r) { return r.waistCm; });
    var latest = last(weights);
    var week = withinDays(weights, 7);
    var month = withinDays(weights, 28);
    var rate = slopePerWeek(month);

    $("body-stats").innerHTML = statGrid([
      [t("body.latest"), latest ? latest.kg.toFixed(1) + " kg" : "-", latest ? dateText(latest.date) : t("body.waitingWeighIn")],
      [t("body.avg7"), week.length ? mean(week.map(function (r) { return r.kg; })).toFixed(2) + " kg" : "-", t("body.readings", { n: week.length })],
      [t("body.changeWeek"), week.length > 1 ? (week[week.length - 1].kg - week[0].kg).toFixed(2) + " kg" : "-", t("body.sameTime")],
      [t("body.rate4"), rate === null ? "-" : rate.toFixed(2) + " kg/week", rate === null ? t("body.needMore") : (rate < -0.2 ? t("body.onTrack") : t("body.slower"))],
      [t("body.totalChange"), (latest ? (latest.kg - p.targets.startWeightKg).toFixed(1) : "-") + " kg", t("body.sinceStart", { kg: p.targets.startWeightKg })],
      [t("body.bodyFat"), fats.length ? last(fats).bodyFat.toFixed(1) + " %" : "-", fats.length ? dateText(last(fats).date) : t("body.waitingScale")]
    ]);

    function slice(rows, key) {
      var days = data.bodyRange === "all" ? 100000 : data.bodyRange === "1y" ? 366 : 90;
      return withinDays(rows, days).map(function (r) { return { d: toDay(r.date), v: r[key] }; });
    }
    C.lineChart($("body-weight-chart"), {
      points: slice(weights, "kg"), dots: true, area: false, yZero: false,
      reference: p.targets.weightKg, formatY: function (v) { return v.toFixed(0); },
      tip: function (hit) { return "<b>" + dateText(C.isoOf(hit.d)) + "</b><br>" + t("body.kg", { v: hit.v.toFixed(1) }); }
    });
    C.lineChart($("body-fat-chart"), {
      points: slice(fats, "bodyFat"), dots: true, area: false, yZero: false,
      reference: p.targets.bodyFatHigh, formatY: function (v) { return v.toFixed(0) + "%"; },
      tip: function (hit) { return "<b>" + dateText(C.isoOf(hit.d)) + "</b><br>" + t("body.percent", { v: hit.v.toFixed(1) }); }
    });

    if (waist.length) {
      $("waist-wrap").innerHTML = "<div class=\"chart chart-sm\" id=\"waist-chart\"></div>";
      C.lineChart($("waist-chart"), {
        points: waist.map(function (r) { return { d: toDay(r.date), v: r.waistCm }; }),
        dots: true, area: false, yZero: false,
        formatY: function (v) { return v.toFixed(0); },
        tip: function (hit) { return "<b>" + dateText(C.isoOf(hit.d)) + "</b><br>" + t("body.cm", { v: hit.v.toFixed(1) }); }
      });
    } else {
      $("waist-wrap").innerHTML = emptyBlock(t("body.noWaist"), t("body.noWaistHelp"));
    }
  }

  /* ------------------------------------------------------------------- gym */

  function renderGym() {
    var log = data.logbook;
    var sessions = (log && log.gymSessions) || [];
    var lifts = (log && log.lifts) || [];

    if (!sessions.length) {
      $("gym-chart").innerHTML = emptyBlock(t("gym.emptyTitle"), t("gym.emptyHelp"));
      $("gym-stats").innerHTML = "";
      $("gym-table").innerHTML = emptyBlock(t("gym.emptyTable"), t("gym.emptyTableHelp"));
      return;
    }

    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var start = weekStart(addDays(today(), -7 * i));
      var inWeek = sessions.filter(function (s) { return weekStart(s.date) === start; });
      weeks.push({
        label: dateText(start, true),
        value: inWeek.length,
        minutes: inWeek.reduce(function (s, row) { return s + (row.durationMin || 0); }, 0)
      });
    }
    C.barChart($("gym-chart"), {
      items: weeks, goal: data.progress.targets.gymSessionsPerWeek,
      formatY: function (v) { return v.toFixed(0); },
      tip: function (item) {
        return "<b>" + t("gym.weekOf", { date: item.label }) + "</b><br>" +
          t("gym.sessionsCount", { n: item.value }) + "<br>" + t("gym.minutes", { n: item.minutes });
      }
    });

    var byType = {};
    sessions.forEach(function (s) { byType[s.type || "?"] = (byType[s.type || "?"] || 0) + 1; });
    var thisWeek = sessions.filter(function (s) { return weekStart(s.date) === weekStart(today()); });
    var last14 = withinDays(sessions, 14);
    var volume = lifts.filter(function (l) { return l.weightKg && l.sets && l.reps; })
      .map(function (l) { return { date: l.date, volume: l.sets * l.reps * l.weightKg, exercise: l.exercise }; });
    var bestLift = volume.length ? volume.reduce(function (a, b) { return b.volume > a.volume ? b : a; }) : null;
    var avgRpe = mean(sessions.map(function (s) { return s.rpe; }));

    $("gym-stats").innerHTML = statGrid([
      [t("gym.sessionsThisWeek"), thisWeek.length + " / " + data.progress.targets.gymSessionsPerWeek,
        t("gym.toNow", { date: dateText(weekStart(today())) })],
      [t("gym.last14"), t("gym.sessionsCount", { n: last14.length }),
        t("gym.minutes", { n: last14.reduce(function (s, r) { return s + (r.durationMin || 0); }, 0) })],
      [t("gym.split"), t("gym.splitValue", { a: byType.A || 0, b: byType.B || 0, c: byType.C || 0 }), t("gym.splitNote")],
      [t("gym.avgRpe"), avgRpe ? avgRpe.toFixed(1) : "-", t("gym.rpeScale")],
      [t("gym.heaviest"), bestLift ? t("gym.volume", { v: bestLift.volume.toFixed(0) }) : "-",
        bestLift ? t("gym.heaviestNote", { exercise: bestLift.exercise, date: dateText(bestLift.date) }) : t("gym.heaviestEmpty")],
      [t("gym.liftEntries"), lifts.length, t("gym.liftEntriesNote")]
    ]);

    var recent = sessions.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 8);
    $("gym-table").innerHTML = tableHtml(recent.map(function (s) {
      var dayLifts = lifts.filter(function (l) { return l.date === s.date; });
      return [
        dateText(s.date),
        s.type || "-",
        t("gym.min", { n: s.durationMin || "-" }),
        s.rpe || "-",
        dayLifts.length ? dayLifts.map(function (l) {
          return l.exercise + " " + (l.sets || "?") + "x" + (l.reps || "?") + (l.weightKg ? " @ " + l.weightKg + " kg" : "");
        }).join(", ") : (s.notes || "-")
      ];
    }), [t("gym.col.date"), t("gym.col.type"), t("gym.col.duration"), t("gym.col.rpe"), t("gym.col.lifts")]);
  }

  /* ------------------------------------------------------------------- run */

  function renderRun() {
    var runs = data.progress.runs.filter(function (r) { return r.name === "Running"; });
    var walks = data.progress.runs.filter(function (r) { return r.name === "Walking"; });
    var planIndex = Math.max(0, Math.min(9, Math.floor(daysBetween(PLAN_START, today()) / 7)));
    var planColumn = I.lang === "zh" ? 1 : 0;

    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var start = weekStart(addDays(today(), -7 * i));
      var inWeek = runs.filter(function (r) { return weekStart(r.date) === start; });
      weeks.push({
        label: dateText(start, true),
        value: inWeek.reduce(function (s, r) { return s + (r.distanceKm || 0); }, 0),
        count: inWeek.length
      });
    }
    C.barChart($("run-chart"), {
      items: weeks, formatY: function (v) { return v.toFixed(0); },
      tip: function (item) {
        return "<b>" + t("gym.weekOf", { date: item.label }) + "</b><br>" +
          t("run.km", { v: item.value.toFixed(1) }) + "<br>" + t("run.runsCount", { n: item.count });
      }
    });

    var recentRuns = runs.slice(-12);
    var paced = recentRuns.filter(function (r) { return r.paceMinPerKm; });
    if (paced.length > 1) {
      C.lineChart($("run-pace-chart"), {
        points: paced.map(function (r) { return { d: toDay(r.date), v: r.paceMinPerKm }; }),
        dots: true, area: false, yZero: false,
        formatY: function (v) { return v.toFixed(0); },
        tip: function (hit) { return "<b>" + dateText(C.isoOf(hit.d)) + "</b><br>" + hit.v.toFixed(2) + " min/km"; }
      });
    } else {
      $("run-pace-chart").innerHTML = emptyBlock(t("run.paceEmpty"), t("run.paceEmptyHelp"));
    }

    var last8 = withinDays(runs, 56);
    var longest = runs.length ? runs.reduce(function (a, b) { return (b.distanceKm || 0) > (a.distanceKm || 0) ? b : a; }) : null;
    var avgPace = mean(paced.map(function (r) { return r.paceMinPerKm; }));
    $("run-stats").innerHTML = statGrid([
      [t("run.runs8"), runs.filter(function (r) { return r.date >= addDays(today(), -56); }).length,
        t("run.plusWalks", { n: walks.filter(function (w) { return w.date >= addDays(today(), -56); }).length })],
      [t("run.distance"), last8.reduce(function (s, r) { return s + (r.distanceKm || 0); }, 0).toFixed(1) + " km", t("run.distanceNote")],
      [t("run.longest"), longest ? t("run.km", { v: longest.distanceKm.toFixed(2) }) : "-", longest ? dateText(longest.date) : ""],
      [t("run.avgPace"), avgPace ? avgPace.toFixed(2) + " min/km" : "-", t("run.avgPaceNote")],
      [t("run.planWeek"), t("run.planWeekValue", { n: planIndex + 1 }), t("run.planStarted", { date: dateText(PLAN_START) })],
      [t("run.thisWeek"), t("run.thisWeekValue", { n: runs.filter(function (r) { return weekStart(r.date) === weekStart(today()); }).length }), t("run.thisWeekNote")]
    ]);

    $("run-plan").innerHTML =
      "<thead><tr><th>" + t("run.planHeadWeek") + "</th><th>" + t("run.planHead1") + "</th><th>" + t("run.planHead2") + "</th><th>" + t("run.planHeadSun") + "</th></tr></thead>" +
      "<tbody>" + RUN_PLAN.map(function (row, i) {
        return "<tr" + (i === planIndex ? " style=\"background:var(--surface-2)\"" : "") + "><td class=\"num\">" + (i + 1) + "</td><td>" + row[0][planColumn] + "</td><td>" + row[1][planColumn] + "</td><td>" + row[2][planColumn] + "</td></tr>";
      }).join("") + "</tbody>";

    var recent = runs.slice().reverse().slice(0, 8);
    $("run-table").innerHTML = recent.length ? tableHtml(recent.map(function (r) {
      return [
        dateText(r.date),
        r.distanceKm ? t("run.km", { v: r.distanceKm.toFixed(2) }) : "-",
        r.durationMin ? t("run.min", { n: r.durationMin }) : "-",
        r.paceMinPerKm ? r.paceMinPerKm.toFixed(2) : "-",
        r.avgHr || "-",
        r.energyKcal || "-"
      ];
    }), [t("run.col.date"), t("run.col.distance"), t("run.col.duration"), t("run.col.pace"), t("run.col.hr"), t("run.col.kcal")])
      : emptyBlock(t("run.noRuns"), t("run.noRunsHelp"));
  }

  /* ------------------------------------------------------------------ food */

  function renderFood() {
    var log = data.logbook;
    var meals = (log && log.meals) || [];
    var targets = data.progress.targets;

    if (!meals.length) {
      $("food-chart").innerHTML = emptyBlock(t("food.emptyTitle"), t("food.emptyHelp"));
      $("food-stats").innerHTML = "";
      $("food-table").innerHTML = "";
      $("protein-chart").innerHTML = emptyBlock(t("food.emptyTitle"), t("food.emptyHelp"));
      return;
    }

    var days = [];
    for (var i = 13; i >= 0; i--) {
      var date = addDays(today(), -i);
      var row = meals.filter(function (m) { return m.date === date; })[0];
      days.push({
        label: i % 2 === 0 ? String(+date.slice(8)) : "",
        value: row && row.calories ? row.calories : 0,
        date: date,
        protein: row ? row.proteinG : null
      });
    }
    C.barChart($("food-chart"), {
      items: days.map(function (d) { return { label: d.label, value: d.value, date: d.date, protein: d.protein }; }),
      goal: targets.kcal, formatY: function (v) { return C.compact(v); },
      tip: function (item) {
        return "<b>" + dateText(item.date) + "</b><br>" +
          (item.value ? item.value + " kcal" : t("food.notLogged")) +
          (item.protein ? "<br>" + item.protein + " g" : "");
      }
    });

    var week = withinDays(meals, 7);
    var month = withinDays(meals, 28);
    var loggedDays = month.length;
    var onTarget = month.filter(function (m) { return m.onTarget; }).length;
    C.barChart($("protein-chart"), {
      items: days.map(function (d) { return { label: d.label, value: d.protein || 0, date: d.date }; }),
      goal: targets.proteinG, formatY: function (v) { return C.compact(v); },
      tip: function (item) { return "<b>" + dateText(item.date) + "</b><br>" + (item.value ? item.value + " g" : t("food.notLogged")); }
    });

    var waterAvg = mean(week.map(function (m) { return m.waterL; }));
    var trend = "-";
    if (week.length > 1 && month.length > 2) {
      trend = mean(week.map(function (m) { return m.calories; })) <= mean(month.map(function (m) { return m.calories; }))
        ? t("food.holding") : t("food.watchWeekends");
    }
    $("food-stats").innerHTML = statGrid([
      [t("food.kcal7"), week.length ? C.int(mean(week.map(function (m) { return m.calories; }))) + " kcal" : "-", t("common.target") + " " + C.int(targets.kcal)],
      [t("food.protein7"), week.length ? C.int(mean(week.map(function (m) { return m.proteinG; }))) + " g" : "-", t("common.target") + " " + targets.proteinG + " g"],
      [t("food.daysLogged"), t("food.of28", { n: loggedDays }), t("food.consistency")],
      [t("food.onTarget"), loggedDays ? t("food.onTargetValue", { pct: Math.round((onTarget / loggedDays) * 100) }) : "-", t("food.onTargetNote", { n: onTarget, total: loggedDays })],
      [t("food.water7"), waterAvg ? waterAvg.toFixed(1) + " L" : "-", t("food.waterNote")],
      [t("food.trend"), trend, t("food.trendNote")]
    ]);

    var recent = meals.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 10);
    $("food-table").innerHTML = tableHtml(recent.map(function (m) {
      return [
        dateText(m.date),
        m.calories || "-",
        m.proteinG || "-",
        m.waterL || "-",
        m.onTarget ? "<span class=\"tick\">" + t("common.yes") + "</span>" : "<span class=\"miss\">" + t("common.no") + "</span>",
        m.notes || ""
      ];
    }), [t("food.col.date"), t("food.col.kcal"), t("food.col.protein"), t("food.col.water"), t("food.col.onTarget"), t("food.col.notes")]);
  }

  /* ------------------------------------------------------------- scoreboard */

  function scoreboard() {
    var p = data.progress;
    var log = data.logbook || {};
    var meals = log.meals || [];
    var gym = log.gymSessions || [];

    var stepsByDate = {};
    p.supporting.steps.forEach(function (row) { stepsByDate[row[0]] = row[1]; });
    var runsByDate = {};
    p.runs.forEach(function (run) { runsByDate[run.date] = true; });
    var sleeps = {};
    (p.supporting.sleep || []).forEach(function (row) { sleeps[row.date] = row; });
    var gymByDate = {};
    gym.forEach(function (s) { gymByDate[s.date] = true; });
    var mealByDate = {};
    meals.forEach(function (m) { mealByDate[m.date] = m; });

    var rows = [];
    for (var i = 6; i >= 0; i--) {
      var date = addDays(today(), -i);
      var meal = mealByDate[date];
      var sleep = sleeps[date];
      var wake = sleep && sleep.end ? sleep.end.slice(11, 16) : null;
      var lightsOut = sleep && sleep.start ? sleep.start.slice(11, 16) : null;
      var checks = [
        wake ? wake <= "08:45" : null,
        stepsByDate[date] !== undefined ? stepsByDate[date] >= p.targets.steps : null,
        meal && meal.proteinG ? meal.proteinG >= p.targets.proteinG : null,
        meal && meal.calories ? meal.calories <= p.targets.kcal : null,
        gymByDate[date] || runsByDate[date] ? true : (date < today() ? false : null),
        lightsOut ? lightsOut <= "02:30" : null
      ];
      var score = checks.filter(function (c) { return c === true; }).length;
      rows.push("<tr><td>" + dateText(date) + "</td>" + checks.map(function (c) {
        return "<td>" + (c === true
          ? "<span class=\"tick\">" + t("common.yes") + "</span>"
          : c === false ? "<span class=\"miss\">" + t("common.no") + "</span>" : "<span class=\"miss\">-</span>") + "</td>";
      }).join("") + "<td class=\"num\">" + score + "/6</td></tr>");
    }

    $("score-table").innerHTML = "<thead><tr><th>" + t("score.day") + "</th><th>" + t("score.wake") + "</th><th>" +
      t("score.steps") + "</th><th>" + t("score.protein") + "</th><th>" + t("score.kcal") + "</th><th>" +
      t("score.session") + "</th><th>" + t("score.lights") + "</th><th class=\"num\">" + t("score.score") + "</th></tr></thead><tbody>" +
      rows.join("") + "</tbody>";
    $("score-note").textContent = t("score.note");
  }

  /* ------------------------------------------------------------- supporting */

  function renderSupporting() {
    var p = data.progress;
    function series(rows, days) {
      var cutoff = addDays(today(), -days);
      return rows.filter(function (row) { return row[0] >= cutoff; })
        .map(function (row) { return { d: toDay(row[0]), v: row[1] }; });
    }
    var blocks = [
      [t("support.restingHr"), series(p.supporting.restingHr, 90), "bpm", 90],
      [t("support.hrv"), series(p.supporting.hrv, 90), "ms", 90],
      [t("support.vo2"), series(p.supporting.vo2max, 180), "", 180],
      [t("support.sleep"), (p.supporting.sleep || []).filter(function (row) { return row.date >= addDays(today(), -90); })
        .map(function (row) { return { d: toDay(row.date), v: row.hours }; }), t("support.hours"), 90],
      [t("support.steps"), series(p.supporting.steps, 90), "", 90],
      [t("support.exercise"), series(p.supporting.exerciseMinutes, 90), "min", 90]
    ];
    $("supporting").innerHTML = blocks.map(function (block, index) {
      var points = block[1];
      var latestValue = points.length ? points[points.length - 1].v : null;
      var unit = block[2];
      return "<div class=\"card\">" +
        "<div class=\"card-head\"><h3>" + block[0] + "</h3><span class=\"card-figure\">" +
        (latestValue === null ? t("common.noData") : C.smart(latestValue) + (unit ? " " + unit : "")) +
        "</span></div>" +
        "<p class=\"card-note\">" + (points.length
          ? t(block[3] === 180 ? "support.days180" : "support.days90", { n: points.length })
          : t("common.waiting")) + "</p>" +
        "<div class=\"chart chart-xs\" id=\"support-" + index + "\"></div>" +
        "</div>";
    }).join("");
    blocks.forEach(function (block, index) {
      C.lineChart($("support-" + index), {
        points: block[1], dots: false, area: false, yZero: false,
        formatY: function (v) { return C.compact(v); },
        tip: function (hit) { return "<b>" + dateText(C.isoOf(hit.d)) + "</b><br>" + C.smart(hit.v) + " " + block[2]; }
      });
    });
  }

  /* ---------------------------------------------------------------- wiring */

  function renderAll() {
    applyStaticText();
    C.clearCharts();
    renderHero();
    renderBody();
    renderGym();
    renderRun();
    renderFood();
    scoreboard();
    renderSupporting();

    var syncNote = data.logbook && data.logbook.syncedAt
      ? t("footer.synced", { date: data.logbook.syncedAt.slice(0, 16).replace("T", " ") })
      : data.logbookError
        ? t("footer.notSyncedWhy", { why: data.logbookError })
        : t("footer.notSynced");
    var healthNote = data.progress ? t("footer.health", { date: dateText(data.progress.exportDate.slice(0, 10)) }) : "";
    $("footer-line").innerHTML = healthNote + " &middot; " + syncNote +
      " &middot; <a href=\"" + (I.lang === "zh" ? "zh/archive/" : "archive/") + "\">" + t("footer.archive") + "</a>";
    $("last-sync").textContent = data.logbook && data.logbook.syncedAt ? data.logbook.syncedAt.slice(0, 10) : t("common.pending");
  }

  function wireControls() {
    document.querySelectorAll("[data-body-range]").forEach(function (button) {
      button.addEventListener("click", function () {
        data.bodyRange = button.dataset.bodyRange;
        document.querySelectorAll("[data-body-range]").forEach(function (b) { b.classList.toggle("is-on", b === button); });
        C.clearCharts();
        renderAll();
      });
    });
    document.querySelectorAll("[data-body-range]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.bodyRange === data.bodyRange);
    });
    document.addEventListener("languagechange", function () {
      renderAll();
    });
  }

  function load() {
    I.mountToggle(document.getElementById("lang-toggle"));
    var jobs = [
      fetch("data/progress.json", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("progress.json " + r.status);
        return r.json();
      }).then(function (json) { data.progress = json; }),
      fetch("data/logbook.json", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (json) { data.logbook = json; })
        .catch(function (error) { data.logbookError = error.message; data.logbook = { syncedAt: null, gymSessions: [], lifts: [], meals: [], body: [] }; })
    ];
    Promise.all(jobs).then(function () {
      C.initTheme();
      document.addEventListener("themechange", applyStaticText);
      wireControls();
      renderAll();
    }).catch(function (error) {
      applyStaticText();
      document.getElementById("targets").innerHTML = emptyBlock(t("footer.loadError"), t("footer.loadErrorHelp", { message: error.message }));
    });
  }

  document.addEventListener("DOMContentLoaded", load);
})();
