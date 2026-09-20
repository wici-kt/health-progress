#!/usr/bin/env node
/**
 * Turns the full Apple Health extraction into the two files the site reads.
 *
 *   data/archive.json   every metric, workout, route and ECG, sanitised
 *   data/progress.json  the slim set the dashboard needs
 *
 * Input is data/archive.raw.json, produced by tools/extract_health.py from a
 * Health export. The raw file stays local and is never committed.
 *
 * Usage: node tools/build-data.mjs [path/to/archive.raw.json]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = process.argv[2] || join(ROOT, "data", "archive.raw.json");

if (!existsSync(INPUT)) {
  console.error(`No extraction found at ${INPUT}`);
  console.error("Run: node tools/refresh-health.mjs /path/to/export.zip");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(INPUT, "utf8"));

/* ------------------------------------------------------------------ sanitise */

/* Device names in the export contain real names. Replace them with neutral
   labels so the published data carries no identifiers. */
const SOURCE_LABELS = [
  [/Apple Watch/i, "Apple Watch"],
  [/^Wing$/i, "iPhone A"],
  [/Sze Ka Wai/i, "iPhone B"],
  [/「Sze」/i, "iPhone C"],
  [/iPhone/, "iPhone"],
  [/HUAWEI/i, "Huawei band"],
  [/小米/, "Mi Fitness band"],
  [/dB Meter/i, "Sound meter app"],
  [/Fasting/i, "Fasting app"],
  [/Fitbit/i, "Fitbit"],
  [/Clock/i, "Clock app"],
  [/Blood Oxygen/i, "Blood Oxygen app"],
];

const seenLabels = new Map();
function labelSource(name) {
  if (!name) return "Unknown";
  for (const [pattern, label] of SOURCE_LABELS) {
    if (pattern.test(name)) {
      const key = label + "|" + name;
      seenLabels.set(key, name);
      return label;
    }
  }
  return "Other source";
}

/* Routes are published as metre offsets from their own start point, rounded to
   5 m. The card on the archive page only ever drew the normalised shape, so the
   absolute position was never used: dropping the origin removes the location
   entirely while keeping the shape exactly. */
function scrubRoute(route) {
  const [lat0, lon0] = route.path[0];
  const metresPerLat = 110540;
  const metresPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const path = route.path.map(([lat, lon]) => [
    Math.round(((lon - lon0) * metresPerLon) / 5) * 5,
    Math.round(((lat - lat0) * metresPerLat) / 5) * 5,
  ]);
  return {
    date: route.date,
    points: route.points,
    distance: route.distance,
    gain: route.gain,
    degenerate: !!route.degenerate,
    start: route.start,
    end: route.end,
    path,
  };
}

const archive = {
  generated: raw.generated,
  epoch: raw.epoch,
  meta: {
    exportDate: raw.meta.exportDate,
    // date of birth, blood type and skin type are deliberately dropped
    me: { sex: raw.meta.me.sex },
    records: raw.meta.records,
    workoutCount: raw.meta.workoutCount,
    activityDays: raw.meta.activityDays,
    routeCount: raw.meta.routeCount,
    ecgCount: raw.meta.ecgCount,
    metricCount: raw.meta.metricCount,
    sources: Object.fromEntries(
      Object.entries(raw.meta.sources).map(([name, count]) => [labelSource(name), count])
    ),
    files: raw.meta.files,
  },
  categoryLabels: raw.categoryLabels,
  metrics: {},
  nights: raw.nights.map((night) => ({ ...night, source: labelSource(night.source) })),
  workouts: raw.workouts.map((workout) => ({
    ...workout,
    source: labelSource(workout.source),
  })),
  activity: raw.activity,
  routes: raw.routes.map(scrubRoute),
  ecgs: raw.ecgs.map(({ name, ...rest }) => rest), // the ECG files carry the owner's name
};

for (const [id, metric] of Object.entries(raw.metrics)) {
  archive.metrics[id] = {
    ...metric,
    sources: Object.fromEntries(
      Object.entries(metric.sources).map(([name, count]) => [labelSource(name), count])
    ),
    // raw sample rows are [timestamp, value, source, unit]
    values: (metric.values || []).map((row) => [row[0], row[1], labelSource(row[2]), row[3]]),
    valueSample: (metric.valueSample || []).map((row) => [row[0], row[1], labelSource(row[2]), row[3]]),
  };
}

/* ------------------------------------------------------------------ progress */

const M = {};
for (const metric of Object.values(archive.metrics)) M[metric.base] = metric;

const EPOCH = Date.UTC(2000, 0, 1);
const dayToIso = (day) => new Date(EPOCH + day * 86400000).toISOString().slice(0, 10);

function daily(key, mode) {
  const metric = M[key];
  if (!metric) return [];
  const out = [];
  for (let i = 0; i < metric.daily.d.length; i++) {
    const n = metric.daily.n[i];
    const value = mode === "sum" ? metric.daily.s[i] : n ? metric.daily.s[i] / n : null;
    if (value === null) continue;
    out.push([dayToIso(metric.daily.d[i]), Math.round(value * 100) / 100]);
  }
  return out;
}

function sparse(key, fields) {
  const metric = M[key];
  if (!metric) return [];
  return (metric.values || [])
    .map((row) => {
      const entry = { date: String(row[0]).slice(0, 10) };
      fields.forEach((field, index) => {
        entry[field] = row[index + 1];
      });
      return entry;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

const weight = sparse("BodyMass", ["kg"]);
const bodyFat = sparse("BodyFatPercentage", ["percent"]);
const bmi = sparse("BodyMassIndex", ["bmi"]);

/* Merge the scale readings into one series keyed by date. */
const byDate = new Map();
for (const row of weight) byDate.set(row.date, { date: row.date, kg: row.kg });
for (const row of bodyFat) {
  const entry = byDate.get(row.date) || { date: row.date };
  entry.bodyFat = row.percent;
  byDate.set(row.date, entry);
}
for (const row of bmi) {
  const entry = byDate.get(row.date) || { date: row.date };
  entry.bmi = row.bmi;
  byDate.set(row.date, entry);
}
const body = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

const runs = archive.workouts
  .filter((w) => /Run|Walk/.test(w.name))
  .map((w) => {
    const distanceKm = w.distanceUnit === "km" ? w.distance : null;
    const durationMin = w.durationUnit === "min" ? w.duration : null;
    return {
      date: w.start.slice(0, 10),
      time: w.start.slice(11, 16),
      name: w.name,
      distanceKm: distanceKm ? Math.round(distanceKm * 100) / 100 : null,
      durationMin: durationMin ? Math.round(durationMin) : null,
      paceMinPerKm: distanceKm > 0.3 && durationMin ? Math.round((durationMin / distanceKm) * 100) / 100 : null,
      avgHr: w.hrAvg ? Math.round(w.hrAvg) : null,
      maxHr: w.hrMax ? Math.round(w.hrMax) : null,
      energyKcal: w.energyUnit === "kcal" ? Math.round(w.energy) : null,
      source: w.source,
    };
  })
  .sort((a, b) => a.date.localeCompare(b.date));

const progress = {
  generatedAt: new Date().toISOString(),
  exportDate: archive.meta.exportDate,
  profile: {
    heightCm: M.Height && M.Height.values[0] ? M.Height.values[0][1] : null,
    sex: archive.meta.me.sex === "HKBiologicalSexMale" ? "male" : null,
  },
  targets: {
    weightKg: 70,
    bmiMax: 25,
    bodyFatLow: 16,
    bodyFatHigh: 17,
    gymSessionsPerWeek: 3,
    runSessionsPerWeek: 3,
    kcal: 1900,
    proteinG: 150,
    steps: 10000,
    deadline: "2026-12-01",
    finalWeighIn: "2026-12-25",
    startWeightKg: 79.3,
  },
  body,
  supporting: {
    restingHr: daily("RestingHeartRate", "mean"),
    hrv: daily("HeartRateVariabilitySDNN", "mean"),
    vo2max: daily("VO2Max", "mean"),
    steps: daily("StepCount", "sum"),
    exerciseMinutes: daily("AppleExerciseTime", "sum"),
    sleepHours: archive.nights
      .filter((n) => n.asleep > 0)
      .map((n) => [n.date, Math.round((n.asleep / 60) * 100) / 100]),
  },
  runs,
  workouts: {
    total: archive.meta.workoutCount,
    byType: Object.entries(
      archive.workouts.reduce((acc, w) => {
        acc[w.name] = (acc[w.name] || 0) + 1;
        return acc;
      }, {})
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  },
};

writeFileSync(join(ROOT, "data", "archive.json"), JSON.stringify(archive));
writeFileSync(join(ROOT, "data", "progress.json"), JSON.stringify(progress));

const kb = (path) => Math.round(readFileSync(path).length / 1024);
console.log("data/archive.json  " + kb(join(ROOT, "data", "archive.json")) + " kB");
console.log("data/progress.json " + kb(join(ROOT, "data", "progress.json")) + " kB");
console.log("routes published as start-relative offsets, " + seenLabels.size + " device names relabelled");
console.log("weight readings: " + body.length + ", runs and walks: " + runs.length);
