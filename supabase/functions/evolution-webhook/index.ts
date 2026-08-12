/**
 * Webhook Evolution → bot AuxPlus (renovação / atendentes / créditos / testes).
 * Configure na Evolution: POST {SUPABASE_URL}/functions/v1/evolution-webhook
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PANEL_ORIGIN = "https://searchdefense.top";
const UPSTREAM = "https://gesapioffice.com/api";
const PANEL_URL = "http://localhost:32116";
const HEALTH_CHECK_ENDPOINT = "/ges-api/recargas/credits";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Health check rápido do painel (3s timeout).
 * Retorna true se responsivo, false se offline.
 */
async function isPanelHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${PANEL_URL}${HEALTH_CHECK_ENDPOINT}`, {
      method: "GET",
      signal: controller.signal,
      credentials: "omit",
    });

    clearTimeout(timeoutId);
    return response.ok || response.status < 500; // 2xx ou 4xx = online
  } catch {
    return false;
  }
}

/**
 * Retorna mensagem amigável baseada no status do painel.
 */
function getPanelStatusMessage(isOnline: boolean): string {
  if (isOnline) {
    return "Estou conseguindo me comunicar com os servidores.\n\nVou transferir você para nosso atendimento para investigar o problema.";
  } else {
    return "❌ Estamos com uma instabilidade no serviço no momento.\n\nNossos técnicos já estão trabalhando no reparo.\n\nQuando conseguirmos resolver, enviaremos uma mensagem aqui. 🛠️";
  }
}

/**
 * Registra cliente que reportou problema quando painel está offline.
 */
async function reportClientProblem(
  client: any,
  userId: string,
  phone: string,
  clientName?: string,
  problemType?: 'assist' | 'payment' | 'other'
): Promise<void> {
  try {
    // Apenas registra se é problema de assistência
    if (problemType && problemType !== 'assist') {
      console.log(
        `[reportClientProblem] Ignorando problema tipo "${problemType}" (não é assistência)`
      );
      return;
    }

    const stateKey = `panel_down_monitoring_${userId}`;

    // Carrega estado atual
    const { data: stateData } = await client
      .from("platform_settings")
      .select("value")
      .eq("key", stateKey)
      .maybeSingle();

    let state = stateData?.value || {
      isDown: true,
      wentDownAt: new Date().toISOString(),
      clientsReporting: [],
      notificationsSent: {},
    };

    if (typeof state === "string") {
      state = JSON.parse(state);
    }

    // Adiciona novo report (evita duplicatas)
    const filtered = (state.clientsReporting || []).filter(
      (r: any) => r.phone !== phone
    );

    const report = {
      phone,
      name: clientName,
      reportedAt: new Date().toISOString(),
      userId,
      problemType: problemType || 'assist',
    };

    state.clientsReporting = [...filtered, report];
    state.isDown = true;
    state.wentDownAt = state.wentDownAt || new Date().toISOString();

    // Salva estado
    await client.from("platform_settings").upsert(
      {
        key: stateKey,
        value: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    console.log(
      `[reportClientProblem] Cliente ${phone} registrado (tipo: ${problemType}). Total: ${state.clientsReporting.length}`
    );
  } catch (error) {
    console.error("[reportClientProblem] Erro:", error);
  }
}

function digitsPhone(raw: string) {
  let d = String(raw || "").replace(/\D/g, "");
  // 55 + DDD + 8 dígitos (sem o 9 do celular) → inclui o 9
  if (d.startsWith("55") && d.length === 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 8) d = `55${ddd}9${rest}`;
  }
  if (d.startsWith("55") && d.length >= 12) return d;
  // DDD + 8 dígitos
  if (d.length === 10) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    d = `55${ddd}9${rest}`;
    return d;
  }
  if (d.length === 11) return `55${d}`;
  return d;
}

/** Nota no painel = só o nome. Telefone vai no campo whatsapp da criação. */
function sanitizeTestClientName(raw: string) {
  const n = String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
  if (n.length < 2) return "";
  // Evita confundir com opção de menu
  if (/^\d{1,2}$/.test(n)) return "";
  if (/^(voltar|volta|atendente|atendentes|menu|pular)$/i.test(waNorm(n))) {
    return "";
  }
  return n;
}

/**
 * Compara celulares BR com/sem o 9º dígito.
 * Exige o mesmo DDD — não compara só os 8 finais (evita misturar clientes).
 */
function phoneMatches(a: string, b: string) {
  const x = digitsPhone(a);
  const y = digitsPhone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (!x.startsWith("55") || !y.startsWith("55")) {
    return x.endsWith(y) || y.endsWith(x);
  }
  if (x.length < 12 || y.length < 12) return false;
  const dddX = x.slice(2, 4);
  const dddY = y.slice(2, 4);
  if (dddX !== dddY) return false;
  const localX = x.slice(4).replace(/^9/, "");
  const localY = y.slice(4).replace(/^9/, "");
  return localX.length === 8 && localX === localY;
}

function extractMessageId(data: Record<string, unknown>): string {
  const key = (data.key || {}) as Record<string, unknown>;
  return String(key.id || key.Id || data.id || "").trim();
}

/** Intervalo mínimo entre bolhas do bot (anti-spam WhatsApp). */
const BOT_MSG_GAP_MS = 1400;

/**
 * Janela após o teste em que não ofertamos plano para quem mandou mensagem
 * solta (“obrigado”, “ok”…) — isso não é “voltar o contato”.
 * Quem digita a frase de teste, *teste*, *atendente* ou mostra intenção de
 * assinar continua sendo atendido normalmente.
 */
const TEST_RETURN_COOLDOWN_MS = 30 * 60 * 1000;
const BOT_TYPING_DELAY_MS = 1200;
const BOT_MAX_PER_PHONE_HOUR = 30;
const BOT_MAX_PER_PHONE_DAY = 80;
const BOT_DEDUP_TTL_MS = 15 * 60 * 1000;

function fill(
  template: string,
  vars: Record<string, string | number | undefined | null>,
) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v == null || v === "" ? "—" : String(v));
  }
  return out;
}

const DEFAULT_MESSAGES: Record<string, string> = {
  askIntent:
    "Olá! Aqui é o atendimento automático.\n\n" +
    "👤 Usuário: *{user}*\n" +
    "📅 Vencimento: *{due}*\n\n" +
    "Como posso ajudar?\n\n" +
    "*1* — {renewLabel}\n" +
    "*2* — Falar com nossos atendentes",
  renewCreatingPix: "Perfeito! Estou gerando o PIX da {renewKind}…",
  renewPixIntro:
    "✅ PIX de {renewKind}\n\n" +
    "Usuário: *{user}*\n" +
    "Vencimento atual: *{due}*\n" +
    "Vencimento após pagamento: *{newDue}*\n\n" +
    "Na próxima mensagem envio o código PIX (copia e cola).",
  problemHuman:
    "Certo! Vou te encaminhar para nossos atendentes.\nEm breve alguém responde por aqui.",
  humanAssumed:
    "👤 *Atendimento humano*\n\n" +
    "Um atendente assumiu esta conversa.\n" +
    "Pode falar por aqui — o automático fica pausado até o atendimento terminar.",
  humanBusy:
    "Seu atendimento está com nossos atendentes no momento.\nAssim que finalizar, o automático volta.",
  humanEnded:
    "✅ *Atendimento encerrado*\n\n" +
    "O automático voltou a responder por aqui.\n" +
    "Se precisar de algo, é só mandar mensagem.",
  resellerOffer:
    "Olá! Atendimento automático — área do revendedor.\n\n" +
    "👤 Login: *{user}*\n\n" +
    "*1* — Recarregar *{credits} créditos* por *{amount}*\n" +
    "Ou escreva *atendente* para falar com a equipe",
  resellerPixIntro:
    "✅ PIX de recarga\n\n" +
    "Pacote: *{credits} créditos*\n" +
    "Valor: *{amount}*\n\n" +
    "Na próxima mensagem envio o código PIX (copia e cola).",
  testReady:
    "✅ Teste liberado!\n\n" +
    "Usuário: *{user}*\n" +
    "Senha: *{password}*\n" +
    "Validade: *{hours}h*\n\n" +
    "DNS: {dns}\n" +
    "M3U: {m3u}",
  testPcReady:
    "✅ Teste de *{hours}h* no *computador*\n\n" +
    "1) Abra este link no navegador:\n" +
    "{loginUrl}\n\n" +
    "2) Entre com:\n" +
    "Usuário: *{user}*\n" +
    "Senha: *{password}*\n\n" +
    "Quando quiser assinar, chame de novo por aqui.",
  testPhoneReady:
    "✅ Teste de *{hours}h* no *celular Android*\n\n" +
    "1) Baixe o app:\n" +
    "{apk}\n\n" +
    "2) Abra o *uni.apk*, instale e escolha a opção *UniPlay*\n\n" +
    "3) Conecte com:\n" +
    "Usuário: *{user}*\n" +
    "Senha: *{password}*\n\n" +
    "Quando quiser assinar, chame de novo por aqui.",
  testPhoneIosReady:
    "✅ Teste de *{hours}h* no *iPhone*\n\n" +
    "1) Baixe o app *Smarters Player Lite*:\n" +
    "{iosApp}\n\n" +
    "2) Abra o app e vá em *Xtream Codes*\n\n" +
    "3) Preencha:\n" +
    "• Nome: *{name}*\n" +
    "• Usuário: *{user}*\n" +
    "• Senha: *{password}*\n" +
    "• URL / DNS: *{dns}*\n\n" +
    "4) Em *PIN de acesso*, toque em *Skip* se não quiser colocar pin\n\n" +
    "5) Pronto — toque em *Assistir*\n\n" +
    "Quando quiser assinar, chame de novo por aqui.",
  testAskPhoneOs:
    "Seu celular é *Android* ou *iPhone*?\n\n" +
    "*1* — Android\n" +
    "*2* — iPhone",
  testAskDevice:
    "Legal! Vamos liberar seu teste de *{hours} horas*.\n\n" +
    "Em qual aparelho você vai assistir?\n\n" +
    "*1* — TV\n" +
    "*2* — Computador\n" +
    "*3* — Celular",
  testAskTv:
    "Qual é o tipo da sua TV?\n\n" +
    "*1* — TV Box\n" +
    "*2* — Android TV / Google TV\n" +
    "*3* — Roku\n" +
    "*4* — Samsung\n" +
    "*5* — LG",
  testAskAppSamsung:
    "Na *Samsung* você pode usar:\n\n" +
    "*1* — *FunPlay* (ativa com o MAC da TV)\n" +
    "*2* — *XCloud TV* (provedor + usuário + senha)\n\n" +
    "Digite *1* ou *2*.",
  testAskAppRokuLg:
    "Nesse aparelho você pode usar:\n\n" +
    "*1* — *Prime IPTV* (ativa com o MAC da TV)\n" +
    "*2* — *XCloud TV* (provedor + usuário + senha)\n\n" +
    "Digite *1* ou *2*.",
  testAppFunReady:
    "✅ Teste de *{hours}h* liberado — app *FunPlay*\n\n" +
    "Usuário: *{user}*\n" +
    "Senha: *{password}*\n\n" +
    "Agora:\n" +
    "1) Baixe o *FunPlay* na loja do aparelho\n" +
    "2) Abra o app — no *canto inferior direito* aparece o *MAC*\n" +
    "3) Envie o MAC aqui — aceito nos dois formatos:\n" +
    "   • com dois-pontos: *aa:bb:cc:dd:ee:ff*\n" +
    "   • tudo junto: *aabbccddeeff*\n\n" +
    "_Mande só o MAC nesta mensagem._",
  testAppPrimeReady:
    "✅ Teste de *{hours}h* liberado — app *Prime IPTV*\n\n" +
    "Usuário: *{user}*\n" +
    "Senha: *{password}*\n\n" +
    "Agora:\n" +
    "1) Baixe o *Prime IPTV* na loja do aparelho\n" +
    "2) Abra o app — no *canto inferior direito* aparece o *MAC*\n" +
    "3) Envie o MAC aqui — aceito nos dois formatos:\n" +
    "   • com dois-pontos: *aa:bb:cc:dd:ee:ff*\n" +
    "   • tudo junto: *aabbccddeeff*\n\n" +
    "_Mande só o MAC nesta mensagem._",
  testAppXcloudReady:
    "✅ Teste de *{hours}h* liberado — app *XCloud TV*\n\n" +
    "No XCloud, digite *exatamente*:\n\n" +
    "Provedor: *uniplay*\n" +
    "Usuário: *{user}*\n" +
    "Senha: *{password}*\n\n" +
    "Quando terminar o teste e quiser assinar, é só mandar mensagem de novo por aqui.",
  testMacOk:
    "✅ *Ativado!* MAC *{mac}* no *{app}*.\n\n" +
    "Seu teste dura *{hours} horas*.\n\n" +
    "Para a lista atualizar na TV:\n\n" +
    "1. No app, vá em *Recarregar* / *Reload*\n" +
    "2. Depois em *Playlist* / *Lista*\n" +
    "3. Aperte *OK* no controle\n" +
    "4. Volte — e já pode assistir\n\n" +
    "Se não carregar, feche o app por completo e abra de novo.\n\n" +
    "Quando quiser assinar, mande mensagem aqui.",
  testMacOkRoku:
    "✅ *Ativado!* MAC *{mac}* no *{app}*.\n\n" +
    "Seu teste dura *{hours} horas*.\n\n" +
    "No *Roku* não existe Recarregar/Reload — faça assim:\n\n" +
    "1. Saia do app *por completo* (não deixe aberto em segundo plano)\n" +
    "2. Abra o app de novo\n" +
    "3. Pronto — já pode assistir\n\n" +
    "Quando quiser assinar, mande mensagem aqui.",
  testMacCheckIn:
    "E aí, conseguiu assistir? Deu tudo certo por aí?\n\n" +
    "Se algo travar, me conta que a gente resolve.\n\n" +
    "Quando quiser *ativar o plano*, é só voltar aqui e mandar mensagem — te ajudo na hora.",
  testAskName:
    "Antes de liberar o teste, qual é o *seu nome*?\n\n" +
    "_Digite só o nome._",
  testMacInvalid:
    "Não consegui ler esse MAC.\n\n" +
    "Aceito nos dois formatos:\n" +
    "• *aa:bb:cc:dd:ee:ff*\n" +
    "• *aabbccddeeff*\n\n" +
    "Ele fica no *canto inferior direito* do app.\n" +
    "Mande *só o MAC*, sem outros textos.",
  testOfferPlan:
    "Que bom que voltou! 😊\n\n" +
    "Seu teste (*{user}*) já foi feito.\n\n" +
    "Para ativar o plano:\n\n" +
    "*1* — *1 mês* por *{amount}* (ativo na hora)\n" +
    "*2* — Quero mais meses / falar com atendente",
  testActivatedMonth:
    "✅ *1 mês* ativado no usuário *{user}*!\n\n" +
    "Valor: *{amount}*\n\n" +
    "Segue o PIX para pagamento:",
  errorGeneric:
    "Não consegui concluir agora.\nTente de novo em instantes ou escreva *atendente* para falar com a equipe.",
  pixAlreadyOpen:
    "Você já tem um PIX em aberto.\n\n" +
    "Usuário: *{user}*\n" +
    "Vencimento atual: *{due}*\n" +
    "Vencimento após pagamento: *{newDue}*\n" +
    "Valor: *{amount}*\n\n" +
    "Use o código abaixo (válido por até 24h).\n\n" +
    "Se quiser falar de *outro assunto* ou *mudar a mensalidade*, digite *atendente*.",
  testAlreadyUsed:
    "Você *já usou* o teste gratuito neste número.\n\n" +
    "Se quiser assinar, veja as opções:",
  testConfirmInstall: "Conseguiu instalar o app? *(sim/não)*",
  testConfirmInstallOk:
    "Perfeito! 🎉 Seu teste de *{hours}h* já está no ar.\n\n" +
    "Aproveite! Em instantes te pergunto se deu tudo certo.\n" +
    "Quando quiser assinar, é só voltar aqui.",
  testConfirmInstallNo:
    "Que pena… Vamos resolver! 😊\n\n" +
    "Me conta o que apareceu (não abre, tela preta, erro…)\n" +
    "ou digite *atendente* para falar com a equipe.",
  testMacPrompt:
    "Perfeito! Então me envie o *MAC* que aparece no *canto inferior direito* do app.\n\n" +
    "_Formatos: *aa:bb:cc:dd:ee:ff* ou *aabbccddeeff*_",
  testCheckInOk:
    "Que bom! Fico feliz que deu certo. 😊\n\n" +
    "Seu teste dura *{hours}h*.\n" +
    "Quando quiser assinar, é só voltar aqui — te ajudo na hora.",
  testCheckInNo:
    "Que pena que travou… 😕\n\n" +
    "Me conta o que está acontecendo (tela preta, não carrega, erro…) que eu te ajudo.\n" +
    "Ou digite *atendente*.",
};

const LEGACY_MESSAGES: Record<string, string[]> = {
  askIntent: [
    "Olá! Sou o atendimento automático.\n\nDigite *1* para renovação\nou *2* se estiver com problema (nossos atendentes vão te ajudar).",
    "Olá! Sou o atendimento automático.\n\nDigite *1* para renovação\nou *2* se estiver com problema (um humano vai te atender).",
  ],
  renewCreatingPix: ["Certo! Gerando o PIX da renovação…"],
  renewPixIntro: [
    "PIX para renovar *{months} {monthsLabel}* de *{user}*\nVencimento atual: *{due}*\nValor: *{amount}*\n\nNa próxima mensagem vai só o código PIX.",
    "✅ PIX de renovação\n\n" +
      "Usuário: *{user}*\n" +
      "Plano: *{months} {monthsLabel}*\n" +
      "Vencimento atual: *{due}*\n" +
      "Valor: *{amount}*\n\n" +
      "Na próxima mensagem envio o código PIX (copia e cola).",
  ],
  problemHuman: [
    "Entendi. Vou te passar para nossos atendentes. Aguarde a resposta.",
    "Entendi. Vou te transferir para atendimento humano. Aguarde a resposta.",
  ],
  humanBusy: [
    "Seu atendimento está com nossos atendentes. Assim que finalizar, o automático volta.",
    "Seu atendimento está com um humano. Assim que finalizar, o automático volta.",
  ],
  humanEnded: [
    "Atendimento encerrado. O automático voltou a responder.",
    "Atendimento humano encerrado. O automático voltou a responder.",
    "Atendimento finalizado.\nO automático voltou a responder por aqui.",
  ],
  resellerOffer: [
    "Olá, revendedor!\n\nDigite *1* para abastecer *{credits} créditos* por *{amount}*.\nOu *2* se precisar falar com nossos atendentes.",
    "Olá, revendedor!\n\nDigite *1* para abastecer *{credits} créditos* por *{amount}*.\nOu *2* se precisar de atendimento humano.",
    "Olá! Atendimento automático — área do revendedor.\n\n" +
      "👤 Login: *{user}*\n\n" +
      "*1* — Abastecer *{credits} créditos* por *{amount}*\n" +
      "*2* — Falar com nossos atendentes",
    "Olá! Atendimento automático — área do revendedor.\n\n" +
      "👤 Login: *{user}*\n\n" +
      "*1* — Recarregar *{credits} créditos* por *{amount}*\n" +
      "Ou escreva *atendente* para falar com a equipe",
  ],
  resellerPixIntro: [
    "PIX para *{credits} créditos*\nValor: *{amount}*\n\nNa próxima mensagem vai só o código PIX.",
    "✅ PIX de créditos\n\n" +
      "Pacote: *{credits} créditos*\n" +
      "Valor: *{amount}*\n\n" +
      "Na próxima mensagem envio o código PIX (copia e cola).",
  ],
  pixAlreadyOpen: [
    "Já existe um PIX aguardando pagamento para você. Use o código abaixo (ou aguarde expirar em até 24h).",
    "Você já tem um PIX em aberto.\nUse o código abaixo (válido por até 24h):",
  ],
  errorGeneric: ["Não consegui concluir agora. Tente de novo em instantes."],
};

function resolveMessages(raw: Record<string, string> | undefined) {
  const out = { ...DEFAULT_MESSAGES, ...(raw || {}) };
  for (const [key, olds] of Object.entries(LEGACY_MESSAGES)) {
    if (olds.includes(String(out[key] || ""))) {
      out[key] = DEFAULT_MESSAGES[key];
    }
  }
  return out;
}

function moneyBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDue(value?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Data de hoje no Brasil (YYYY-MM-DD) — alinhado às pastas de clientes. */
function todayYmdBrazil() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Soma meses em YYYY-MM-DD (respeita fim de mês). */
function addMonthsYmd(ymd: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return String(ymd || "").slice(0, 10);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const add = Math.max(1, Math.floor(Number(months) || 1));
  const target = mo + add;
  const ny = y + Math.floor(target / 12);
  const nm = ((target % 12) + 12) % 12;
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  const dd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Novo vencimento após renovar/estender (igual Automações):
 * se ainda ativo, soma a partir do vencimento atual; se vencido, a partir de hoje.
 */
function nextDueAfterRenewYmd(
  currentDue?: string | null,
  months = 1,
): string {
  const today = todayYmdBrazil();
  const dueKey = String(currentDue || "").slice(0, 10);
  const base =
    /^\d{4}-\d{2}-\d{2}$/.test(dueKey) && dueKey >= today ? dueKey : today;
  return addMonthsYmd(base, months);
}

/** Ainda não venceu (hoje ou futuro) → Estender; já passou → Renovar */
function isClientStillActive(dueDate?: string | null) {
  const due = String(dueDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due >= todayYmdBrazil();
}

function clientRenewLabel(dueDate?: string | null) {
  return isClientStillActive(dueDate) ? "Renovar vencimento" : "Renovar";
}

function clientRenewKind(dueDate?: string | null) {
  return isClientStillActive(dueDate) ? "renovação" : "renovação";
}

/** Menu do cliente com Renovar / Estender conforme o vencimento. */
function fillClientAskIntent(
  template: string,
  opts: { user: unknown; dueDate?: string | null },
) {
  const renewLabel = clientRenewLabel(opts.dueDate);
  let msg = fill(template, {
    user: opts.user,
    due: formatDue(opts.dueDate),
    renewLabel,
    renewKind: clientRenewKind(opts.dueDate),
  });
  if (isClientStillActive(opts.dueDate)) {
    // Textos antigos salvos com "Renovar" fixo
    msg = msg
      .replace(/\*1\*\s*[—\-–]\s*Renovar\b/gi, `*1* — ${renewLabel}`)
      .replace(/(^|\n)\s*\*?1\*?\s*[—\-–]\s*Renovar\b/gi, `$1*1* — ${renewLabel}`)
      .replace(/\*1\*\s+Renovar\b/gi, `*1* ${renewLabel}`);
  }
  return msg;
}

function fillClientRenewPix(
  template: string,
  vars: Record<string, string | number>,
  dueDate?: string | null,
) {
  const active = isClientStillActive(dueDate);
  const months = Math.max(1, Math.floor(Number(vars.months) || 1));
  const newDue = formatDue(nextDueAfterRenewYmd(dueDate, months));
  let msg = fill(template, {
    ...vars,
    newDue,
    renewLabel: clientRenewLabel(dueDate),
    renewKind: clientRenewKind(dueDate),
  });
  // Textos antigos sem {newDue}: injeta abaixo do vencimento atual
  if (
    !/vencimento após pagamento/i.test(msg) &&
    !/novo vencimento/i.test(msg)
  ) {
    msg = msg.replace(
      /(Vencimento atual:\s*\*?[^*\n]+\*?)/i,
      `$1\nVencimento após pagamento: *${newDue}*`,
    );
  }
  if (active) {
    msg = msg
      .replace(/PIX de renovação/gi, "PIX para estender o vencimento")
      .replace(/da renovação/gi, "para estender o vencimento")
      .replace(/\brenovação\b/gi, "extensão");
  }
  return msg;
}

function normKey(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function extractText(msg: Record<string, unknown>): string {
  const m = (msg.message || msg) as Record<string, unknown>;
  if (typeof m.conversation === "string") return m.conversation;
  const ext = m.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  const img = m.imageMessage as { caption?: string } | undefined;
  if (img?.caption) return img.caption;
  const vid = m.videoMessage as { caption?: string } | undefined;
  if (vid?.caption) return vid.caption;
  const doc = m.documentMessage as { caption?: string; title?: string } | undefined;
  if (doc?.caption) return doc.caption;
  const btn = m.buttonsResponseMessage as { selectedDisplayText?: string } | undefined;
  if (btn?.selectedDisplayText) return btn.selectedDisplayText;
  return "";
}

/** Detecta mídia sem texto útil (foto, áudio, vídeo, doc, figurinha). */
function detectInboundMedia(
  msg: Record<string, unknown>,
): "image" | "audio" | "video" | "document" | "sticker" | null {
  const m = (msg.message || msg) as Record<string, unknown>;
  if (m.imageMessage) return "image";
  if (m.audioMessage || m.pttMessage) return "audio";
  if (m.videoMessage) return "video";
  if (m.documentMessage || m.documentWithCaptionMessage) return "document";
  if (m.stickerMessage) return "sticker";
  return null;
}

function mediaHintMessage(
  kind: "image" | "audio" | "video" | "document" | "sticker",
): string {
  if (kind === "image" || kind === "document") {
    return (
      "Recebi seu arquivo/foto 👍\n\n" +
      "Se for *comprovante de pagamento*, aguarde a confirmação automática " +
      "(pode levar alguns segundos).\n\n" +
      "Se precisar de outra coisa, digite *1* (renovação/créditos) ou *2* (atendente).\n" +
      "Ou escreva em texto o que precisa."
    );
  }
  if (kind === "audio") {
    return (
      "Recebi seu áudio 🔊\n\n" +
      "Por enquanto respondo melhor por *texto*.\n" +
      "Digite *1* para renovação/créditos, *2* para atendente, ou explique por escrito."
    );
  }
  if (kind === "video") {
    return (
      "Recebi seu vídeo 🎬\n\n" +
      "Se puder, envie o pedido em *texto* (*1* renovação/créditos ou *2* atendente)."
    );
  }
  return (
    "Recebi sua figurinha 🙂\n\n" +
    "Me diga em texto como posso ajudar: *1* renovação/créditos ou *2* atendente."
  );
}

function jidToPhone(jid: string): string {
  const s = String(jid || "").trim();
  if (!s) return "";
  // @lid não é telefone — precisa do remoteJidAlt / senderPn
  if (s.includes("@lid")) return "";
  const user = s.split("@")[0] || "";
  return digitsPhone(user);
}

function extractRemotePhone(data: Record<string, unknown>): {
  phone: string;
  fromMe: boolean;
} {
  const key = (data.key || {}) as Record<string, unknown>;
  const fromMe = Boolean(key.fromMe ?? data.fromMe);
  const candidates = [
    key.remoteJidAlt,
    key.participantAlt,
    data.senderPn,
    data.sender_pn,
    key.participant,
    key.remoteJid,
    data.remoteJid,
  ];
  let phone = "";
  for (const c of candidates) {
    const p = jidToPhone(String(c || ""));
    if (p.length >= 10) {
      phone = p;
      break;
    }
  }
  return { phone, fromMe };
}

/** Evolution às vezes manda `data` como objeto ou array de mensagens. */
function normalizeMessageData(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const data = payload.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    return data[0] as Record<string, unknown>;
  }
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return payload;
}

async function sb() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Supabase service role ausente");
  return createClient(url, key);
}

async function getSetting<T>(
  client: ReturnType<typeof createClient>,
  key: string,
): Promise<T | null> {
  const { data } = await client
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data?.value) return null;
  if (typeof data.value === "string") {
    try {
      return JSON.parse(data.value) as T;
    } catch {
      return null;
    }
  }
  return data.value as T;
}

async function putSetting(
  client: ReturnType<typeof createClient>,
  key: string,
  value: unknown,
) {
  await client.from("platform_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

/** Grava teste/renovação do WhatsApp no mesmo log das Automações (iptv_jobs). */
async function appendIptvJobLog(
  client: ReturnType<typeof createClient>,
  userId: string,
  job: {
    id: string;
    kind: "test" | "renew";
    status?: string;
    clientName?: string;
    panelUsername?: string;
    panelRemoteId?: string | number;
    phone?: string;
    dueDate?: string | null;
    months?: number;
    testHours?: number;
    note?: string;
    panelPassword?: string;
  },
) {
  try {
    const key = `iptv_jobs_user_${userId}`;
    const bag =
      (await getSetting<{ jobs?: unknown[] }>(client, key)) || {};
    const jobs = Array.isArray(bag.jobs) ? [...bag.jobs] : [];
    const username = String(job.panelUsername || "").trim().toLowerCase();
    const exists = jobs.some((row) => {
      if (!row || typeof row !== "object") return false;
      const j = row as Record<string, unknown>;
      if (String(j.id || "") === job.id) return true;
      if (
        job.kind === "test" &&
        username &&
        String(j.kind) === "test" &&
        String(j.panelUsername || "").trim().toLowerCase() === username
      ) {
        return true;
      }
      return false;
    });
    if (exists) return;
    const now = new Date().toISOString();
    const entry = {
      id: job.id,
      kind: job.kind,
      status: job.status || "done",
      itemRefId: "",
      clientName: String(job.clientName || job.panelUsername || "WhatsApp"),
      panelUsername: String(job.panelUsername || ""),
      panelRemoteId: job.panelRemoteId,
      panelPassword: job.panelPassword,
      phone: String(job.phone || "").replace(/\D/g, ""),
      dueDate: job.dueDate ?? null,
      months: Number(job.months) || 0,
      testHours: Number(job.testHours) || 0,
      note: job.note || "WhatsApp",
      createdAt: now,
      updatedAt: now,
    };
    await putSetting(client, key, {
      jobs: [entry, ...jobs].slice(0, 200),
    });
  } catch {
    /* log opcional — não quebra o atendimento */
  }
}

/**
 * Meses do plano do cliente (AXPLAN / Meses do plano).
 * Só multi-mês quando o cadastro tiver > 1; senão = 1 mês.
 */
function extractPlanMonths(notes?: string | null): number | null {
  const m = /\n?<!--AXPLAN:([\s\S]*?)-->/.exec(String(notes ?? ""));
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as {
      months?: unknown;
      segments?: Array<{ planMonths?: unknown }>;
    };
    if (Array.isArray(parsed.segments) && parsed.segments.length) {
      const last = parsed.segments[parsed.segments.length - 1];
      const sm = Math.floor(Number(last?.planMonths));
      if (Number.isFinite(sm) && sm >= 1) return Math.min(24, sm);
    }
    const n = Math.floor(Number(parsed.months));
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(24, n);
  } catch {
    return null;
  }
}

/** Créditos UniPlay por meses do plano (igual IPTV_RENEW_OPTIONS). */
function creditsForPlanMonths(months: number): number {
  const m = Math.max(1, Math.min(24, Math.floor(Number(months) || 1)));
  const map: Record<number, number> = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    6: 5,
    12: 10,
  };
  if (map[m] != null) return map[m];
  // fallback: 1 crédito por mês, teto 10
  return Math.max(1, Math.min(10, m));
}

/** Meses a renovar no bot: só o plano do cliente; sem AXPLAN → 1 mês. */
function resolveClientRenewMonths(notes?: string | null): number {
  const fromPlan = extractPlanMonths(notes);
  if (fromPlan != null && fromPlan >= 1) return Math.min(24, fromPlan);
  return 1;
}

function formatWaPhoneDisplay(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) {
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return d ? `+${d}` : "—";
}

async function fetchEvolutionOwnerPhone(
  apiBaseUrl: string,
  apiKey: string,
  instance: string,
): Promise<string> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const name = encodeURIComponent(instance);
  try {
    const res = await fetch(
      `${base}/instance/fetchInstances?instanceName=${name}`,
      { headers: { apikey: apiKey } },
    );
    const raw = await res.json().catch(() => null);
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? [raw]
        : [];
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const obj = row as Record<string, unknown>;
      const nested =
        obj.instance && typeof obj.instance === "object"
          ? (obj.instance as Record<string, unknown>)
          : obj;
      const owner = String(
        nested.ownerJid ||
          nested.owner ||
          nested.wuid ||
          nested.number ||
          obj.ownerJid ||
          obj.owner ||
          obj.number ||
          "",
      ).trim();
      const phone = jidToPhone(owner) || digitsPhone(owner);
      if (phone.length >= 10) return phone;
    }
  } catch {
    /* ignore */
  }
  return "";
}

async function enqueueHumanAlert(
  client: ReturnType<typeof createClient>,
  userId: string,
  phone: string,
  role: string,
) {
  const key = `wa_bot_alerts_user_${userId}`;
  const bag =
    (await getSetting<{ alerts?: Array<Record<string, unknown>> }>(
      client,
      key,
    )) || { alerts: [] };
  const alerts = Array.isArray(bag.alerts) ? [...bag.alerts] : [];
  const id = `ha_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  alerts.unshift({
    id,
    phone,
    role,
    at: new Date().toISOString(),
    seen: false,
  });
  // mantém só os últimos 40
  await putSetting(client, key, { alerts: alerts.slice(0, 40) });
  return id;
}

/** Avisa o dono no WhatsApp da própria conta conectada (notificação no celular). */
async function notifyOwnerHumanHandoff(
  apiBaseUrl: string,
  apiKey: string,
  instance: string,
  contactPhone: string,
  role: string,
) {
  const owner = await fetchEvolutionOwnerPhone(apiBaseUrl, apiKey, instance);
  if (!owner) return;
  // Evita loop se o contato for o próprio dono
  if (phoneMatches(owner, contactPhone)) return;
  const roleLabel =
    role === "reseller" ? "Revendedor" : role === "client" ? "Cliente" : "Contato";
  const text =
    `🔔 *Pessoa no atendimento*\n\n` +
    `${roleLabel} pediu falar com os atendentes.\n` +
    `Número: *${formatWaPhoneDisplay(contactPhone)}*\n\n` +
    `_Responda no chat dessa pessoa. Digite "assumir" para o bot ficar mudo; quando terminar, "atendimento encerrado"._`;
  await evoSend(apiBaseUrl, apiKey, instance, owner, text);
}

async function evoSend(
  apiBaseUrl: string,
  apiKey: string,
  instance: string,
  phone: string,
  text: string,
  typingDelayMs = BOT_TYPING_DELAY_MS,
) {
  const base = apiBaseUrl.replace(/\/$/, "");
  const number = digitsPhone(phone);
  await fetch(`${base}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      // Evolution atrás de ngrok free
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({
      number,
      text,
      delay: Math.max(800, Math.min(5000, typingDelayMs)),
    }),
  });
}

/**
 * Proxy preferido por request (ngrok / Vercel). A UniPlay responde 404 a IPs
 * de datacenter do Supabase Edge — por isso não chamamos gesapioffice direto.
 */
let uniplayProxyPrefer = "";

function uniplayProxyCandidates(): string[] {
  const list = [
    uniplayProxyPrefer.replace(/\/$/, ""),
    "https://auxplus.vercel.app/api/gesapi",
  ].filter(Boolean);
  return [...new Set(list)];
}

function uniplayErrorMessage(status: number, data: unknown, via: string) {
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const msg = String(obj.message || obj.error || "").trim();
  if (msg && !/^UniPlay\s*\d+$/i.test(msg)) return msg;
  if (status === 404 || status === 403) {
    return (
      "A UniPlay bloqueou a nuvem (404). Em Admin → Automações, configure o " +
      "Proxy API (ngrok + ges-proxy) e salve — o WhatsApp usa o mesmo proxy. " +
      `(via ${via})`
    );
  }
  return msg || `UniPlay ${status}`;
}

async function uniplayFetch(
  path: string,
  bearer: string,
  init?: RequestInit,
) {
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const token = bearer.replace(/^Bearer\s+/i, "").trim();
  const method = (init?.method || "GET").toUpperCase();
  const body =
    init?.body == null
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : String(init.body);

  const attempts: Array<{ kind: "proxy" | "direct"; base: string }> = [
    ...uniplayProxyCandidates().map((base) => ({
      kind: "proxy" as const,
      base,
    })),
    // Último recurso — costuma falhar no Edge, mas tenta
    { kind: "direct", base: UPSTREAM },
  ];

  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    try {
      let res: Response;
      if (attempt.kind === "proxy") {
        const headers: Record<string, string> = {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "x-iptv-path": apiPath,
          "ngrok-skip-browser-warning": "true",
        };
        if (token) headers["x-iptv-authorization"] = `Bearer ${token}`;
        res = await fetch(attempt.base, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : body,
        });
      } else {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: PANEL_ORIGIN,
          Referer: `${PANEL_ORIGIN}/`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        res = await fetch(`${UPSTREAM}${apiPath}`, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : body,
        });
      }

      const text = await res.text();
      let data: unknown = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text.slice(0, 200) };
      }

      if (!res.ok) {
        const err = new Error(
          uniplayErrorMessage(res.status, data, attempt.base),
        );
        // proxy/direct indisponível → tenta próximo candidato
        if (
          res.status === 404 ||
          res.status === 403 ||
          res.status === 502 ||
          res.status === 500 ||
          res.status === 503
        ) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      return data;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      // rede / proxy fora → próximo
      if (/Failed to fetch|NetworkError|fetch failed|502|503/i.test(lastErr.message)) {
        continue;
      }
      // mensagem já tratada de 404 → próximo candidate
      if (/bloqueou a nuvem|UniPlay 404/i.test(lastErr.message)) {
        continue;
      }
      throw lastErr;
    }
  }
  throw (
    lastErr ||
    new Error(
      "Não foi possível falar com a UniPlay. Configure o Proxy API em Admin → Automações.",
    )
  );
}

function genTestPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Aceita aa:bb:cc:dd:ee:ff, aa-bb-..., aabbccddeeff, aa bb cc... */
function normalizeMacWa(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const sep = s.match(
    /\b([a-fA-F0-9]{2})[:\-.\s]+([a-fA-F0-9]{2})[:\-.\s]+([a-fA-F0-9]{2})[:\-.\s]+([a-fA-F0-9]{2})[:\-.\s]+([a-fA-F0-9]{2})[:\-.\s]+([a-fA-F0-9]{2})\b/,
  );
  if (sep) {
    return [1, 2, 3, 4, 5, 6]
      .map((i) => sep[i]!.toLowerCase())
      .join(":");
  }
  // Só hex + separadores comuns (evita misturar letras de "MAC", "meu", etc.)
  const onlyMacChars = s.replace(/[^a-fA-F0-9:\-.\s]/g, "").trim();
  const hex = onlyMacChars.replace(/[^a-fA-F0-9]/g, "");
  if (hex.length === 12) {
    return hex.toLowerCase().match(/.{2}/g)!.join(":");
  }
  // Mensagem curta tipo "mac aabbccddeeff" — pega bloco de 12 hex
  const block = s.match(/(?:^|[^a-fA-F0-9])([a-fA-F0-9]{12})(?:[^a-fA-F0-9]|$)/);
  if (block?.[1]) {
    return block[1].toLowerCase().match(/.{2}/g)!.join(":");
  }
  return "";
}

function looksLikeMacMessage(raw: string) {
  return Boolean(normalizeMacWa(raw));
}

/**
 * Classifica resposta do cliente a perguntas sim/não
 * (instalação do app, check-in “conseguiu assistir?”).
 */
function classifyTestResponse(
  text: string,
): "positive" | "negative" | "neutral" {
  const t = normKey(text);
  if (!t) return "neutral";
  const positives = [
    "sim",
    "ss",
    "si",
    "consegui",
    "conseguiu",
    "deu certo",
    "deu tudo certo",
    "funcionou",
    "funciona",
    "funcionando",
    "ok",
    "okay",
    "perfeito",
    "show",
    "tranquilo",
    "rodou",
    "ta ok",
    "ta rodando",
    "yes",
    "claro",
    "assisti",
    "to assistindo",
  ];
  for (const k of positives) {
    if (t === k || t.startsWith(k + " ")) return "positive";
  }
  const negatives = [
    "nao",
    "nao consegui",
    "nao deu",
    "travou",
    "nao funciona",
    "nao funcionou",
    "nao abre",
    "nao abriu",
    "nao carrega",
    "nao entra",
    "nao acessa",
    "problema",
    "erro",
    "bug",
    "nada",
    "nope",
    "nao assisti",
  ];
  for (const k of negatives) {
    if (t === k || t.startsWith(k + " ")) return "negative";
  }
  return "neutral";
}

/** Mensagem de quem já testou e quer assinar / voltar a falar do plano. */
function looksLikeSubIntent(text: string): boolean {
  const t = normKey(text);
  const keys = [
    "assinar",
    "quero pagar",
    "plano",
    "preco",
    "precos",
    "quanto custa",
    "quanto e",
    "mensalidade",
    "contratar",
    "ativar",
    "promocao",
    "como assino",
    "valor do plano",
    "valores",
    "comprar",
    "12 meses",
    "6 meses",
    "anual",
  ];
  return keys.some((k) => k.length >= 3 && t.includes(k));
}

function inferTestTvFromOption(opt: {
  key?: string;
  label?: string;
  keywords?: string;
  nextMenuId?: string;
}): "box" | "android" | "roku" | "samsung" | "lg" | undefined {
  const blob =
    `${opt.key || ""} ${opt.label || ""} ${opt.keywords || ""} ${opt.nextMenuId || ""}`.toLowerCase();
  if (blob.includes("roku")) return "roku";
  if (blob.includes("samsung")) return "samsung";
  if (/(^|[^a-z])lg([^a-z]|$)/.test(blob)) return "lg";
  if (blob.includes("android") || blob.includes("google")) return "android";
  if (blob.includes("box")) return "box";
  return undefined;
}

function extractTokenFromLogin(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;
  const nested =
    (obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : null) || obj;
  const raw = String(
    nested.access_token ||
      nested.accessToken ||
      nested.token ||
      obj.access_token ||
      obj.token ||
      "",
  ).trim();
  return raw.replace(/^Bearer\s+/i, "");
}

function tokenNeedsRefresh(bearer: string): boolean {
  const token = bearer.replace(/^Bearer\s+/i, "").trim();
  if (!token) return true;
  try {
    const mid = token.split(".")[1];
    if (!mid) return false;
    const json = atob(mid.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp)) return false;
    return exp * 1000 < Date.now() + 10 * 60 * 1000;
  } catch {
    return false;
  }
}

function parseWelcomeUserPass(blob: string) {
  const text = String(blob || "");
  const user =
    /USU[ÁA]RIO\s*[:：]\s*([^\s\n*]+)/i.exec(text)?.[1] ||
    /user(?:name)?\s*[:：]\s*([^\s\n*]+)/i.exec(text)?.[1] ||
    "";
  const pass =
    /SENHA\s*[:：]\s*([^\s\n*]+)/i.exec(text)?.[1] ||
    /pass(?:word)?\s*[:：]\s*([^\s\n*]+)/i.exec(text)?.[1] ||
    "";
  return { username: user.trim(), password: pass.trim() };
}

function pickUsernamePassFromCreated(
  created: unknown,
  fallbackPass: string,
) {
  const blobs: string[] = [];
  const walk = (v: unknown, depth = 0) => {
    if (depth > 4 || v == null) return;
    if (typeof v === "string") {
      if (v.length > 8) blobs.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) {
        walk(x, depth + 1);
      }
    }
  };
  walk(created);
  let username = "";
  let password = fallbackPass;
  let remoteId: string | number | undefined;
  if (created && typeof created === "object") {
    const obj = created as Record<string, unknown>;
    const nested =
      (obj.data && typeof obj.data === "object"
        ? (obj.data as Record<string, unknown>)
        : null) ||
      (obj.user && typeof obj.user === "object"
        ? (obj.user as Record<string, unknown>)
        : null) ||
      (obj.infos && typeof obj.infos === "object"
        ? (obj.infos as Record<string, unknown>)
        : null) ||
      obj;
    username = String(
      nested.username || nested.user || obj.username || obj.user || "",
    ).trim();
    password = String(
      nested.password ||
        nested.pass ||
        nested.senha ||
        obj.password ||
        obj.pass ||
        fallbackPass,
    ).trim();
    remoteId =
      (nested.id as string | number | undefined) ??
      (nested.user_id as string | number | undefined) ??
      (obj.id as string | number | undefined);
  }
  if (!username || !password) {
    for (const blob of blobs) {
      const parsed = parseWelcomeUserPass(blob);
      if (!username && parsed.username) username = parsed.username;
      if ((!password || password === fallbackPass) && parsed.password) {
        password = parsed.password;
      }
      if (username && password && password !== fallbackPass) break;
    }
  }
  return { username, password: password || fallbackPass, remoteId };
}

async function ensurePanelBearer(
  client: ReturnType<typeof createClient>,
  userId: string,
  automations: Record<string, unknown>,
): Promise<string> {
  let bearer = String(automations.iptvBearerToken || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  const panelUser = String(automations.iptvUsername || "").trim();
  const panelPass = String(automations.iptvPassword || "");
  if (!tokenNeedsRefresh(bearer)) return bearer;
  if (!panelUser || !panelPass) {
    if (!bearer) throw new Error("UniPlay desconectada — conecte em Automações");
    if (tokenNeedsRefresh(bearer)) {
      throw new Error(
        "Sessão UniPlay expirada. Abra Automações e clique em Conectar.",
      );
    }
    return bearer;
  }
  const data = await uniplayFetch("/login", "", {
    method: "POST",
    body: JSON.stringify({
      username: panelUser,
      password: panelPass,
      code: "",
    }),
  });
  const token = extractTokenFromLogin(data);
  if (!token) throw new Error("Login UniPlay sem token");
  bearer = token;
  const nextAuto = { ...automations, iptvBearerToken: bearer };
  await putSetting(client, `automations_user_${userId}`, nextAuto);
  automations.iptvBearerToken = bearer;
  return bearer;
}

async function createUniplayTestUser(
  bearer: string,
  hours: number,
  phone: string,
  packageId?: string,
  clientName?: string,
) {
  const password = genTestPassword();
  const hoursSafe = String(Math.max(1, Math.min(6, hours)));
  const waDigits = digitsPhone(phone);
  // Painel exige whatsapp como inteiro (DDI+DDD+número)
  const wa = waDigits ? Number(waDigits) : undefined;
  const pkg = String(packageId || "1");
  const nota = sanitizeTestClientName(clientName || "") || "";
  const baseFields: Record<string, unknown> = {
    test_hours: hoursSafe,
    nota,
    password,
    pass: password,
    senha: password,
  };
  // Só envia telefone se for número válido — string vazia quebra a API
  if (wa != null && Number.isFinite(wa) && wa > 0) {
    baseFields.whatsapp = wa;
  }
  const attempts: Array<Record<string, unknown>> = [
    // Formato simples (mais compatível)
    { ...baseFields },
    // Formato completo do painel
    {
      ...baseFields,
      isOficial: false,
      package: pkg,
      credits: 1,
      isCustomPackage: false,
      bouquets: [],
    },
  ];
  let lastErr: Error | null = null;
  let created: unknown = null;
  for (const body of attempts) {
    try {
      created = await uniplayFetch("/users-iptv", bearer, {
        method: "POST",
        body: JSON.stringify(body),
      });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (lastErr) throw lastErr;
  let { username, password: pass, remoteId } = pickUsernamePassFromCreated(
    created,
    password,
  );
  if (!username) {
    try {
      const listed = (await uniplayFetch("/users-iptv", bearer)) as unknown;
      const rows = Array.isArray(listed)
        ? listed
        : Array.isArray((listed as { data?: unknown })?.data)
          ? ((listed as { data: unknown[] }).data)
          : [];
      const phoneDigits = digitsPhone(phone);
      const hit = [...rows].reverse().find((row) => {
        if (!row || typeof row !== "object") return false;
        const r = row as Record<string, unknown>;
        const waField = String(r.whatsapp || r.email || r.phone || "").replace(
          /\D/g,
          "",
        );
        return waField && phoneMatches(waField, phoneDigits);
      }) as Record<string, unknown> | undefined;
      if (hit) {
        username = String(hit.username || hit.user || "").trim();
        if (!pass) pass = String(hit.password || hit.pass || password).trim();
        remoteId = (hit.id as string | number | undefined) ?? remoteId;
      }
    } catch {
      /* ignore list fallback */
    }
  }
  if (!username) {
    throw new Error(
      "Teste criado, mas o painel não devolveu o usuário. Tente de novo ou escreva *atendente*.",
    );
  }
  return { username, password: pass || password, remoteId };
}

async function findUniplayUserId(bearer: string, username: string) {
  const want = username.trim().toLowerCase();
  if (!want) return null;
  const listed = (await uniplayFetch("/users-iptv", bearer)) as unknown;
  const rows = Array.isArray(listed)
    ? listed
    : Array.isArray((listed as { data?: unknown })?.data)
      ? ((listed as { data: unknown[] }).data)
      : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const u = String(r.username || r.user || "").trim().toLowerCase();
    if (u === want) return r.id ?? r.user_id ?? r.uid ?? null;
  }
  return null;
}

async function activatePartnerAppWa(
  bearer: string,
  app: "fun" | "prime",
  username: string,
  password: string,
  mac: string,
) {
  const path = app === "fun" ? "/activate-fun" : "/activate-prime";
  return await uniplayFetch(path, bearer, {
    method: "POST",
    body: JSON.stringify({ username, password, mac }),
  });
}

/**
 * NUNCA renovar/estender linha UniPlay neste webhook.
 * Extend Line consome crédito — só pode rodar no app (PixRenewPanel)
 * depois que o Mercado Pago confirmar o pagamento.
 */

async function createMpPix(opts: {
  accessToken: string;
  amount: number;
  email: string;
  externalReference: string;
  description: string;
}) {
  const value = (Math.round(opts.amount * 100) / 100).toFixed(2);
  const res = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      type: "online",
      total_amount: value,
      external_reference: opts.externalReference.slice(0, 64),
      processing_mode: "automatic",
      transactions: {
        payments: [
          {
            amount: value,
            expiration_time: "PT24H",
            payment_method: { id: "pix", type: "bank_transfer" },
          },
        ],
      },
      payer: { email: opts.email },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.message || data.error || `MP ${res.status}`));
  }
  const tx = (data.transactions || {}) as {
    payments?: Array<Record<string, unknown>>;
  };
  const payment = Array.isArray(tx.payments) ? tx.payments[0] : undefined;
  const pm = (payment?.payment_method || {}) as Record<string, unknown>;
  const qr = String(pm.qr_code || "").trim();
  if (!qr) throw new Error("MP sem QR PIX");
  const expRaw = String(
    payment?.date_of_expiration ||
      payment?.dateOfExpiration ||
      data.date_of_expiration ||
      "",
  ).trim();
  const expMs = expRaw ? Date.parse(expRaw) : NaN;
  return {
    id: String(data.id || ""),
    qr_code: qr,
    /** Expiração real do QR no Mercado Pago */
    date_of_expiration: Number.isFinite(expMs)
      ? new Date(expMs).toISOString()
      : new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  };
}

/** PIX ainda válido no MP (não expirado). */
function isMpOrderStillValid(row: Record<string, unknown>, now = Date.now()) {
  if (String(row.status || "") !== "pending") return false;
  const expRaw = String(row.expiresAt || "").trim();
  if (expRaw) {
    const t = Date.parse(expRaw);
    if (Number.isFinite(t) && now >= t) return false;
  } else {
    const created = Date.parse(String(row.createdAt || ""));
    if (Number.isFinite(created) && now >= created + 24 * 3600 * 1000) {
      return false;
    }
  }
  return Boolean(String(row.pixCopyPaste || "").trim());
}

/** Remove pending expirados; devolve PIX válido do mesmo cliente/usuário, se houver. */
function findValidPendingMpOrder(
  orders: unknown[],
  opts: { itemRefId?: string; panelUsername?: string },
): { pending?: Record<string, unknown>; orders: unknown[] } {
  const now = Date.now();
  const itemId = String(opts.itemRefId || "").trim();
  const username = String(opts.panelUsername || "")
    .trim()
    .toLowerCase();
  const kept: unknown[] = [];
  let pending: Record<string, unknown> | undefined;
  for (const o of orders) {
    if (!o || typeof o !== "object") continue;
    const row = o as Record<string, unknown>;
    if (String(row.status || "") === "pending" && !isMpOrderStillValid(row, now)) {
      continue; // expirado → some; cliente pode gerar outro
    }
    kept.push(row);
    if (pending) continue;
    if (String(row.status || "") !== "pending") continue;
    if (!isMpOrderStillValid(row, now)) continue;
    const sameItem = itemId && String(row.itemRefId || "") === itemId;
    const sameUser =
      username &&
      String(row.panelUsername || "")
        .trim()
        .toLowerCase() === username;
    if (sameItem || sameUser) pending = row;
  }
  return { pending, orders: kept };
}

function waNorm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function formatTestMenu(
  menu: { message?: string; options?: Array<Record<string, string>> } | null | undefined,
  vars?: Record<string, string | number | undefined | null>,
) {
  let intro = String(menu?.message || "");
  const entries = Object.entries(vars || {});
  for (const [k, v] of entries) {
    intro = intro.split("{" + k + "}").join(v == null || v === "" ? "—" : String(v));
  }
  const lines = (menu?.options || []).map((o) => {
    let label = String(o.label || "");
    for (const [k, v] of entries) {
      label = label.split("{" + k + "}").join(v == null || v === "" ? "—" : String(v));
    }
    return "*" + (o.key || "?") + "* — " + label;
  });
  if (!lines.length) return intro.trim();
  if (!intro.trim()) return lines.join("\n");
  return intro.trim() + "\n\n" + lines.join("\n");
}

function matchTestOption(
  text: string,
  options: Array<Record<string, unknown>> | undefined,
) {
  const t = waNorm(text);
  if (!t) return null;
  const list = options || [];
  for (const opt of list) {
    if (waNorm(String(opt.key ?? "")) === t) return opt;
  }
  for (const opt of list) {
    const keys = String(opt.keywords || "")
      .split(/[,;|/]/)
      .map((x) => waNorm(x))
      .filter(Boolean);
    if (keys.some((k) => k === t)) return opt;
  }
  let best: Record<string, unknown> | null = null;
  let bestLen = 0;
  for (const opt of list) {
    const keys = [
      ...String(opt.keywords || "")
        .split(/[,;|/]/)
        .map((x) => x.trim())
        .filter(Boolean),
      String(opt.label || ""),
    ]
      .map(waNorm)
      .filter((k) => k.length >= 3);
    for (const k of keys) {
      if ((t.includes(k) || k.includes(t)) && k.length > bestLen) {
        best = opt;
        bestLen = k.length;
      }
    }
  }
  return best;
}

function withNavOptions(
  menu:
    | { message?: string; options?: Array<Record<string, unknown>> }
    | null
    | undefined,
  opts?: { allowBack?: boolean },
) {
  const options = [...(menu?.options || [])];
  const hasBack = options.some(
    (o) =>
      waNorm(String(o.action ?? "")) === "back" ||
      waNorm(String(o.key ?? "")) === "0" ||
      waNorm(String(o.keywords || "")).includes("voltar"),
  );
  if (opts?.allowBack !== false && !hasBack) {
    options.push({
      key: "0",
      label: "Voltar",
      keywords: "voltar,volta,menu",
      action: "back",
    });
  }
  const msg = String(menu?.message || "").trim();
  const footer =
    "\n\n_Digite *voltar* para o menu anterior ou *atendente* para falar com a equipe._";
  const message =
    msg && !/atendente/i.test(msg) ? `${msg}${footer}` : msg || footer.trim();
  return { message, options };
}

function defaultTestOfferMenu() {
  return {
    message:
      "Que bom que voltou! Seu teste (*{user}*) já foi feito.\n\n" +
      "*Nossos Preços para Contratação*\n\n" +
      "*Plano Básico: R$ 29,90 por mês*\n" +
      "- Direito a *1 tela*\n\n" +
      "*Plano Padrão: R$ 44,90 por mês*\n" +
      "- Direito a *2 telas*\n\n" +
      "_______________________\n\n" +
      "✨ *Promoção Especial:* 2 telas\n" +
      "- *6 meses*: *R$ 155* (R$ 25,83/mês)\n" +
      "- *12 meses*: *R$ 290* (R$ 24,17/mês)\n\n" +
      "Podem ser utilizados em:\n" +
      "- 📺 TVs\n" +
      "- 📱 Celulares\n" +
      "- 💻 Computadores\n\n" +
      "Escolha o plano:",
    options: [
      {
        key: "1",
        label: "Plano Básico — R$ 29,90 (1 tela)",
        keywords: "basico,básico,29,29.90,29,90",
        action: "activate_month",
        amountBrl: 29.9,
        screens: 1,
      },
      {
        key: "2",
        label: "Plano Padrão — R$ 44,90 (2 telas)",
        keywords: "padrao,padrão,44,44.90,44,90",
        action: "activate_month",
        amountBrl: 44.9,
        screens: 2,
      },
      {
        key: "3",
        label: "Promo 6 meses — R$ 155 (atendente)",
        keywords: "6 meses,6meses,155",
        action: "human",
      },
      {
        key: "4",
        label: "Promo 12 meses — R$ 290 (atendente)",
        keywords: "12 meses,12meses,290,anual",
        action: "human",
      },
      {
        key: "atendente",
        label: "Falar com atendente",
        keywords: "atendente,atendentes,humano,suporte",
        action: "human",
      },
    ],
  };
}

function isLegacyTestOffer(offer: unknown) {
  if (!offer || typeof offer !== "object") return true;
  const o = offer as { message?: string; options?: Array<Record<string, unknown>> };
  const options = Array.isArray(o.options) ? o.options : [];
  if (!options.length) return true;
  const activate = options.filter((x) => String(x.action || "") === "activate_month");
  if (activate.length !== 1) return false;
  const blob = `${o.message || ""} ${activate[0]?.label || ""}`.toLowerCase();
  return (
    /1\s*m[eê]s por|ativo na hora/.test(blob) &&
    !/29[,.]?90|44[,.]?90/.test(blob)
  );
}

const DEFAULT_PHONE_APK = "http://tie-tv.com.br/uni.apk";
const DEFAULT_PHONE_IOS =
  "https://apps.apple.com/br/app/smarters-player-lite/id1628995509";

function defaultPhoneOsMenu() {
  return {
    message: "Seu celular é *Android* ou *iPhone*?",
    options: [
      {
        key: "1",
        label: "Android",
        keywords: "android",
        action: "phone_android",
      },
      {
        key: "2",
        label: "iPhone",
        keywords: "iphone,ios,apple",
        action: "phone_ios",
      },
    ],
  };
}

/** Garante menu Android/iPhone + links padrão em fluxos já salvos. */
function ensurePhoneFlowInWebhook(tf: Record<string, unknown>) {
  const phoneMenu = tf.phoneMenu as { options?: unknown[] } | undefined;
  const apk = String(tf.phoneApkUrl || "").trim();
  const texts = (tf.texts && typeof tf.texts === "object"
    ? { ...(tf.texts as Record<string, string>) }
    : {}) as Record<string, string>;
  const next: Record<string, unknown> = { ...tf };
  if (!Array.isArray(phoneMenu?.options) || !phoneMenu.options.length) {
    next.phoneMenu = defaultPhoneOsMenu();
  }
  if (!apk || /auxplus\.vercel\.app\/uni\.apk/i.test(apk)) {
    next.phoneApkUrl = DEFAULT_PHONE_APK;
  }
  if (!String(tf.phoneIosUrl || "").trim()) {
    next.phoneIosUrl = DEFAULT_PHONE_IOS;
  }
  if (!String(texts.phoneIosReady || "").trim()) {
    texts.phoneIosReady = DEFAULT_MESSAGES.testPhoneIosReady;
  }
  if (
    String(texts.phoneReady || "").trim() &&
    !/android/i.test(texts.phoneReady) &&
    /celular/i.test(texts.phoneReady) &&
    /uni\.apk/i.test(texts.phoneReady)
  ) {
    texts.phoneReady = DEFAULT_MESSAGES.testPhoneReady;
  } else if (!String(texts.phoneReady || "").trim()) {
    texts.phoneReady = DEFAULT_MESSAGES.testPhoneReady;
  }
  const askName = String(texts.askName || "").trim();
  if (!askName || /ex\.?:?\s*jo[aã]o|\(ex\./i.test(askName)) {
    texts.askName = DEFAULT_MESSAGES.testAskName;
  }
  if (!String(texts.macCheckIn || "").trim()) {
    texts.macCheckIn = DEFAULT_MESSAGES.testMacCheckIn;
  }
  if (!String(texts.alreadyUsed || "").trim()) {
    texts.alreadyUsed = DEFAULT_MESSAGES.testAlreadyUsed;
  }
  if (!String(texts.confirmInstall || "").trim()) {
    texts.confirmInstall = DEFAULT_MESSAGES.testConfirmInstall;
  }
  if (!String(texts.confirmInstallOk || "").trim()) {
    texts.confirmInstallOk = DEFAULT_MESSAGES.testConfirmInstallOk;
  }
  if (!String(texts.confirmInstallNo || "").trim()) {
    texts.confirmInstallNo = DEFAULT_MESSAGES.testConfirmInstallNo;
  }
  if (!String(texts.macPrompt || "").trim()) {
    texts.macPrompt = DEFAULT_MESSAGES.testMacPrompt;
  }
  if (!String(texts.checkInOk || "").trim()) {
    texts.checkInOk = DEFAULT_MESSAGES.testCheckInOk;
  }
  if (!String(texts.checkInNo || "").trim()) {
    texts.checkInNo = DEFAULT_MESSAGES.testCheckInNo;
  }
  next.texts = texts;
  return next;
}

function withFreshTestOffer(tf: Record<string, unknown>) {
  const withPhone = ensurePhoneFlowInWebhook(tf);
  if (!isLegacyTestOffer(withPhone.offerMenu)) {
    return enrichOfferScreens(withPhone);
  }
  const price = Number(withPhone.monthPriceBrl);
  return enrichOfferScreens({
    ...withPhone,
    monthPriceBrl: Number.isFinite(price) && price > 0 ? price : 29.9,
    offerMenu: defaultTestOfferMenu(),
  });
}

/** Garante screens nas opções auto (29,90→1 · 44,90→2) e texto do Padrão. */
function enrichOfferScreens(tf: Record<string, unknown>) {
  const offer = tf.offerMenu as
    | { message?: string; options?: Array<Record<string, unknown>> }
    | undefined;
  if (!offer || !Array.isArray(offer.options) || !offer.options.length) {
    return tf;
  }
  let changed = false;
  const options = offer.options.map((o) => {
    if (String(o.action || "") !== "activate_month") return o;
    const amt = Number(o.amountBrl);
    let screens = Number(o.screens);
    if (!Number.isFinite(screens) || screens < 1) {
      if (Number.isFinite(amt) && amt >= 40 && amt <= 50) screens = 2;
      else screens = 1;
      changed = true;
      return { ...o, screens };
    }
    return o;
  });
  let message = String(offer.message || "");
  if (/3\s*telas/i.test(message) && /44[,.]?\s*90/.test(message)) {
    message = message.replace(/3\s*telas/gi, "2 telas");
    changed = true;
  }
  // Nunca falar de créditos do painel com o cliente
  if (/cr[eé]dito/i.test(message)) {
    message = message
      .replace(/\s*\(1\s*cr[eé]dito(?:\s*\+\s*2\s*ativa[cç][oõ]es)?\)/gi, "")
      .replace(/\s*\([^)]*cr[eé]dito[^)]*\)/gi, "")
      .replace(/\s*1\s*cr[eé]dito(?:\s*no\s*painel)?/gi, "");
    changed = true;
  }
  if (!changed) return tf;
  return { ...tf, offerMenu: { ...offer, message, options } };
}

/** Intro do PIX após escolher plano — nunca dizer que já está ativo. */
function pickActivatedMonthTemplate(texts: Record<string, string>) {
  const fallback =
    "✅ PIX do plano — usuário *{user}*\n\n" +
    "Valor: *{amount}*\n\n" +
    "Segue o código para pagamento.\n" +
    "Assim que o pagamento for confirmado, o plano é liberado.";
  const custom = String(texts.activatedMonth || "").trim();
  if (!custom) return fallback;
  // Qualquer texto antigo que soe como “já liberado”
  if (
    /ativad/i.test(custom) ||
    /liberad/i.test(custom) ||
    /cr[eé]dito/i.test(custom) ||
    /1\s*\*?m[eê]s\*?/i.test(custom)
  ) {
    return fallback;
  }
  return custom;
}

function resolveTestFlowFromBot(bot: Record<string, unknown>) {
  const tf = bot?.testFlow as Record<string, unknown> | undefined;
  const deviceMenu = tf?.deviceMenu as { options?: unknown[] } | undefined;
  if (
    tf &&
    typeof tf === "object" &&
    String(tf.triggerPhrase || "").trim() &&
    Array.isArray(deviceMenu?.options) &&
    deviceMenu.options.length
  ) {
    return withFreshTestOffer(tf);
  }
  const messages = (bot?.messages || {}) as Record<string, string>;
  const trigger = String(bot?.testTriggerPhrase || "").trim();
  if (!String(messages.testAskDevice || "").trim() && !trigger) return null;
  return {
    triggerPhrase:
      trigger || "Olá quero testar o T&E no meu aparelho.",
    monthPriceBrl:
      Number(bot?.testMonthPriceBrl) > 0 ? Number(bot.testMonthPriceBrl) : 29.9,
    pcLoginUrl: String(bot?.testPcLoginUrl || "http://navegauni.top/login").trim(),
    phoneApkUrl: String(
      bot?.testPhoneApkUrl || "http://tie-tv.com.br/uni.apk",
    ).trim(),
    phoneIosUrl: String(
      bot?.testPhoneIosUrl ||
        "https://apps.apple.com/br/app/smarters-player-lite/id1628995509",
    ).trim(),
    deviceMenu: {
      message: String(messages.testAskDevice || "Em qual aparelho?"),
      options: [
        { key: "1", label: "TV", keywords: "tv", action: "ask_tv" },
        { key: "2", label: "Computador", keywords: "computador,pc", action: "pc" },
        { key: "3", label: "Celular", keywords: "celular,iphone,smartphone", action: "phone" },
      ],
    },
    phoneMenu: {
      message: String(
        messages.testAskPhoneOs ||
          "Seu celular é *Android* ou *iPhone*?",
      ),
      options: [
        {
          key: "1",
          label: "Android",
          keywords: "android",
          action: "phone_android",
        },
        {
          key: "2",
          label: "iPhone",
          keywords: "iphone,ios,apple",
          action: "phone_ios",
        },
      ],
    },
    tvMenu: {
      message: String(messages.testAskTv || "Tipo da TV?"),
      options: [
        { key: "1", label: "TV Box", keywords: "box", action: "app_fun" },
        { key: "2", label: "Android TV", keywords: "android", action: "app_fun" },
        {
          key: "3",
          label: "Roku",
          keywords: "roku",
          action: "ask_app",
          nextMenuId: "rokulg",
        },
        {
          key: "4",
          label: "Samsung",
          keywords: "samsung",
          action: "ask_app",
          nextMenuId: "samsung",
        },
        {
          key: "5",
          label: "LG",
          keywords: "lg",
          action: "ask_app",
          nextMenuId: "rokulg",
        },
      ],
    },
    appMenus: [
      {
        id: "samsung",
        title: "Samsung",
        menu: {
          message: String(messages.testAskAppSamsung || ""),
          options: [
            { key: "1", label: "FunPlay", keywords: "fun", action: "app_fun" },
            {
              key: "2",
              label: "XCloud",
              keywords: "xcloud",
              action: "app_xcloud",
            },
          ],
        },
      },
      {
        id: "rokulg",
        title: "Roku/LG",
        menu: {
          message: String(messages.testAskAppRokuLg || ""),
          options: [
            {
              key: "1",
              label: "Prime IPTV",
              keywords: "prime",
              action: "app_prime",
            },
            {
              key: "2",
              label: "XCloud",
              keywords: "xcloud",
              action: "app_xcloud",
            },
          ],
        },
      },
    ],
    offerMenu: defaultTestOfferMenu(),
    texts: {
      askName: String(messages.testAskName || DEFAULT_MESSAGES.testAskName),
      funReady: String(messages.testAppFunReady || ""),
      primeReady: String(messages.testAppPrimeReady || ""),
      xcloudReady: String(messages.testAppXcloudReady || ""),
      macOk: String(messages.testMacOk || DEFAULT_MESSAGES.testMacOk),
      macOkRoku: String(
        messages.testMacOkRoku || DEFAULT_MESSAGES.testMacOkRoku,
      ),
      macCheckIn: String(
        messages.testMacCheckIn || DEFAULT_MESSAGES.testMacCheckIn,
      ),
      macInvalid: String(
        messages.testMacInvalid || DEFAULT_MESSAGES.testMacInvalid,
      ),
      alreadyUsed: DEFAULT_MESSAGES.testAlreadyUsed,
      confirmInstall: DEFAULT_MESSAGES.testConfirmInstall,
      confirmInstallOk: DEFAULT_MESSAGES.testConfirmInstallOk,
      confirmInstallNo: DEFAULT_MESSAGES.testConfirmInstallNo,
      macPrompt: DEFAULT_MESSAGES.testMacPrompt,
      checkInOk: DEFAULT_MESSAGES.testCheckInOk,
      checkInNo: DEFAULT_MESSAGES.testCheckInNo,
      pcReady: String(messages.testPcReady || ""),
      phoneReady: String(messages.testPhoneReady || ""),
      phoneIosReady: String(
        messages.testPhoneIosReady || DEFAULT_MESSAGES.testPhoneIosReady,
      ),
      activatedMonth: String(messages.testActivatedMonth || ""),
      notConfigured: "Fluxo de teste não configurado.",
    },
  };
}

function pickMacOkTemplate(
  texts: Record<string, string>,
  isRoku: boolean,
): string {
  if (isRoku) {
    const custom = String(texts.macOkRoku || "").trim();
    if (custom) return custom;
    return DEFAULT_MESSAGES.testMacOkRoku;
  }
  const custom = String(texts.macOk || "").trim();
  // Conta com texto antigo (sem passos) → usa o modelo novo
  if (custom && /recarregar|reload/i.test(custom)) return custom;
  return DEFAULT_MESSAGES.testMacOk;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const payload = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const event = String(payload.event || payload.type || "").toLowerCase();
    if (event && !event.includes("upsert") && !event.includes("messages")) {
      return json({ ok: true, skipped: event });
    }

    const instance = String(
      payload.instance ||
        (payload as { instanceName?: string }).instanceName ||
        "",
    ).trim();
    const data = normalizeMessageData(payload);
    const { phone, fromMe } = extractRemotePhone(data);
    const text = extractText(data).trim();
    const mediaKind = detectInboundMedia(data);
    const messageId = extractMessageId(data);
    if (!instance || !phone || (!text && !mediaKind)) {
      return json({
        ok: true,
        skipped: "incomplete",
        instance: Boolean(instance),
        phone: Boolean(phone),
        text: Boolean(text),
        media: Boolean(mediaKind),
      });
    }

    const client = await sb();
    const map = await getSetting<{ userId?: string }>(
      client,
      `wa_instance_${instance.toLowerCase()}`,
    );
    const userId = String(map?.userId || "").trim();
    if (!userId) return json({ ok: true, skipped: "no_user_map" });

    const bot =
      (await getSetting<Record<string, unknown>>(
        client,
        `wa_bot_user_${userId}`,
      )) || {};
    if (bot.enabled !== true) return json({ ok: true, skipped: "bot_off" });

    const messages = resolveMessages(
      (bot.messages || {}) as Record<string, string>,
    );
    const keywords = (bot.keywords || {}) as Record<string, string[]>;
    const endHuman = String(
      bot.endHumanPhrase || "atendimento encerrado",
    ).toLowerCase();
    const testFlow = resolveTestFlowFromBot(bot as Record<string, unknown>);
    const testPhrase = String(
      (testFlow as { triggerPhrase?: string } | null)?.triggerPhrase ||
        bot.testTriggerPhrase ||
        "",
    ).trim();

    const evo =
      (await getSetting<{
        apiBaseUrl?: string;
        apiKey?: string;
      }>(client, "evolution_api")) || {};
    const apiBaseUrl = String(evo.apiBaseUrl || "").trim();
    const apiKey = String(evo.apiKey || "").trim();
    if (!apiBaseUrl || !apiKey) {
      return json({ ok: false, error: "evolution missing" }, 500);
    }

    type Session = {
      state?: string;
      role?: string;
      itemRefId?: string;
      panelUsername?: string;
      resellerId?: string | number;
      testUsername?: string;
      testPassword?: string;
      testRemoteId?: string | number;
      testApp?: "fun" | "prime" | "xcloud";
      testDevice?: "tv" | "pc" | "phone";
      testTv?: "box" | "android" | "roku" | "samsung" | "lg";
      testHours?: number;
      testDoneAt?: string;
      testAppMenuId?: string;
      /** Nome informado antes de criar o teste (vai na nota do painel). */
      testClientName?: string;
      /** Telas/ativações MAC após contratar plano (extras além do teste). */
      activationsTotal?: number;
      activationsDone?: number;
      /** Token do check-in pós-MAC (cancela se o cliente responder). */
      macCheckInId?: string;
      /** Último aviso “atendimento humano” (anti-spam). */
      humanBusyAt?: string;
      /** Já avisou o cliente sobre o atendimento humano (1× por sessão). */
      humanBusySent?: boolean;
      updatedAt?: string;
    };
    type TestConsumed = {
      at: string;
      username?: string;
      name?: string;
      remoteId?: string | number;
    };
    type BotSendLog = { at: string; phone: string };
    type Store = {
      sessions?: Record<string, Session>;
      humanPaused?: Record<string, boolean>;
      /** Já usou o teste — só sai com "liberar teste" do dono */
      testConsumed?: Record<string, TestConsumed>;
      /** Dedup de webhooks Evolution (message id → expiresAt ms) */
      recentMsgIds?: Record<string, number>;
      /** Log de envios do bot (anti-spam / caps) */
      botSendLog?: BotSendLog[];
      /** Último envio do bot neste chat (gap entre bolhas) */
      lastSendAtByPhone?: Record<string, number>;
      /** Cliente pediu para parar o automático */
      optOut?: Record<string, boolean>;
    };
    const store =
      (await getSetting<Store>(client, `wa_bot_state_user_${userId}`)) || {};
    const sessions = { ...(store.sessions || {}) };
    const humanPaused = { ...(store.humanPaused || {}) };
    const testConsumed = { ...(store.testConsumed || {}) };
    const recentMsgIds = { ...(store.recentMsgIds || {}) };
    let botSendLog = Array.isArray(store.botSendLog)
      ? [...store.botSendLog]
      : [];
    const lastSendAtByPhone = { ...(store.lastSendAtByPhone || {}) };
    const optOut = { ...(store.optOut || {}) };

    const phoneStateKey = (p: string) => digitsPhone(p) || String(p || "");

    const findTestConsumed = (p: string): TestConsumed | null => {
      const key = phoneStateKey(p);
      if (key && testConsumed[key]) return testConsumed[key];
      for (const [k, v] of Object.entries(testConsumed)) {
        if (phoneMatches(k, p)) return v;
      }
      return null;
    };

    const markTestConsumed = (p: string, info: TestConsumed) => {
      const key = phoneStateKey(p);
      if (!key) return;
      // remove chaves duplicadas do mesmo número
      for (const k of Object.keys(testConsumed)) {
        if (k !== key && phoneMatches(k, p)) delete testConsumed[k];
      }
      testConsumed[key] = info;
    };

    const clearTestConsumed = (p: string) => {
      const key = phoneStateKey(p);
      if (key) delete testConsumed[key];
      for (const k of Object.keys(testConsumed)) {
        if (phoneMatches(k, p)) delete testConsumed[k];
      }
    };

    const logWhatsAppTest = async (info: {
      username: string;
      password?: string;
      name?: string;
      remoteId?: string | number;
      hours?: number;
    }) => {
      const username = String(info.username || "").trim();
      if (!username) return;
      const phoneKey = phoneStateKey(phone) || digitsPhone(phone) || phone;
      await appendIptvJobLog(client, userId, {
        id: `wa_test_${phoneKey}_${username}`,
        kind: "test",
        status: "done",
        clientName: String(info.name || "").trim() || username,
        panelUsername: username,
        panelPassword: info.password,
        panelRemoteId: info.remoteId,
        phone,
        testHours: Number(info.hours) || testHours,
        note: "WhatsApp · teste gerado",
      });
    };

    const persistState = async () => {
      const now = Date.now();
      for (const [id, exp] of Object.entries(recentMsgIds)) {
        if (Number(exp) < now) delete recentMsgIds[id];
      }
      const dayAgo = now - 24 * 60 * 60 * 1000;
      botSendLog = botSendLog
        .filter((r) => Date.parse(r.at) >= dayAgo)
        .slice(-400);
      await putSetting(client, `wa_bot_state_user_${userId}`, {
        sessions,
        humanPaused,
        testConsumed,
        recentMsgIds,
        botSendLog,
        lastSendAtByPhone,
        optOut,
      });
    };

    // Dedup: Evolution às vezes reenvia o mesmo evento
    if (messageId) {
      const exp = Number(recentMsgIds[messageId] || 0);
      if (exp > Date.now()) {
        return json({ ok: true, skipped: "dup_message" });
      }
      recentMsgIds[messageId] = Date.now() + BOT_DEDUP_TTL_MS;
      await persistState();
    }

    const phoneKeyForCaps = () => phoneStateKey(phone) || digitsPhone(phone) || phone;

    const canBotSendToPhone = (): { ok: boolean; reason?: string } => {
      const key = phoneKeyForCaps();
      const now = Date.now();
      const hourAgo = now - 60 * 60 * 1000;
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayMs = dayStart.getTime();
      const forPhone = botSendLog.filter((r) => phoneMatches(r.phone, key));
      const hourCount = forPhone.filter((r) => Date.parse(r.at) >= hourAgo).length;
      const dayCount = forPhone.filter((r) => Date.parse(r.at) >= dayMs).length;
      if (hourCount >= BOT_MAX_PER_PHONE_HOUR) {
        return { ok: false, reason: "phone_hour_cap" };
      }
      if (dayCount >= BOT_MAX_PER_PHONE_DAY) {
        return { ok: false, reason: "phone_day_cap" };
      }
      return { ok: true };
    };

    let lastSendInRequest = 0;
    const send = async (msg: string) => {
      const body = String(msg || "").trim();
      if (!body) return;
      const gate = canBotSendToPhone();
      if (!gate.ok) {
        console.warn("bot send capped", gate.reason, phone);
        return;
      }
      const key = phoneKeyForCaps();
      const now = Date.now();
      const lastPhone = Number(lastSendAtByPhone[key] || 0);
      const wait = Math.max(
        0,
        BOT_MSG_GAP_MS - (now - lastSendInRequest),
        BOT_MSG_GAP_MS - (now - lastPhone),
      );
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      await evoSend(apiBaseUrl, apiKey, instance, phone, body);
      const sentAt = Date.now();
      lastSendInRequest = sentAt;
      lastSendAtByPhone[key] = sentAt;
      botSendLog.push({ at: new Date(sentAt).toISOString(), phone: key });
    };

    const setHumanPaused = (p: string, paused: boolean) => {
      const key = phoneStateKey(p) || p;
      for (const k of Object.keys(humanPaused)) {
        if (k !== key && phoneMatches(k, p)) delete humanPaused[k];
      }
      if (paused) humanPaused[key] = true;
      else {
        delete humanPaused[key];
        delete humanPaused[p];
      }
    };

    const isHumanPaused = (p: string) => {
      if (humanPaused[p] || humanPaused[phoneStateKey(p)]) return true;
      return Object.keys(humanPaused).some(
        (k) => humanPaused[k] && phoneMatches(k, p),
      );
    };

    // Comandos do dono: SÓ com fromMe + texto EXATO (senão a msg do bot
    // “Atendimento encerrado…” re-dispara o comando e vira loop).
    const cmdNorm = normKey(text);
    const endHumanNorm = normKey(endHuman);
    const isOwnerReleaseTest =
      fromMe && cmdNorm === normKey("liberar teste");
    const isOwnerAssume = fromMe && cmdNorm === "assumir";
    const isOwnerEndHuman =
      fromMe && Boolean(endHumanNorm) && cmdNorm === endHumanNorm;

    if (isOwnerReleaseTest) {
      clearTestConsumed(phone);
      setHumanPaused(phone, false);
      const ok = phoneStateKey(phone);
      if (ok) delete optOut[ok];
      for (const k of Object.keys(optOut)) {
        if (phoneMatches(k, phone)) delete optOut[k];
      }
      sessions[phone] = {
        state: "idle",
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await send(
        "✅ Teste *liberado* para este contato.\nPode pedir o teste de novo quando quiser.",
      );
      return json({ ok: true, action: "test_released" });
    }

    if (isOwnerAssume) {
      setHumanPaused(phone, true);
      sessions[phone] = {
        ...(sessions[phone] || {}),
        state: "human",
        humanBusySent: false,
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await send(
        messages.humanAssumed || DEFAULT_MESSAGES.humanAssumed,
      );
      return json({ ok: true, action: "human_assumed" });
    }

    if (isOwnerEndHuman) {
      setHumanPaused(phone, false);
      const used = findTestConsumed(phone);
      // Não apaga o bloqueio de teste — só encerra o humano
      sessions[phone] = {
        state: "idle",
        ...(used
          ? {
              testUsername: used.username,
              testDoneAt: used.at,
              testClientName: used.name,
              testRemoteId: used.remoteId,
            }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await send(
        messages.humanEnded || DEFAULT_MESSAGES.humanEnded,
      );
      return json({ ok: true, action: "human_ended" });
    }

    if (fromMe) return json({ ok: true, skipped: "fromMe" });

    // Foto/áudio/vídeo/doc sem legenda → não ficar calado
    if (!text && mediaKind) {
      if (isHumanPaused(phone)) {
        return json({ ok: true, skipped: "human_media" });
      }
      await send(mediaHintMessage(mediaKind));
      return json({ ok: true, action: "media_hint", media: mediaKind });
    }

    // Opt-out: cliente digita parar / stop
    const wantsOptOut =
      cmdNorm === "parar" ||
      cmdNorm === "stop" ||
      cmdNorm === "sair" ||
      cmdNorm === "cancelar mensagens";
    const wantsOptIn =
      cmdNorm === "voltar" ||
      cmdNorm === "ativar bot" ||
      cmdNorm === "continuar";
    const isOptedOut =
      optOut[phoneStateKey(phone)] === true ||
      Object.keys(optOut).some((k) => optOut[k] && phoneMatches(k, phone));
    if (wantsOptOut) {
      const key = phoneStateKey(phone) || phone;
      optOut[key] = true;
      setHumanPaused(phone, false);
      sessions[phone] = {
        ...(sessions[phone] || {}),
        state: "idle",
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await send(
        "Ok — parei as respostas automáticas neste chat.\n\n" +
          "Se quiser o automático de novo, digite *voltar*.",
      );
      return json({ ok: true, action: "opt_out" });
    }
    if (wantsOptIn && isOptedOut) {
      const key = phoneStateKey(phone);
      if (key) delete optOut[key];
      for (const k of Object.keys(optOut)) {
        if (phoneMatches(k, phone)) delete optOut[k];
      }
      await persistState();
      await send(
        "Pronto — o automático voltou neste chat. Como posso ajudar?",
      );
      return json({ ok: true, action: "opt_in" });
    }
    if (isOptedOut) {
      return json({ ok: true, skipped: "opt_out" });
    }

    if (isHumanPaused(phone)) {
      // Avisa o cliente UMA vez por atendimento humano (não repete a cada
      // mensagem que ele mandar enquanto o atendente estiver assumido).
      const prev = sessions[phone] || {
        state: "human",
        updatedAt: new Date().toISOString(),
      };
      if (!prev.humanBusySent) {
        sessions[phone] = {
          ...prev,
          state: "human",
          humanBusySent: true,
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send(
          messages.humanBusy || DEFAULT_MESSAGES.humanBusy,
        );
      }
      return json({ ok: true, skipped: "human_paused" });
    }

    const automations =
      (await getSetting<Record<string, unknown>>(
        client,
        `automations_user_${userId}`,
      )) || {};
    const iptvPanel =
      (await getSetting<Record<string, unknown>>(client, "iptv_panel")) || {};
    // Mesmo Proxy API das Automações (ngrok) — obrigatório no Edge
    uniplayProxyPrefer = String(
      iptvPanel.apiProxyUrl ||
        iptvPanel.api_proxy_url ||
        automations.apiProxyUrl ||
        "",
    ).trim();
    const mpToken = String(automations.mpAccessToken || "").trim();
    const mpEmail = String(automations.mpPayerEmail || "").trim();
    let bearer = String(automations.iptvBearerToken || "").trim();
    try {
      bearer = await ensurePanelBearer(client, userId, automations);
    } catch {
      /* mantém bearer atual; ações UniPlay vão falhar com mensagem clara */
    }
    const syncResellersFolderId = String(
      automations.syncResellersFolderId || "",
    ).trim();
    const defaultPackage = String(
      automations.iptvDefaultPackage || automations.defaultPackage || "1",
    ).trim() || "1";
    const testHours = Math.max(
      1,
      Math.min(6, Number(automations.testHours) || 6),
    );
    const creditUnit = Math.max(
      0.01,
      Number(automations.resellerCreditPriceBrl) || 8.5,
    );
    const resellerPackageCredits = 10;
    const resellerPackageAmount =
      Math.round(creditUnit * resellerPackageCredits * 100) / 100;

    // user_id no banco pode ser number ou string
    const uidNum = Number(userId);
    let foldersQuery = client.from("folders").select("id,user_id,type");
    if (Number.isFinite(uidNum) && String(uidNum) === String(userId).trim()) {
      foldersQuery = foldersQuery.eq("user_id", uidNum);
    } else {
      foldersQuery = foldersQuery.eq("user_id", userId);
    }
    const { data: folders } = await foldersQuery;
    // fallback: se eq tipado falhar, busca e filtra
    let folderRows = folders || [];
    if (!folderRows.length) {
      const { data: allFolders } = await client
        .from("folders")
        .select("id,user_id,type");
      folderRows = (allFolders || []).filter(
        (f: { user_id?: string | number }) =>
          String(f.user_id) === String(userId),
      );
    }

    const folderIds = new Set(
      folderRows
        .filter((f: { type?: string }) => f.type === "Cliente")
        .map((f: { id: string | number }) => String(f.id)),
    );

    const { data: items } = await client.from("items").select("*");

    type ItemRow = {
      id: string | number;
      folder_id: string | number;
      item_id?: string;
      name?: string;
      phone?: string;
      price?: number;
      due_date?: string | null;
      notes?: string | null;
      is_active?: boolean;
    };

    const userItems = ((items || []) as ItemRow[]).filter(
      (i) =>
        folderIds.has(String(i.folder_id)) && i.is_active !== false,
    );

    const byPhone = userItems.filter((i) => phoneMatches(i.phone || "", phone));
    const resellerItem = byPhone.find(
      (i) => String(i.folder_id) === syncResellersFolderId,
    );
    const clientItem =
      byPhone.find((i) => String(i.folder_id) !== syncResellersFolderId) ||
      byPhone[0];

    let session = sessions[phone] || {
      state: "idle",
      updatedAt: new Date().toISOString(),
    };
    // Resposta ao check-in pós-teste (“conseguiu assistir?”) → tratar depois,
    // não como retorno de contato que dispara a oferta de plano.
    const hadPendingCheckIn = Boolean(session.macCheckInId);
    // Qualquer resposta do cliente cancela o check-in pós-MAC agendado
    if (session.macCheckInId) {
      session = {
        ...session,
        macCheckInId: undefined,
        updatedAt: new Date().toISOString(),
      };
      sessions[phone] = session;
      await persistState();
    }

    const renewKeys = [
      ...new Set([
        ...(Array.isArray(keywords.renew) ? keywords.renew : []),
        "1",
        "renovar",
        "renovacao",
        "estender",
        "estender vencimento",
        "extensao",
        "extensão",
      ]),
    ].map(normKey);
    const problemKeys = (
      keywords.problem || ["atendente", "atendentes", "problema", "suporte"]
    ).map(normKey);
    const buyKeys = (keywords.resellerBuy || ["1", "credito"]).map(normKey);
    const t = normKey(text);
    // Menu do cliente/revendedor usa *2* = atendentes. Em outros menus, "2" não chama.
    const menuAllowsTwoAsAttendant =
      session.state === "ask_intent" || session.state === "reseller_offer";
    const wantsAttendant =
      t === "atendente" ||
      t === "atendentes" ||
      (menuAllowsTwoAsAttendant && t === "2") ||
      problemKeys.some(
        (k) =>
          k !== "2" && (t === k || (k.length >= 5 && t.includes(k))),
      );

    const testMonthPrice = (() => {
      const n = Number(
        (testFlow as { monthPriceBrl?: number } | null)?.monthPriceBrl ??
          bot.testMonthPriceBrl,
      );
      if (Number.isFinite(n) && n >= 1) return Math.round(n * 100) / 100;
      return 30;
    })();
    const testFlowStates = new Set([
      "test_ask_name",
      "test_ask_device",
      "test_ask_phone_os",
      "test_ask_tv",
      "test_ask_app",
      "test_await_mac",
      "test_confirm_install",
      "test_plan_await_mac",
      "test_offer_plan",
    ]);
    const tfTexts = ((testFlow as { texts?: Record<string, string> } | null)
      ?.texts || {}) as Record<string, string>;
    type FlowMenu = {
      message?: string;
      options?: Array<Record<string, unknown>>;
    };
    type FlowAppMenu = { id?: string; menu?: FlowMenu };
    const flowObj = testFlow as {
      deviceMenu?: FlowMenu;
      tvMenu?: FlowMenu;
      phoneMenu?: FlowMenu;
      offerMenu?: FlowMenu;
      appMenus?: FlowAppMenu[];
      pcLoginUrl?: string;
      phoneApkUrl?: string;
      phoneIosUrl?: string;
    } | null;
    const findAppMenu = (id?: string) =>
      (flowObj?.appMenus || []).find((m) => m.id === id);
    const dnsSmartersDefault =
      String(
        (iptvPanel as { dnsSmarters?: string; dns_smarters?: string })
          .dnsSmarters ||
          (iptvPanel as { dns_smarters?: string }).dns_smarters ||
          "http://blushes.top",
      ).trim() || "http://blushes.top";

    const sendMenu = async (
      menu: FlowMenu | null | undefined,
      vars: Record<string, string | number>,
      nav?: { allowBack?: boolean },
    ) => {
      const enriched = withNavOptions(menu, nav);
      await send(formatTestMenu(enriched, vars));
    };

    /** ~2 min após MAC: pergunta se assistiu, se o cliente ainda não respondeu. */
    const scheduleMacCheckIn = (checkInId: string) => {
      const delayMs = 120_000;
      const msg =
        String(tfTexts.macCheckIn || "").trim() ||
        DEFAULT_MESSAGES.testMacCheckIn;
      const task = (async () => {
        try {
          await new Promise((r) => setTimeout(r, delayMs));
          const fresh =
            (await getSetting<Store>(
              client,
              `wa_bot_state_user_${userId}`,
            )) || {};
          const sessMap = { ...(fresh.sessions || {}) };
          let key = phone;
          let sess = sessMap[key];
          if (!sess || sess.macCheckInId !== checkInId) {
            const hit = Object.entries(sessMap).find(
              ([, v]) => v?.macCheckInId === checkInId,
            );
            if (!hit) return;
            key = hit[0];
            sess = hit[1];
          }
          if (!sess || sess.macCheckInId !== checkInId) return;
          const paused = fresh.humanPaused || {};
          const isPaused = Object.entries(paused).some(
            ([k, v]) => Boolean(v) && phoneMatches(k, phone),
          );
          if (isPaused) return;
          await evoSend(apiBaseUrl, apiKey, instance, phone, msg);
          sessMap[key] = {
            ...sess,
            macCheckInId: undefined,
            updatedAt: new Date().toISOString(),
          };
          await putSetting(client, `wa_bot_state_user_${userId}`, {
            ...fresh,
            sessions: sessMap,
            humanPaused: fresh.humanPaused || {},
            testConsumed: fresh.testConsumed || {},
          });
        } catch (e) {
          console.error("macCheckIn failed", e);
        }
      })();
      try {
        EdgeRuntime.waitUntil(task);
      } catch {
        void task;
      }
    };

    const currentTestMenu = (sess: Session): FlowMenu | null => {
      if (sess.state === "test_ask_device") return flowObj?.deviceMenu || null;
      if (sess.state === "test_ask_phone_os") {
        return flowObj?.phoneMenu || defaultPhoneOsMenu();
      }
      if (sess.state === "test_ask_tv") return flowObj?.tvMenu || null;
      if (sess.state === "test_ask_app") {
        return findAppMenu(sess.testAppMenuId)?.menu || null;
      }
      if (sess.state === "test_offer_plan") return flowObj?.offerMenu || null;
      return null;
    };

    const goBackTest = async (sess: Session) => {
      if (sess.state === "test_ask_phone_os") {
        sessions[phone] = {
          ...sess,
          state: "test_ask_device",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await sendMenu(
          flowObj?.deviceMenu,
          { hours: sess.testHours || testHours },
          { allowBack: false },
        );
        return json({ ok: true, action: "test_back_device" });
      }
      if (
        sess.state === "test_ask_tv" ||
        sess.state === "test_await_mac" ||
        sess.state === "test_confirm_install"
      ) {
        if (
          (sess.state === "test_await_mac" ||
            sess.state === "test_confirm_install") &&
          sess.testAppMenuId
        ) {
          sessions[phone] = {
            ...sess,
            state: "test_ask_app",
            updatedAt: new Date().toISOString(),
          };
          await persistState();
          await sendMenu(findAppMenu(sess.testAppMenuId)?.menu, {
            hours: sess.testHours || testHours,
          });
          return json({ ok: true, action: "test_back_app" });
        }
        if (
          sess.state === "test_await_mac" ||
          sess.state === "test_confirm_install"
        ) {
          sessions[phone] = {
            ...sess,
            state: "test_ask_tv",
            updatedAt: new Date().toISOString(),
          };
          await persistState();
          await sendMenu(flowObj?.tvMenu, {
            hours: sess.testHours || testHours,
          });
          return json({ ok: true, action: "test_back_tv" });
        }
        sessions[phone] = {
          ...sess,
          state: "test_ask_device",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await sendMenu(
          flowObj?.deviceMenu,
          { hours: sess.testHours || testHours },
          { allowBack: false },
        );
        return json({ ok: true, action: "test_back_device" });
      }
      if (sess.state === "test_ask_app") {
        sessions[phone] = {
          ...sess,
          state: "test_ask_tv",
          testAppMenuId: undefined,
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await sendMenu(flowObj?.tvMenu, {
          hours: sess.testHours || testHours,
        });
        return json({ ok: true, action: "test_back_tv" });
      }
      if (sess.state === "test_ask_device") {
        sessions[phone] = {
          ...sess,
          state: "test_ask_name",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send(
          tfTexts.askName || DEFAULT_MESSAGES.testAskName,
        );
        return json({ ok: true, action: "test_back_name" });
      }
      if (sess.state === "test_ask_name") {
        sessions[phone] = {
          ...sess,
          state: "idle",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send("Ok. Quando quiser, digite *teste*.");
        return json({ ok: true, action: "test_back_idle" });
      }
      sessions[phone] = {
        ...sess,
        state: "idle",
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await send("Ok. Quando quiser, digite *teste*.");
      return json({ ok: true, action: "test_back_idle" });
    };

    const sendAlreadyUsedOrOffer = async (opts?: {
      includeAlreadyUsed?: boolean;
    }) => {
      const used = findTestConsumed(phone);
      const sess: Session = {
        ...sessions[phone],
        state: "idle",
        testUsername: used?.username || sessions[phone]?.testUsername,
        testDoneAt: used?.at || sessions[phone]?.testDoneAt,
        testClientName: used?.name || sessions[phone]?.testClientName,
        testRemoteId: used?.remoteId || sessions[phone]?.testRemoteId,
        updatedAt: new Date().toISOString(),
      };
      sessions[phone] = sess;
      await persistState();
      if (sess.testUsername) {
        if (opts?.includeAlreadyUsed !== false) {
          await send(
            tfTexts.alreadyUsed || DEFAULT_MESSAGES.testAlreadyUsed,
          );
        }
        return await sendTestOfferPlan(sess);
      }
      await send(tfTexts.alreadyUsed || DEFAULT_MESSAGES.testAlreadyUsed);
      await send(
        "Para assinar ou tirar dúvidas, escreva *atendente*.",
      );
      return json({ ok: true, action: "test_already_used" });
    };

    const startTestAskName = async () => {
      if (!flowObj || !testPhrase) {
        await send(
          tfTexts.notConfigured ||
            "Fluxo de teste não configurado nesta conta.",
        );
        return json({ ok: true, action: "test_not_configured" });
      }
      if (findTestConsumed(phone)) {
        // Já usou o teste → não abre outro; avisa e oferece o plano.
        return await sendAlreadyUsedOrOffer({ includeAlreadyUsed: true });
      }
      sessions[phone] = {
        state: "test_ask_name",
        role: "unknown",
        testHours,
        testClientName: undefined,
        testUsername: undefined,
        testPassword: undefined,
        testRemoteId: undefined,
        testDoneAt: undefined,
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await send(
        tfTexts.askName || DEFAULT_MESSAGES.testAskName,
      );
      return json({ ok: true, action: "test_ask_name" });
    };

    const startTestDeviceAsk = async (sess?: Session) => {
      if (!flowObj || !testPhrase) {
        await send(
          tfTexts.notConfigured ||
            "Fluxo de teste não configurado nesta conta.",
        );
        return json({ ok: true, action: "test_not_configured" });
      }
      const base = sess || sessions[phone] || {};
      sessions[phone] = {
        ...base,
        state: "test_ask_device",
        role: base.role || "unknown",
        testHours: base.testHours || testHours,
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await sendMenu(
        flowObj.deviceMenu,
        { hours: testHours },
        { allowBack: false },
      );
      return json({ ok: true, action: "test_ask_device" });
    };

    const sendTestOfferPlan = async (sess: Session) => {
      if (!flowObj) {
        await send(
          tfTexts.notConfigured || "Fluxo de teste não configurado.",
        );
        return json({ ok: true, action: "test_not_configured" });
      }
      const userLogin = String(
        sess.testUsername || sess.panelUsername || "",
      ).trim();
      sessions[phone] = {
        ...sess,
        state: "test_offer_plan",
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      await sendMenu(flowObj.offerMenu, {
        user: userLogin || "seu teste",
        amount: moneyBrl(testMonthPrice),
        hours: sess.testHours || testHours,
      });
      return json({ ok: true, action: "test_offer_plan" });
    };

    /**
     * Ativa o MAC no app (FunPlay/Prime) e agenda o check-in pós-teste.
     * Compartilhado entre o estado test_await_mac e a confirmação de
     * instalação (quando o cliente já manda o MAC sem responder sim/não).
     */
    const activateMacForSession = async (sess: Session, rawMac: string) => {
      const mac = normalizeMacWa(rawMac);
      if (!mac) {
        await send(tfTexts.macInvalid || "MAC inválido");
        await send("_Digite o MAC, *voltar* para o menu ou *atendente*._");
        return json({ ok: true, action: "test_mac_invalid" });
      }
      const app = sess.testApp === "prime" ? "prime" : "fun";
      const username = String(sess.testUsername || "").trim();
      const password = String(sess.testPassword || "").trim();
      if (!username || !password) {
        throw new Error(
          "Teste sem usuário/senha. Digite *voltar* e escolha o app de novo.",
        );
      }
      bearer = await ensurePanelBearer(client, userId, automations);
      await activatePartnerAppWa(bearer, app, username, password, mac);
      const checkInId = crypto.randomUUID();
      const doneAt = new Date().toISOString();
      sessions[phone] = {
        ...sess,
        state: "idle",
        testDoneAt: doneAt,
        macCheckInId: checkInId,
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      const isRoku = sess.testTv === "roku";
      await send(
        fill(pickMacOkTemplate(tfTexts, isRoku), {
          mac,
          hours: sess.testHours || testHours,
          app: app === "fun" ? "FunPlay" : "Prime IPTV",
        }),
      );
      scheduleMacCheckIn(checkInId);
      return json({ ok: true, action: "test_mac_ok" });
    };

    const finishTestWithApp = async (
      sess: Session,
      app: "fun" | "prime" | "xcloud",
    ) => {
      bearer = await ensurePanelBearer(client, userId, automations);
      const hours = Number(sess.testHours) || testHours;
      let username = String(sess.testUsername || "").trim();
      let password = String(sess.testPassword || "").trim();
      let remoteId = sess.testRemoteId;
      if (!username || !password) {
        const clientName = String(sess.testClientName || "").trim();
        if (!clientName) {
          return await startTestAskName();
        }
        const created = await createUniplayTestUser(
          bearer,
          hours,
          phone,
          defaultPackage,
          clientName,
        );
        username = created.username;
        password = created.password;
        remoteId = created.remoteId;
        markTestConsumed(phone, {
          at: new Date().toISOString(),
          username,
          name: clientName,
          remoteId,
        });
        await logWhatsAppTest({
          username,
          password,
          name: clientName,
          remoteId,
          hours,
        });
      }
      const baseSess: Session = {
        ...sess,
        role: sess.role || "unknown",
        testUsername: username,
        testPassword: password,
        testRemoteId: remoteId,
        testApp: app,
        testHours: hours,
        panelUsername: username,
        updatedAt: new Date().toISOString(),
      };
      if (app === "xcloud") {
        const doneAt = new Date().toISOString();
        markTestConsumed(phone, {
          at: doneAt,
          username,
          name: String(sess.testClientName || "").trim() || undefined,
          remoteId,
        });
        await logWhatsAppTest({
          username,
          password,
          name: String(sess.testClientName || "").trim() || undefined,
          remoteId,
          hours,
        });
        sessions[phone] = {
          ...baseSess,
          state: "test_confirm_install",
        };
        await persistState();
        await send(
          fill(
            tfTexts.xcloudReady || "XCloud · uniplay · {user} / {password}",
            { user: username, password, hours },
          ),
        );
        await send(tfTexts.confirmInstall || DEFAULT_MESSAGES.testConfirmInstall);
        return json({ ok: true, action: "test_confirm_install" });
      }
      sessions[phone] = { ...baseSess, state: "test_confirm_install" };
      await persistState();
      const tpl = app === "fun" ? tfTexts.funReady : tfTexts.primeReady;
      const askMacFallback =
        app === "fun"
          ? DEFAULT_MESSAGES.testAppFunReady
          : DEFAULT_MESSAGES.testAppPrimeReady;
      await send(
        fill(tpl || askMacFallback, {
          user: username,
          password,
          hours,
        }),
      );
      await send(tfTexts.confirmInstall || DEFAULT_MESSAGES.testConfirmInstall);
      return json({ ok: true, action: "test_confirm_install" });
    };

    const finishTestPcPhone = async (
      sess: Session,
      device: "pc" | "phone_android" | "phone_ios",
    ) => {
      const clientName = String(sess.testClientName || "").trim();
      if (!clientName) {
        return await startTestAskName();
      }
      bearer = await ensurePanelBearer(client, userId, automations);
      const hours = Number(sess.testHours) || testHours;
      const created = await createUniplayTestUser(
        bearer,
        hours,
        phone,
        defaultPackage,
        clientName,
      );
      const doneAt = new Date().toISOString();
      markTestConsumed(phone, {
        at: doneAt,
        username: created.username,
        name: clientName,
        remoteId: created.remoteId,
      });
      await logWhatsAppTest({
        username: created.username,
        password: created.password,
        name: clientName,
        remoteId: created.remoteId,
        hours,
      });
      const testDevice: "pc" | "phone" =
        device === "pc" ? "pc" : "phone";
      sessions[phone] = {
        ...sess,
        state: "test_confirm_install",
        role: sess.role || "unknown",
        testDevice,
        testUsername: created.username,
        testPassword: created.password,
        testRemoteId: created.remoteId,
        testHours: hours,
        panelUsername: created.username,
        updatedAt: new Date().toISOString(),
      };
      await persistState();
      const loginUrl =
        String(flowObj?.pcLoginUrl || "").trim() ||
        "http://navegauni.top/login";
      const apkUrl =
        String(flowObj?.phoneApkUrl || "").trim() || DEFAULT_PHONE_APK;
      const iosAppUrl =
        String(flowObj?.phoneIosUrl || "").trim() || DEFAULT_PHONE_IOS;
      if (device === "pc") {
        await send(
          fill(
            tfTexts.pcReady ||
              "Abra {loginUrl}\nUsuário: *{user}*\nSenha: *{password}*",
            {
              user: created.username,
              password: created.password,
              hours,
              loginUrl,
            },
          ),
        );
        await send(tfTexts.confirmInstall || DEFAULT_MESSAGES.testConfirmInstall);
        return json({ ok: true, action: "test_confirm_install" });
      }
      if (device === "phone_ios") {
        await send(
          fill(
            tfTexts.phoneIosReady || DEFAULT_MESSAGES.testPhoneIosReady,
            {
              user: created.username,
              password: created.password,
              hours,
              iosApp: iosAppUrl,
              dns: dnsSmartersDefault,
              name: clientName,
            },
          ),
        );
        await send(tfTexts.confirmInstall || DEFAULT_MESSAGES.testConfirmInstall);
        return json({ ok: true, action: "test_confirm_install" });
      }
      await send(
        fill(
          tfTexts.phoneReady || DEFAULT_MESSAGES.testPhoneReady,
          {
            user: created.username,
            password: created.password,
            hours,
            apk: apkUrl,
          },
        ),
      );
      await send(tfTexts.confirmInstall || DEFAULT_MESSAGES.testConfirmInstall);
      return json({ ok: true, action: "test_confirm_install" });
    };

    const askPlanScreenMac = async (sess: Session) => {
      const total = Math.max(1, Number(sess.activationsTotal) || 1);
      const done = Math.max(0, Number(sess.activationsDone) || 0);
      const next = done + 1;
      const appName = sess.testApp === "prime" ? "Prime IPTV" : "FunPlay";
      await send(
        `Seu plano inclui *${total} telas*. A *1ª* já foi no teste.\n\n` +
          `Envie o *MAC* da *${next}ª tela* no *${appName}*.\n` +
          `(${done} de ${total} prontas)\n\n` +
          `_Formatos: *aa:bb:cc:dd:ee:ff* ou *aabbccddeeff*.\n` +
          `Digite *pular* para encerrar, ou *atendente*._`,
      );
    };

    const runTestAction = async (
      sess: Session,
      action: string,
      nextMenuId?: string,
      meta?: { amountBrl?: number; screens?: number },
    ) => {
      if (action === "ask_tv") {
        sessions[phone] = {
          ...sess,
          state: "test_ask_tv",
          testDevice: "tv",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await sendMenu(flowObj!.tvMenu, {
          hours: sess.testHours || testHours,
        });
        return json({ ok: true, action: "test_ask_tv" });
      }
      if (action === "pc") return await finishTestPcPhone(sess, "pc");
      if (action === "phone") {
        sessions[phone] = {
          ...sess,
          state: "test_ask_phone_os",
          testDevice: "phone",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await sendMenu(flowObj?.phoneMenu || defaultPhoneOsMenu(), {
          hours: sess.testHours || testHours,
        });
        return json({ ok: true, action: "test_ask_phone_os" });
      }
      if (action === "phone_android") {
        return await finishTestPcPhone(sess, "phone_android");
      }
      if (action === "phone_ios") {
        return await finishTestPcPhone(sess, "phone_ios");
      }
      if (action === "ask_app") {
        const menu = findAppMenu(nextMenuId);
        if (!menu?.menu) {
          await send(
            messages.errorGeneric || "Submenu de apps não configurado.",
          );
          return json({ ok: false, error: "app_menu_missing" });
        }
        sessions[phone] = {
          ...sess,
          state: "test_ask_app",
          testAppMenuId: menu.id,
          testDevice: "tv",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await sendMenu(menu.menu, { hours: sess.testHours || testHours });
        return json({ ok: true, action: "test_ask_app" });
      }
      if (action === "back") return await goBackTest(sess);
      if (action === "app_fun") return await finishTestWithApp(sess, "fun");
      if (action === "app_prime") return await finishTestWithApp(sess, "prime");
      if (action === "app_xcloud") {
        return await finishTestWithApp(sess, "xcloud");
      }
      if (action === "human") {
        setHumanPaused(phone, true);
        sessions[phone] = {
          ...sess,
          state: "human",
          humanBusySent: false,
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send(
          messages.problemHuman || "Vou te passar para nossos atendentes.",
        );
        try {
          await enqueueHumanAlert(client, userId, phone, "unknown");
          const notif =
            (await getSetting<{
              enabled?: boolean;
              whatsappHumanEnabled?: boolean;
            }>(client, `notif_settings_user_${userId}`)) || {};
          if (
            notif.enabled !== false &&
            notif.whatsappHumanEnabled !== false
          ) {
            await notifyOwnerHumanHandoff(
              apiBaseUrl,
              apiKey,
              instance,
              phone,
              "unknown",
            );
          }
        } catch {
          /* ignore */
        }
        return json({ ok: true, action: "test_human" });
      }
      if (action === "activate_month") {
        if (!bearer) throw new Error("UniPlay desconectada");
        const username = String(sess.testUsername || "").trim();
        if (!username) throw new Error("Teste sem usuário");
        const planAmount = (() => {
          const fromOpt = Number(meta?.amountBrl);
          if (Number.isFinite(fromOpt) && fromOpt >= 1) {
            return Math.round(fromOpt * 100) / 100;
          }
          return testMonthPrice;
        })();
        let remoteId = sess.testRemoteId;
        if (remoteId == null || remoteId === "") {
          remoteId = (await findUniplayUserId(bearer, username)) ?? undefined;
        }
        if (remoteId == null || remoteId === "") {
          throw new Error("Usuário do teste não encontrado no painel");
        }
        // NÃO renovar no UniPlay antes do PIX — só após pagamento confirmado
        const screens = (() => {
          const s = Number(meta?.screens);
          if (Number.isFinite(s) && s >= 1) return Math.min(10, Math.floor(s));
          return 1;
        })();
        if (!mpToken || !mpEmail) {
          await send(
            "PIX não configurado. Peça ao responsável para ligar o Mercado Pago nas Automações, ou escreva *atendente*.",
          );
          return json({ ok: false, error: "mp_missing" });
        }
        await send(
          fill(pickActivatedMonthTemplate(tfTexts), {
            user: username,
            amount: moneyBrl(planAmount),
          }),
        );
        try {
          const ordersKey = `mp_orders_user_${userId}`;
          const bag =
            (await getSetting<{ orders?: unknown[] }>(client, ordersKey)) || {
              orders: [],
            };
          const found = findValidPendingMpOrder(
            Array.isArray(bag.orders) ? bag.orders : [],
            { panelUsername: username },
          );
          let orders = found.orders;
          if (found.pending?.pixCopyPaste) {
            if (orders.length !== (bag.orders as unknown[])?.length) {
              await putSetting(client, ordersKey, { orders: orders.slice(0, 200) });
            }
            await send(messages.pixAlreadyOpen || "Já existe PIX.");
            await send(String(found.pending.pixCopyPaste));
            sessions[phone] = {
              ...sess,
              testRemoteId: remoteId,
              state: "idle",
              updatedAt: new Date().toISOString(),
            };
            await persistState();
            return json({ ok: true, action: "test_pix_exists" });
          }
          const pix = await createMpPix({
            accessToken: mpToken,
            amount: planAmount,
            email: mpEmail,
            externalReference: `auxplus_test_${userId}_${username}_${Date.now()}`,
            description: `Plano teste ${username} · ${moneyBrl(planAmount)}`,
          });
          const order = {
            id: `mp_${Date.now().toString(36)}`,
            mpPaymentId: pix.id,
            status: "pending",
            itemRefId: "",
            clientName: username,
            panelUsername: username,
            phone,
            months: 1,
            credits: 1,
            amount: planAmount,
            pixCopyPaste: pix.qr_code,
            kind: "test_activate",
            screens,
            testApp: sess.testApp || "",
            testPassword: String(sess.testPassword || ""),
            testRemoteId: remoteId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: pix.date_of_expiration,
          };
          await putSetting(client, ordersKey, {
            orders: [order, ...orders].slice(0, 200),
          });
          await send(pix.qr_code);
        } catch {
          await send(
            "Não consegui gerar o PIX agora. Fale com o atendente (" +
              moneyBrl(planAmount) +
              ").",
          );
          return json({ ok: false, error: "pix_failed" });
        }
        sessions[phone] = {
          ...sess,
          testRemoteId: remoteId,
          state: "idle",
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        return json({ ok: true, action: "test_pix_pending" });
      }
      await send(messages.errorGeneric || "Opção inválida.");
      return json({ ok: true, action: "test_bad_action" });
    };

    // Teste: frase do site OU só "teste" (pessoa não sabe a frase longa).
    // Cliente já cadastrado → menu de renovação (não mistura com teste).
    const wantsTest =
      waNorm(text) === "teste" ||
      (Boolean(testPhrase) &&
        (waNorm(text) === waNorm(testPhrase) ||
          text.trim() === testPhrase));
    if (
      wantsTest &&
      (testPhrase || flowObj) &&
      !clientItem &&
      !resellerItem
    ) {
      try {
        bearer = await ensurePanelBearer(client, userId, automations);
        if (!flowObj) {
          await send(
            tfTexts.notConfigured ||
              "Fluxo de teste não configurado nesta conta.",
          );
          return json({ ok: true, action: "test_not_configured" });
        }
        const used = findTestConsumed(phone);
        if (used || (session.testUsername && session.testDoneAt)) {
          // Pediu um NOVO teste depois de já ter usado → "já usou" + oferta.
          return await sendAlreadyUsedOrOffer({ includeAlreadyUsed: true });
        }
        return await startTestAskName();
      } catch (e) {
        await send(
          e instanceof Error
            ? e.message
            : messages.errorGeneric || "Falha no teste",
        );
        return json({ ok: false, error: String(e) });
      }
    }

    // Contato que já testou manda qualquer coisa fora de menu.
    // Só reage quando é retorno de verdade: resposta ao check-in pós-teste,
    // interesse em assinar ou contato voltando depois do cooldown.
    // "Você já usou o teste" NÃO é enviado aqui — só quando pede um novo teste.
    if (
      flowObj &&
      !testFlowStates.has(String(session.state || "")) &&
      !clientItem &&
      !resellerItem &&
      (findTestConsumed(phone) ||
        (session.testUsername && session.testDoneAt))
    ) {
      // Pediu atendente → faz health check do painel antes de encaminhar
      if (wantsAttendant) {
        // Health check rápido (sem bloquear)
        const panelOk = await isPanelHealthy();

        // Mensagem dinâmica baseada no status do painel
        const statusMsg = getPanelStatusMessage(panelOk);
        await send(statusMsg);

        // Se painel está offline, registra cliente para notificação posterior
        if (!panelOk) {
          // Registra cliente que reportou problema (tipo: assistência)
          await reportClientProblem(
            client,
            userId,
            phone,
            clientItem?.name || resellerItem?.name,
            'assist'  // Problema tipo: assistência
          );
          return json({ ok: true, action: "problem_panel_offline" });
        }

        // Painel online → transfere para atendimento humano
        setHumanPaused(phone, true);
        sessions[phone] = {
          ...session,
          state: "human",
          role: "unknown",
          humanBusySent: false,
          updatedAt: new Date().toISOString(),
        };
        await persistState();

        try {
          await enqueueHumanAlert(client, userId, phone, "unknown");
          const notif =
            (await getSetting<{
              enabled?: boolean;
              whatsappHumanEnabled?: boolean;
            }>(client, `notif_settings_user_${userId}`)) || {};
          if (
            notif.enabled !== false &&
            notif.whatsappHumanEnabled !== false
          ) {
            await notifyOwnerHumanHandoff(
              apiBaseUrl,
              apiKey,
              instance,
              phone,
              "unknown",
            );
          }
        } catch {
          /* alerta não bloqueia o handoff */
        }
        return json({ ok: true, action: "human" });
      }
      const used = findTestConsumed(phone);
      const lastTestAt = used?.at || session.testDoneAt;
      const fresh =
        Boolean(lastTestAt) &&
        Date.now() - new Date(lastTestAt as string).getTime() <
          TEST_RETURN_COOLDOWN_MS;
      // Interesse claro em assinar → oferta do plano (sem o "já usou")
      if (looksLikeSubIntent(text)) {
        return await sendAlreadyUsedOrOffer({ includeAlreadyUsed: false });
      }
      if (hadPendingCheckIn || fresh) {
        // Resposta ao check-in pós-teste ("conseguiu assistir?") → reage
        const cls = classifyTestResponse(text);
        if (cls === "positive") {
          await send(
            fill(tfTexts.checkInOk || DEFAULT_MESSAGES.testCheckInOk, {
              hours: session.testHours || testHours,
            }),
          );
          return json({ ok: true, action: "test_checkin_ok" });
        }
        if (cls === "negative") {
          await send(tfTexts.checkInNo || DEFAULT_MESSAGES.testCheckInNo);
          return json({ ok: true, action: "test_checkin_no" });
        }
        // Neutro pouco depois do teste → não incomoda
        return json({ ok: true, action: "idle_silent" });
      }
      // Contato voltando depois do cooldown → oferta do plano (sem "já usou")
      return await sendAlreadyUsedOrOffer({ includeAlreadyUsed: false });
    }

    // Fluxo guiado de teste (menus editáveis da conta)
    if (flowObj && testFlowStates.has(String(session.state || ""))) {
      try {
        // Atalhos globais no fluxo
        if (
          t === "voltar" ||
          t === "volta" ||
          t === "0" ||
          t === "menu" ||
          t === "voltar menu"
        ) {
          return await goBackTest(session);
        }
        if (wantsAttendant || t === "atendente" || t === "atendentes") {
          return await runTestAction(session, "human");
        }

        if (session.state === "test_ask_name") {
          const name = sanitizeTestClientName(text);
          if (!name) {
            await send(
              "Não entendi o nome.\n\n" +
                (tfTexts.askName || DEFAULT_MESSAGES.testAskName),
            );
            return json({ ok: true, action: "test_ask_name_retry" });
          }
          const nextSess: Session = {
            ...session,
            testClientName: name,
            state: "test_ask_device",
            updatedAt: new Date().toISOString(),
          };
          sessions[phone] = nextSess;
          await persistState();
          return await startTestDeviceAsk(nextSess);
        }

        if (session.state === "test_await_mac") {
          if (!looksLikeMacMessage(text)) {
            await send(tfTexts.macInvalid || "MAC inválido");
            await send(
              "_Digite o MAC, *voltar* para o menu ou *atendente*._",
            );
            return json({ ok: true, action: "test_mac_invalid" });
          }
          return await activateMacForSession(session, text);
        }

        if (session.state === "test_confirm_install") {
          const isMacApp =
            session.testApp === "fun" || session.testApp === "prime";
          // Já mandou o MAC direto (pulou o sim/não) → ativa
          if (isMacApp && looksLikeMacMessage(text)) {
            return await activateMacForSession(session, text);
          }
          const cls = classifyTestResponse(text);
          if (cls === "positive") {
            if (isMacApp) {
              sessions[phone] = {
                ...session,
                state: "test_await_mac",
                updatedAt: new Date().toISOString(),
              };
              await persistState();
              await send(
                tfTexts.macPrompt || DEFAULT_MESSAGES.testMacPrompt,
              );
              return json({ ok: true, action: "test_confirm_install_ok_mac" });
            }
            // XCloud / PC / celular: sem MAC — teste no ar + check-in
            const doneAt = new Date().toISOString();
            const checkInId = crypto.randomUUID();
            sessions[phone] = {
              ...session,
              state: "idle",
              testDoneAt: doneAt,
              macCheckInId: checkInId,
              updatedAt: new Date().toISOString(),
            };
            await persistState();
            await send(
              fill(
                tfTexts.confirmInstallOk ||
                  DEFAULT_MESSAGES.testConfirmInstallOk,
                { hours: session.testHours || testHours },
              ),
            );
            scheduleMacCheckIn(checkInId);
            return json({ ok: true, action: "test_confirm_install_ok" });
          }
          if (cls === "negative") {
            sessions[phone] = {
              ...session,
              state: "idle",
              updatedAt: new Date().toISOString(),
            };
            await persistState();
            await send(
              tfTexts.confirmInstallNo ||
                DEFAULT_MESSAGES.testConfirmInstallNo,
            );
            return json({ ok: true, action: "test_confirm_install_no" });
          }
          // Sem resposta clara → repete a pergunta
          await send(tfTexts.confirmInstall || DEFAULT_MESSAGES.testConfirmInstall);
          return json({ ok: true, action: "test_confirm_install_retry" });
        }

        if (session.state === "test_plan_await_mac") {
          const tSkip = waNorm(text);
          if (tSkip === "pular" || tSkip === "pula" || tSkip === "skip") {
            sessions[phone] = {
              ...session,
              state: "idle",
              updatedAt: new Date().toISOString(),
            };
            await persistState();
            await send(
              "Ok, encerrei as ativações por aqui. Se precisar de outra tela, escreva *atendente*.",
            );
            return json({ ok: true, action: "test_plan_mac_skip" });
          }
          if (!looksLikeMacMessage(text)) {
            await send(tfTexts.macInvalid || "MAC inválido");
            await askPlanScreenMac(session);
            return json({ ok: true, action: "test_plan_mac_invalid" });
          }
          const mac = normalizeMacWa(text);
          if (!mac) {
            await send(tfTexts.macInvalid || "MAC inválido");
            await askPlanScreenMac(session);
            return json({ ok: true, action: "test_plan_mac_invalid" });
          }
          const app = session.testApp === "prime" ? "prime" : "fun";
          const username = String(session.testUsername || "").trim();
          const password = String(session.testPassword || "").trim();
          if (!username || !password) {
            throw new Error(
              "Sem usuário/senha do teste. Escreva *atendente*.",
            );
          }
          bearer = await ensurePanelBearer(client, userId, automations);
          await activatePartnerAppWa(bearer, app, username, password, mac);
          const total = Math.max(1, Number(session.activationsTotal) || 1);
          const done = Math.max(0, Number(session.activationsDone) || 0) + 1;
          const isRoku = session.testTv === "roku";
          await send(
            fill(pickMacOkTemplate(tfTexts, isRoku), {
              mac,
              hours: session.testHours || testHours,
              app: app === "fun" ? "FunPlay" : "Prime IPTV",
            }),
          );
          if (done < total) {
            const nextSess: Session = {
              ...session,
              activationsDone: done,
              state: "test_plan_await_mac",
              updatedAt: new Date().toISOString(),
            };
            sessions[phone] = nextSess;
            await persistState();
            await askPlanScreenMac(nextSess);
            return json({ ok: true, action: "test_plan_mac_next" });
          }
          sessions[phone] = {
            ...session,
            activationsDone: done,
            state: "idle",
            updatedAt: new Date().toISOString(),
          };
          await persistState();
          await send(
            `✅ *${done}/${total}* tela${done > 1 ? "s" : ""} ativada${done > 1 ? "s" : ""} no plano.\n\nBom proveito! Qualquer coisa, mande mensagem.`,
          );
          return json({ ok: true, action: "test_plan_mac_done" });
        }

        let menu: FlowMenu | null = currentTestMenu(session);
        if (!menu) {
          await send(
            "Menu não encontrado. Digite *teste* ou *atendente*.",
          );
          return json({ ok: false, error: "menu_missing" });
        }

        const menuForMatch = withNavOptions(menu, {
          allowBack: session.state !== "test_ask_device",
        });
        const opt = matchTestOption(text, menuForMatch.options);
        if (!opt) {
          await sendMenu(menu, {
            hours: session.testHours || testHours,
            user: session.testUsername || "",
            amount: moneyBrl(testMonthPrice),
          }, { allowBack: session.state !== "test_ask_device" });
          return json({ ok: true, action: "test_menu_repeat" });
        }
        let sessForAction = session;
        if (session.state === "test_ask_tv") {
          const tv = inferTestTvFromOption(opt);
          if (tv) {
            sessForAction = {
              ...session,
              testTv: tv,
              updatedAt: new Date().toISOString(),
            };
            sessions[phone] = sessForAction;
            await persistState();
          }
        }
        const amountRaw = Number(
          (opt as { amountBrl?: unknown }).amountBrl,
        );
        const screensRaw = Number(
          (opt as { screens?: unknown }).screens,
        );
        return await runTestAction(
          sessForAction,
          String(opt.action || ""),
          opt.nextMenuId != null ? String(opt.nextMenuId) : undefined,
          {
            amountBrl:
              Number.isFinite(amountRaw) && amountRaw > 0
                ? Math.round(amountRaw * 100) / 100
                : undefined,
            screens:
              Number.isFinite(screensRaw) && screensRaw >= 1
                ? Math.min(10, Math.floor(screensRaw))
                : undefined,
          },
        );
      } catch (e) {
        const raw =
          e instanceof Error
            ? e.message
            : messages.errorGeneric || "Falha no teste";
        const errMsg = /bloqueou a nuvem|Proxy API|UniPlay 404/i.test(raw)
          ? "Não consegui liberar o teste agora (painel UniPlay indisponível da nuvem). Peça ao dono para conferir o *Proxy API* em Automações, ou escreva *atendente*."
          : raw;
        await send(
          `${errMsg}\n\n_Digite *voltar* para tentar de novo ou *atendente* para falar com a equipe._`,
        );
        // Mantém no menu atual para nova tentativa
        const menu = currentTestMenu(session);
        if (menu && session.state !== "test_await_mac") {
          await sendMenu(menu, {
            hours: session.testHours || testHours,
            user: session.testUsername || "",
            amount: moneyBrl(testMonthPrice),
          }, { allowBack: session.state !== "test_ask_device" });
        }
        return json({ ok: false, error: String(e) });
      }
    }

    // Revendedor
    if (resellerItem && String(resellerItem.folder_id) === syncResellersFolderId) {
      if (session.state !== "reseller_offer") {
        sessions[phone] = {
          state: "reseller_offer",
          role: "reseller",
          itemRefId: String(resellerItem.id),
          panelUsername: String(resellerItem.item_id || ""),
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send(
          fill(
            messages.resellerOffer ||
              "Digite 1 para {credits} créditos por {amount}",
            {
              user: resellerItem.item_id,
              credits: resellerPackageCredits,
              amount: moneyBrl(resellerPackageAmount),
            },
          ),
        );
        return json({ ok: true, action: "reseller_offer" });
      }

      if (wantsAttendant) {
        setHumanPaused(phone, true);
        sessions[phone] = {
          state: "human",
          role: "reseller",
          humanBusySent: false,
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send(
          messages.problemHuman ||
            "Vou te passar para nossos atendentes.",
        );
        try {
          await enqueueHumanAlert(client, userId, phone, "reseller");
          const notif =
            (await getSetting<{
              enabled?: boolean;
              whatsappHumanEnabled?: boolean;
            }>(client, `notif_settings_user_${userId}`)) || {};
          if (notif.enabled !== false && notif.whatsappHumanEnabled !== false) {
            await notifyOwnerHumanHandoff(
              apiBaseUrl,
              apiKey,
              instance,
              phone,
              "reseller",
            );
          }
        } catch {
          /* alerta não bloqueia o handoff */
        }
        return json({ ok: true, action: "human" });
      }

      if (buyKeys.some((k) => t === k || t.includes(k))) {
        try {
          if (!mpToken || !mpEmail) throw new Error("Mercado Pago não configurado");
          const credits = resellerPackageCredits;
          const amount = resellerPackageAmount;
          const ordersKey = `mp_orders_user_${userId}`;
          const bag =
            (await getSetting<{ orders?: unknown[] }>(client, ordersKey)) || {
              orders: [],
            };
          const found = findValidPendingMpOrder(
            Array.isArray(bag.orders) ? bag.orders : [],
            {
              itemRefId: String(resellerItem.id),
              panelUsername: String(resellerItem.item_id || ""),
            },
          );
          let orders = found.orders;
          if (found.pending?.pixCopyPaste) {
            if (orders.length !== (Array.isArray(bag.orders) ? bag.orders.length : 0)) {
              await putSetting(client, ordersKey, { orders: orders.slice(0, 200) });
            }
            const pendingCredits = Math.max(
              1,
              Math.floor(Number(found.pending.credits) || credits),
            );
            const pendingAmount =
              Math.round((Number(found.pending.amount) || amount) * 100) / 100;
            await send(
              fill(
                "Você já tem um PIX em aberto.\n\n" +
                  "Pacote: *{credits} créditos*\n" +
                  "Valor: *{amount}*\n\n" +
                  "Use o código abaixo (válido por até 24h).\n\n" +
                  "Se quiser falar de *outro assunto*, digite *atendente*.",
                {
                  credits: pendingCredits,
                  amount: moneyBrl(pendingAmount),
                },
              ),
            );
            await send(String(found.pending.pixCopyPaste));
            return json({ ok: true, action: "pix_exists" });
          }
          const pix = await createMpPix({
            accessToken: mpToken,
            amount,
            email: mpEmail,
            externalReference: `auxplus_res_${userId}_${resellerItem.id}_${Date.now()}`,
            description: `Créditos revendedor ${resellerItem.item_id}`,
          });
          const order = {
            id: `mp_${Date.now().toString(36)}`,
            mpPaymentId: pix.id,
            status: "pending",
            itemRefId: String(resellerItem.id),
            clientName: String(resellerItem.name || resellerItem.item_id || ""),
            panelUsername: String(resellerItem.item_id || ""),
            dueDate: resellerItem.due_date,
            phone,
            months: 0,
            credits,
            amount,
            pixCopyPaste: pix.qr_code,
            kind: "reseller_credits",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: pix.date_of_expiration,
          };
          await putSetting(client, ordersKey, {
            orders: [order, ...orders].slice(0, 200),
          });
          await send(
            fill(messages.resellerPixIntro || "PIX {credits} · {amount}", {
              credits,
              amount: moneyBrl(amount),
            }),
          );
          await send(pix.qr_code);
          sessions[phone] = {
            ...sessions[phone],
            state: "idle",
            updatedAt: new Date().toISOString(),
          };
          await persistState();
          return json({ ok: true, action: "reseller_pix" });
        } catch (e) {
          await send(
            messages.errorGeneric ||
              (e instanceof Error ? e.message : "Erro"),
          );
          return json({ ok: false, error: String(e) });
        }
      }
    }

    // Cliente conhecido
    if (clientItem && String(clientItem.folder_id) !== syncResellersFolderId) {
      if (session.state !== "ask_intent") {
        sessions[phone] = {
          state: "ask_intent",
          role: "client",
          itemRefId: String(clientItem.id),
          panelUsername: String(clientItem.item_id || ""),
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send(
          fillClientAskIntent(
            messages.askIntent || DEFAULT_MESSAGES.askIntent,
            {
              user: clientItem.item_id,
              dueDate: clientItem.due_date,
            },
          ),
        );
        return json({ ok: true, action: "ask_intent" });
      }

      if (wantsAttendant) {
        setHumanPaused(phone, true);
        sessions[phone] = {
          state: "human",
          role: "client",
          itemRefId: String(clientItem.id),
          humanBusySent: false,
          updatedAt: new Date().toISOString(),
        };
        await persistState();
        await send(
          messages.problemHuman ||
            "Vou te passar para nossos atendentes.",
        );
        try {
          await enqueueHumanAlert(client, userId, phone, "client");
          const notif =
            (await getSetting<{
              enabled?: boolean;
              whatsappHumanEnabled?: boolean;
            }>(client, `notif_settings_user_${userId}`)) || {};
          if (notif.enabled !== false && notif.whatsappHumanEnabled !== false) {
            await notifyOwnerHumanHandoff(
              apiBaseUrl,
              apiKey,
              instance,
              phone,
              "client",
            );
          }
        } catch {
          /* alerta não bloqueia o handoff */
        }
        return json({ ok: true, action: "human" });
      }

      if (renewKeys.some((k) => t === k || t.includes(k))) {
        try {
          if (!mpToken || !mpEmail) throw new Error("Mercado Pago não configurado");
          // Multi-mês só se "Meses do plano" > 1 no cadastro; senão 1 mês / 1 crédito
          const months = resolveClientRenewMonths(
            String(clientItem.notes || ""),
          );
          const credits = creditsForPlanMonths(months);
          // Preço = valor do plano na pasta (pacote), não mensalidade × meses
          const amount = Math.round((Number(clientItem.price) || 0) * 100) / 100;
          if (amount < 1) throw new Error(`Cliente *${clientItem.item_id}* sem preço configurado na pasta. Peça ao responsável para adicionar um valor ou escreva *atendente*`);

          const ordersKey = `mp_orders_user_${userId}`;
          const bag =
            (await getSetting<{ orders?: unknown[] }>(client, ordersKey)) || {
              orders: [],
            };
          const found = findValidPendingMpOrder(
            Array.isArray(bag.orders) ? bag.orders : [],
            {
              itemRefId: String(clientItem.id),
              panelUsername: String(clientItem.item_id || ""),
            },
          );
          let orders = found.orders;
          if (found.pending?.pixCopyPaste) {
            if (orders.length !== (Array.isArray(bag.orders) ? bag.orders.length : 0)) {
              await putSetting(client, ordersKey, { orders: orders.slice(0, 200) });
            }
            const pendingMonths = Math.max(
              1,
              Math.floor(Number(found.pending.months) || months),
            );
            const pendingAmount =
              Math.round((Number(found.pending.amount) || amount) * 100) / 100;
            await send(
              fillClientRenewPix(
                messages.pixAlreadyOpen || DEFAULT_MESSAGES.pixAlreadyOpen,
                {
                  user: String(clientItem.item_id || ""),
                  due: formatDue(clientItem.due_date),
                  months: pendingMonths,
                  monthsLabel: pendingMonths === 1 ? "mês" : "meses",
                  amount: moneyBrl(pendingAmount),
                },
                clientItem.due_date,
              ),
            );
            await send(String(found.pending.pixCopyPaste));
            return json({ ok: true, action: "pix_exists" });
          }

          const stillActive = isClientStillActive(clientItem.due_date);
          await send(
            fillClientRenewPix(
              messages.renewCreatingPix || DEFAULT_MESSAGES.renewCreatingPix,
              {},
              clientItem.due_date,
            ),
          );
          const pix = await createMpPix({
            accessToken: mpToken,
            amount,
            email: mpEmail,
            externalReference: `auxplus_bot_${userId}_${clientItem.id}_${Date.now()}`,
            description: `${stillActive ? "Extensão" : "Renovação"} ${clientItem.item_id} · ${months}m`,
          });
          const order = {
            id: `mp_${Date.now().toString(36)}`,
            mpPaymentId: pix.id,
            status: "pending",
            itemRefId: String(clientItem.id),
            clientName: String(clientItem.name || clientItem.item_id || ""),
            panelUsername: String(clientItem.item_id || ""),
            dueDate: clientItem.due_date,
            phone,
            months,
            credits,
            amount,
            pixCopyPaste: pix.qr_code,
            kind: "renew",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: pix.date_of_expiration,
          };
          await putSetting(client, ordersKey, {
            orders: [order, ...orders].slice(0, 200),
          });
          await send(
            fillClientRenewPix(
              messages.renewPixIntro || DEFAULT_MESSAGES.renewPixIntro,
              {
                user: String(clientItem.item_id || ""),
                due: formatDue(clientItem.due_date),
                months,
                monthsLabel: months === 1 ? "mês" : "meses",
                amount: moneyBrl(amount),
              },
              clientItem.due_date,
            ),
          );
          await send(pix.qr_code);
          sessions[phone] = {
            state: "idle",
            role: "client",
            itemRefId: String(clientItem.id),
            updatedAt: new Date().toISOString(),
          };
          await persistState();
          return json({ ok: true, action: "renew_pix" });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          // Se for erro de configuração/cliente, passa a mensagem de erro para o cliente
          // Se for erro técnico, mostra genérico
          const isClientError = errMsg.includes("sem preço") || errMsg.includes("não configurado");
          const clientMsg = isClientError
            ? errMsg
            : (messages.errorGeneric || DEFAULT_MESSAGES.errorGeneric);
          await send(clientMsg);
          console.error(`[evolution-webhook] Erro na renovação: ${errMsg}`);
          return json({ ok: false, error: errMsg });
        }
      }

      // resposta inválida na pergunta de intenção → reenvia menu
      await send(
        fillClientAskIntent(
          messages.askIntent || DEFAULT_MESSAGES.askIntent,
          {
            user: clientItem.item_id,
            dueDate: clientItem.due_date,
          },
        ),
      );
      return json({ ok: true, action: "ask_intent_repeat" });
    }

    // Desconhecido: não aciona o robô (conversa segue normal).
    // Só responde se a frase de teste tiver sido enviada (tratada acima).
    return json({ ok: true, skipped: "unknown_silent" });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "webhook falhou" },
      500,
    );
  }
});
