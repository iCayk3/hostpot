import { buildRouterScript, type Mode, type RouterConfig } from "@/lib/router-script";
import { configurationForToken, configureDevice, confirmInstallation, createActivation, listDevices, registerDevice, updateDeviceMode, validateToken } from "@/lib/provisioning-store";
import { isAdminRequest } from "@/lib/admin-auth";
import { queuePortalRefresh } from "@/lib/operations-store";

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

function permanentAgent(base:string,token:string){const telemetry=`${base}/api/operations/telemetry/${token}`,commands=`${base}/api/operations/commands/${token}`;return `/system scheduler remove [find name=conecta-agent]
/system script remove [find name=conecta-agent]
/system script add name=conecta-agent source={
:local activeCount [:len [/ip hotspot active find]]
:local hostCount [:len [/ip hotspot host find where authorized=no]]
:local sessions ""
:foreach item in=[/ip hotspot active find] do={:local left ""; :do {:set left [/ip hotspot active get \$item session-time-left]} on-error={}; :set sessions (\$sessions . [/ip hotspot active get \$item user] . "|" . [/ip hotspot active get \$item address] . "|" . [/ip hotspot active get \$item mac-address] . "|" . [/ip hotspot active get \$item uptime] . "|" . \$left . ";")}
:local hosts ""
:foreach item in=[/ip hotspot host find] do={:local hostMac [/ip hotspot host get \$item mac-address]; :local hostName ""; :do {:local lease [/ip dhcp-server lease find where mac-address=\$hostMac]; :if ([:len \$lease] > 0) do={:set hostName [/ip dhcp-server lease get [:pick \$lease 0] host-name]}} on-error={}; :set hosts (\$hosts . [/ip hotspot host get \$item address] . "|" . \$hostMac . "|" . [/ip hotspot host get \$item authorized] . "|" . \$hostName . ";")}
:local payload ("activeCount=" . \$activeCount . "\nhostCount=" . \$hostCount . "\nuptime=" . [/system resource get uptime] . "\ncpu=" . [/system resource get cpu-load] . "\nfreeMemory=" . [/system resource get free-memory] . "\nsessions=" . \$sessions . "\nhosts=" . \$hosts)
/tool fetch url="${telemetry}" http-method=post http-header-field="Content-Type: text/plain" http-data=\$payload keep-result=no
/tool fetch url="${commands}" dst-path=conecta-command.rsc
/import file-name=conecta-command.rsc
}
/system scheduler add name=conecta-agent interval=15s start-time=startup on-event=conecta-agent
/system script run conecta-agent`}

function parsePayload(raw: string) {
  return Object.fromEntries(raw.split(/\r?\n/).map((line) => {
    const position = line.indexOf("=");
    return position > 0 ? [line.slice(0, position), line.slice(position + 1)] : [line, ""];
  }));
}

function hotspotLogin(mode:Mode,identity:string){const buttons=[["5m","5 minutos"],["10m","10 minutos"],["15m","15 minutos"],["30m","30 minutos"],["60m","60 minutos"]];const chooser=buttons.map(([key,label])=>`<form action="$(link-login-only)" method="post"><input type="hidden" name="username" value="portal-${key}"><input type="hidden" name="password" value="Conecta${key}"><input type="hidden" name="dst" value="$(link-orig)"><button>${label}<small>Conectar agora</small></button></form>`).join("");const waiting=`<div class="waiting"><div class="pulse"></div><h2>Aguardando liberação</h2><p>Solicite ao responsável a liberação deste dispositivo.</p><div class="device"><small>DISPOSITIVO</small><strong>$(mac)</strong><span>IP $(ip)</span></div><p class="refresh">Esta página tenta reconectar automaticamente.</p></div><script>setInterval(function(){location.href='$(link-orig-esc)'||'http://neverssl.com'},5000)</script>`;return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conecta+ | Wi-Fi</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:linear-gradient(135deg,#f4f5ee,#e7f0e5);color:#10231e;font-family:Arial,sans-serif}.wrap{width:min(470px,100%)}.brand{font-size:24px;font-weight:800;margin-bottom:24px}.brand b{color:#168565}.card{background:#fff;border:1px solid #dfe6dd;border-radius:22px;padding:30px;box-shadow:0 25px 70px #17362b1a}.tag{color:#168565;font-size:10px;letter-spacing:.16em;font-weight:800}h1{font-size:35px;line-height:1.05;margin:12px 0 8px}p{color:#71817b;font-size:13px;line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:24px}.grid form:last-child{grid-column:1/-1}.grid button{width:100%;border:1px solid #dce3dc;background:#f8faf6;border-radius:12px;padding:15px;text-align:left;color:#10231e;font-size:16px;font-weight:800}.grid button:active{background:#eaf4e5;border-color:#168565}.grid small{display:block;color:#81908a;font-size:9px;margin-top:4px;font-weight:400}.foot{text-align:center;color:#95a09c;font-size:9px;margin-top:16px}.waiting{text-align:center}.pulse{width:60px;height:60px;border-radius:50%;background:#168565;margin:10px auto 22px;box-shadow:0 0 0 12px #16856517}.waiting h2{font-size:25px;margin:0}.device{background:#f1f5ee;border-radius:12px;padding:15px;margin:22px 0;text-align:left}.device small,.device strong,.device span{display:block}.device small{font-size:8px;color:#81908a}.device strong{margin:5px 0;font-size:14px}.device span{font-size:10px;color:#71817b}.refresh{font-size:10px}@media(max-width:420px){.card{padding:23px}.grid{grid-template-columns:1fr}.grid form:last-child{grid-column:auto}h1{font-size:30px}}</style></head><body><main class="wrap"><div class="brand">Conecta<b>+</b></div><section class="card"><span class="tag">WI-FI ${identity.replace(/[<>]/g,"")}</span><h1>${mode==="self"?"Escolha seu tempo de acesso":"Acesso controlado"}</h1><p>${mode==="self"?"Selecione por quanto tempo deseja utilizar a internet.":"Seu dispositivo já foi identificado pelo sistema."}</p>${mode==="self"?`<div class="grid">${chooser}</div>`:waiting}</section><div class="foot">Rede gerenciada por Conecta+</div></main></body></html>`}

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
    const base=publicBase(request);
    return text(`${buildRouterScript(result.config, result.mode)}
/tool fetch url="${base}/api/provisioning/hotspot-login/${path[1]}" dst-path=hotspot/login.html
${permanentAgent(base,path[1])}
/tool fetch url="${confirmUrl}" http-method=post http-data="status=installed" keep-result=no
:log info "Conecta+: provisionamento finalizado"
/system scheduler remove [find name=conecta-poll]
`);
  }
  if(path[0]==="hotspot-login"&&path[1]){const result=configurationForToken(path[1]);if(!result||!result.config||!result.mode)return text("Ativação inválida",404);return new Response(hotspotLogin(result.mode,result.config.identity),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})}
  return json({ error: "Rota não encontrada" }, 404);
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  if (path[0] === "activations" && path.length === 1) {
    if (!isAdminRequest(request)) return json({ error: "Não autorizado" }, 401);
    try {
      const activation = createActivation();
      const base = publicBase(request);
      return json({ ...activation, command: `/tool fetch url=\"${base}/api/provisioning/bootstrap/${activation.token}\" dst-path=conecta-bootstrap.rsc; /import file-name=conecta-bootstrap.rsc` }, 201);
    } catch (error) {
      console.error("Falha ao criar ativação:", error);
      return json({ error: "Não foi possível gravar a ativação no banco de dados. Verifique o volume /data." }, 500);
    }
  }
  if (path[0] === "register" && path[1]) {
    const id = registerDevice(path[1], parsePayload(await request.text()));
    return id ? text(`registered=${id}`) : text("invalid activation", 401);
  }
  if (path[0] === "devices" && path[1] && path[2] === "configure") {
    if (!isAdminRequest(request)) return json({ error: "Não autorizado" }, 401);
    const body = await request.json() as { config: RouterConfig; mode: Mode };
    if(!configureDevice(path[1], body.config, body.mode))return json({ error: "Equipamento não encontrado" }, 404);
    queuePortalRefresh(path[1]);
    return json({ status: "ready" });
  }
  if(path[0]==="devices"&&path[1]&&path[2]==="mode"){if(!isAdminRequest(request))return json({error:"Não autorizado"},401);const body=await request.json() as {mode:Mode};if(!updateDeviceMode(path[1],body.mode))return json({error:"Modo ou equipamento inválido"},400);queuePortalRefresh(path[1]);return json({status:"queued",mode:body.mode})}
  if (path[0] === "confirm" && path[1]) {
    return confirmInstallation(path[1]) ? json({ status: "installed" }) : json({ error: "Ativação inválida" }, 404);
  }
  return json({ error: "Rota não encontrada" }, 404);
}
