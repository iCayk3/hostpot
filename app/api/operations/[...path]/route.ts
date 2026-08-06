import { isAdminRequest, createOperatorSession, operatorCookie, operatorFromRequest } from "@/lib/admin-auth";
import { hashToken } from "@/lib/provisioning-store";
import { adminOverview, allOperationalDevices, authenticateOperator, createOperator, deviceDashboard, getOperator, listOperators, nextCommand, operatorDevices, queueRelease, queueTerminate, saveTelemetry, setClientLabel } from "@/lib/operations-store";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{"Cache-Control":"no-store",...headers}});
const parse=(raw:string)=>Object.fromEntries(raw.split(/\r?\n/).map(line=>{const i=line.indexOf("=");return i>0?[line.slice(0,i),line.slice(i+1)]:[line,""]}));
type Ctx={params:Promise<{path:string[]}>};
export async function GET(request:Request,ctx:Ctx){const{path}=await ctx.params;
 if(path[0]==="operators")return isAdminRequest(request)?json({operators:listOperators()}):json({error:"Não autorizado"},401);
 if(path[0]==="overview")return isAdminRequest(request)?json(adminOverview()):json({error:"Não autorizado"},401);
 const admin=isAdminRequest(request),operatorId=operatorFromRequest(request);if(path[0]==="session")return json({authenticated:admin||!!operatorId,user:admin?{name:"Administrador",username:process.env.ADMIN_USERNAME||"admin",role:"admin"}:operatorId?getOperator(operatorId):null});
 if(path[0]==="devices")return admin?json({devices:allOperationalDevices()}):operatorId?json({devices:operatorDevices(operatorId)}):json({error:"Não autorizado"},401);
 if(path[0]==="dashboard"&&path[1]){if(!admin&&!operatorId)return json({error:"Não autorizado"},401);const data=deviceDashboard(path[1],admin?undefined:operatorId!);return data?json(data):json({error:"Sem acesso"},403)}
 if(path[0]==="commands"&&path[1])return new Response(nextCommand(hashToken(path[1]),path[1],process.env.PUBLIC_BASE_URL||new URL(request.url).origin)||":error \"token invalido\"",{headers:{"Content-Type":"text/plain"}});
 return json({error:"Rota não encontrada"},404)}
export async function POST(request:Request,ctx:Ctx){const{path}=await ctx.params;
 if(path[0]==="login"){const b=await request.json() as any;const user=authenticateOperator(b.username||"",b.password||"");if(!user)return json({error:"Credenciais inválidas"},401);const s=createOperatorSession(user.id);return json({user},200,{"Set-Cookie":`${operatorCookie}=${s.value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${s.maxAge}`})}
 if(path[0]==="operators"){if(!isAdminRequest(request))return json({error:"Não autorizado"},401);const b=await request.json() as any;try{return json({id:createOperator(b.name,b.username,b.password,b.deviceIds||[])},201)}catch{return json({error:"Usuário já existe ou dados inválidos"},400)}}
 if(path[0]==="telemetry"&&path[1])return saveTelemetry(hashToken(path[1]),parse(await request.text()))?json({status:"ok"}):json({error:"Token inválido"},401);
 if(path[0]==="release"&&path[1]){const admin=isAdminRequest(request),op=operatorFromRequest(request);if(!admin&&!op)return json({error:"Não autorizado"},401);const allowed=deviceDashboard(path[1],admin?undefined:op!);if(!allowed)return json({error:"Sem acesso"},403);const b=await request.json() as any;const id=queueRelease(path[1],b.mac,Number(b.minutes),admin?"admin":op!);return id?json({id,status:"queued"},201):json({error:"Tempo inválido"},400)}
 if(path[0]==="client-label"&&path[1]){const admin=isAdminRequest(request),op=operatorFromRequest(request);if(!admin&&!op)return json({error:"Não autorizado"},401);if(!deviceDashboard(path[1],admin?undefined:op!))return json({error:"Sem acesso"},403);const b=await request.json() as any;return setClientLabel(path[1],String(b.mac||""),String(b.label||""))?json({status:"saved"}):json({error:"MAC inválido"},400)}
 if(path[0]==="terminate"&&path[1]){const admin=isAdminRequest(request),op=operatorFromRequest(request);if(!admin&&!op)return json({error:"Não autorizado"},401);if(!deviceDashboard(path[1],admin?undefined:op!))return json({error:"Sem acesso"},403);const b=await request.json() as any;const id=queueTerminate(path[1],String(b.mac||""),admin?"admin":op!);return id?json({id,status:"queued"},201):json({error:"MAC inválido"},400)}
 return json({error:"Rota não encontrada"},404)}
