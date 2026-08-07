import { cookieSecurity,createOperatorSession,isAdminRequest,operatorCookie,operatorFromRequest } from "@/lib/admin-auth";
import { adminOverview,agentTokenHash,allOperationalDevices,authenticateOperator,createOperator,deviceDashboard,getOperator,listOperators,nextCommand,operatorDevices,queueRelease,queueTerminate,saveTelemetry,setClientLabel } from "@/lib/operations-store";
import { assertTrustedOrigin,enforceRateLimit,handleApiError,readJson,readText } from "@/lib/security";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{"Cache-Control":"no-store",...headers}});
const parse=(raw:string)=>Object.fromEntries(raw.split(/\r?\n/).slice(0,1000).map(line=>{const i=line.indexOf("=");return i>0?[line.slice(0,i),line.slice(i+1)]:[line,""]}));
type Ctx={params:Promise<{path:string[]}>};

export async function GET(request:Request,ctx:Ctx){try{const{path}=await ctx.params;
 if(path[0]==="operators")return isAdminRequest(request)?json({operators:listOperators()}):json({error:"Não autorizado"},401);
 if(path[0]==="overview")return isAdminRequest(request)?json(adminOverview()):json({error:"Não autorizado"},401);
 const admin=isAdminRequest(request),operatorId=operatorFromRequest(request);
 if(path[0]==="session")return json({authenticated:admin||!!operatorId,user:admin?{name:"Administrador",username:process.env.ADMIN_USERNAME||"admin",role:"admin"}:operatorId?getOperator(operatorId):null});
 if(path[0]==="devices")return admin?json({devices:allOperationalDevices()}):operatorId?json({devices:operatorDevices(operatorId)}):json({error:"Não autorizado"},401);
 if(path[0]==="dashboard"&&path[1]){if(!admin&&!operatorId)return json({error:"Não autorizado"},401);const data=deviceDashboard(path[1],admin?undefined:operatorId!);return data?json(data):json({error:"Sem acesso"},403)}
 if(path[0]==="commands"&&path[1]){enforceRateLimit(request,"router-commands",20,60_000,path[1]);return new Response(nextCommand(agentTokenHash(path[1]),path[1],process.env.PUBLIC_BASE_URL||new URL(request.url).origin)||':error "token invalido"',{headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}})}
 return json({error:"Rota não encontrada"},404)}catch(error){return handleApiError(error)}}

export async function POST(request:Request,ctx:Ctx){try{const{path}=await ctx.params;
 if(path[0]==="login"){assertTrustedOrigin(request);const body=await readJson<{username?:string;password?:string}>(request,4096);enforceRateLimit(request,"operator-login",5,15*60_000,String(body.username||""));const user=authenticateOperator(body.username||"",body.password||"");if(!user)return json({error:"Credenciais inválidas"},401);const session=createOperatorSession(user.id);return json({user},200,{"Set-Cookie":`${operatorCookie}=${session.value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${session.maxAge}${cookieSecurity()}`})}
 if(path[0]==="telemetry"&&path[1]){enforceRateLimit(request,"router-telemetry",10,60_000,path[1]);return saveTelemetry(agentTokenHash(path[1]),parse(await readText(request,262_144)))?json({status:"ok"}):json({error:"Token inválido"},401)}
 assertTrustedOrigin(request);
 if(path[0]==="operators"){if(!isAdminRequest(request))return json({error:"Não autorizado"},401);const body=await readJson<any>(request,16_384);try{return json({id:createOperator(body.name,body.username,body.password,Array.isArray(body.deviceIds)?body.deviceIds:[])},201)}catch{return json({error:"Usuário já existe ou dados inválidos"},400)}}
 const admin=isAdminRequest(request),operator=operatorFromRequest(request);if(!admin&&!operator)return json({error:"Não autorizado"},401);if(!path[1]||!deviceDashboard(path[1],admin?undefined:operator!))return json({error:"Sem acesso"},403);
 const body=await readJson<any>(request,4096);
 if(path[0]==="release"){const id=queueRelease(path[1],body.mac,Number(body.minutes),admin?"admin":operator!);return id?json({id,status:"queued"},201):json({error:"Tempo ou MAC inválido"},400)}
 if(path[0]==="client-label")return setClientLabel(path[1],String(body.mac||""),String(body.label||""))?json({status:"saved"}):json({error:"MAC inválido"},400);
 if(path[0]==="terminate"){const id=queueTerminate(path[1],String(body.mac||""),admin?"admin":operator!);return id?json({id,status:"queued"},201):json({error:"MAC inválido"},400)}
 return json({error:"Rota não encontrada"},404)}catch(error){return handleApiError(error)}}
