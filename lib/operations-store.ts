import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = process.env.PROVISIONING_DATA_DIR || join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(join(dir, "conecta.db"));
db.exec("PRAGMA journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS operators (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS operator_devices (operator_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY(operator_id,device_id))`);
db.exec(`CREATE TABLE IF NOT EXISTS telemetry (device_id TEXT PRIMARY KEY, active_count INTEGER NOT NULL DEFAULT 0, host_count INTEGER NOT NULL DEFAULT 0, uptime TEXT, cpu INTEGER, free_memory TEXT, updated_at TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS hotspot_sessions (device_id TEXT NOT NULL, session_key TEXT NOT NULL, username TEXT, address TEXT, mac TEXT, uptime TEXT, time_left TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(device_id,session_key))`);
db.exec(`CREATE TABLE IF NOT EXISTS hotspot_hosts (device_id TEXT NOT NULL, host_key TEXT NOT NULL, address TEXT, mac TEXT, authorized INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(device_id,host_key))`);
db.exec(`CREATE TABLE IF NOT EXISTS access_releases (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, mac TEXT NOT NULL, minutes INTEGER NOT NULL, status TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, executed_at TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS router_commands (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, script TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, delivered_at TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS access_events (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, mac TEXT, username TEXT, duration_minutes INTEGER, started_at TEXT NOT NULL, last_seen TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`);
db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_device ON hotspot_sessions(device_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_hosts_device ON hotspot_hosts(device_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_commands_pending ON router_commands(device_id,status)");

const now = () => new Date().toISOString();
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");

export function createOperator(name: string, username: string, password: string, deviceIds: string[]) {
  const id = randomUUID(), salt = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO operators VALUES (?,?,?,?,?,1,?)").run(id, name, username.toLowerCase(), hashPassword(password, salt), salt, now());
  const assign = db.prepare("INSERT OR IGNORE INTO operator_devices VALUES (?,?)");
  for (const deviceId of deviceIds) assign.run(id, deviceId);
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

export function deviceDashboard(deviceId: string, operatorId?: string) {
  if (operatorId && !db.prepare("SELECT 1 ok FROM operator_devices WHERE operator_id=? AND device_id=?").get(operatorId,deviceId)) return null;
  const device = db.prepare(`SELECT d.id,d.serial,d.model,d.identity,d.status,d.last_seen,a.mode,t.active_count,t.host_count,t.uptime,t.cpu,t.free_memory,t.updated_at FROM devices d JOIN activations a ON a.id=d.activation_id LEFT JOIN telemetry t ON t.device_id=d.id WHERE d.id=?`).get(deviceId);
  if (!device) return null;
  const sessions = db.prepare("SELECT username,address,mac,uptime,time_left,updated_at FROM hotspot_sessions WHERE device_id=? ORDER BY updated_at DESC").all(deviceId);
  const hosts = db.prepare("SELECT address,mac,authorized,updated_at FROM hotspot_hosts WHERE device_id=? ORDER BY updated_at DESC").all(deviceId);
  const releases = db.prepare("SELECT id,mac,minutes,status,created_at,executed_at FROM access_releases WHERE device_id=? ORDER BY created_at DESC LIMIT 50").all(deviceId);
  const durationStats=db.prepare(`SELECT duration_minutes minutes,COUNT(*) total FROM access_events WHERE device_id=? AND started_at>=datetime('now','-1 day') GROUP BY duration_minutes ORDER BY duration_minutes`).all(deviceId);
  return { device, sessions, hosts, releases,durationStats };
}

function deviceIdByTokenHash(tokenHash: string) {
  return db.prepare(`SELECT d.id FROM devices d JOIN activations a ON a.id=d.activation_id WHERE a.token_hash=?`).get(tokenHash) as {id:string}|undefined;
}

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
  for(const item of (values.hosts||"").split(";").filter(Boolean)){const [address,mac,authorized]=item.split("|");insH.run(device.id,mac||address,address,mac,authorized==="true"?1:0,timestamp)}
  return true;
}

export function queueRelease(deviceId:string,mac:string,minutes:number,operatorId:string){
  if(![5,10,15,30,60].includes(minutes)) return null;
  const id=randomUUID(), tag=`conecta-${id.slice(0,8)}`, script=`/ip hotspot ip-binding remove [find mac-address=${mac}]\n/ip hotspot ip-binding add mac-address=${mac} type=bypassed comment=\"${tag}\"\n/system scheduler add name=${tag} interval=${minutes}m start-time=startup on-event=\"/ip hotspot ip-binding remove [find comment=${tag}]; /system scheduler set [find name=${tag}] disabled=yes\"`;
  db.prepare("INSERT INTO access_releases VALUES (?,?,?,?,?,?,?,NULL)").run(id,deviceId,mac,minutes,"queued",operatorId,now());
  db.prepare("INSERT INTO router_commands VALUES (?,?,?,?,?,NULL)").run(id,deviceId,script,"pending",now()); return id;
}

export function nextCommand(tokenHash:string){const d=deviceIdByTokenHash(tokenHash);if(!d)return null;const c=db.prepare("SELECT * FROM router_commands WHERE device_id=? AND status='pending' ORDER BY created_at LIMIT 1").get(d.id) as any;if(!c)return ":nothing";db.prepare("UPDATE router_commands SET status='delivered',delivered_at=? WHERE id=?").run(now(),c.id);db.prepare("UPDATE access_releases SET status='delivered',executed_at=? WHERE id=?").run(now(),c.id);return String(c.script)}
