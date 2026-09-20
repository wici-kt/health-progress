/* Progress dashboard. Reads data/progress.json (Apple Health, rebuilt locally)
   and data/logbook.json (Notion, synced nightly). */

(function () {
  "use strict";

  var C = window.HealthCharts;
  var DAY = C.DAY;
  var $ = function (id) { return document.getElementById(id); };

  var data = { progress: null, logbook: null, logbookError: null };

  var RUN_PLAN = [
    ["1 min jog / 2 min walk x 8", "30 min walk + 4 x 1 min jog", "60 min walk"],
    ["2 min jog / 2 min walk x 7", "30 min walk + 6 x 1 min jog", "60-70 min walk"],
    ["3 min jog / 2 min walk x 6", "6 x 30 s uphill, walk down", "40 min easy walk-run"],
    ["5 min jog / 2 min walk x 4", "25 min brisk walk", "40 min easy walk-run"],
    ["8 min jog / 2 min walk x 3", "6 x 45 s faster, 90 s walk", "45 min easy"],
    ["10 min jog / 2 min walk x 2", "20 min continuous", "45 min easy"],
    ["4 x 3 min hard, 2 min walk", "20 min continuous", "50 min easy"],
    ["15 min continuous + 5 min walk", "22 min continuous", "50 min easy"],
    ["5 x 3 min hard, 90 s walk", "25 min continuous", "3 km easy"],
    ["3 km time trial", "20 min easy", "30 min easy"]
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
      ? "days to " + C.longDate(targets.deadline)
      : "target date reached";

    var lost = targets.startWeightKg - current;
    var toGo = current - targets.weightKg;
    var rate = slopePerWeek(withinDays(p.body.filter(function (r) { return r.kg; }), 28));
    var projection = "not enough data";
    if (rate && rate < -0.05) {
      var weeks = toGo / Math.abs(rate);
      projection = "on trend " + C.longDate(addDays(today(), Math.round(weeks * 7)));
    } else if (rate !== null && toGo <= 0) {
      projection = "target reached";
    } else if (rate !== null) {
      projection = "trend is flat";
    }

    var bodyFat = latest && latest.bodyFat ? latest.bodyFat : null;
    var bmi = latest && latest.bmi ? latest.bmi : (latest ? latest.kg / Math.pow(p.profile.heightCm / 100, 2) : null);
    var gym = (data.logbook && data.logbook.gymSessions) || [];
    var gymThisWeek = gym.filter(function (s) { return weekStart(s.date) === weekStart(today()); }).length;
    var waist = last(body.filter(function (r) { return r.waistCm; }));

    var items = [
      ["Weight", current.toFixed(1) + " kg", "target " + targets.weightKg + " kg, " + (toGo > 0 ? toGo.toFixed(1) + " to go" : "reached"),
        Math.max(0, Math.min(100, ((targets.startWeightKg - current) / (targets.startWeightKg - targets.weightKg)) * 100))],
      ["Body fat", (bodyFat ? bodyFat.toFixed(1) : "-") + " %", "target " + targets.bodyFatLow + "-" + targets.bodyFatHigh + " %",
        bodyFat ? Math.max(0, Math.min(100, ((26.5 - bodyFat) / (26.5 - targets.bodyFatHigh)) * 100)) : 0],
      ["BMI", bmi ? bmi.toFixed(1) : "-", "normal is under " + targets.bmiMax,
        bmi ? Math.max(0, Math.min(100, ((28.2 - bmi) / (28.2 - targets.bmiMax)) * 100)) : 0],
      ["Gym this week", gymThisWeek + " / " + targets.gymSessionsPerWeek, gym.length ? gym.length + " sessions logged so far" : "no sessions logged yet",
        Math.min(100, (gymThisWeek / targets.gymSessionsPerWeek) * 100)],
      ["Waist", waist ? waist.waistCm.toFixed(1) + " cm" : "-", waist ? "logged " + C.longDate(waist.date) : "log it in Notion: Body", waist ? 60 : 0],
      ["Projection", toGo <= 0 ? "done" : projection, "at the current 4-week rate"]
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
      ["Latest", latest ? latest.kg.toFixed(1) + " kg" : "-", latest ? C.longDate(latest.date) : "waiting for a weigh-in"],
      ["7-day average", week.length ? mean(week.map(function (r) { return r.kg; })).toFixed(2) + " kg" : "-", week.length + " readings"],
      ["Change this week", week.length > 1 ? (week[week.length - 1].kg - week[0].kg).toFixed(2) + " kg" : "-", "same time weigh-ins"],
      ["4-week rate", rate === null ? "-" : rate.toFixed(2) + " kg/week", rate === null ? "need more readings" : (rate < -0.2 ? "on track for the target" : "slower than the plan")],
      ["Total change", (latest ? (latest.kg - p.targets.startWeightKg).toFixed(1) : "-") + " kg", "since " + p.targets.startWeightKg + " kg on 20 Sep"],
      ["Body fat", fats.length ? last(fats).bodyFat.toFixed(1) + " %" : "-", fats.length ? C.longDate(last(fats).date) : "waiting for scale data"]
    ]);

    var range = localStorage.getItem("health-body-range") || "1y";
    function slice(rows, key) {
      var days = range === "all" ? 100000 : range === "1y" ? 366 : 90;
      return withinDays(rows, days).map(function (r) { return { d: toDay(r.date), v: r[key] }; });
    }
    C.lineChart($("body-weight-chart"), {
      points: slice(weights, "kg"), dots: true, area: false, yZero: false,
      goal: undefined, reference: p.targets.weightKg, formatY: function (v) { return v.toFixed(0); },
      tip: function (hit) { return "<b>" + C.longDate(C.isoOf(hit.d)) + "</b><br>" + hit.v.toFixed(1) + " kg"; }
    });
    C.lineChart($("body-fat-chart"), {
      points: slice(fats, "bodyFat"), dots: true, area: false, yZero: false,
      reference: p.targets.bodyFatHigh, formatY: function (v) { return v.toFixed(0) + "%"; },
      tip: function (hit) { return "<b>" + C.longDate(C.isoOf(hit.d)) + "</b><br>" + hit.v.toFixed(1) + "% body fat"; }
    });

    if (waist.length) {
      $("waist-wrap").innerHTML = "<div class=\"chart chart-sm\" id=\"waist-chart\"></div>";
      C.lineChart($("waist-chart"), {
        points: waist.map(function (r) { return { d: toDay(r.date), v: r.waistCm }; }),
        dots: true, area: false, yZero: false,
        formatY: function (v) { return v.toFixed(0); },
        tip: function (hit) { return "<b>" + C.longDate(C.isoOf(hit.d)) + "</b><br>" + hit.v.toFixed(1) + " cm waist"; }
      });
    } else {
      $("waist-wrap").innerHTML = emptyBlock("No waist measurements yet", "Add a row to the Body database in Notion with the Waist cm field filled in, and it appears here after the next sync.");
    }
  }

  /* ------------------------------------------------------------------- gym */

  function renderGym() {
    var log = data.logbook;
    var sessions = (log && log.gymSessions) || [];
    var lifts = (log && log.lifts) || [];

    if (!sessions.length) {
      $("gym-chart").innerHTML = emptyBlock("Waiting for the first gym session",
        "Log it in the Gym Sessions database in Notion: Date, Type A/B/C, Duration and RPE. The chart fills in after the nightly sync.");
      $("gym-stats").innerHTML = "";
      $("gym-table").innerHTML = emptyBlock("No sessions logged",
        "Once you log three sessions a week, this panel shows weekly volume, the A/B/C balance and your main lifts.");
      return;
    }

    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var start = weekStart(addDays(today(), -7 * i));
      var inWeek = sessions.filter(function (s) { return weekStart(s.date) === start; });
      weeks.push({
        label: C.shortDate(start),
        value: inWeek.length,
        minutes: inWeek.reduce(function (s, row) { return s + (row.durationMin || 0); }, 0)
      });
    }
    C.barChart($("gym-chart"), {
      items: weeks, goal: data.progress.targets.gymSessionsPerWeek,
      formatY: function (v) { return v.toFixed(0); },
      tip: function (item) { return "<b>Week of " + item.label + "</b><br>" + item.value + " sessions<br>" + item.minutes + " minutes"; }
    });

    var byType = {};
    sessions.forEach(function (s) { byType[s.type || "?"] = (byType[s.type || "?"] || 0) + 1; });
    var thisWeek = sessions.filter(function (s) { return weekStart(s.date) === weekStart(today()); });
    var last14 = withinDays(sessions, 14);
    var volume = lifts.filter(function (l) { return l.weightKg && l.sets && l.reps; })
      .map(function (l) { return { date: l.date, volume: l.sets * l.reps * l.weightKg, exercise: l.exercise }; });
    var weeklyVolume = {};
    volume.forEach(function (v) { var w = weekStart(v.date); weeklyVolume[w] = (weeklyVolume[w] || 0) + v.volume; });
    var volumeKeys = Object.keys(weeklyVolume).sort();
    var bestLift = volume.length ? volume.reduce(function (a, b) { return b.volume > a.volume ? b : a; }) : null;

    $("gym-stats").innerHTML = statGrid([
      ["Sessions this week", thisWeek.length + " / " + data.progress.targets.gymSessionsPerWeek, C.longDate(weekStart(today())) + " to now"],
      ["Last 14 days", last14.length + " sessions", last14.reduce(function (s, r) { return s + (r.durationMin || 0); }, 0) + " minutes"],
      ["Split", "A " + (byType.A || 0) + " / B " + (byType.B || 0) + " / C " + (byType.C || 0), "aim for balance across the week"],
      ["Average RPE", mean(sessions.map(function (s) { return s.rpe; })) ? mean(sessions.map(function (s) { return s.rpe; })).toFixed(1) : "-", "1 to 10 scale"],
      ["Heaviest set", bestLift ? bestLift.volume.toFixed(0) + " kg volume" : "-", bestLift ? bestLift.exercise + " on " + C.longDate(bestLift.date) : "log sets, reps and weight"],
      ["Lift entries", lifts.length, "main lifts only, as planned"]
    ]);

    var recent = sessions.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 8);
    $("gym-table").innerHTML = tableHtml(recent.map(function (s) {
      var dayLifts = lifts.filter(function (l) { return l.date === s.date; });
      return [
        C.longDate(s.date),
        s.type || "-",
        (s.durationMin || "-") + " min",
        s.rpe || "-",
        dayLifts.length ? dayLifts.map(function (l) {
          return l.exercise + " " + (l.sets || "?") + "x" + (l.reps || "?") + (l.weightKg ? " @ " + l.weightKg + " kg" : "");
        }).join(", ") : (s.notes || "-")
      ];
    }), ["Date", "Type", "Duration", "RPE", "Lifts"]);
  }

  /* ------------------------------------------------------------------- run */

  function renderRun() {
    var runs = data.progress.runs.filter(function (r) { return r.name === "Running"; });
    var walks = data.progress.runs.filter(function (r) { return r.name === "Walking"; });
    var planIndex = Math.max(0, Math.min(9, Math.floor(daysBetween(PLAN_START, today()) / 7)));

    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var start = weekStart(addDays(today(), -7 * i));
      var inWeek = runs.filter(function (r) { return weekStart(r.date) === start; });
      weeks.push({
        label: C.shortDate(start),
        value: inWeek.reduce(function (s, r) { return s + (r.distanceKm || 0); }, 0),
        count: inWeek.length
      });
    }
    C.barChart($("run-chart"), {
      items: weeks, formatY: function (v) { return v.toFixed(0); },
      tip: function (item) { return "<b>Week of " + item.label + "</b><br>" + item.value.toFixed(1) + " km running<br>" + item.count + " sessions"; }
    });

    var recentRuns = runs.slice(-12);
    var paced = recentRuns.filter(function (r) { return r.paceMinPerKm; });
    if (paced.length > 1) {
      C.lineChart($("run-pace-chart"), {
        points: paced.map(function (r) { return { d: toDay(r.date), v: r.paceMinPerKm }; }),
        dots: true, area: false, yZero: false,
        formatY: function (v) { return v.toFixed(0); },
        tip: function (hit) { return "<b>" + C.longDate(C.isoOf(hit.d)) + "</b><br>" + hit.v.toFixed(2) + " min/km"; }
      });
    } else {
      $("run-pace-chart").innerHTML = emptyBlock("No pacing data yet", "Pace appears once you log a run longer than a few hundred metres.");
    }

    var last8 = withinDays(runs, 56);
    $("run-stats").innerHTML = statGrid([
      ["Runs in 8 weeks", runs.filter(function (r) { return r.date >= addDays(today(), -56); }).length, "plus " + walks.filter(function (w) { return w.date >= addDays(today(), -56); }).length + " recorded walks"],
      ["Distance", last8.reduce(function (s, r) { return s + (r.distanceKm || 0); }, 0).toFixed(1) + " km", "last 8 weeks of running"],
      ["Longest run", runs.length ? Math.max.apply(null, runs.map(function (r) { return r.distanceKm || 0; })).toFixed(2) + " km" : "-", runs.length ? C.longDate(runs.reduce(function (a, b) { return (b.distanceKm || 0) > (a.distanceKm || 0) ? b : a; }).date) : ""],
      ["Average pace", mean(paced.map(function (r) { return r.paceMinPerKm; })) ? mean(paced.map(function (r) { return r.paceMinPerKm; })).toFixed(2) + " min/km" : "-", "your last 12 runs"],
      ["Plan week", "Week " + (planIndex + 1) + " of 10", "started " + C.longDate(PLAN_START)],
      ["This week's runs", runs.filter(function (r) { return weekStart(r.date) === weekStart(today()); }).length + " / 3", "Tuesday, Thursday, Sunday"]
    ]);

    $("run-plan").innerHTML = "<tr><th>Week</th><th>Run 1 (Tue)</th><th>Run 2 (Thu)</th><th>Sunday</th></tr>" +
      RUN_PLAN.map(function (row, i) {
        return "<tr" + (i === planIndex ? " style=\"background:var(--surface-2)\"" : "") + "><td class=\"num\">" + (i + 1) + "</td><td>" + row[0] + "</td><td>" + row[1] + "</td><td>" + row[2] + "</td></tr>";
      }).join("");

    var recent = runs.slice().reverse().slice(0, 8);
    $("run-table").innerHTML = recent.length ? tableHtml(recent.map(function (r) {
      return [
        C.longDate(r.date),
        r.distanceKm ? r.distanceKm.toFixed(2) + " km" : "-",
        r.durationMin ? r.durationMin + " min" : "-",
        r.paceMinPerKm ? r.paceMinPerKm.toFixed(2) : "-",
        r.avgHr || "-",
        r.energyKcal || "-"
      ];
    }), ["Date", "Distance", "Duration", "Min/km", "Avg HR", "kcal"]) : emptyBlock("No runs recorded yet", "Apple Health logs runs automatically once you start one on the watch.");
  }

  /* ------------------------------------------------------------------ food */

  function renderFood() {
    var log = data.logbook;
    var meals = (log && log.meals) || [];
    var targets = data.progress.targets;

    if (!meals.length) {
      $("food-chart").innerHTML = emptyBlock("Waiting for the first meal entry",
        "Log one row a day in the Meals database in Notion: Calories, Protein g, Water and the On target checkbox. Thirty seconds a day is enough.");
      $("food-stats").innerHTML = "";
      $("food-table").innerHTML = "";
      return;
    }

    var days = [];
    for (var i = 13; i >= 0; i--) {
      var date = addDays(today(), -i);
      var row = meals.filter(function (m) { return m.date === date; })[0];
      days.push({
        label: i % 2 === 0 ? date.slice(8) : "",
        value: row && row.calories ? row.calories : 0,
        date: date,
        protein: row ? row.proteinG : null,
        onTarget: row ? row.onTarget : null
      });
    }
    C.barChart($("food-chart"), {
      items: days.map(function (d) { return { label: d.label, value: d.value, date: d.date, protein: d.protein }; }),
      goal: targets.kcal, formatY: function (v) { return C.compact(v); },
      tip: function (item) {
        return "<b>" + C.longDate(item.date) + "</b><br>" +
          (item.value ? item.value + " kcal" : "not logged") +
          (item.protein ? "<br>" + item.protein + " g protein" : "");
      }
    });

    var week = withinDays(meals, 7);
    var month = withinDays(meals, 28);
    var loggedDays = month.length;
    var onTarget = month.filter(function (m) { return m.onTarget; }).length;
    C.barChart($("protein-chart"), {
      items: days.map(function (d) { return { label: d.label, value: d.protein || 0, date: d.date }; }),
      goal: targets.proteinG, formatY: function (v) { return C.compact(v); },
      tip: function (item) { return "<b>" + C.longDate(item.date) + "</b><br>" + (item.value ? item.value + " g protein" : "not logged"); }
    });

    $("food-stats").innerHTML = statGrid([
      ["Calories, 7 days", week.length ? C.int(mean(week.map(function (m) { return m.calories; }))) + " kcal" : "-", "target " + C.int(targets.kcal)],
      ["Protein, 7 days", week.length ? C.int(mean(week.map(function (m) { return m.proteinG; }))) + " g" : "-", "target " + targets.proteinG + " g"],
      ["Days logged", loggedDays + " of 28", "consistency beats precision"],
      ["On target", loggedDays ? Math.round((onTarget / loggedDays) * 100) + "% of logged days" : "-", onTarget + " of " + loggedDays],
      ["Water, 7 days", week.length ? mean(week.map(function (m) { return m.waterL; })) ? mean(week.map(function (m) { return m.waterL; })).toFixed(1) + " L" : "-" : "-", "target 2.5-3 L"],
      ["Trend", week.length > 1 && month.length > 2 ? (mean(week.map(function (m) { return m.calories; })) <= mean(month.map(function (m) { return m.calories; })) ? "holding" : "watch the weekends") : "-", "compare against the 4-week average"]
    ]);

    var recent = meals.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 10);
    $("food-table").innerHTML = tableHtml(recent.map(function (m) {
      return [
        C.longDate(m.date),
        m.calories || "-",
        m.proteinG || "-",
        m.waterL || "-",
        m.onTarget ? "<span class=\"tick\">yes</span>" : "<span class=\"miss\">no</span>",
        m.notes || ""
      ];
    }), ["Date", "kcal", "Protein g", "Water L", "On target", "Notes"]);
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
    var totals = [0, 0, 0, 0, 0, 0];
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
      checks.forEach(function (c, index) { if (c === true) totals[index]++; });
      rows.push("<tr><td>" + C.longDate(date) + "</td>" + checks.map(function (c) {
        return "<td>" + (c === true ? "<span class=\"tick\">yes</span>" : c === false ? "<span class=\"miss\">no</span>" : "<span class=\"miss\">-</span>") + "</td>";
      }).join("") + "<td class=\"num\">" + score + "/6</td></tr>");
    }

    $("score-table").innerHTML = "<thead><tr><th>Day</th><th>Wake 08:45</th><th>Steps 10k</th><th>Protein 150</th><th>kcal ≤1900</th><th>Session</th><th>Lights out</th><th class=\"num\">Score</th></tr></thead><tbody>" + rows.join("") + "</tbody>";
    $("score-note").textContent = "Last 7 days. Waking times and lights-out come from Apple Health sleep; meals and sessions come from Notion.";
  }

  /* ------------------------------------------------------------- supporting */

  function renderSupporting() {
    var p = data.progress;
    function series(rows, days, label, format) {
      var cutoff = addDays(today(), -days);
      return {
        points: rows.filter(function (row) { return row[0] >= cutoff; }).map(function (row) { return { d: toDay(row[0]), v: row[1] }; }),
        label: label, format: format
      };
    }
    var blocks = [
      ["Resting heart rate", series(p.supporting.restingHr, 90, "bpm"), "bpm"],
      ["HRV", series(p.supporting.hrv, 90, "ms"), "ms"],
      ["VO2 max", series(p.supporting.vo2max, 180, "ml/kg/min"), ""],
      ["Sleep", { points: (p.supporting.sleep || []).filter(function (row) { return row.date >= addDays(today(), -90); }).map(function (row) { return { d: toDay(row.date), v: row.hours }; }), label: "hours" }, "h"],
      ["Steps", series(p.supporting.steps, 90, "steps"), ""],
      ["Exercise minutes", series(p.supporting.exerciseMinutes, 90, "minutes"), "min"]
    ];
    $("supporting").innerHTML = blocks.map(function (block, index) {
      var points = block[1].points;
      var latestValue = points.length ? points[points.length - 1].v : null;
      return "<div class=\"card\">" +
        "<div class=\"card-head\"><h3>" + block[0] + "</h3><span class=\"card-figure\">" +
        (latestValue === null ? "no data" : C.smart(latestValue) + " " + block[2]) +
        "</span></div>" +
        "<p class=\"card-note\">" + (points.length ? points.length + " days of readings in the last " + (block[0] === "VO2 max" ? "180" : "90") + " days" : "waiting for data") + "</p>" +
        "<div class=\"chart chart-xs\" id=\"support-" + index + "\"></div>" +
        "</div>";
    }).join("");
    blocks.forEach(function (block, index) {
      C.lineChart($("support-" + index), {
        points: block[1].points, dots: false, area: false, yZero: false,
        formatY: function (v) { return C.compact(v); },
        tip: function (hit) { return "<b>" + C.longDate(C.isoOf(hit.d)) + "</b><br>" + C.smart(hit.v) + " " + block[2]; }
      });
    });
  }

  /* ---------------------------------------------------------------- wiring */

  function renderAll() {
    C.clearCharts();
    renderHero();
    renderBody();
    renderGym();
    renderRun();
    renderFood();
    scoreboard();
    renderSupporting();
    var syncNote = data.logbook && data.logbook.syncedAt
      ? "Notion synced " + data.logbook.syncedAt.slice(0, 16).replace("T", " ") + " UTC"
      : data.logbookError
        ? "Notion logbook not synced yet (" + data.logbookError + ")"
        : "Notion logbook not synced yet";
    var healthNote = data.progress ? "Apple Health data from " + C.longDate(data.progress.exportDate.slice(0, 10)) : "";
    $("footer-line").innerHTML = healthNote + " &middot; " + syncNote +
      " &middot; <a href=\"archive/\">Full health archive</a>";
    $("last-sync").textContent = data.logbook && data.logbook.syncedAt ? data.logbook.syncedAt.slice(0, 10) : "pending";
  }

  function load() {
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
      renderAll();
      document.querySelectorAll("[data-body-range]").forEach(function (button) {
        button.addEventListener("click", function () {
          localStorage.setItem("health-body-range", button.dataset.bodyRange);
          document.querySelectorAll("[data-body-range]").forEach(function (b) { b.classList.toggle("is-on", b === button); });
          C.clearCharts();
          renderAll();
        });
      });
      var stored = localStorage.getItem("health-body-range") || "1y";
      document.querySelectorAll("[data-body-range]").forEach(function (b) {
        b.classList.toggle("is-on", b.dataset.bodyRange === stored);
      });
    }).catch(function (error) {
      document.getElementById("targets").innerHTML = emptyBlock("Could not load the data", error.message +
        ". The dashboard needs data/progress.json, which is generated by tools/build-data.mjs.");
    });
  }

  document.addEventListener("DOMContentLoaded", load);
})();
