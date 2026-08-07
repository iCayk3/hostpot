import { adminCookie, cookieSecurity, createAdminSession, isAdminRequest, validAdminCredentials } from "@/lib/admin-auth";
import { assertTrustedOrigin,enforceRateLimit,handleApiError,readJson } from "@/lib/security";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "session") return Response.json({ error: "Rota não encontrada" }, { status: 404 });
  return Response.json({ authenticated: isAdminRequest(request) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
 try{
  const { action } = await context.params;
  if (action === "login") {
    assertTrustedOrigin(request);const body = await readJson<{username?:string;password?:string}>(request,2048);enforceRateLimit(request,"admin-login",5,15*60_000,String(body.username||""));
    if (!body.username||!body.password || !validAdminCredentials(body.username,body.password)) return Response.json({ error: "Credenciais inválidas" }, { status: 401 });
    const session = createAdminSession();
    return Response.json({ authenticated: true }, { headers: { "Set-Cookie": `${adminCookie}=${session.value}; Path=/; HttpOnly; SameSite=Strict${cookieSecurity()}` } });
  }
  if (action === "logout") {
    assertTrustedOrigin(request);return Response.json({ authenticated: false }, { headers: { "Set-Cookie": `${adminCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSecurity()}` } });
  }
  return Response.json({ error: "Rota não encontrada" }, { status: 404 });
 }catch(error){return handleApiError(error)}
}
