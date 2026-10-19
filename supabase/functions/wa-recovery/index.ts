import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { RECOVERY_MESSAGE, recoveryCandidates, recoverySetting, runRecoveryQueue } from "../_shared/waRecovery.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const digest = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,"0")).join("");
const attempts = new Map<string,{count:number,until:number}>();
Deno.serve(async req => {
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"Use POST."},405);
  try {
    const raw=await req.text();if(raw.length>20000)return reply({error:"Pedido muito grande."},413);
    const body=JSON.parse(raw);
    if(body.action==="login"){
      const username=String(body.username||"").trim(),password=String(body.password||"");
      const key=(req.headers.get("x-forwarded-for")||"")+username.toLowerCase();const now=Date.now();
      const throttle=attempts.get(key);if(throttle&&throttle.until>now&&throttle.count>=8)return reply({error:"Aguarde antes de tentar novamente."},429);
      attempts.set(key,{count:throttle&&throttle.until>now?throttle.count+1:1,until:now+300000});
      if(!username||username.length>128||!password||password.length>512)return reply({error:"Dados inválidos."},400);
      const {data:user}=await db.from("users").select("id,password,is_active").eq("username",username).maybeSingle();
      const stored=String(user?.password||"");
      const valid=user&&user.is_active!==false&&(/^\$2[aby]\$/.test(stored)?await bcrypt.compare(password,stored.replace(/^\$2y\$/,"$2a$")):password===stored);
      if(!valid)return reply({error:"Usuário ou senha inválidos."},401);
      const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,"0")).join("");const expiresAt=new Date(now+7*86400000).toISOString();
      const {error}=await db.from("platform_private_secrets").upsert({name:`recovery_session_${await digest(token)}`,value:{userId:String(user.id),expiresAt,passwordVersion:await digest(stored)},updated_at:new Date().toISOString()});
      if(error)throw new Error("Falha ao iniciar sessão.");attempts.delete(key);return reply({token,userId:String(user.id),expiresAt});
    }
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!/^[a-f0-9]{64}$/.test(token))return reply({error:"Saia e entre novamente no AuxPlus para usar a recuperação."},401);
    const name=`recovery_session_${await digest(token)}`;
    const {data:session}=await db.from("platform_private_secrets").select("value").eq("name",name).maybeSingle();
    if(!session?.value?.userId||Date.parse(session.value.expiresAt)<=Date.now())return reply({error:"Sessão expirada. Entre novamente no AuxPlus."},401);
    if(body.action==="logout"){await db.from("platform_private_secrets").delete().eq("name",name);return reply({ok:true});}
    const userId=String(session.value.userId);const {data:user}=await db.from("users").select("password,is_active").eq("id",userId).maybeSingle();
    if(!user||user.is_active===false||session.value.passwordVersion!==await digest(String(user.password)))return reply({error:"Sessão inválida. Entre novamente."},403);
    if(body.action==="candidates")return reply({candidates:await recoveryCandidates(db,userId)});
    if(body.action==="create"){
      const message=String(body.message||"").trim();const selected=Array.isArray(body.itemRefs)?[...new Set(body.itemRefs.map(String))]:[];
      if(!message.includes("{item_id}")||!/(?:^|\n)\*?1\s*[—–-]/.test(message)||!/(?:^|\n)\*?2\s*[—–-]/.test(message)||message.length>3000||message.length<40||selected.length<1||selected.length>100)return reply({error:"Escolha de 1 a 100 clientes e mantenha {item_id} e as opções 1 e 2 na mensagem."},400);
      const bot=await recoverySetting(db,`wa_bot_user_${userId}`);if(bot.enabled!==true)throw new Error("Ative o atendimento WhatsApp antes de criar a fila.");
      const candidates=await recoveryCandidates(db,userId);const chosen=candidates.filter((i:any)=>selected.includes(i.itemRef));
      if(chosen.length!==selected.length)throw new Error("Alguns clientes não estão mais disponíveis. Atualize a lista.");
      const interval=Math.max(60,Math.min(3600,Number(body.intervalSeconds)||120));
      const {data:campaign,error}=await db.from("wa_recovery_campaigns").insert({user_id:userId,message,interval_seconds:interval}).select("id").single();
      if(error)throw new Error("Já existe uma fila aberta. Conclua ou cancele antes de criar outra.");
      const {error:insertError}=await db.from("wa_recovery_contacts").insert(chosen.map((i:any)=>({user_id:userId,campaign_id:campaign.id,phone:i.phone,destination:i.destination,item_ref:i.itemRef,username:i.username,client_name:i.name})));
      if(insertError){await db.from("wa_recovery_campaigns").delete().eq("id",campaign.id);throw new Error("Fila não criada. Atualize a lista de clientes.");}
      return reply({ok:true});
    }
    if(["start","pause","cancel"].includes(body.action)){
      const status=body.action==="start"?"running":body.action==="pause"?"paused":"cancelled";
      const {data:updated,error}=await db.from("wa_recovery_campaigns").update({status,...(body.action==="start"?{last_error:null}:{})}).eq("user_id",userId).eq("id",String(body.campaignId||"")).in("status",["paused","running"]).select("id");
      if(error||!updated?.length)throw new Error("Fila indisponível. Atualize a página.");
      if(body.action==="cancel")await db.from("wa_recovery_contacts").delete().eq("campaign_id",updated[0].id).eq("status","queued");
    } else if(body.action==="tick") { await runRecoveryQueue(db,userId); }
    else if(body.action!=="status")return reply({error:"Ação inválida."},400);
    const {data:campaigns,error}=await db.from("wa_recovery_campaigns").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(10);
    if(error)throw new Error("Falha ao consultar as filas.");
    const {data:contacts}=await db.from("wa_recovery_contacts").select("id,campaign_id,username,status,reason,sent_at,updated_at").eq("user_id",userId).order("updated_at",{ascending:false}).limit(1000);
    return reply({campaigns:campaigns||[],contacts:contacts||[],defaultMessage:RECOVERY_MESSAGE});
  }catch(error){return reply({error:error instanceof Error?error.message:"Não foi possível concluir."},400);}
});
