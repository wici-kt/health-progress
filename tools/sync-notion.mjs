#!/usr/bin/env node
/**
 * Pulls the four Notion logbook databases and writes data/logbook.json.
 *
 *   Gym Sessions   date, type, duration, RPE, notes
 *   Gym Lifts      date, exercise, sets, reps, weight
 *   Meals          date, calories, protein, water, on target, notes
 *   Body           date, weight, waist, body fat, notes
 *
 * Needs NOTION_TOKEN in the environment and data source ids in config.json,
 * both of which tools/setup-notion.mjs puts there on first run.
 *
 * The file is only rewritten when the rows actually change, so the nightly
 * workflow does not create empty commits.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "config.json");
const OUTPUT = join(ROOT, "data", "logbook.json");
const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
const TOKEN = process.env.NOTION_TOKEN;

const text = (property) => ((property && (property.rich_text || property.title)) || [])
  .map((part) => part.plain_text || "").join("").trim() || null;
const number = (property) => (property && typeof property.number === "number" ? property.number : null);
const dateOf = (property) => {
  const start = property && property.date && property.date.start;
  return start ? String(start).slice(0, 10) : null;
};
const select = (property) => (property && property.select && property.select.name) || null;
const checkbox = (property) => !!(property && property.checkbox);

/* Which Notion property maps to which field in logbook.json. */
const TABLES = {
  gymSessions: {
    label: "Gym Sessions",
    map: (p) => ({
      date: dateOf(p["Date"]),
      type: select(p["Type"]),
      durationMin: number(p["Duration min"]),
      rpe: number(p["RPE"]),
      notes: text(p["Notes"])
    })
  },
  lifts: {
    label: "Gym Lifts",
    map: (p) => ({
      date: dateOf(p["Date"]),
      exercise: select(p["Exercise"]) || text(p["Exercise"]),
      sets: number(p["Sets"]),
      reps: number(p["Reps"]),
      weightKg: number(p["Weight kg"])
    })
  },
  meals: {
    label: "Meals",
    map: (p) => ({
      date: dateOf(p["Date"]),
      calories: number(p["Calories"]),
      proteinG: number(p["Protein g"]),
      waterL: number(p["Water L"]),
      onTarget: checkbox(p["On target"]),
      notes: text(p["Notes"])
    })
  },
  body: {
    label: "Body",
    map: (p) => ({
      date: dateOf(p["Date"]),
      weightKg: number(p["Weight kg"]),
      waistCm: number(p["Waist cm"]),
      bodyFatPct: number(p["Body fat %"]),
      notes: text(p["Notes"])
    })
  }
};

function readConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    console.error("config.json is not valid JSON: " + error.message);
    process.exit(1);
  }
}

async function notion(path, options) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
      ...(options && options.headers)
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && body.message ? body.message : response.statusText;
    throw new Error(`${path} failed with ${response.status}: ${detail}`);
  }
  return body;
}

async function queryDataSource(dataSourceId) {
  const pages = [];
  let cursor;
  for (let page = 0; page < 40; page++) {
    const body = await notion(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, start_cursor: cursor })
    });
    pages.push(...(body.results || []));
    if (!body.has_more) break;
    cursor = body.next_cursor;
  }
  return pages;
}

function stable(value) {
  return JSON.stringify(value);
}

async function main() {
  const config = readConfig();
  const configured = config && config.databases &&
    Object.keys(TABLES).every((key) => config.databases[key] && config.databases[key].dataSourceId);

  if (!configured) {
    console.log("Notion is not configured yet, so nothing was synced.");
    console.log("Run: NOTION_TOKEN=... node tools/setup-notion.mjs <parent-page-id>");
    return;
  }
  if (!TOKEN) {
    console.error("NOTION_TOKEN is missing. Add it as a repository secret or export it locally.");
    process.exit(1);
  }

  const out = { gymSessions: [], lifts: [], meals: [], body: [] };
  for (const [key, table] of Object.entries(TABLES)) {
    const pages = await queryDataSource(config.databases[key].dataSourceId);
    const rows = pages
      .map((page) => table.map(page.properties || {}))
      .filter((row) => row.date)
      .sort((a, b) => (a.date === b.date
        ? JSON.stringify(a).localeCompare(JSON.stringify(b))
        : a.date.localeCompare(b.date)));
    out[key] = rows;
    console.log(`${table.label}: ${rows.length} rows`);
  }

  const counts = Object.fromEntries(Object.keys(TABLES).map((key) => [key, out[key].length]));
  const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, "utf8")) : null;
  const changed = !previous || stable({ counts, ...out }) !== stable({
    counts: Object.fromEntries(Object.keys(TABLES).map((key) => [key, (previous[key] || []).length])),
    gymSessions: previous.gymSessions || [],
    lifts: previous.lifts || [],
    meals: previous.meals || [],
    body: previous.body || []
  });

  if (!changed) {
    console.log("No change since the last sync, leaving data/logbook.json alone.");
    return;
  }

  const payload = {
    syncedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    counts,
    ...out
  };
  writeFileSync(OUTPUT, JSON.stringify(payload, null, 0) + "\n");
  console.log("Wrote data/logbook.json: " + JSON.stringify(counts));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
