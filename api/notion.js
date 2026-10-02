/**
 * Serverless function (Vercel) that writes one logbook entry into Notion.
 *
 * The browser never sees the Notion token: it lives in the Vercel environment
 * as NOTION_TOKEN, and this function is the only thing that uses it.
 *
 * POST /api/notion
 *   {
 *     "passcode": "...",            // must match FORM_PASSCODE
 *     "kind": "meal" | "gym" | "body",
 *     "date": "2026-10-02",
 *     ...fields for that kind
 *   }
 */

const NOTION_VERSION = "2025-09-03";

/* Data source ids are not secret; they are the same ones in config.json. */
const SOURCES = {
  meal: process.env.NOTION_MEALS_DS || "3ef1efe8-fee1-4104-aa47-8ce12f648559",
  gym: process.env.NOTION_GYM_DS || "ec1bd0d9-d011-4099-be3d-1b80530fdcb2",
  lift: process.env.NOTION_LIFTS_DS || "6ce0d6dc-97e5-45d1-89b2-f67a49aeff83",
  body: process.env.NOTION_BODY_DS || "96a969ae-8213-4120-a237-ea6e1727905b"
};

/* Same table the sync script uses, so a template fills in its own calories. */
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

function text(value) {
  return { rich_text: [{ type: "text", text: { content: String(value).slice(0, 1900) } }] };
}
function title(value) {
  return { title: [{ type: "text", text: { content: String(value).slice(0, 1900) } }] };
}
function date(value) {
  return { date: { start: String(value).slice(0, 10) } };
}
function number(value) {
  return value === "" || value === null || value === undefined ? undefined : { number: Number(value) };
}
function select(value) {
  return value ? { select: { name: String(value) } } : undefined;
}
function checkbox(value) {
  return { checkbox: !!value };
}
function compact(object) {
  Object.keys(object).forEach((key) => object[key] === undefined && delete object[key]);
  return object;
}

async function notion(path, options, token) {
  const response = await fetch("https://api.notion.com/v1" + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body && body.message) || response.statusText);
  }
  return body;
}

function buildPage(kind, payload) {
  const when = payload.date || new Date().toISOString().slice(0, 10);

  if (kind === "meal") {
    const preset = payload.template ? MEAL_TEMPLATES[payload.template] : null;
    return {
      dataSourceId: SOURCES.meal,
      properties: compact({
        Day: title(payload.template || payload.meal || "Meal"),
        Date: date(when),
        Meal: select(payload.meal),
        Template: select(payload.template),
        Calories: number(payload.calories !== undefined && payload.calories !== "" ? payload.calories : preset && preset.kcal),
        "Protein g": number(payload.proteinG !== undefined && payload.proteinG !== "" ? payload.proteinG : preset && preset.protein),
        "Water L": number(payload.waterL),
        "On target": checkbox(payload.onTarget),
        Notes: payload.notes ? text(payload.notes) : undefined
      })
    };
  }

  if (kind === "gym") {
    return {
      dataSourceId: SOURCES.gym,
      properties: compact({
        Session: title(payload.type ? "Gym " + payload.type : "Gym"),
        Date: date(when),
        Type: select(payload.type),
        "Duration min": number(payload.durationMin),
        RPE: number(payload.rpe),
        Notes: payload.notes ? text(payload.notes) : undefined
      })
    };
  }

  if (kind === "body") {
    return {
      dataSourceId: SOURCES.body,
      properties: compact({
        Entry: title(payload.notes ? payload.notes.slice(0, 40) : "Body"),
        Date: date(when),
        "Weight kg": number(payload.weightKg),
        "Waist cm": number(payload.waistCm),
        "Body fat %": number(payload.bodyFatPct),
        Notes: payload.notes ? text(payload.notes) : undefined
      })
    };
  }

  throw new Error("Unknown kind: " + kind);
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST" });
    return;
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    response.status(500).json({ ok: false, error: "NOTION_TOKEN is not set on the server" });
    return;
  }

  const passcode = process.env.FORM_PASSCODE;
  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  if (passcode && body.passcode !== passcode) {
    response.status(401).json({ ok: false, error: "Wrong passcode" });
    return;
  }

  try {
    const created = [];
    const page = buildPage(body.kind, body);
    created.push(await notion("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: page.dataSourceId },
        properties: page.properties
      })
    }, token));

    /* A gym session can carry one main lift in the same submit. */
    if (body.kind === "gym" && body.exercise) {
      created.push(await notion("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: SOURCES.lift },
          properties: compact({
            Lift: title(body.exercise),
            Date: date(body.date || new Date().toISOString().slice(0, 10)),
            Exercise: select(body.exercise),
            Sets: number(body.sets),
            Reps: number(body.reps),
            "Weight kg": number(body.weightKg)
          })
        })
      }, token));
    }

    response.status(200).json({ ok: true, created: created.length });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
}
