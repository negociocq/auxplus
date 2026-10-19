import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
const key = "auxplus-recovery-session-v1";
const endpoint = `${SUPABASE_URL}/functions/v1/wa-recovery`;
export async function startRecoverySession(username: string, password: string) {
  const response = await fetch(endpoint, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({action:"login",username,password}), signal: AbortSignal.timeout(15000) });
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Falha ao iniciar sessão.");
  localStorage.setItem(key,JSON.stringify(result));
}
export async function recoveryRequest(userId: string, action: string, body: Record<string,unknown> = {}) {
  const session=JSON.parse(localStorage.getItem(key)||"null");
  if(!session||session.userId!==userId||Date.parse(session.expiresAt)<=Date.now())throw new Error("Saia e entre novamente no AuxPlus para usar a recuperação.");
  const response=await fetch(endpoint,{method:"POST",headers:{apikey:SUPABASE_ANON_KEY,"Content-Type":"application/json",Authorization:`Bearer ${session.token}`},body:JSON.stringify({...body,action})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Falha na recuperação.");return result;
}
export function endRecoverySession(){
  let session; try { session=JSON.parse(localStorage.getItem(key)||"null"); } catch { /* Invalid local session. */ } localStorage.removeItem(key);
  if(session?.token)void fetch(endpoint,{method:"POST",headers:{apikey:SUPABASE_ANON_KEY,"Content-Type":"application/json",Authorization:`Bearer ${session.token}`},body:JSON.stringify({action:"logout"}),keepalive:true}).catch(()=>undefined);
}
