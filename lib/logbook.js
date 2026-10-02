/**
 * Reads the four Notion logbook databases and returns them in the shape the
 * dashboard expects. Used by the Vercel function /api/data and by the local
 * sync script, so the mapping only lives in one place.
 */

const NOTION_VERSION = "2025-09-03";
const API = "https://api.notion.com/v1";

export const SOURCES = {
  gymSessions: process.env.NOTION_GYM_DS || "ec1bd0d9-d011-4099-be3d-1b80530fdcb2",
  lifts: process.env.NOTION_LIFTS_DS || "6ce0d6dc-97e5-45d1-89b2-f67a49aeff83",
  meals: process.env.NOTION_MEALS_DS || "3ef1efe8-fee1-4104-aa47-8ce12f648559",
  body: process.env.NOTION_BODY_DS || "96a969ae-8213-4120-a237-ea6e1727905b"
};

/* Meal templates carry their own calories and protein, so a form or Notion
   entry only needs the template name. Hand-typed numbers still win. */
export const MEAL_TEMPLATES = {
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

export const text = (property) => ((property && (property.rich_text || property.title)) || [])
  .map((part) => part.plain_text || "").join("").trim() || null;
export const number = (property) => (property && typeof property.number === "number" ? property.number : null);
export const dateOf = (property) => {
  const start = property && property.date && property.date.start;
  return start ? String(start).slice(0, 10) : null;
};
export const select = (property) => (property && property.select && property.select.name) || null;
export const checkbox = (property) => !!(property && property.checkbox);

export const TABLES = {
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

async function notion(path, options, token) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body && body.message) || response.statusText);
  return body;
}

async function queryAll(dataSourceId, token) {
  const pages = [];
  let cursor;
  for (let page = 0; page < 40; page++) {
    const body = await notion(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, start_cursor: cursor })
    }, token);
    pages.push(...(body.results || []));
    if (!body.has_more) break;
    cursor = body.next_cursor;
  }
  return pages;
}

export async function fetchLogbook(token, syncedAt) {
  const out = { gymSessions: [], lifts: [], meals: [], body: [] };
  const counts = {};
  for (const [key, table] of Object.entries(TABLES)) {
    const rows = (await queryAll(SOURCES[key], token))
      .map((page) => table.map(page.properties || {}))
      .filter((row) => row.date)
      .sort((a, b) => (a.date === b.date
        ? JSON.stringify(a).localeCompare(JSON.stringify(b))
        : a.date.localeCompare(b.date)));
    out[key] = rows;
    counts[key] = rows.length;
  }
  return {
    syncedAt: syncedAt || new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    live: true,
    counts,
    ...out
  };
}
