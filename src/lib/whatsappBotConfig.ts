import { supabase } from "@/integrations/supabase/client";
import {
  emptyWaTestFlow,
  normalizeWaTestFlow,
  type WaTestFlowConfig,
} from "@/lib/waTestFlow";

export type { WaTestFlowConfig } from "@/lib/waTestFlow";
export {
  emptyWaTestFlow,
  exampleWaTestFlow,
  exampleTestOfferMenu,
  formatWaTestMenu,
  isWaTestFlowConfigured,
  matchWaTestOption,
  newBlankAppMenu,
  newBlankOption,
  WA_TEST_ACTION_LABELS,
} from "@/lib/waTestFlow";

/** Config editável do atendimento automático no WhatsApp. */
export interface WhatsappBotConfig {
  enabled: boolean;
  /** Frase que encerra o atendimento humano e devolve o bot */
  endHumanPhrase: string;
  /** @deprecated use testFlow.triggerPhrase — mantido na sincronização */
  testTriggerPhrase: string;
  /** @deprecated use testFlow.pcLoginUrl */
  testPcLoginUrl: string;
  /** @deprecated use testFlow.phoneApkUrl */
  testPhoneApkUrl: string;
  /** @deprecated use testFlow.phoneIosUrl */
  testPhoneIosUrl: string;
  /** Fluxo de teste editável por conta (em branco para contas novas) */
  testFlow: WaTestFlowConfig;
  messages: {
    /** Cliente conhecido: pergunta renovação ou problema */
    askIntent: string;
    /** Menu: qual é o problema? (quando cliente diz "problema") */
    askProblemKind: string;
    /** Resposta quando cliente não consegue assistir (painel online) */
    problemAssistPanelOk: string;
    /** Resposta quando cliente não consegue assistir (painel offline) */
    problemAssistPanelDown: string;
    /** Resposta quando cliente tem problema de pagamento */
    problemPayment: string;
    /** Resposta quando cliente tem outro problema */
    problemOther: string;
    /** Após escolher renovação */
    renewCreatingPix: string;
    /** Intro do PIX (placeholders: {name} {user} {due} {months} {amount}) */
    renewPixIntro: string;
    /** Cliente pediu problema (deprecated, mantém compatibilidade) */
    problemHuman: string;
    /** Dono digitou “assumir” */
    humanAssumed: string;
    /** Aviso enquanto está em atendimento humano */
    humanBusy: string;
    /** Bot voltou após “atendimento encerrado” */
    humanEnded: string;
    /** Revendedor: oferta de créditos */
    resellerOffer: string;
    /** PIX créditos (placeholders: {credits} {amount}) */
    resellerPixIntro: string;
    /** Teste criado genérico (placeholders: {user} {password} {hours} {m3u} {dns}) */
    testReady: string;
    /** Computador — link + login ({user} {password} {hours} {loginUrl}) */
    testPcReady: string;
    /** Celular — APK + UniPlay ({user} {password} {hours} {apk}) */
    testPhoneReady: string;
    /** Qual aparelho? TV / PC / celular ({hours}) */
    testAskDevice: string;
    /** Qual tipo de TV? */
    testAskTv: string;
    /** Samsung: FunPlay ou XCloud */
    testAskAppSamsung: string;
    /** Roku/LG: Prime ou XCloud */
    testAskAppRokuLg: string;
    /** FunPlay — pedir MAC ({user} {password} {hours}) */
    testAppFunReady: string;
    /** Prime IPTV — pedir MAC ({user} {password} {hours}) */
    testAppPrimeReady: string;
    /** XCloud — provedor/usuário/senha ({user} {password} {hours}) */
    testAppXcloudReady: string;
    /** MAC ativado ({mac} {hours} {app}) */
    testMacOk: string;
    /** MAC inválido */
    testMacInvalid: string;
    /** Voltou após teste — oferta 1 mês ({user} {amount}) */
    testOfferPlan: string;
    /** Intro PIX do plano após teste ({user} {amount}) — ainda sem pagamento */
    testActivatedMonth: string;
    /** Erro genérico */
    errorGeneric: string;
    /** Já existe PIX pendente */
    pixAlreadyOpen: string;
  };
  keywords: {
    renew: string[];
    problem: string[];
    resellerBuy: string[];
  };
  /** @deprecated use testFlow.monthPriceBrl */
  testMonthPriceBrl: number;
}

const KEY = "auxplus-wa-bot";
const dbKey = (userId: string) => `wa_bot_user_${userId}`;
const stateDbKey = (userId: string) => `wa_bot_state_user_${userId}`;
const instanceMapKey = (instanceName: string) =>
  `wa_instance_${instanceName.trim().toLowerCase()}`;

export function defaultWhatsappBotConfig(): WhatsappBotConfig {
  return {
    enabled: false,
    endHumanPhrase: "atendimento encerrado",
    testTriggerPhrase: "",
    testPcLoginUrl: "",
    testPhoneApkUrl: "",
    testPhoneIosUrl: "",
    testFlow: emptyWaTestFlow(),
    messages: {
      askIntent:
        "Olá! Aqui é o atendimento automático.\n\n" +
        "👤 Usuário: *{user}*\n" +
        "📅 Vencimento: *{due}*\n\n" +
        "Como posso ajudar?\n\n" +
        "*1* — {renewLabel}\n" +
        "*2* — Falar com nossos atendentes",
      askProblemKind:
        "Qual é o problema?\n\n" +
        "*1* — Não consigo assistir\n" +
        "*2* — Problema de pagamento\n" +
        "*3* — Outro assunto\n" +
        "*0* — Voltar",
      problemAssistPanelOk:
        "✅ Estou conseguindo me comunicar com os servidores.\n\n" +
        "Vou transferir você para nosso atendimento para investigar o problema.",
      problemAssistPanelDown:
        "❌ Estamos com uma instabilidade no serviço no momento.\n\n" +
        "Nossos técnicos já estão trabalhando no reparo. Tente novamente em alguns minutos.",
      problemPayment:
        "Entendi. Vou te encaminhar para nossos atendentes para ajudar com o pagamento.\n\nEm breve alguém responde por aqui.",
      problemOther:
        "Certo! Vou te encaminhar para nossos atendentes.\nEm breve alguém responde por aqui.",
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
        "*2* — Falar com nossos atendentes",
      resellerPixIntro:
        "✅ PIX de recarga\n\n" +
        "Pacote: *{credits} créditos*\n" +
        "Valor: *{amount}*\n\n" +
        "Na próxima mensagem envio o código PIX (copia e cola).",
      testReady: "",
      testPcReady: "",
      testPhoneReady: "",
      testAskDevice: "",
      testAskTv: "",
      testAskAppSamsung: "",
      testAskAppRokuLg: "",
      testAppFunReady: "",
      testAppPrimeReady: "",
      testAppXcloudReady: "",
      testMacOk: "",
      testMacInvalid: "",
      testOfferPlan: "",
      testActivatedMonth: "",
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
    },
    keywords: {
      renew: [
        "1",
        "renovacao",
        "renovação",
        "renovar",
        "estender",
        "estender vencimento",
        "extensao",
        "extensão",
        "pix",
      ],
      problem: ["atendente", "atendentes", "problema", "suporte", "ajuda", "humano"],
      resellerBuy: [
        "1",
        "credito",
        "crédito",
        "creditos",
        "créditos",
        "recarga",
        "recarregar",
        "abastecer",
      ],
    },
    testMonthPriceBrl: 0,
  };
}

function normalizeBotConfig(
  base: WhatsappBotConfig,
  parsed: Partial<WhatsappBotConfig>,
): WhatsappBotConfig {
  const messages = (() => {
    const merged = { ...base.messages, ...(parsed.messages || {}) };
    delete (merged as { unknownContact?: string }).unknownContact;
    const legacy: Partial<Record<keyof WhatsappBotConfig["messages"], string[]>> =
      {
        askIntent: [
          "Olá! Sou o atendimento automático.\n\nDigite *1* para renovação\nou *2* se estiver com problema (nossos atendentes vão te ajudar).",
          "Olá! Sou o atendimento automático.\n\nDigite *1* para renovação\nou *2* se estiver com problema (um humano vai te atender).",
          "Olá! Aqui é o atendimento automático.\n\n" +
            "👤 Usuário: *{user}*\n" +
            "📅 Vencimento: *{due}*\n\n" +
            "Como posso ajudar?\n\n" +
            "*1* — Renovar\n" +
            "Ou escreva *atendente* para falar com a equipe",
        ],
        renewCreatingPix: [
          "Certo! Gerando o PIX da renovação…",
          "Perfeito! Estou gerando o PIX da renovação…",
        ],
        renewPixIntro: [
          "PIX para renovar *{months} {monthsLabel}* de *{user}*\nVencimento atual: *{due}*\nVencimento após pagamento: *{newDue}*\nValor: *{amount}*\n\nNa próxima mensagem vai só o código PIX.",
          "✅ PIX de renovação\n\n" +
            "Usuário: *{user}*\n" +
            "Plano: *{months} {monthsLabel}*\n" +
            "Vencimento atual: *{due}*\n" +
            "Vencimento após pagamento: *{newDue}*\n" +
            "Valor: *{amount}*\n\n" +
            "Na próxima mensagem envio o código PIX (copia e cola).",
          "✅ PIX de renovação\n\n" +
            "Usuário: *{user}*\n" +
            "Vencimento atual: *{due}*\n" +
            "Vencimento após pagamento: *{newDue}*\n\n" +
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
        errorGeneric: [
          "Não consegui concluir agora. Tente de novo em instantes.",
        ],
      };
    for (const key of Object.keys(legacy) as (keyof typeof legacy)[]) {
      const olds = legacy[key] || [];
      if (olds.includes(String(merged[key] || ""))) {
        merged[key] = base.messages[key];
      }
    }
    return merged;
  })();

  const testFlow = normalizeWaTestFlow(
    (parsed as { testFlow?: unknown }).testFlow,
    messages,
    {
      triggerPhrase: parsed.testTriggerPhrase,
      monthPriceBrl: Number(parsed.testMonthPriceBrl),
      pcLoginUrl: parsed.testPcLoginUrl,
      phoneApkUrl: parsed.testPhoneApkUrl,
      phoneIosUrl: (parsed as { testPhoneIosUrl?: string }).testPhoneIosUrl,
    },
  );

  return {
    ...base,
    ...parsed,
    enabled: parsed.enabled === true,
    endHumanPhrase:
      parsed.endHumanPhrase?.trim() || base.endHumanPhrase,
    // Espelha testFlow nos campos legados (webhook / UI antiga)
    testTriggerPhrase: testFlow.triggerPhrase,
    testPcLoginUrl: testFlow.pcLoginUrl,
    testPhoneApkUrl: testFlow.phoneApkUrl,
    testPhoneIosUrl: testFlow.phoneIosUrl,
    testMonthPriceBrl: testFlow.monthPriceBrl,
    testFlow,
    messages,
    keywords: {
      renew: [
        ...new Set([
          ...(parsed.keywords?.renew?.length
            ? parsed.keywords.renew
            : base.keywords.renew),
          "estender",
          "estender vencimento",
          "extensao",
          "extensão",
        ]),
      ],
      problem: parsed.keywords?.problem?.length
        ? parsed.keywords.problem
        : base.keywords.problem,
      resellerBuy: parsed.keywords?.resellerBuy?.length
        ? parsed.keywords.resellerBuy
        : base.keywords.resellerBuy,
    },
  };
}

export function loadWhatsappBotConfig(userId: string): WhatsappBotConfig {
  const base = defaultWhatsappBotConfig();
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return base;
    return normalizeBotConfig(
      base,
      JSON.parse(raw) as Partial<WhatsappBotConfig>,
    );
  } catch {
    return base;
  }
}

function writeLocal(userId: string, config: WhatsappBotConfig) {
  localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(config));
}

export function saveWhatsappBotConfig(
  userId: string,
  config: WhatsappBotConfig,
) {
  const clean = normalizeBotConfig(defaultWhatsappBotConfig(), config);
  writeLocal(userId, clean);
  void persistRemote(userId, clean);
  return clean;
}

export async function saveWhatsappBotConfigRemote(
  userId: string,
  config: WhatsappBotConfig,
) {
  const clean = normalizeBotConfig(defaultWhatsappBotConfig(), config);
  writeLocal(userId, clean);
  await persistRemote(userId, clean);
  return clean;
}

async function persistRemote(userId: string, config: WhatsappBotConfig) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: dbKey(userId),
        value: config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* local ok */
  }
}

export async function loadWhatsappBotConfigRemote(
  userId: string,
): Promise<WhatsappBotConfig> {
  const local = loadWhatsappBotConfig(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", dbKey(userId))
      .maybeSingle();
    if (error || !data?.value) return local;
    const raw =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as Partial<WhatsappBotConfig>)
        : (data.value as Partial<WhatsappBotConfig>);
    const merged = normalizeBotConfig(defaultWhatsappBotConfig(), raw);
    writeLocal(userId, merged);
    return merged;
  } catch {
    return local;
  }
}

/** Mapeia instância Evolution → userId AuxPlus (para o webhook). */
export async function registerWaInstanceMapping(
  instanceName: string,
  userId: string,
) {
  if (!supabase || !instanceName || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: instanceMapKey(instanceName),
        value: { userId: String(userId), instanceName },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* ignore */
  }
}

export type WaBotSessionState =
  | "idle"
  | "ask_intent"
  | "ask_problem_kind"
  | "reseller_offer"
  | "human"
  | "test_ask_name"
  | "test_ask_device"
  | "test_ask_tv"
  | "test_ask_app"
  | "test_await_mac"
  | "test_confirm_install"
  | "test_plan_await_mac"
  | "test_offer_plan";

export interface WaBotSession {
  state: WaBotSessionState;
  role?: "client" | "reseller" | "unknown";
  itemRefId?: string;
  panelUsername?: string;
  resellerId?: string | number;
  /** Fluxo de teste WhatsApp */
  testUsername?: string;
  testPassword?: string;
  testRemoteId?: string | number;
  testApp?: "fun" | "prime" | "xcloud";
  testDevice?: "tv" | "pc" | "phone";
  testTv?: "box" | "android" | "roku" | "samsung" | "lg";
  testHours?: number;
  testDoneAt?: string;
  testAppMenuId?: string;
  testClientName?: string;
  activationsTotal?: number;
  activationsDone?: number;
  updatedAt: string;
}

export type WaTestConsumed = {
  at: string;
  username?: string;
  name?: string;
  remoteId?: string | number;
};

export interface WaBotStateStore {
  sessions: Record<string, WaBotSession>;
  /** Telefones em atendimento humano (bot pausado) */
  humanPaused: Record<string, boolean>;
  /** Já usou o teste — só o dono remove com "liberar teste" */
  testConsumed?: Record<string, WaTestConsumed>;
}

export function defaultWaBotState(): WaBotStateStore {
  return { sessions: {}, humanPaused: {}, testConsumed: {} };
}

export async function loadWaBotStateRemote(
  userId: string,
): Promise<WaBotStateStore> {
  if (!supabase || !userId) return defaultWaBotState();
  try {
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", stateDbKey(userId))
      .maybeSingle();
    if (!data?.value) return defaultWaBotState();
    const raw =
      typeof data.value === "string"
        ? JSON.parse(data.value)
        : data.value;
    return {
      sessions: (raw?.sessions || {}) as Record<string, WaBotSession>,
      humanPaused: (raw?.humanPaused || {}) as Record<string, boolean>,
      testConsumed: (raw?.testConsumed || {}) as Record<string, WaTestConsumed>,
    };
  } catch {
    return defaultWaBotState();
  }
}

export async function saveWaBotStateRemote(
  userId: string,
  state: WaBotStateStore,
) {
  if (!supabase || !userId) return;
  await supabase.from("platform_settings").upsert(
    {
      key: stateDbKey(userId),
      value: state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

export function fillBotTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v == null || v === "" ? "—" : String(v));
  }
  return out;
}

export { dbKey as waBotConfigDbKey, stateDbKey as waBotStateDbKey };
