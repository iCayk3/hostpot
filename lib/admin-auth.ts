import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "conecta_admin_v2";
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

export function validAdminCredentials(username:string,password: string) {
  const configuredUser=process.env.ADMIN_USERNAME||"admin";
  if(username!==configuredUser)return false;
  const configured = process.env.ADMIN_PASSWORD || "admin";
  const expected = Buffer.from(configured);
  const received = Buffer.from(password);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const adminCookie = COOKIE_NAME;

const OPERATOR_COOKIE = "conecta_operator";
export function createOperatorSession(userId:string){const expires=Math.floor(Date.now()/1000)+maxAge;const payload=`${userId}:${expires}`;return{value:`${Buffer.from(payload).toString("base64url")}.${sign(payload)}`,maxAge}}
export function operatorFromRequest(request:Request){const cookie=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith(`${OPERATOR_COOKIE}=`));if(!cookie)return null;const [encoded,signature]=cookie.slice(OPERATOR_COOKIE.length+1).split(".");if(!encoded||!signature)return null;const payload=Buffer.from(encoded,"base64url").toString();const [id,expires]=payload.split(":");if(Number(expires)<Math.floor(Date.now()/1000))return null;const a=Buffer.from(sign(payload)),b=Buffer.from(signature);return a.length===b.length&&timingSafeEqual(a,b)?id:null}
export const operatorCookie=OPERATOR_COOKIE;
