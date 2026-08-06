import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "conecta_admin";
const maxAge = 8 * 60 * 60;

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ACTIVATION_TOKEN_SECRET || "development-only-change-me";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createAdminSession() {
  const expires = Math.floor(Date.now() / 1000) + maxAge;
  const payload = String(expires);
  return { value: `${payload}.${sign(payload)}`, maxAge };
}

export function isAdminRequest(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return false;
  const [expires, signature] = cookie.slice(COOKIE_NAME.length + 1).split(".");
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(expires));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function validAdminPassword(password: string) {
  const configured = process.env.ADMIN_PASSWORD || "admin";
  const expected = Buffer.from(configured);
  const received = Buffer.from(password);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const adminCookie = COOKIE_NAME;
