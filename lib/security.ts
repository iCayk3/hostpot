const buckets = new Map<string, { count: number; reset: number }>();

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function clientAddress(request: Request) {
  return (request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
}

export function enforceRateLimit(request: Request, scope: string, limit: number, windowMs: number, subject = "") {
  const key = `${scope}:${clientAddress(request)}:${subject.slice(0, 100)}`;
  const time = Date.now(), entry = buckets.get(key);
  if (!entry || entry.reset <= time) { buckets.set(key, { count: 1, reset: time + windowMs }); return; }
  entry.count++;
  if (entry.count > limit) throw new HttpError(429, "Muitas tentativas. Aguarde e tente novamente.");
  if (buckets.size > 10_000) for (const [item, value] of buckets) if (value.reset <= time) buckets.delete(item);
}

export async function readJson<T>(request: Request, maxBytes = 16_384): Promise<T> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Requisição muito grande");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new HttpError(413, "Requisição muito grande");
  try { return JSON.parse(raw) as T; } catch { throw new HttpError(400, "JSON inválido"); }
}

export async function readText(request: Request, maxBytes = 131_072) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Requisição muito grande");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new HttpError(413, "Requisição muito grande");
  return raw;
}

export function validMac(value: unknown) { const mac = String(value || "").toUpperCase(); return /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac) ? mac : null; }
export function cleanText(value: unknown, max = 80) { return String(value || "").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max); }
export function assertTrustedOrigin(request: Request) { const site = request.headers.get("sec-fetch-site"); if (site === "cross-site") throw new HttpError(403, "Origem não permitida"); const origin = request.headers.get("origin"); if (!origin) return; const expected = new URL(process.env.PUBLIC_BASE_URL || request.url).origin; if (origin !== expected) throw new HttpError(403, "Origem não permitida"); }
export function secureCookie() { return (process.env.PUBLIC_BASE_URL || "").startsWith("https://") ? "; Secure" : ""; }
export function handleApiError(error: unknown) { if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } }); console.error("API error", error); return Response.json({ error: "Erro interno" }, { status: 500, headers: { "Cache-Control": "no-store" } }); }

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production" || process.env.SKIP_ENV_VALIDATION === "1") return;
  for (const key of ["PUBLIC_BASE_URL", "ACTIVATION_TOKEN_SECRET", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"] as const) if (!process.env[key] || String(process.env[key]).length < 16) throw new Error(`${key} deve ser configurado com valor seguro`);
  if (new URL(String(process.env.PUBLIC_BASE_URL)).protocol !== "https:") throw new Error("PUBLIC_BASE_URL deve usar HTTPS em produção");
  if (process.env.ADMIN_PASSWORD === "admin") throw new Error("ADMIN_PASSWORD não pode usar a senha padrão");
  if (process.env.MERCADO_PAGO_ACCESS_TOKEN && !process.env.MERCADO_PAGO_WEBHOOK_SECRET) throw new Error("MERCADO_PAGO_WEBHOOK_SECRET é obrigatório quando pagamentos estão ativos");
}
