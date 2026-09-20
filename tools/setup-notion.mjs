#!/usr/bin/env node
/**
 * One-time Notion setup: creates the four logbook databases under a page you
 * have shared with your integration, then writes their ids into config.json.
 *
 *   NOTION_TOKEN=secret_xxx node tools/setup-notion.mjs            # list pages
 *   NOTION_TOKEN=secret_xxx node tools/setup-notion.mjs <page-id>  # create
 *
 * Run it again with the same page id and it will reuse the databases it finds
 * instead of creating duplicates.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "config.json");
const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
const TOKEN = process.env.NOTION_TOKEN;

const numberFormat = { number: { format: "number" } };
const TABLES = {
  gymSessions: {
    title: "Gym Sessions",
    properties: {
      Session: { title: {} },
      Date: { date: {} },
      Type: { select: { options: [{ name: "A" }, { name: "B" }, { name: "C" }] } },
      "Duration min": numberFormat,
      RPE: numberFormat,
      Notes: { rich_text: {} }
    }
  },
  lifts: {
    title: "Gym Lifts",
    properties: {
      Lift: { title: {} },
      Date: { date: {} },
      Exercise: {
        select: {
          options: [
            "Goblet squat", "Leg press", "Bench press", "Push-up", "Lat pulldown", "Assisted pull-up",
            "Romanian deadlift", "Deadlift", "Incline press", "Shoulder press", "Seated row",
            "Split squat", "Leg raise", "Overhead press", "Pull-up", "Dumbbell row", "Hip thrust",
            "Farmer carry"
          ].map((name) => ({ name }))
        }
      },
      Sets: numberFormat,
      Reps: numberFormat,
      "Weight kg": numberFormat
    }
  },
  meals: {
    title: "Meals",
    properties: {
      Day: { title: {} },
      Date: { date: {} },
      Calories: numberFormat,
      "Protein g": numberFormat,
      "Water L": numberFormat,
      "On target": { checkbox: {} },
      Notes: { rich_text: {} }
    }
  },
  body: {
    title: "Body",
    properties: {
      Entry: { title: {} },
      Date: { date: {} },
      "Weight kg": numberFormat,
      "Waist cm": numberFormat,
      "Body fat %": numberFormat,
      Notes: { rich_text: {} }
    }
  }
};

async function notion(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Notion-Version": VERSION,
      "Content-Type": "application/json"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (body && body.message) || response.statusText;
    throw new Error(`${path} failed with ${response.status}: ${detail}`);
  }
  return body;
}

async function listPages() {
  const body = await notion("/search", {
    method: "POST",
    body: JSON.stringify({ filter: { property: "object", value: "page" }, page_size: 25 })
  });
  const pages = (body.results || []).map((page) => {
    const title = (page.properties && Object.values(page.properties)
      .map((property) => ((property.title || []).map((part) => part.plain_text).join("")))
      .find((value) => value)) || "(untitled)";
    return { id: page.id, title };
  });
  if (!pages.length) {
    console.log("This integration cannot see any pages yet.");
    console.log("Open the page in Notion, choose Connections, and add your integration, then run this again.");
    return;
  }
  console.log("Pages this integration can see:\n");
  pages.forEach((page) => console.log(`  ${page.title}\n    ${page.id}`));
  console.log("\nNow run:  node tools/setup-notion.mjs <one of those ids>");
}

async function findExisting(title) {
  const body = await notion("/search", {
    method: "POST",
    body: JSON.stringify({ query: title, filter: { property: "object", value: "data_source" }, page_size: 50 })
  });
  return (body.results || []).find((source) => (source.name || "") === title) || null;
}

async function createDatabase(parentPageId, key, spec) {
  const existing = await findExisting(spec.title);
  if (existing) {
    const database = await notion(`/databases/${existing.id}`);
    const source = (database.data_sources && database.data_sources[0]) || {};
    console.log(`reusing ${spec.title}`);
    return { databaseId: database.id, dataSourceId: source.id, title: spec.title };
  }
  const created = await notion("/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: spec.title } }],
      initial_data_source: { properties: spec.properties }
    })
  });
  let dataSourceId = created.data_sources && created.data_sources[0] && created.data_sources[0].id;
  if (!dataSourceId) {
    const fetched = await notion(`/databases/${created.id}`);
    dataSourceId = fetched.data_sources && fetched.data_sources[0] && fetched.data_sources[0].id;
  }
  if (!dataSourceId) throw new Error("Notion created " + spec.title + " but returned no data source id");
  console.log("created " + spec.title);
  return { databaseId: created.id, dataSourceId, title: spec.title };
}

async function main() {
  if (!TOKEN) {
    console.error("Set NOTION_TOKEN first.");
    process.exit(1);
  }
  const parentPageId = process.argv[2];
  if (!parentPageId) return listPages();

  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  config.parentPageId = parentPageId;
  config.databases = config.databases || {};
  for (const [key, spec] of Object.entries(TABLES)) {
    config.databases[key] = await createDatabase(parentPageId, key, spec);
  }
  config.updatedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  console.log("\nWrote config.json. Next: node tools/sync-notion.mjs");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
