import { validateProductionEnvironment } from "@/lib/security";

export const dynamic = "force-dynamic";

export function GET() {
  try { validateProductionEnvironment(); }
  catch (error) {
    return Response.json({ status: "error", service: "conecta-mais-hotspot", error: error instanceof Error ? error.message : "Configuração de produção inválida" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({
    status: "ok",
    service: "conecta-mais-hotspot",
    timestamp: new Date().toISOString(),
  });
}
