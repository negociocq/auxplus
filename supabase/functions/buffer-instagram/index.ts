import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { manageBufferInstagram, runBufferInstagram } from '../_shared/bufferInstagram.ts';
declare const EdgeRuntime: { waitUntil: (task: Promise<unknown>) => void };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const digest = async(value:string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply({error:'Use POST.'},405);
  try {
    const text=await req.text();if(text.length>5000)return reply({error:'Pedido muito grande.'},413);
    const body=JSON.parse(text);
    if(body.action==='tick') {
      const {data,error}=await db.from('platform_private_secrets').select('value').eq('name','buffer_instagram_cron').maybeSingle();
      if(error||!req.headers.get('x-buffer-cron')||req.headers.get('x-buffer-cron')!==data?.value?.token)return reply({error:'Não autorizado.'},401);
      EdgeRuntime.waitUntil(runBufferInstagram(db));return reply({ok:true});
    }
    const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'Entre novamente no AuxPlus para conectar o Buffer.'},401);
    const {data:session,error}=await db.from('platform_private_secrets').select('value').eq('name',`recovery_session_${await digest(token)}`).maybeSingle();
    if(error||!session?.value?.userId||!Number.isFinite(Date.parse(session.value.expiresAt))||Date.parse(session.value.expiresAt)<=Date.now())return reply({error:'Sessão expirada. Entre novamente no AuxPlus.'},401);
    const userId=String(session.value.userId);
    const {data:user,error:userError}=await db.from('users').select('password,is_active').eq('id',userId).maybeSingle();
    if(userError||!user||user.is_active===false||session.value.passwordVersion!==await digest(String(user.password)))return reply({error:'Sessão inválida. Entre novamente no AuxPlus.'},403);
    const result=await manageBufferInstagram(db,userId,body);
    if(body.action==='post-now'||body.action==='editorial-post-now')EdgeRuntime.waitUntil(runBufferInstagram(db,userId));
    return reply(result);
  }catch(e){return reply({error:e instanceof Error?e.message:'Não foi possível concluir.'},400);}
});
