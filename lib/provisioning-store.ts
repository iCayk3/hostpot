import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Mode, RouterConfig } from "./router-script";
import { database as db } from "./database";

export type Device = {
  id: string; activationId: string; code: string; serial: string; model: string; architecture: string;
  routerosVersion: string; identity: string; interfaces: string[]; status: string; lastSeen: string;
  installedAt: string | null; config: RouterConfig | null; mode: Mode | null;
};

db.exec(`CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  config_json TEXT, mode TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, activation_id TEXT NOT NULL UNIQUE, serial TEXT NOT NULL,
  model TEXT NOT NULL, architecture TEXT NOT NULL, routeros_version TEXT NOT NULL,
  identity TEXT NOT NULL, interfaces_json TEXT NOT NULL, status TEXT NOT NULL,
  last_seen TEXT NOT NULL, installed_at TEXT,
  FOREIGN KEY(activation_id) REFERENCES activations(id)
)`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial)");
db.exec("CREATE INDEX IF NOT EXISTS idx_activations_token_hash ON activations(token_hash)");
const deviceColumns = db.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>;
if (!deviceColumns.some((column) => column.name === "agent_token_hash")) db.exec("ALTER TABLE devices ADD COLUMN agent_token_hash TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_agent_token_hash ON devices(agent_token_hash) WHERE agent_token_hash IS NOT NULL");
db.exec("PRAGMA optimize");

export const hashToken = (token: string) => {const secret=process.env.ACTIVATION_TOKEN_SECRET||(process.env.NODE_ENV==="production"?"":"development-activation-secret");if(!secret)throw new Error("ACTIVATION_TOKEN_SECRET obrigatório");return createHmac("sha256",secret).update(token).digest("hex")};
const now = () => new Date().toISOString();
export const hashAgentToken = (token: string) => createHmac("sha256", process.env.ACTIVATION_TOKEN_SECRET || "development-activation-secret").update(`agent:${token}`).digest("hex");

export function createActivation() {
  const id = randomUUID();
  const code = randomBytes(3).toString("hex").toUpperCase();
  const token = randomBytes(24).toString("base64url");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  db.prepare("INSERT INTO activations (id,code,token_hash,status,created_at,expires_at) VALUES (?,?,?,?,?,?)")
    .run(id, code, hashToken(token), "awaiting", createdAt, expiresAt);
  return { id, code, token, status: "awaiting", createdAt, expiresAt };
}

function activationByToken(token: string) {
  return db.prepare("SELECT * FROM activations WHERE token_hash=?").get(hashToken(token)) as Record<string, string | null> | undefined;
}

export function validateToken(token: string) {
  const activation = activationByToken(token);
  if (!activation || activation.status === "installed" || new Date(String(activation.expires_at)).getTime() < Date.now()) return null;
  return activation;
}

export function registerDevice(token: string, values: Record<string, string>) {
  const activation = validateToken(token);
  if (!activation) return null;
  const serial = values.serial || "unknown";
  const existing = db.prepare("SELECT id FROM devices WHERE activation_id=? OR serial=?").get(activation.id, serial) as { id: string } | undefined;
  const id = existing?.id || randomUUID();
  const interfaces = values.interfaces?.split(",").map((item) => item.trim()).filter(Boolean) || [];
  if (existing) {
    db.prepare("UPDATE devices SET activation_id=?,serial=?,model=?,architecture=?,routeros_version=?,identity=?,interfaces_json=?,status=?,last_seen=? WHERE id=?")
      .run(activation.id, serial, values.model || "unknown", values.architecture || "unknown", values.version || "unknown", values.identity || "MikroTik", JSON.stringify(interfaces), "detected", now(), id);
  } else {
    db.prepare("INSERT INTO devices (id,activation_id,serial,model,architecture,routeros_version,identity,interfaces_json,status,last_seen,installed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, activation.id, values.serial || "unknown", values.model || "unknown", values.architecture || "unknown", values.version || "unknown", values.identity || "MikroTik", JSON.stringify(interfaces), "detected", now(), null);
  }
  db.prepare("UPDATE activations SET status='detected' WHERE id=?").run(activation.id);
  return id;
}

export function configureDevice(id: string, config: RouterConfig, mode: Mode) {
  const interfaceName=/^[A-Za-z0-9_.:+-]{1,63}$/;
  const ipv4="(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}";
  if(!config||!Object.values(config).every(value=>typeof value==="string"&&value.length<=128)||!interfaceName.test(config.wan)||!interfaceName.test(config.management)||!config.guests.split(",").every(value=>interfaceName.test(value.trim()))||!new RegExp(`^${ipv4}/(?:[8-9]|[12]\\d|3[0-2])$`).test(config.guestSubnet)||!new RegExp(`^${ipv4}$`).test(config.guestGateway)||!new RegExp(`^${ipv4}-${ipv4}$`).test(config.guestPool)||!new RegExp(`^${ipv4}/(?:[8-9]|[12]\\d|3[0-2])$`).test(config.managementAddress)||!/^[A-Za-z0-9.-]{1,253}$/.test(config.dnsName)||!/^[A-Za-z0-9_.-]{3,32}$/.test(config.adminUser)||config.adminPassword.length<12||!/^[0-9]+[kKmMgG]?\/[0-9]+[kKmMgG]?$/.test(config.rateLimit))return false;
  const device = db.prepare("SELECT activation_id FROM devices WHERE id=?").get(id) as { activation_id: string } | undefined;
  if (!device) return false;
  db.prepare("UPDATE activations SET config_json=?,mode=?,status='ready' WHERE id=?").run(JSON.stringify(config), mode, device.activation_id);
  db.prepare("UPDATE devices SET status='ready' WHERE id=?").run(id);
  return true;
}

export function updateDeviceMode(id:string,mode:Mode){if(mode!=="self"&&mode!=="admin")return false;const device=db.prepare("SELECT activation_id FROM devices WHERE id=?").get(id) as {activation_id:string}|undefined;if(!device)return false;db.prepare("UPDATE activations SET mode=? WHERE id=?").run(mode,device.activation_id);return true}

export function configurationForToken(token: string) {
  const activation = validateToken(token);
  if (!activation) return null;
  const device=db.prepare("SELECT id FROM devices WHERE activation_id=?").get(activation.id) as {id:string}|undefined;
  return {
    activation,
    deviceId:device?.id||null,
    config: activation.config_json ? JSON.parse(String(activation.config_json)) as RouterConfig : null,
    mode: activation.mode as Mode | null,
  };
}

export function confirmInstallation(token: string) {
  const activation = activationByToken(token);
  if (!activation) return false;
  const installedAt = now();
  db.prepare("UPDATE activations SET status='installed' WHERE id=?").run(activation.id);
  db.prepare("UPDATE devices SET status='installed',installed_at=?,last_seen=? WHERE activation_id=?").run(installedAt, installedAt, activation.id);
  return true;
}

export function activateAgentToken(token: string) {
  const activation = validateToken(token);
  if (!activation) return null;
  const agentToken = randomBytes(32).toString("base64url");
  db.prepare("UPDATE devices SET agent_token_hash=? WHERE activation_id=?").run(hashAgentToken(agentToken), activation.id);
  return agentToken;
}

export function configurationForAgentToken(token: string) {
  const row = db.prepare(`SELECT d.id,a.mode,a.config_json FROM devices d JOIN activations a ON a.id=d.activation_id WHERE d.agent_token_hash=? AND a.status IN ('ready','installed')`).get(hashAgentToken(token)) as { id: string; mode: Mode | null; config_json: string | null } | undefined;
  return row ? { deviceId: row.id, mode: row.mode, config: row.config_json ? JSON.parse(row.config_json) as RouterConfig : null } : null;
}

export function listDevices(): Device[] {
  const rows = db.prepare(`SELECT d.*,a.code,a.config_json,a.mode FROM devices d
    JOIN activations a ON a.id=d.activation_id ORDER BY d.last_seen DESC`).all() as Array<Record<string, string | null>>;
  return rows.map((row) => ({
    id: String(row.id), activationId: String(row.activation_id), code: String(row.code), serial: String(row.serial),
    model: String(row.model), architecture: String(row.architecture), routerosVersion: String(row.routeros_version),
    identity: String(row.identity), interfaces: JSON.parse(String(row.interfaces_json)), status: String(row.status),
    lastSeen: String(row.last_seen), installedAt: row.installed_at, config: row.config_json ? JSON.parse(row.config_json) : null,
    mode: row.mode as Mode | null,
  }));
}
