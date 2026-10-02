/**
 * Gate for the whole site: nothing is served without a signed session cookie.
 * The login page and the static assets it needs are the only exceptions.
 */

import { COOKIE, password, verify } from "./lib/session.js";

export const config = {
  matcher: ["/((?!login|api/login|assets/|favicon\\.ico|_vercel).*)"]
};

export default async function middleware(request) {
  const secret = password();
  const cookie = request.headers.get("cookie") || "";
  const match = new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)").exec(cookie);
  const signedIn = match ? await verify(decodeURIComponent(match[1]), secret) : false;
  if (signedIn) return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ ok: false, error: "Not signed in" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }

  const login = new URL("/login", url.origin);
  login.searchParams.set("next", url.pathname + url.search);
  return Response.redirect(login.toString(), 307);
}
