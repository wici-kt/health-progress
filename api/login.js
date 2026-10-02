/**
 * Exchanges the site password for a signed session cookie.
 * POST /api/login  { password }
 */

import { COOKIE, MAX_AGE, password, sign } from "../lib/session.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Use POST" }), { status: 405 });
  }

  const secret = password();
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: "SITE_PASSWORD is not configured" }), { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  if (String(body.password || "") !== secret) {
    return new Response(JSON.stringify({ ok: false, error: "Wrong password" }), { status: 401 });
  }

  const expiry = Date.now() + MAX_AGE * 1000;
  const token = await sign(expiry, secret);
  const cookie = [
    COOKIE + "=" + token,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=" + MAX_AGE
  ].join("; ");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie, "cache-control": "no-store" }
  });
}
