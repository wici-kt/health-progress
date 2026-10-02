/** Clears the session cookie. POST /api/logout */

import { COOKIE } from "../lib/session.js";

export const config = { runtime: "edge" };

export default async function handler() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "cache-control": "no-store"
    }
  });
}
