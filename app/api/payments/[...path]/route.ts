import { createHmac, timingSafeEqual } from "node:crypto";
import { applyPaymentStatus, approveCashPayment, failPayment, financialReport, getPayment, newCashPayment, newPayment, paymentByMpId, paymentClientAddress, paymentDevice, paymentDiagnostics, priceFor, reopenPaymentWindow, saveMercadoPago } from "@/lib/payments-store";
import { isAdminRequest,operatorFromRequest } from "@/lib/admin-auth";
import { deviceDashboard,queuePaymentWindow } from "@/lib/operations-store";
import { assertTrustedOrigin, enforceRateLimit, handleApiError, HttpError, readJson, validMac } from "@/lib/security";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const token = () => process.env.MERCADO_PAGO_ACCESS_TOKEN || "";

async function mpPayment(id: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const payload=await responsePayload(response);
  if (!response.ok) throw new Error(`Mercado Pago ${response.status}: ${String(payload.message||payload.error||"consulta recusada")}`);
  return payload;
}

async function responsePayload(response:Response){const raw=await response.text();try{return JSON.parse(raw) as Record<string,any>}catch{throw new Error(`Mercado Pago respondeu ${response.status} com conteúdo inválido: ${raw.slice(0,300)||"resposta vazia"}`)}}

async function reconcile(localId: string) {
  const local = getPayment(localId);
  if (local?.status === "paid_cash") return local;
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
    if(path[0]==="financial"){if(!isAdminRequest(request))return json({error:"Não autorizado"},401);const days=Number(new URL(request.url).searchParams.get("days")||30);return json(financialReport(days))}
    if(path[0]==="diagnostics"){const admin=isAdminRequest(request),operator=operatorFromRequest(request),deviceId=path[1];if(!admin&&!operator)return json({error:"Não autorizado"},401);if(deviceId&&!deviceDashboard(deviceId,admin?undefined:operator!))return json({error:"Sem acesso"},403);return json({payments:paymentDiagnostics(deviceId)})}
    if (path[0] === "config" && path[1]) { enforceRateLimit(request, "payment-config", 60, 60_000); const price = priceFor(Number(path[1])); return price ? json({ enabled: !!token(), minutes: Number(path[1]), price }) : json({ error: "Plano sem preço" }, 404); }
    if (path[0] === "status" && path[1]) { enforceRateLimit(request, "payment-status", 30, 60_000, path[1]); const payment = await reconcile(path[1]); if (!payment) return json({ error: "Pagamento não encontrado" }, 404); return json({ id: payment.id, status: payment.status, released: !!payment.released }); }
    return json({ error: "Rota não encontrada" }, 404);
  } catch (error) { return handleApiError(error); }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { path } = await ctx.params;
    if(path[0]==="reopen"&&path[1]){assertTrustedOrigin(request);const admin=isAdminRequest(request),operator=operatorFromRequest(request),payment=getPayment(path[1]);if(!payment||(!admin&&!operator)||!deviceDashboard(payment.device_id,admin?undefined:operator!))return json({error:"Não autorizado"},401);enforceRateLimit(request,"reopen-payment",30,60_000);return reopenPaymentWindow(path[1])?json({status:"queued",minutes:2}):json({error:"Pagamento já liberado ou dispositivo sem IP ativo"},409)}
    if(path[0]==="cash"&&path[1]){assertTrustedOrigin(request);const admin=isAdminRequest(request),operator=operatorFromRequest(request),payment=getPayment(path[1]);if(!payment||(!admin&&!operator)||!deviceDashboard(payment.device_id,admin?undefined:operator!))return json({error:"Não autorizado"},401);enforceRateLimit(request,"cash-payment",30,60_000);return approveCashPayment(path[1])?json({status:"paid_cash",released:true}):json({error:"Pagamento inexistente ou já liberado"},409)}
    if(path[0]==="cash-request"){assertTrustedOrigin(request);enforceRateLimit(request,"cash-request",5,10*60_000);const body=await readJson<Record<string,unknown>>(request,4096),minutes=Number(body.minutes),amount=priceFor(minutes),mac=validMac(body.mac),deviceId=String(body.deviceId||""),device=paymentDevice(deviceId);if(!amount||!device||device.mode!=="self"||!mac)throw new HttpError(400,"Dados do pedido inválidos");const id=newCashPayment(device.id,mac,minutes,amount);return json({id,minutes,amount,status:"cash_pending"},201)}
    if (path[0] === "create") {
      assertTrustedOrigin(request); enforceRateLimit(request, "payment-create", 5, 10 * 60_000);
      if (!token()) return json({ error: "Mercado Pago não configurado" }, 503);
      const body = await readJson<Record<string, unknown>>(request, 4_096), minutes = Number(body.minutes), amount = priceFor(minutes), mac = validMac(body.mac),deviceId=String(body.deviceId||""),address=String(body.address||paymentClientAddress(deviceId,String(body.mac||"").toUpperCase())),email = String(body.email || "").trim().toLowerCase(), device = paymentDevice(deviceId);
      if (!amount || !device || device.mode !== "self" || !mac || email.length > 254 || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Dados da compra inválidos");
      const id = newPayment(device.id, mac, minutes, amount, email), base = String(process.env.PUBLIC_BASE_URL).replace(/\/$/, "");
      queuePaymentWindow(device.id,address,mac);
      try {
        const response = await fetch("https://api.mercadopago.com/v1/payments", { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", "X-Idempotency-Key": id }, body: JSON.stringify({ transaction_amount: amount, description: `Acesso Wi-Fi por ${minutes} minutos`, payment_method_id: "pix", external_reference: id, notification_url: `${base}/api/payments/webhook`, payer: { email } }), signal: AbortSignal.timeout(15_000) });
        const payload = await responsePayload(response);
        if (!response.ok) throw new Error(`Mercado Pago ${response.status}: ${String(payload.message||payload.error||"requisição recusada")}`);
        saveMercadoPago(id, payload); const payment = getPayment(id);
        return json({ id, minutes, amount, status: payment.status, qrCode: payment.qr_code, qrBase64: payment.qr_base64, ticketUrl: payment.ticket_url, temporaryAccessMinutes:2 }, 201);
      } catch(error) {const detail=error instanceof Error?error.message:"Falha não identificada";failPayment(id,detail);return json({error:"Não foi possível criar o Pix",detail},502);}
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
