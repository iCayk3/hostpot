import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Mode, RouterConfig } from "./router-script";

export type Device = {
  id: string; activationId: string; code: string; serial: string; model: string; architecture: string;
  routerosVersion: string; identity: string; interfaces: string[]; status: string; lastSeen: string;
  installedAt: string | null; config: RouterConfig | null; mode: Mode | null;
};

const dataDir = process.env.PROVISIONING_DATA_DIR || join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "conecta.db"));
db.exec("PRAGMA journal_mode=WAL");
db.exec("PRAGMA foreign_keys=ON");
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
db.exec("PRAGMA optimize");

const hash = (token: string) => createHmac("sha256", process.env.ACTIVATION_TOKEN_SECRET || "development-activation-secret").update(token).digest("hex");
const now = () => new Date().toISOString();

export function createActivation() {
  const id = randomUUID();
  const code = randomBytes(3).toString("hex").toUpperCase();
  const token = randomBytes(24).toString("base64url");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  db.prepare("INSERT INTO activations (id,code,token_hash,status,created_at,expires_at) VALUES (?,?,?,?,?,?)")
    .run(id, code, hash(token), "awaiting", createdAt, expiresAt);
  return { id, code, token, status: "awaiting", createdAt, expiresAt };
}

function activationByToken(token: string) {
  return db.prepare("SELECT * FROM activations WHERE token_hash=?").get(hash(token)) as Record<string, string | null> | undefined;
}

export function validateToken(token: string) {
  const activation = activationByToken(token);
  if (!activation || (activation.status === "awaiting" && new Date(String(activation.expires_at)).getTime() < Date.now())) return null;
  return activation;
}

export function registerDevice(token: string, values: Record<string, string>) {
  const activation = validateToken(token);
  if (!activation) return null;
  const existing = db.prepare("SELECT id FROM devices WHERE activation_id=?").get(activation.id) as { id: string } | undefined;
  const id = existing?.id || randomUUID();
  const interfaces = values.interfaces?.split(",").map((item) => item.trim()).filter(Boolean) || [];
  if (existing) {
    db.prepare("UPDATE devices SET serial=?,model=?,architecture=?,routeros_version=?,identity=?,interfaces_json=?,status=?,last_seen=? WHERE id=?")
      .run(values.serial || "unknown", values.model || "unknown", values.architecture || "unknown", values.version || "unknown", values.identity || "MikroTik", JSON.stringify(interfaces), "detected", now(), id);
  } else {
    db.prepare("INSERT INTO devices VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, activation.id, values.serial || "unknown", values.model || "unknown", values.architecture || "unknown", values.version || "unknown", values.identity || "MikroTik", JSON.stringify(interfaces), "detected", now(), null);
  }
  db.prepare("UPDATE activations SET status='detected' WHERE id=?").run(activation.id);
  return id;
}

export function configureDevice(id: string, config: RouterConfig, mode: Mode) {
  const device = db.prepare("SELECT activation_id FROM devices WHERE id=?").get(id) as { activation_id: string } | undefined;
  if (!device) return false;
  db.prepare("UPDATE activations SET config_json=?,mode=?,status='ready' WHERE id=?").run(JSON.stringify(config), mode, device.activation_id);
  db.prepare("UPDATE devices SET status='ready' WHERE id=?").run(id);
  return true;
}

export function configurationForToken(token: string) {
  const activation = validateToken(token);
  if (!activation) return null;
  return {
    activation,
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
