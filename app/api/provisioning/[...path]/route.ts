import { buildRouterScript, type Mode, type RouterConfig } from "@/lib/router-script";
import { configurationForToken, configureDevice, confirmInstallation, createActivation, listDevices, registerDevice, validateToken } from "@/lib/provisioning-store";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

function publicBase(request: Request) {
  return (process.env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function bootstrapScript(base: string, token: string) {
  const register = `${base}/api/provisioning/register/${token}`;
  const config = `${base}/api/provisioning/config/${token}`;
  return `# Conecta+ bootstrap RouterOS 7
:local serial "unknown"
:do {:set serial [/system routerboard get serial-number]} on-error={}
:local model [/system resource get board-name]
:local version [/system resource get version]
:local architecture [/system resource get architecture-name]
:local identity [/system identity get name]
:local interfaces ""
:foreach item in=[/interface find] do={:set interfaces (\$interfaces . [/interface get \$item name] . ",")}
:local payload ("serial=" . \$serial . "\nmodel=" . \$model . "\nversion=" . \$version . "\narchitecture=" . \$architecture . "\nidentity=" . \$identity . "\ninterfaces=" . \$interfaces)
/tool fetch url="${register}" http-method=post http-header-field="Content-Type: text/plain" http-data=\$payload keep-result=no
:if ([:len [/system script find name=conecta-poll]] = 0) do={/system script add name=conecta-poll source="/tool fetch url=\\\"${config}\\\" dst-path=conecta-config.rsc; /import file-name=conecta-config.rsc"}
:if ([:len [/system scheduler find name=conecta-poll]] = 0) do={/system scheduler add name=conecta-poll interval=30s start-time=startup on-event=conecta-poll}
:log info "Conecta+: equipamento registrado; aguardando configuracao do servidor"
`;
}

function parsePayload(raw: string) {
  return Object.fromEntries(raw.split(/\r?\n/).map((line) => {
    const position = line.indexOf("=");
    return position > 0 ? [line.slice(0, position), line.slice(position + 1)] : [line, ""];
  }));
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  if (path[0] === "devices" && path.length === 1) return isAdminRequest(request) ? json({ devices: listDevices() }) : json({ error: "Não autorizado" }, 401);
  if (path[0] === "bootstrap" && path[1]) {
    if (!validateToken(path[1])) return text(":error \"Codigo de ativacao invalido ou expirado\"", 404);
    return text(bootstrapScript(publicBase(request), path[1]));
  }
  if (path[0] === "config" && path[1]) {
    const result = configurationForToken(path[1]);
    if (!result) return text(":error \"Ativacao invalida\"", 404);
    if (!result.config || !result.mode) return text(":log info \"Conecta+: aguardando configuracao no painel\"");
    const confirmUrl = `${publicBase(request)}/api/provisioning/confirm/${path[1]}`;
    return text(`${buildRouterScript(result.config, result.mode)}
/tool fetch url="${confirmUrl}" http-method=post http-data="status=installed" keep-result=no
/system scheduler remove [find name=conecta-poll]
/system script remove [find name=conecta-poll]
:log info "Conecta+: provisionamento finalizado"
`);
  }
  return json({ error: "Rota não encontrada" }, 404);
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  if (path[0] === "activations" && path.length === 1) {
    if (!isAdminRequest(request)) return json({ error: "Não autorizado" }, 401);
    const activation = createActivation();
    const base = publicBase(request);
    return json({ ...activation, command: `/tool fetch url=\"${base}/api/provisioning/bootstrap/${activation.token}\" dst-path=conecta-bootstrap.rsc; /import file-name=conecta-bootstrap.rsc` }, 201);
  }
  if (path[0] === "register" && path[1]) {
    const id = registerDevice(path[1], parsePayload(await request.text()));
    return id ? text(`registered=${id}`) : text("invalid activation", 401);
  }
  if (path[0] === "devices" && path[1] && path[2] === "configure") {
    if (!isAdminRequest(request)) return json({ error: "Não autorizado" }, 401);
    const body = await request.json() as { config: RouterConfig; mode: Mode };
    return configureDevice(path[1], body.config, body.mode) ? json({ status: "ready" }) : json({ error: "Equipamento não encontrado" }, 404);
  }
  if (path[0] === "confirm" && path[1]) {
    return confirmInstallation(path[1]) ? json({ status: "installed" }) : json({ error: "Ativação inválida" }, 404);
  }
  return json({ error: "Rota não encontrada" }, 404);
}
