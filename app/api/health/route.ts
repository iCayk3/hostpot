export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "conecta-mais-hotspot",
    timestamp: new Date().toISOString(),
  });
}
