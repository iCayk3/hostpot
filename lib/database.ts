import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateProductionEnvironment } from "./security";

validateProductionEnvironment();

const dataDir = process.env.PROVISIONING_DATA_DIR || join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const globalDatabase = globalThis as typeof globalThis & { conectaDatabase?: DatabaseSync };

export const database = globalDatabase.conectaDatabase || new DatabaseSync(join(dataDir, "conecta.db"));
globalDatabase.conectaDatabase = database;

database.exec("PRAGMA busy_timeout=5000");
database.exec("PRAGMA journal_mode=WAL");
database.exec("PRAGMA foreign_keys=ON");
