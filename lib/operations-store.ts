import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { database as db } from "./database";
import { hashAgentToken } from "./provisioning-store";
import { cleanText, validMac } from "./security";

db.exec(`CREATE TABLE IF NOT EXISTS operators (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS operator_devices (operator_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY(operator_id,device_id))`);
db.exec(`CREATE TABLE IF NOT EXISTS telemetry (device_id TEXT PRIMARY KEY, active_count INTEGER NOT NULL DEFAULT 0, host_count INTEGER NOT NULL DEFAULT 0, uptime TEXT, cpu INTEGER, free_memory TEXT, updated_at TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS hotspot_sessions (device_id TEXT NOT NULL, session_key TEXT NOT NULL, username TEXT, address TEXT, mac TEXT, uptime TEXT, time_left TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(device_id,session_key))`);
db.exec(`CREATE TABLE IF NOT EXISTS hotspot_hosts (device_id TEXT NOT NULL, host_key TEXT NOT NULL, address TEXT, mac TEXT, authorized INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(device_id,host_key))`);
db.exec(`CREATE TABLE IF NOT EXISTS access_releases (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, mac TEXT NOT NULL, minutes INTEGER NOT NULL, status TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, executed_at TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS router_commands (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, script TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, delivered_at TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS access_events (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, mac TEXT, username TEXT, duration_minutes INTEGER, started_at TEXT NOT NULL, last_seen TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`);
db.exec(`CREATE TABLE IF NOT EXISTS client_devices (device_id TEXT NOT NULL, mac TEXT NOT NULL, label TEXT, detected_name TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(device_id,mac))`);
db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_device ON hotspot_sessions(device_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_hosts_device ON hotspot_hosts(device_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_commands_pending ON router_commands(device_id,status)");

const now = () => new Date().toISOString();
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");

export function createOperator(name: string, username: string, password: string, deviceIds: string[]) {
  name=cleanText(name,80);username=cleanText(username,40).toLowerCase();
  if(name.length<2||!/^[a-z0-9._-]{3,40}$/.test(username)||password.length<12||password.length>128)throw new Error("Dados inválidos");
  const id = randomUUID(), salt = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO operators VALUES (?,?,?,?,?,1,?)").run(id, name, username.toLowerCase(), hashPassword(password, salt), salt, now());
  const assign = db.prepare("INSERT OR IGNORE INTO operator_devices VALUES (?,?)");
  for (const deviceId of [...new Set(deviceIds.slice(0,100))]) if(db.prepare("SELECT 1 FROM devices WHERE id=?").get(deviceId))assign.run(id,deviceId);
  return id;
}

export function authenticateOperator(username: string, password: string) {
  const row = db.prepare("SELECT * FROM operators WHERE username=? AND active=1").get(username.toLowerCase()) as Record<string,string|number>|undefined;
  if (!row) return null;
  const actual = Buffer.from(hashPassword(password, String(row.salt))), expected = Buffer.from(String(row.password_hash));
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? { id:String(row.id), name:String(row.name), username:String(row.username) } : null;
}
export function getOperator(id:string){return db.prepare("SELECT id,name,username FROM operators WHERE id=? AND active=1").get(id)}

export function listOperators() {
  return db.prepare(`SELECT o.id,o.name,o.username,o.active,o.created_at,COALESCE(group_concat(od.device_id),'') device_ids FROM operators o LEFT JOIN operator_devices od ON od.operator_id=o.id GROUP BY o.id ORDER BY o.name`).all().map((r:any)=>({...r,deviceIds:String(r.device_ids).split(',').filter(Boolean)}));
}
export function adminOverview(){const totals=db.prepare(`SELECT COUNT(*) routers,COALESCE(SUM(t.active_count),0) active,COALESCE(SUM(t.host_count),0) hosts,MAX(t.updated_at) updated_at FROM devices d LEFT JOIN telemetry t ON t.device_id=d.id`).get();const sessions=db.prepare(`SELECT d.identity,s.username,s.address,s.mac,s.uptime,s.time_left,s.updated_at FROM hotspot_sessions s JOIN devices d ON d.id=s.device_id ORDER BY s.updated_at DESC LIMIT 50`).all();return{totals,sessions}}

export function operatorDevices(operatorId: string) {
  return db.prepare(`SELECT d.id,d.serial,d.model,d.identity,d.status,d.last_seen,a.mode,t.active_count,t.host_count,t.uptime,t.cpu,t.free_memory,t.updated_at
    FROM operator_devices od JOIN devices d ON d.id=od.device_id JOIN activations a ON a.id=d.activation_id LEFT JOIN telemetry t ON t.device_id=d.id WHERE od.operator_id=? ORDER BY d.identity`).all(operatorId);
}

export function allOperationalDevices(){return db.prepare(`SELECT d.id,d.serial,d.model,d.identity,d.status,d.last_seen,a.mode,t.active_count,t.host_count,t.uptime,t.cpu,t.free_memory,t.updated_at FROM devices d JOIN activations a ON a.id=d.activation_id LEFT JOIN telemetry t ON t.device_id=d.id ORDER BY d.identity`).all()}

export function deviceDashboard(deviceId: string, operatorId?: string) {
  if (operatorId && !db.prepare("SELECT 1 ok FROM operator_devices WHERE operator_id=? AND device_id=?").get(operatorId,deviceId)) return null;
  const device = db.prepare(`SELECT d.id,d.serial,d.model,d.identity,d.status,d.last_seen,a.mode,t.active_count,t.host_count,t.uptime,t.cpu,t.free_memory,t.updated_at FROM devices d JOIN activations a ON a.id=d.activation_id LEFT JOIN telemetry t ON t.device_id=d.id WHERE d.id=?`).get(deviceId);
  if (!device) return null;
  const sessions = db.prepare(`SELECT s.username,s.address,s.mac,s.uptime,s.time_left,s.updated_at,c.label,c.detected_name FROM hotspot_sessions s LEFT JOIN client_devices c ON c.device_id=s.device_id AND c.mac=s.mac WHERE s.device_id=? ORDER BY s.updated_at DESC`).all(deviceId);
  const hosts = db.prepare(`SELECT h.address,h.mac,h.authorized,h.updated_at,c.label,c.detected_name FROM hotspot_hosts h LEFT JOIN client_devices c ON c.device_id=h.device_id AND c.mac=h.mac WHERE h.device_id=? ORDER BY h.updated_at DESC`).all(deviceId);
  const releases = db.prepare("SELECT id,mac,minutes,status,created_at,executed_at FROM access_releases WHERE device_id=? ORDER BY created_at DESC LIMIT 50").all(deviceId);
  const adminAccesses=(db.prepare(`SELECT r.id,r.mac,r.minutes,r.status,r.created_at,r.executed_at,c.label,c.detected_name FROM access_releases r LEFT JOIN client_devices c ON c.device_id=r.device_id AND c.mac=r.mac WHERE r.device_id=? AND r.status IN ('queued','delivered') ORDER BY r.created_at DESC`).all(deviceId) as any[]).map(row=>{if(!row.executed_at)return{...row,expires_at:null,remaining_seconds:null};const expiresAt=new Date(new Date(row.executed_at).getTime()+Number(row.minutes)*60000).toISOString();return{...row,expires_at:expiresAt,remaining_seconds:Math.max(0,Math.floor((new Date(expiresAt).getTime()-Date.now())/1000))}}).filter(row=>row.status==='queued'||Number(row.remaining_seconds)>0);
  const durationStats=db.prepare(`SELECT duration_minutes minutes,COUNT(*) total FROM access_events WHERE device_id=? AND started_at>=datetime('now','-1 day') GROUP BY duration_minutes ORDER BY duration_minutes`).all(deviceId);
  return { device, sessions, hosts, releases,adminAccesses,durationStats };
}

function deviceIdByTokenHash(tokenHash: string) {
  return db.prepare(`SELECT d.id FROM devices d JOIN activations a ON a.id=d.activation_id WHERE d.agent_token_hash=? AND a.status='installed'`).get(tokenHash) as {id:string}|undefined;
}

export const agentTokenHash = (token: string) => hashAgentToken(token);

export function saveTelemetry(tokenHash: string, values: Record<string,string>) {
  const device = deviceIdByTokenHash(tokenHash); if (!device) return false;
  const timestamp=now();
  db.prepare(`INSERT INTO telemetry VALUES (?,?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET active_count=excluded.active_count,host_count=excluded.host_count,uptime=excluded.uptime,cpu=excluded.cpu,free_memory=excluded.free_memory,updated_at=excluded.updated_at`)
    .run(device.id,Number(values.activeCount||0),Number(values.hostCount||0),values.uptime||"",Number(values.cpu||0),values.freeMemory||"",timestamp);
  db.prepare("UPDATE devices SET last_seen=? WHERE id=?").run(timestamp,device.id);
  db.prepare("DELETE FROM hotspot_sessions WHERE device_id=?").run(device.id);
  db.prepare("DELETE FROM hotspot_hosts WHERE device_id=?").run(device.id);
  const insS=db.prepare("INSERT INTO hotspot_sessions VALUES (?,?,?,?,?,?,?,?)");
  for(const item of (values.sessions||"").split(";").filter(Boolean)){const [user,address,mac,uptime,left]=item.split("|");insS.run(device.id,`${mac}-${user}`,user,address,mac,uptime,left,timestamp);const current=db.prepare("SELECT id FROM access_events WHERE device_id=? AND mac=? AND username=? AND active=1 ORDER BY started_at DESC LIMIT 1").get(device.id,mac,user) as {id:string}|undefined;const minutes=Number((user||"").match(/portal-(\d+)m/)?.[1]||0)||null;if(current)db.prepare("UPDATE access_events SET active=1,last_seen=? WHERE id=?").run(timestamp,current.id);else db.prepare("INSERT INTO access_events VALUES (?,?,?,?,?,?,?,1)").run(randomUUID(),device.id,mac,user,minutes,timestamp,timestamp)}
  db.prepare("UPDATE access_events SET active=0 WHERE device_id=? AND last_seen<>?").run(device.id,timestamp);
  const insH=db.prepare("INSERT INTO hotspot_hosts VALUES (?,?,?,?,?,?)");
  for(const item of (values.hosts||"").split(";").filter(Boolean)){const [address,mac,authorized,detectedName]=item.split("|");insH.run(device.id,mac||address,address,mac,authorized==="true"?1:0,timestamp);if(mac)db.prepare(`INSERT INTO client_devices(device_id,mac,label,detected_name,updated_at) VALUES (?,?,NULL,?,?) ON CONFLICT(device_id,mac) DO UPDATE SET detected_name=CASE WHEN excluded.detected_name<>'' THEN excluded.detected_name ELSE client_devices.detected_name END,updated_at=excluded.updated_at`).run(device.id,mac,detectedName||"",timestamp)}
  return true;
}

export function queueRelease(deviceId:string,mac:string,minutes:number,operatorId:string){
  const safeMac=validMac(mac),paymentWindow=minutes===2&&operatorId==="mercadopago-checkout";if(!safeMac||(!paymentWindow&&![5,10,15,30,60].includes(minutes))) return null;
  const stored=db.prepare(`SELECT a.config_json FROM devices d JOIN activations a ON a.id=d.activation_id WHERE d.id=?`).get(deviceId) as {config_json:string|null}|undefined;let rate="10M/10M";try{const configured=JSON.parse(stored?.config_json||"{}").rateLimit;if(/^[0-9]+[kKmMgG]?\/[0-9]+[kKmMgG]?$/.test(configured))rate=configured}catch{}
  const id=randomUUID(), tag=`conecta-${id.slice(0,8)}`, script=`:local clientAddress ""\n:local clientHost [/ip hotspot host find where mac-address=${safeMac}]\n:if ([:len \$clientHost] > 0) do={:set clientAddress [/ip hotspot host get [:pick \$clientHost 0] address]}\n/ip hotspot ip-binding remove [find mac-address=${safeMac}]\n/ip hotspot ip-binding add mac-address=${safeMac} type=bypassed comment=\"${tag}\"\n/queue simple remove [find name=${tag}]\n:if ([:len \$clientAddress] > 0) do={/queue simple add name=${tag} target=(\$clientAddress . "/32") max-limit=${rate} comment=\"Conecta+ limite temporario\"}\n/system scheduler add name=${tag} interval=${minutes}m start-time=startup on-event=\"/ip hotspot ip-binding remove [find comment=${tag}]; /queue simple remove [find name=${tag}]; /system scheduler set [find name=${tag}] disabled=yes\"\n:log info \"Conecta+: acesso ${minutes}m limitado a ${rate} para ${safeMac}\"`;
  db.prepare("INSERT INTO access_releases VALUES (?,?,?,?,?,?,?,NULL)").run(id,deviceId,safeMac,minutes,"queued",cleanText(operatorId,64),now());
  db.prepare("INSERT INTO router_commands VALUES (?,?,?,?,?,NULL)").run(id,deviceId,script,"pending",now()); return id;
}

export function setClientLabel(deviceId:string,mac:string,label:string){const safeMac=validMac(mac);if(!safeMac)return false;db.prepare(`INSERT INTO client_devices(device_id,mac,label,detected_name,updated_at) VALUES (?,?,?,NULL,?) ON CONFLICT(device_id,mac) DO UPDATE SET label=excluded.label,updated_at=excluded.updated_at`).run(deviceId,safeMac,cleanText(label,80),now());return true}

export function queuePaymentWindow(deviceId:string,address:string){
  const parts=address.split(".");if(parts.length!==4||!parts.every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255))return null;
  const configured=(process.env.PIX_BLOCKED_DOMAINS||"facebook.com,facebook.net,fbcdn.net,instagram.com,cdninstagram.com,whatsapp.com,whatsapp.net,tiktok.com,tiktokcdn.com,twitter.com,x.com,twimg.com,youtube.com,youtu.be,googlevideo.com,google.com,connectivitycheck.gstatic.com,captive.apple.com,msftconnecttest.com").split(",").map(item=>item.trim().toLowerCase()).filter(item=>/^[a-z0-9.-]+$/.test(item)).slice(0,80);
  const id=randomUUID(),tag=`conecta-pix-${id.slice(0,8)}`,denies=configured.flatMap(domain=>[domain,`*.${domain}`]).map(domain=>`/ip hotspot walled-garden add action=deny src-address=${address} dst-host=${domain} comment="${tag}"`).join("\n");
  const temporaryRate=/^[0-9]+[kKmMgG]?\/[0-9]+[kKmMgG]?$/.test(process.env.PIX_TEMP_RATE_LIMIT||"")?process.env.PIX_TEMP_RATE_LIMIT:"1M/1M";
  const script=`/ip hotspot walled-garden remove [find comment="${tag}"]\n${denies}\n/ip hotspot walled-garden add action=allow src-address=${address} comment="${tag}"\n/queue simple remove [find name=${tag}]\n/queue simple add name=${tag} target=${address}/32 max-limit=${temporaryRate} comment="Conecta+ pagamento temporario"\n/system scheduler add name=${tag} interval=2m start-time=startup on-event="/ip hotspot walled-garden remove [find comment=${tag}]; /queue simple remove [find name=${tag}]; /system scheduler set [find name=${tag}] disabled=yes"\n:log info "Conecta+: compatibilidade Pix limitada a ${temporaryRate} por 2 minutos para ${address}"`;
  db.prepare("INSERT INTO router_commands VALUES (?,?,?,?,?,NULL)").run(id,deviceId,script,"pending",now());return id;
}

export function queueTerminate(deviceId:string,mac:string,operatorId:string){const safeMac=validMac(mac);if(!safeMac)return null;const id=randomUUID(),actor=cleanText(operatorId,16);const script=`/ip hotspot active remove [find mac-address=${safeMac}]\n/ip hotspot ip-binding remove [find mac-address=${safeMac}]\n:log warning \"Conecta+: acesso encerrado por ${actor} para ${safeMac}\"`;db.prepare("INSERT INTO router_commands VALUES (?,?,?,?,?,NULL)").run(id,deviceId,script,"pending",now());return id}

export function queuePortalRefresh(deviceId:string){const id=randomUUID(),script=`/tool fetch url="__CONNECTION_BASE__/api/provisioning/hotspot-login/__CONNECTION_TOKEN__" dst-path=hotspot/login.html\n/ip hotspot walled-garden remove [find comment="Conecta+ pagamentos"]\n/ip hotspot walled-garden add dst-host=__CONNECTION_HOST__ action=allow comment="Conecta+ pagamentos"\n/ip hotspot profile set [find name=conecta-hotspot] login-by=http-pap\n/ip hotspot cookie remove [find]\n/ip hotspot active remove [find]\n/ip hotspot ip-binding remove [find where comment~"^conecta-"]\n:log warning "Conecta+: modo atualizado; sessoes anteriores encerradas"`;db.prepare("INSERT INTO router_commands VALUES (?,?,?,?,?,NULL)").run(id,deviceId,script,"pending",now());return id}

export function nextCommand(tokenHash:string,token?:string,base?:string){const d=deviceIdByTokenHash(tokenHash);if(!d)return null;const c=db.prepare("SELECT * FROM router_commands WHERE device_id=? AND status='pending' ORDER BY created_at LIMIT 1").get(d.id) as any;if(!c)return ":nothing";db.prepare("UPDATE router_commands SET status='delivered',delivered_at=? WHERE id=?").run(now(),c.id);db.prepare("UPDATE access_releases SET status='delivered',executed_at=? WHERE id=?").run(now(),c.id);let host="";try{host=new URL(base||"").hostname}catch{}const script=String(c.script).replaceAll("__CONNECTION_TOKEN__",token||"").replaceAll("__CONNECTION_BASE__",(base||"").replace(/\/$/,"")).replaceAll("__CONNECTION_HOST__",host);return `/ip firewall filter disable [find action=fasttrack-connection]\n${script}`}
