import { adminCookie, createAdminSession, isAdminRequest, validAdminCredentials } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "session") return Response.json({ error: "Rota não encontrada" }, { status: 404 });
  return Response.json({ authenticated: isAdminRequest(request) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (action === "login") {
    const body = await request.json() as { username?:string; password?: string };
    if (!body.username||!body.password || !validAdminCredentials(body.username,body.password)) return Response.json({ error: "Credenciais inválidas" }, { status: 401 });
    const session = createAdminSession();
    return Response.json({ authenticated: true }, { headers: { "Set-Cookie": `${adminCookie}=${session.value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${session.maxAge}` } });
  }
  if (action === "logout") {
    return Response.json({ authenticated: false }, { headers: { "Set-Cookie": `${adminCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` } });
  }
  return Response.json({ error: "Rota não encontrada" }, { status: 404 });
}
