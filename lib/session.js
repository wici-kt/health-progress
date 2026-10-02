/**
 * Cookie signing for the site login. Runs on the Edge runtime (middleware) and
 * in Node functions, so it only uses Web Crypto.
 *
 * The session value is "<expiry-ms>.<hmac>". The HMAC key is the site
 * password itself, which keeps the setup to a single secret: there is no
 * separate signing key to store.
 */

const encoder = new TextEncoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sign(expiry, secret) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(String(expiry)));
  return `${expiry}.${base64url(signature)}`;
}

export async function verify(token, secret) {
  if (!token || !secret) return false;
  const [expiry] = String(token).split(".");
  const expires = Number(expiry);
  if (!expires || expires < Date.now()) return false;
  return (await sign(expires, secret)) === token;
}

/** The password is whichever of the two environment variables is set. */
export function password() {
  return process.env.SITE_PASSWORD || process.env.FORM_PASSCODE || null;
}

export const COOKIE = "hp_session";
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
