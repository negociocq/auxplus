import { footballClock, footballManifest } from './footballStatus.ts';
import { getEditorialPlan, editorialSlides, renderEditorialSlide, editorialPreview } from './instagramEditorial.ts';
import { editorialAssetPath } from '../../../src/lib/instagramEditorial.ts';

export async function bufferRequest(key: string, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch('https://api.buffer.com', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(25000) });
  // Never include provider response bodies: a validation error could echo credentials.
  if (!response.ok) throw new Error(`Buffer indisponível (HTTP ${response.status}). Confira a chave e o plano no Buffer.`);
  const result = await response.json();
  if (result.errors?.length || !result.data) throw new Error('O Buffer recusou a consulta. Confira as permissões da chave e a conexão do Instagram.');
  return result.data;
}
export async function instagramChannels(key: string) {
  const data = await bufferRequest(key, 'query { account { organizations { id } } }');
  const channels: { id: string; name: string }[] = [];
  for (const org of (data.account?.organizations || []).slice(0, 20)) {
    const result = await bufferRequest(key, `query { channels(input: {organizationId: ${JSON.stringify(org.id)}}) { id name displayName service isQueuePaused } }`);
    for (const channel of result.channels || []) if (String(channel.service).toLowerCase() === 'instagram') {
      channels.push({ id: String(channel.id), name: String(channel.displayName || channel.name || 'Instagram') });
    }
  }
  return channels;
}
export function instagramJobs(entries: any[], feed: boolean, stories: boolean) {
  const jobs: { kind: 'feed' | 'story'; batch: number; entries: any[] }[] = [];
  if (feed) for (let i = 0; i < entries.length; i += 10) jobs.push({ kind: 'feed', batch: i / 10, entries: entries.slice(i, i + 10) });
  if (stories) entries.forEach((entry, batch) => jobs.push({ kind: 'story', batch, entries: [entry] }));
  return jobs;
}
export function instagramPostInput(job: any, urls: string[]) {
  if (!urls.length || urls.length > 10 || job.kind === 'story' && urls.length !== 1 || urls.some(url => !url.startsWith('https://'))) throw new Error('Imagens inválidas para publicação.');
  const caption = job.topic === 'editorial' ? String(job.entries?.[0]?.payload?.plan?.caption || '') : `⚽ Jogos de hoje · ${String(job.post_day).split('-').reverse().join('/')}\nHorários de Brasília.\nPeça seu teste grátis pelo WhatsApp no link da bio.`;
  if (job.topic === 'editorial' && !caption) throw new Error('Seleção editorial sem legenda.');
  return { channelId: job.channel_id, text: job.kind === 'feed' ? caption : '',
    schedulingType: 'automatic', mode: 'shareNow', needsApproval: false, assets: urls.map(url => ({ image: { url } })),
    metadata: { instagram: { type: 'story' === job.kind ? 'story' : 'post', shouldShareToFeed: job.kind === 'feed' } } };
}
const table = 'buffer_instagram_settings';
const rows = 'buffer_instagram_posts';
const publicSettings = 'channel_id,channel_name,enabled,stories,feed,send_time,last_error,editorial_enabled,editorial_times';
async function must(result: any, message: string) { if (result.error) throw new Error(message); return result.data; }
export async function manageBufferInstagram(db: any, userId: string, body: any) {
  const current = await must(await db.from(table).select('*').eq('user_id', userId).maybeSingle(), 'Não foi possível ler a conexão.');
  if (body.action === 'connect') {
    const key = String(body.apiKey || '').trim();
    if (key.length < 12 || key.length > 2048 || /\s/.test(key)) throw new Error('Informe a chave de API gerada pelo Buffer.');
    const channels = await instagramChannels(key);
    if (!channels.length) throw new Error('Nenhum Instagram encontrado. Conecte seu Instagram ao Buffer antes de continuar.');
    if (current?.api_key && current.api_key !== key && current.enabled) throw new Error('Desligue a publicação automática antes de trocar a chave.');
    await must(await db.from(table).upsert({ user_id: userId, api_key: key, updated_at: new Date().toISOString() }), 'Não foi possível salvar a chave.');
    return { ...(await bufferState(db, userId)), channels };
  }
  if (body.action === 'channels') return { ...(await bufferState(db, userId)), channels: current?.api_key ? await instagramChannels(current.api_key) : [] };
  if (body.action === 'editorial-preview') {
    if (!current?.api_key || !current.channel_id) throw new Error('Conecte o Instagram primeiro.');
    const slot = String(body.slot || '12:00');
    if (!Array.isArray(current.editorial_times) || !current.editorial_times.includes(slot)) throw new Error('Escolha um horário de filmes e séries configurado.');
    return { ...(await bufferState(db,userId)), preview:await editorialPreview(db,userId,footballClock().today,slot,current.channel_id,{page:body.page,format:body.format}) };
  }
  if (body.action === 'disconnect') {
    if (current?.lease_until && Date.parse(current.lease_until) > Date.now()) throw new Error('Uma publicação está em andamento. Aguarde terminar para desconectar.');
    await must(await db.from(table).update({ api_key: null, channel_id: null, channel_name: null, enabled: false, editorial_enabled:false,manual_request_day: null,editorial_request_day:null }).eq('user_id', userId), 'Não foi possível desconectar.');
    await must(await db.from(rows).update({ status: 'cancelled' }).eq('user_id', userId).eq('status', 'queued'), 'Não foi possível cancelar a fila.');
  } else if (body.action === 'save') {
    if (!current?.api_key) throw new Error('Conecte o Buffer primeiro.');
    if (typeof body.enabled !== 'boolean' || typeof body.feed !== 'boolean' || typeof body.stories !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.sendTime || '') || !body.feed && !body.stories) throw new Error('Escolha os formatos e informe um horário válido.');
    const editorialEnabled = body.editorialEnabled ?? current.editorial_enabled ?? false;
    const editorialTimes = body.editorialTimes ?? current.editorial_times ?? ['12:00','16:00'];
    if (typeof editorialEnabled !== 'boolean' || !Array.isArray(editorialTimes) || editorialTimes.length !== 2 || new Set(editorialTimes).size !== 2 || editorialTimes.some((t:any)=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('Informe dois horários diferentes para filmes e séries.');
    const channel = (await instagramChannels(current.api_key)).find(c => c.id === body.channelId);
    if (!channel) throw new Error('Escolha um Instagram conectado a esta conta Buffer.');
    const changed = current.channel_id !== channel.id || current.feed !== body.feed || current.stories !== body.stories;
    if (current.lease_until && Date.parse(current.lease_until) > Date.now()) throw new Error('Aguarde a publicação em andamento antes de alterar o agendamento.');
    if (changed) await must(await db.from(rows).update({ status: 'cancelled' }).eq('user_id', userId).eq('status', 'queued'), 'Não foi possível ajustar a fila.');
    await must(await db.from(table).update({ channel_id: channel.id, channel_name: channel.name, enabled: body.enabled, feed: body.feed, stories: body.stories, send_time: body.sendTime, editorial_enabled:editorialEnabled,editorial_times:[...editorialTimes].sort(), ...(changed ? {manual_request_day:null,editorial_request_day:null} : {}), last_error: null, updated_at: new Date().toISOString() }).eq('user_id', userId), 'Não foi possível salvar.');
  } else if (body.action === 'post-now') {
    if (!current?.api_key || !current.channel_id) throw new Error('Salve a conexão e escolha seu Instagram primeiro.');
    await must(await db.from(table).update({ manual_request_day: footballClock().today, last_error: null }).eq('user_id', userId), 'Não foi possível iniciar.');
  } else if (body.action === 'editorial-post-now') {
    if (!current?.api_key || !current.channel_id) throw new Error('Conecte o Instagram primeiro.');
    if (!current.editorial_times?.includes(body.slot)) throw new Error('Escolha um horário de filmes e séries configurado.');
    await must(await db.from(table).update({editorial_request_day:footballClock().today,editorial_request_slot:body.slot,last_error:null}).eq('user_id',userId),'Não foi possível iniciar filmes e séries.');
  } else if (body.action !== 'state') throw new Error('Ação inválida.');
  return bufferState(db, userId);
}
async function bufferState(db: any, userId: string) {
  const [settings, posts, secret] = await Promise.all([
    db.from(table).select(publicSettings).eq('user_id', userId).maybeSingle(),
    db.from(rows).select('id,post_day,kind,batch,status,buffer_id,error,topic,edition').eq('user_id', userId).order('post_day', {ascending:false}).order('created_at').limit(100),
    db.from(table).select('api_key').eq('user_id', userId).maybeSingle(),
  ]);
  if (settings.error || posts.error || secret.error) throw new Error('Não foi possível consultar a integração.');
  return { connected: Boolean(secret.data?.api_key), settings: settings.data || { enabled:false,feed:true,stories:true,send_time:'07:00' }, posts: posts.data || [] };
}
export async function runBufferInstagram(db: any, userId?: string) {
  let query = db.from(table).select('*').not('api_key', 'is', null).not('channel_id', 'is', null);
  if (userId) query = query.eq('user_id', userId);
  const settings = await must(await query.limit(50), 'Falha ao consultar agendamentos.');
  const clock = footballClock();
  const render = `${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-football-banner`;
  const dueEditions = (s:any):string[] => Array.isArray(s.editorial_times) ? s.editorial_times.filter((slot:string)=>s.editorial_enabled&&slot<=clock.time||s.editorial_request_day===clock.today&&s.editorial_request_slot===slot) : [];
  const gamesDue = (s:any) => s.enabled && s.send_time <= clock.time || s.manual_request_day === clock.today;
  for (const initial of settings || []) {
    if (!gamesDue(initial) && !dueEditions(initial).length) continue;
    const lease = crypto.randomUUID();
    const claim = await db.rpc('claim_buffer_instagram', { p_user:initial.user_id, p_token:lease });
    if (claim.error || claim.data !== true) continue;
    const deadline = Date.now() + 100000;
    const renew = async () => {
      const data = await must(await db.from(table).update({lease_until:new Date(Date.now()+180000).toISOString()}).eq('user_id',initial.user_id).eq('lease_token',lease).select('user_id'), 'Falha ao renovar publicação.');
      if (!data?.length) throw new Error('Outra execução assumiu a fila.');
    };
    try {
      const active = await must(await db.from('users').select('is_active').eq('id',initial.user_id).maybeSingle(), 'Conta indisponível.');
      if (!active || active.is_active === false) continue;
      const setting = await must(await db.from(table).select('*').eq('user_id', initial.user_id).single(), 'Conexão indisponível.');
      if (!setting.api_key || !setting.channel_id || !gamesDue(setting) && !dueEditions(setting).length) continue;
      await must(await db.from(rows).update({status:'uncertain',error:'Envio interrompido. Confira no Buffer antes de publicar novamente.'}).eq('user_id',setting.user_id).eq('status','submitting'), 'Falha ao conferir fila.');
      const existing = await must(await db.from(rows).select('id,topic,edition').eq('user_id',setting.user_id).eq('post_day',clock.today).eq('channel_id',setting.channel_id), 'Falha ao conferir o dia.');
      if (gamesDue(setting) && !existing.some((p:any)=>!p.topic||p.topic==='games')) {
        const response = await fetch(`${render}?mode=manifest`, {signal:AbortSignal.timeout(55000)});
        if (!response.ok) throw new Error('Gerador de banners indisponível.');
        const entries = footballManifest(await response.json(),clock.today,clock.tomorrow).filter((entry:any)=>entry.day===clock.today);
        const jobs = instagramJobs(entries,setting.feed,setting.stories);
        if (jobs.length) await must(await db.from(rows).upsert(jobs.map(job=>({...job,topic:'games',edition:'daily',user_id:setting.user_id,post_day:clock.today,channel_id:setting.channel_id})), {onConflict:'user_id,post_day,channel_id,topic,edition,kind,batch',ignoreDuplicates:true}), 'Falha ao criar fila.');
      }
      let planningError:string|null=null;
      for (const slot of dueEditions(setting)) {
        try {
        if (Date.now() > deadline) break;
        if (existing.some((p:any)=>p.topic==='editorial'&&p.edition===slot)) continue;
        await renew();
        const plan = await getEditorialPlan(db,setting.user_id,clock.today,slot,setting.channel_id);
        const entries = editorialSlides(plan).map((payload:any,index:number)=>({payload,index}));
        const jobs = instagramJobs(entries,setting.feed,setting.stories);
        if (jobs.length) await must(await db.from(rows).upsert(jobs.map(job=>({...job,topic:'editorial',edition:slot,user_id:setting.user_id,post_day:clock.today,channel_id:setting.channel_id})),{onConflict:'user_id,post_day,channel_id,topic,edition,kind,batch',ignoreDuplicates:true}),'Não foi possível criar a fila editorial.');
        } catch(error) { planningError=error instanceof Error?error.message:'Não foi possível preparar a seleção editorial.'; }
      }
      // Old dates are never sent after midnight. Accepted/uncertain submissions are never retried.
      const jobs = await must(await db.from(rows).select('*').eq('user_id',setting.user_id).eq('channel_id',setting.channel_id).eq('post_day',clock.today).eq('status','queued').order('created_at').limit(3), 'Fila indisponível.');
      for (const job of jobs) {
        if (footballClock().today !== clock.today || Date.now() > deadline) break;
        if (job.topic==='editorial' ? !dueEditions(setting).includes(job.edition) : !gamesDue(setting)) continue;
        await renew();
        let urls: string[] = job.assets || [];
        if (!urls.length) {
          for (const entry of job.entries) {
            if (Date.now() > deadline) throw new Error('Preparação em andamento. A fila continua no próximo ciclo.');
            await renew();
            const file = job.topic==='editorial' ? editorialAssetPath(setting.user_id,entry.payload.plan,job.edition,job.kind,entry.index) : `${setting.user_id}/${clock.today}/${job.kind}-${entry.region}-${entry.page}.png`;
            const bucket = db.storage.from('instagram-banners');
            const {data:previous} = await bucket.download(file);
            if (!previous) {
              let bytes:Uint8Array;
              if (job.topic==='editorial') bytes = await renderEditorialSlide(entry.payload,job.kind);
              else {
                const params = new URLSearchParams({day:clock.today,region:entry.region,page:String(entry.page),format:job.kind==='feed'?'instagram-feed':'story'});
                const image = await fetch(`${render}?${params}`, {signal:AbortSignal.timeout(55000)});
                if (!image.ok || !image.headers.get('content-type')?.startsWith('image/png')) throw new Error('Não foi possível preparar a imagem.');
                bytes = new Uint8Array(await image.arrayBuffer());
              }
              if (bytes.length > 8*1024*1024) throw new Error('Imagem excede o limite do Instagram.');
              await must(await bucket.upload(file,bytes,{contentType:'image/png',upsert:false}), 'Falha ao guardar o banner.');
            }
            urls.push(bucket.getPublicUrl(file).data.publicUrl);
          }
          await must(await db.from(rows).update({assets:urls}).eq('id',job.id), 'Falha ao guardar imagens da publicação.');
        }
        const input = instagramPostInput(job,urls);
        if (footballClock().today !== clock.today) break;
        await renew();
        const started = await must(await db.from(rows).update({status:'submitting'}).eq('id',job.id).eq('status','queued').select('id'), 'Falha ao iniciar envio.');
        if (!started?.length) continue;
        try {
          const result = await bufferRequest(setting.api_key, 'mutation Publish($input: CreatePostInput!) { createPost(input:$input) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }', {input});
          const id = result.createPost?.post?.id;
          if (!id) {
            await must(await db.from(rows).update({status:'failed',error:'O Buffer recusou a postagem. Confira o plano, os formatos e a conexão no Buffer.'}).eq('id',job.id), 'Falha ao registrar recusa.');
            continue;
          }
          await must(await db.from(rows).update({status:'accepted',buffer_id:String(id),error:null}).eq('id',job.id), 'Falha ao registrar confirmação.');
        } catch {
          await db.from(rows).update({status:'uncertain',error:'Sem confirmação do Buffer. Confira sua fila; não será repetido automaticamente.'}).eq('id',job.id);
          throw new Error('Uma publicação ficou sem confirmação. Confira a fila no Buffer.');
        }
      }
      await db.from(table).update({last_error:planningError}).eq('user_id',setting.user_id);
    } catch (error) {
      await db.from(table).update({last_error:error instanceof Error?error.message:'Falha ao publicar.'}).eq('user_id',initial.user_id);
    } finally {
      await db.from(table).update({lease_until:null,lease_token:null}).eq('user_id',initial.user_id).eq('lease_token',lease);
    }
  }
}
