#!/usr/bin/env node
/**
 * Converts a Strong app CSV export into data/strong.json, which the gym panel
 * reads alongside the Notion logbook.
 *
 *   node tools/import-strong.mjs ~/Downloads/strong_export.csv
 *
 * Strong writes one row per set, with columns that vary slightly between
 * versions, so the importer matches them by name and reports what it found.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "data", "strong.json");
const input = process.argv[2];

if (!input || !existsSync(input)) {
  console.error("Usage: node tools/import-strong.mjs /path/to/strong-export.csv");
  process.exit(1);
}

/* Split a CSV line, honouring quoted fields. */
function splitLine(line) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { out.push(value); value = ""; }
    else value += char;
  }
  out.push(value);
  return out.map((cell) => cell.trim());
}

const raw = readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const lines = raw.split(/\r?\n/).filter((line) => line.trim());
if (lines.length < 2) {
  console.error("That file has no data rows.");
  process.exit(1);
}

const header = splitLine(lines[0]);
const find = (patterns) => {
  for (const pattern of patterns) {
    const index = header.findIndex((name) => pattern.test(name));
    if (index >= 0) return index;
  }
  return -1;
};

const COL = {
  date: find([/^date$/i, /date/i]),
  workout: find([/workout name/i, /^workout$/i]),
  duration: find([/duration/i]),
  exercise: find([/exercise/i]),
  setOrder: find([/set order/i, /^set$/i]),
  weight: find([/^weight/i]),
  reps: find([/^reps$/i]),
  seconds: find([/seconds/i]),
  notes: find([/^notes$/i]),
  rpe: find([/rpe/i, /effort/i])
};

console.log("Columns found:");
Object.entries(COL).forEach(([key, index]) => {
  console.log("  " + key.padEnd(9) + (index >= 0 ? header[index] : "not present"));
});

if (COL.date < 0 || COL.exercise < 0) {
  console.error("\nThis does not look like a Strong export: the Date and Exercise columns are required.");
  process.exit(1);
}

const num = (value) => {
  const parsed = parseFloat(String(value || "").replace(/[^0-9.\-]/g, ""));
  return isNaN(parsed) ? null : parsed;
};
const cell = (row, index) => (index >= 0 ? (row[index] || "").trim() : "");
const isoDate = (value) => {
  const text = String(value || "");
  const direct = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return direct[0];
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const sets = [];
for (const line of lines.slice(1)) {
  const row = splitLine(line);
  const date = isoDate(cell(row, COL.date));
  const exercise = cell(row, COL.exercise);
  if (!date || !exercise) continue;
  sets.push({
    date,
    workout: cell(row, COL.workout) || "Gym",
    exercise,
    setOrder: num(cell(row, COL.setOrder)),
    weightKg: num(cell(row, COL.weight)),
    reps: num(cell(row, COL.reps)),
    seconds: num(cell(row, COL.seconds)),
    rpe: num(cell(row, COL.rpe)),
    durationMin: num(cell(row, COL.duration)),
    notes: cell(row, COL.notes) || null
  });
}

/* One summary per exercise per session, matching the shape the dashboard reads. */
const liftsByKey = new Map();
sets.forEach((set) => {
  const key = set.date + "|" + set.exercise;
  const entry = liftsByKey.get(key) || { date: set.date, exercise: set.exercise, sets: 0, reps: 0, weightKg: 0, volumeKg: 0 };
  entry.sets += 1;
  entry.reps = Math.max(entry.reps, set.reps || 0);
  entry.weightKg = Math.max(entry.weightKg, set.weightKg || 0);
  entry.volumeKg += (set.weightKg || 0) * (set.reps || 0);
  liftsByKey.set(key, entry);
});

const sessionsByKey = new Map();
sets.forEach((set) => {
  const key = set.date + "|" + set.workout;
  const entry = sessionsByKey.get(key) || { date: set.date, name: set.workout, durationMin: 0, sets: 0, volumeKg: 0, topSetKg: 0, rpe: null };
  entry.sets += 1;
  entry.durationMin = Math.max(entry.durationMin, set.durationMin || 0);
  entry.volumeKg += (set.weightKg || 0) * (set.reps || 0);
  entry.topSetKg = Math.max(entry.topSetKg, set.weightKg || 0);
  if (set.rpe) entry.rpe = Math.max(entry.rpe || 0, set.rpe);
  sessionsByKey.set(key, entry);
});

const output = {
  generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  source: "Strong CSV",
  rows: sets.length,
  gymSessions: [...sessionsByKey.values()]
    .map((session) => ({
      date: session.date,
      type: null,
      name: session.name,
      durationMin: session.durationMin || null,
      rpe: session.rpe,
      sets: session.sets,
      volumeKg: Math.round(session.volumeKg),
      topSetKg: session.topSetKg || null,
      source: "Strong"
    }))
    .sort((a, b) => a.date.localeCompare(b.date)),
  lifts: [...liftsByKey.values()]
    .map((lift) => ({
      date: lift.date,
      exercise: lift.exercise,
      sets: lift.sets,
      reps: lift.reps || null,
      weightKg: lift.weightKg || null,
      volumeKg: Math.round(lift.volumeKg),
      source: "Strong"
    }))
    .sort((a, b) => (a.date === b.date ? a.exercise.localeCompare(b.exercise) : a.date.localeCompare(b.date)))
};

writeFileSync(OUTPUT, JSON.stringify(output) + "\n");
console.log("\nWrote data/strong.json");
console.log("  sets read: " + output.rows);
console.log("  sessions:  " + output.gymSessions.length);
console.log("  exercises: " + output.lifts.length);
console.log("\nCommit it to publish: git add data/strong.json && git commit -m \"Import Strong workouts\" && git push");
