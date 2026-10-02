/**
 * Live logbook for the dashboard: reads Notion on request instead of waiting
 * for the nightly sync. Cached at the edge for a minute so a page reload does
 * not hit the Notion API every time.
 *
 * GET /api/data
 */

import { fetchLogbook } from "../lib/logbook.js";

export default async function handler(request, response) {
  const token = process.env.NOTION_TOKEN;
  response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

  if (!token) {
    response.status(500).json({ ok: false, error: "NOTION_TOKEN is not set on the server" });
    return;
  }

  try {
    const logbook = await fetchLogbook(token);
    response.status(200).json(logbook);
  } catch (error) {
    response.status(502).json({ ok: false, error: error.message });
  }
}
