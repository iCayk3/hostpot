import { createHmac, timingSafeEqual } from "node:crypto";
import { applyPaymentStatus, failPayment, getPayment, newPayment, paymentByMpId, paymentDevice, priceFor, saveMercadoPago } from "@/lib/payments-store";
import { assertTrustedOrigin, enforceRateLimit, handleApiError, HttpError, readJson, validMac } from "@/lib/security";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const token = () => process.env.MERCADO_PAGO_ACCESS_TOKEN || "";

async function mpPayment(id: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Mercado Pago ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function reconcile(localId: string) {
  const local = getPayment(localId);
  if (!local?.mp_payment_id) return local;
  const remote = await mpPayment(String(local.mp_payment_id));
  if (String(remote.external_reference) !== local.id || Math.abs(Number(remote.transaction_amount) - Number(local.amount)) > .001) throw new Error("Pagamento divergente");
  applyPaymentStatus(local.id, String(remote.status));
  return getPayment(local.id);
}

function validWebhook(request: Request, dataId: string) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const signature = request.headers.get("x-signature") || "", requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((item) => item.split("=").map((value) => value.trim())));
  const timestamp = Number(parts.ts), received = parts.v1 || "";
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !/^[a-f0-9]{64}$/i.test(received) || !requestId || !dataId) return false;
  const expected = createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${timestamp};`).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { path } = await ctx.params;
    if (path[0] === "config" && path[1]) { enforceRateLimit(request, "payment-config", 60, 60_000); const price = priceFor(Number(path[1])); return price ? json({ enabled: !!token(), minutes: Number(path[1]), price }) : json({ error: "Plano sem preço" }, 404); }
    if (path[0] === "status" && path[1]) { enforceRateLimit(request, "payment-status", 30, 60_000, path[1]); const payment = await reconcile(path[1]); if (!payment) return json({ error: "Pagamento não encontrado" }, 404); return json({ id: payment.id, status: payment.status, released: !!payment.released }); }
    return json({ error: "Rota não encontrada" }, 404);
  } catch (error) { return handleApiError(error); }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { path } = await ctx.params;
    if (path[0] === "create") {
      assertTrustedOrigin(request); enforceRateLimit(request, "payment-create", 5, 10 * 60_000);
      if (!token()) return json({ error: "Mercado Pago não configurado" }, 503);
      const body = await readJson<Record<string, unknown>>(request, 4_096), minutes = Number(body.minutes), amount = priceFor(minutes), mac = validMac(body.mac), email = String(body.email || "").trim().toLowerCase(), device = paymentDevice(String(body.deviceId || ""));
      if (!amount || !device || device.mode !== "self" || !mac || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Dados da compra inválidos");
      const id = newPayment(device.id, mac, minutes, amount, email), base = String(process.env.PUBLIC_BASE_URL).replace(/\/$/, "");
      try {
        const response = await fetch("https://api.mercadopago.com/v1/payments", { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", "X-Idempotency-Key": id }, body: JSON.stringify({ transaction_amount: amount, description: `Wi-Fi ${minutes} minutos - ${device.identity}`, payment_method_id: "pix", external_reference: id, notification_url: `${base}/api/payments/webhook`, payer: { email } }), signal: AbortSignal.timeout(15_000) });
        const payload = await response.json() as Record<string, any>;
        if (!response.ok) throw new Error(`Mercado Pago ${response.status}`);
        saveMercadoPago(id, payload); const payment = getPayment(id);
        return json({ id, minutes, amount, status: payment.status, qrCode: payment.qr_code, qrBase64: payment.qr_base64, ticketUrl: payment.ticket_url }, 201);
      } catch { failPayment(id); return json({ error: "Não foi possível criar o Pix" }, 502); }
    }
    if (path[0] === "webhook") {
      enforceRateLimit(request, "payment-webhook", 120, 60_000);
      const url = new URL(request.url), body = await readJson<Record<string, any>>(request, 16_384), mpId = String(url.searchParams.get("data.id") || body?.data?.id || "").slice(0, 64);
      if (!mpId) return json({ received: true });
      if (!validWebhook(request, mpId)) return json({ error: "Assinatura inválida" }, 401);
      const local = paymentByMpId(mpId); if (local) try { await reconcile(local.id); } catch { /* Mercado Pago tentará novamente. */ }
      return json({ received: true });
    }
    return json({ error: "Rota não encontrada" }, 404);
  } catch (error) { return handleApiError(error); }
}
