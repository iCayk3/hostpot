import { randomUUID } from "node:crypto";
import { database as db } from "./database";
import { queueRelease } from "./operations-store";

db.exec(`CREATE TABLE IF NOT EXISTS pix_payments (id TEXT PRIMARY KEY,device_id TEXT NOT NULL,mac TEXT NOT NULL,minutes INTEGER NOT NULL,amount REAL NOT NULL,email TEXT NOT NULL,mp_payment_id TEXT,status TEXT NOT NULL,qr_code TEXT,qr_base64 TEXT,ticket_url TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,released INTEGER NOT NULL DEFAULT 0)`);
const now=()=>new Date().toISOString();
export function priceFor(minutes:number){if(![5,10,15,30,60].includes(minutes))return null;const value=Number(process.env[`PIX_PRICE_${minutes}`]);return Number.isFinite(value)&&value>0?Number(value.toFixed(2)):null}
export function paymentDevice(deviceId:string){return db.prepare(`SELECT d.id,d.identity,a.mode FROM devices d JOIN activations a ON a.id=d.activation_id WHERE d.id=?`).get(deviceId) as {id:string;identity:string;mode:string}|undefined}
export function newPayment(deviceId:string,mac:string,minutes:number,amount:number,email:string){const id=randomUUID();db.prepare(`INSERT INTO pix_payments(id,device_id,mac,minutes,amount,email,status,created_at,updated_at,released) VALUES (?,?,?,?,?,?,'creating',?,?,0)`).run(id,deviceId,mac,minutes,amount,email,now(),now());return id}
export function saveMercadoPago(id:string,p:any){db.prepare(`UPDATE pix_payments SET mp_payment_id=?,status=?,qr_code=?,qr_base64=?,ticket_url=?,updated_at=? WHERE id=?`).run(String(p.id),String(p.status||"pending"),p.point_of_interaction?.transaction_data?.qr_code||"",p.point_of_interaction?.transaction_data?.qr_code_base64||"",p.point_of_interaction?.transaction_data?.ticket_url||"",now(),id)}
export function failPayment(id:string,status="error"){db.prepare("UPDATE pix_payments SET status=?,updated_at=? WHERE id=?").run(status,now(),id)}
export function getPayment(id:string){return db.prepare("SELECT * FROM pix_payments WHERE id=?").get(id) as any}
export function paymentByMpId(mpId:string){return db.prepare("SELECT * FROM pix_payments WHERE mp_payment_id=?").get(mpId) as any}
export function applyPaymentStatus(id:string,status:string){db.prepare("UPDATE pix_payments SET status=?,updated_at=? WHERE id=?").run(status,now(),id);if(status!=="approved")return;const changed=db.prepare("UPDATE pix_payments SET released=1 WHERE id=? AND released=0").run(id);if(changed.changes){const payment=getPayment(id);queueRelease(payment.device_id,payment.mac,Number(payment.minutes),"mercadopago")}}
