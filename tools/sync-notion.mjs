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

/* Meal templates carry their own calories and protein, so a form entry only
   needs the template name. Anything typed by hand still wins. */
const MEAL_TEMPLATES = {
  "早餐A 蛋+多士+奶": { kcal: 430, protein: 28 },
  "早餐B 乳酪+燕麥+香蕉": { kcal: 430, protein: 26 },
  "早餐C 茶葉蛋+豆漿+包": { kcal: 450, protein: 32 },
  "午餐A 切雞飯 少飯走汁": { kcal: 620, protein: 41 },
  "午餐B 雞胸+糙米+菜": { kcal: 500, protein: 43 },
  "午餐C 鮮茄牛肉飯 少飯": { kcal: 600, protein: 33 },
  "午餐D 便利店": { kcal: 520, protein: 38 },
  "晚餐A 蒸魚+飯+菜": { kcal: 550, protein: 50 },
  "晚餐B 雞或牛+番薯+菜": { kcal: 500, protein: 45 },
  "晚餐C 米線 少油": { kcal: 600, protein: 40 },
  "晚餐D 豆腐+蝦+菜": { kcal: 520, protein: 45 },
  "小食 豆漿+香蕉": { kcal: 250, protein: 15 },
  "乳清蛋白": { kcal: 120, protein: 24 },
  "外食 估算": { kcal: 700, protein: 35 }
};

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
    map: (p) => {
      const template = select(p["Template"]);
      const preset = template ? MEAL_TEMPLATES[template] : null;
      return {
        date: dateOf(p["Date"]),
        meal: select(p["Meal"]) || null,
        template,
        calories: number(p["Calories"]) ?? (preset ? preset.kcal : null),
        proteinG: number(p["Protein g"]) ?? (preset ? preset.protein : null),
        waterL: number(p["Water L"]),
        onTarget: checkbox(p["On target"]),
        notes: text(p["Notes"])
      };
    }
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
    if (previous.syncedAt) {
      console.log("No change since the last sync, leaving data/logbook.json alone.");
      return;
    }
    // First run after setup: record that the connection works, even with no rows yet.
    console.log("First successful sync with no rows logged yet; recording the sync time.");
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
