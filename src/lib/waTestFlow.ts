/** Fluxo de teste WhatsApp — 100% editável por conta. */

export type WaTestOptionAction =
  | "ask_tv"
  | "pc"
  | "phone"
  | "phone_android"
  | "phone_ios"
  | "ask_app"
  | "app_fun"
  | "app_prime"
  | "app_xcloud"
  | "activate_month"
  | "human"
  | "back";

export const WA_TEST_ACTION_LABELS: Record<WaTestOptionAction, string> = {
  ask_tv: "Perguntar tipo de TV",
  pc: "Computador (link + login)",
  phone: "Perguntar Android / iPhone",
  phone_android: "Celular Android (APK + UniPlay)",
  phone_ios: "Celular iPhone (Smarters / Xtream)",
  ask_app: "Perguntar app (submenu)",
  app_fun: "App FunPlay (pedir MAC)",
  app_prime: "App Prime IPTV (pedir MAC)",
  app_xcloud: "App XCloud (usuário/senha)",
  activate_month: "Ativar plano + PIX (auto)",
  human: "Passar para atendente",
  back: "Voltar ao menu anterior",
};

export const DEFAULT_PHONE_APK_URL = "http://tie-tv.com.br/uni.apk";
export const DEFAULT_PHONE_IOS_URL =
  "https://apps.apple.com/br/app/smarters-player-lite/id1628995509";

export interface WaTestMenuOption {
  /** Número mostrado (*1*, *2*…) */
  key: string;
  /** Texto da opção */
  label: string;
  /** Palavras extras que também aceitam (separadas por vírgula) */
  keywords: string;
  action: WaTestOptionAction;
  /** Se action = ask_app, id do submenu de apps */
  nextMenuId?: string;
  /** Se action = activate_month: valor do PIX (ex.: 29.9). Vazio = monthPriceBrl do fluxo */
  amountBrl?: number;
  /**
   * Telas do plano. 1 = só mensalidade (MAC já veio no teste).
   * 2+ = pede MAC das telas extras após contratar.
   */
  screens?: number;
}

export interface WaTestMenu {
  /** Texto introdutório (as opções são montadas automaticamente) */
  message: string;
  options: WaTestMenuOption[];
}

export interface WaTestAppMenu {
  id: string;
  title: string;
  menu: WaTestMenu;
}

export interface WaTestFlowConfig {
  triggerPhrase: string;
  monthPriceBrl: number;
  pcLoginUrl: string;
  phoneApkUrl: string;
  /** Link App Store — Smarters Player Lite (iPhone) */
  phoneIosUrl: string;
  deviceMenu: WaTestMenu;
  tvMenu: WaTestMenu;
  /** Após escolher Celular: Android ou iPhone */
  phoneMenu: WaTestMenu;
  appMenus: WaTestAppMenu[];
  offerMenu: WaTestMenu;
  texts: {
    /** Pergunta o nome antes de criar o teste (nota no painel). */
    askName: string;
    funReady: string;
    primeReady: string;
    xcloudReady: string;
    macOk: string;
    /** Instruções pós-MAC só para Roku (sair do app de verdade). */
    macOkRoku: string;
    /** Check-in se o cliente não responder após ativar o MAC. */
    macCheckIn: string;
    macInvalid: string;
    /** Já usou o teste — aviso ao pedir outro teste. */
    alreadyUsed: string;
    /** Após escolher app/dispositivo — “conseguiu instalar? (sim/não)”. */
    confirmInstall: string;
    /** Resposta sim à confirmação de instalação (XCloud/PC/celular). */
    confirmInstallOk: string;
    /** Resposta não à confirmação de instalação (ajuda). */
    confirmInstallNo: string;
    /** Após “sim” no FunPlay/Prime — pedir o MAC. */
    macPrompt: string;
    /** Check-in “conseguiu assistir?” — resposta sim. */
    checkInOk: string;
    /** Check-in “conseguiu assistir?” — resposta não. */
    checkInNo: string;
    pcReady: string;
    /** Celular Android — APK + UniPlay ({user} {password} {hours} {apk}) */
    phoneReady: string;
    /** Celular iPhone — Smarters Xtream ({user} {password} {hours} {iosApp} {dns} {name}) */
    phoneIosReady: string;
    offerPlan: string;
    activatedMonth: string;
    notConfigured: string;
  };
}

export function examplePhoneMenu(): WaTestMenu {
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

function emptyMenu(): WaTestMenu {
  return { message: "", options: [] };
}

export function emptyWaTestFlow(): WaTestFlowConfig {
  return {
    triggerPhrase: "",
    monthPriceBrl: 0,
    pcLoginUrl: "",
    phoneApkUrl: "",
    phoneIosUrl: "",
    deviceMenu: emptyMenu(),
    tvMenu: emptyMenu(),
    phoneMenu: emptyMenu(),
    appMenus: [],
    offerMenu: emptyMenu(),
    texts: {
      askName: "",
      funReady: "",
      primeReady: "",
      xcloudReady: "",
      macOk: "",
      macOkRoku: "",
      macCheckIn: "",
      macInvalid: "",
      alreadyUsed: "",
      confirmInstall: "",
      confirmInstallOk: "",
      confirmInstallNo: "",
      macPrompt: "",
      checkInOk: "",
      checkInNo: "",
      pcReady: "",
      phoneReady: "",
      phoneIosReady: "",
      offerPlan: "",
      activatedMonth: "",
      notConfigured:
        "O fluxo de teste ainda não foi configurado neste WhatsApp. Peça ao responsável para ajustar em UniPlay → Atendimento → Teste.",
    },
  };
}

/** Catálogo de planos após o teste (Básico/Padrão auto; promo → atendente). */
export function exampleTestOfferMenu(): WaTestMenu {
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
        keywords: "6 meses,6meses,155,promocao 6",
        action: "human",
      },
      {
        key: "4",
        label: "Promo 12 meses — R$ 290 (atendente)",
        keywords: "12 meses,12meses,290,promocao 12,anual",
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

/** Oferta antiga (só 1 mês genérico) — migra para o catálogo novo. */
export function isLegacyTestOfferMenu(menu: WaTestMenu | null | undefined) {
  if (!menu?.options?.length) return true;
  const activate = menu.options.filter((o) => o.action === "activate_month");
  if (activate.length !== 1) return false;
  const blob = `${menu.message} ${activate[0]?.label || ""}`.toLowerCase();
  return /1\s*m[eê]s por|ativo na hora/.test(blob) && !/29[,.]?90|44[,.]?90/.test(blob);
}

/** Modelo pronto (opcional) — só entra se a pessoa clicar em “Usar modelo”. */
export function exampleWaTestFlow(): WaTestFlowConfig {
  return {
    triggerPhrase: "Olá quero testar o T&E no meu aparelho.",
    monthPriceBrl: 29.9,
    pcLoginUrl: "http://navegauni.top/login",
    phoneApkUrl: DEFAULT_PHONE_APK_URL,
    phoneIosUrl: DEFAULT_PHONE_IOS_URL,
    deviceMenu: {
      message:
        "Legal! Vamos liberar seu teste de *{hours} horas*.\n\nEm qual aparelho você vai assistir?",
      options: [
        {
          key: "1",
          label: "TV",
          keywords: "tv,televisao,televisão",
          action: "ask_tv",
        },
        {
          key: "2",
          label: "Computador",
          keywords: "computador,pc,notebook",
          action: "pc",
        },
        {
          key: "3",
          label: "Celular",
          keywords: "celular,iphone,smartphone",
          action: "phone",
        },
      ],
    },
    phoneMenu: examplePhoneMenu(),
    tvMenu: {
      message: "Qual é o tipo da sua TV?",
      options: [
        {
          key: "1",
          label: "TV Box",
          keywords: "box,tv box",
          action: "app_fun",
        },
        {
          key: "2",
          label: "Android TV / Google TV",
          keywords: "android,google",
          action: "app_fun",
        },
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
        {
          key: "0",
          label: "Voltar",
          keywords: "voltar,volta,menu",
          action: "back",
        },
      ],
    },
    appMenus: [
      {
        id: "samsung",
        title: "Apps — Samsung",
        menu: {
          message: "Na *Samsung* você pode usar:",
          options: [
            {
              key: "1",
              label: "FunPlay (ativa com MAC)",
              keywords: "fun,funplay,fun play",
              action: "app_fun",
            },
            {
              key: "2",
              label: "XCloud TV (usuário e senha)",
              keywords: "xcloud,x cloud",
              action: "app_xcloud",
            },
            {
              key: "0",
              label: "Voltar",
              keywords: "voltar,volta,menu",
              action: "back",
            },
          ],
        },
      },
      {
        id: "rokulg",
        title: "Apps — Roku / LG",
        menu: {
          message: "Nesse aparelho você pode usar:",
          options: [
            {
              key: "1",
              label: "Prime IPTV (ativa com MAC)",
              keywords: "prime,prime iptv",
              action: "app_prime",
            },
            {
              key: "2",
              label: "XCloud TV (usuário e senha)",
              keywords: "xcloud,x cloud",
              action: "app_xcloud",
            },
            {
              key: "0",
              label: "Voltar",
              keywords: "voltar,volta,menu",
              action: "back",
            },
          ],
        },
      },
    ],
    offerMenu: exampleTestOfferMenu(),
    texts: {
      askName:
        "Antes de liberar o teste, qual é o *seu nome*?\n\n" +
        "_Digite só o nome._",
      funReady:
        "✅ Teste de *{hours}h* liberado — app *FunPlay*\n\n" +
        "Usuário: *{user}*\nSenha: *{password}*\n\n" +
        "Agora:\n" +
        "1) Baixe o *FunPlay* na loja do aparelho\n" +
        "2) Abra o app — no *canto inferior direito* aparece o *MAC*\n" +
        "3) Envie o MAC aqui — aceito nos dois formatos:\n" +
        "   • com dois-pontos: *aa:bb:cc:dd:ee:ff*\n" +
        "   • tudo junto: *aabbccddeeff*",
      primeReady:
        "✅ Teste de *{hours}h* liberado — app *Prime IPTV*\n\n" +
        "Usuário: *{user}*\nSenha: *{password}*\n\n" +
        "Agora:\n" +
        "1) Baixe o *Prime IPTV* na loja do aparelho\n" +
        "2) Abra o app — no *canto inferior direito* aparece o *MAC*\n" +
        "3) Envie o MAC aqui — aceito nos dois formatos:\n" +
        "   • com dois-pontos: *aa:bb:cc:dd:ee:ff*\n" +
        "   • tudo junto: *aabbccddeeff*",
      xcloudReady:
        "✅ Teste de *{hours}h* liberado — app *XCloud TV*\n\n" +
        "No XCloud, digite *exatamente*:\n\n" +
        "Provedor: *uniplay*\n" +
        "Usuário: *{user}*\n" +
        "Senha: *{password}*",
      macOk:
        "✅ *Ativado!* MAC *{mac}* no *{app}*.\n\n" +
        "Seu teste dura *{hours} horas*.\n\n" +
        "Para a lista atualizar na TV:\n\n" +
        "1. No app, vá em *Recarregar* / *Reload*\n" +
        "2. Depois em *Playlist* / *Lista*\n" +
        "3. Aperte *OK* no controle\n" +
        "4. Volte — e já pode assistir\n\n" +
        "Se não carregar, feche o app por completo e abra de novo.\n\n" +
        "Quando quiser assinar, mande mensagem aqui.",
      macOkRoku:
        "✅ *Ativado!* MAC *{mac}* no *{app}*.\n\n" +
        "Seu teste dura *{hours} horas*.\n\n" +
        "No *Roku* não existe Recarregar/Reload — faça assim:\n\n" +
        "1. Saia do app *por completo* (não deixe aberto em segundo plano)\n" +
        "2. Abra o app de novo\n" +
        "3. Pronto — já pode assistir\n\n" +
        "Quando quiser assinar, mande mensagem aqui.",
      macCheckIn:
        "E aí, conseguiu assistir? Deu tudo certo por aí?\n\n" +
        "Se algo travar, me conta que a gente resolve.\n\n" +
        "Quando quiser *ativar o plano*, é só voltar aqui e mandar mensagem — te ajudo na hora.",
      macInvalid:
        "Não consegui ler esse MAC.\n\n" +
        "Aceito nos dois formatos:\n" +
        "• *aa:bb:cc:dd:ee:ff*\n" +
        "• *aabbccddeeff*\n\n" +
        "Ele fica no *canto inferior direito* do app.\n" +
        "Mande *só o MAC*, sem outros textos.",
      alreadyUsed:
        "Você *já usou* o teste gratuito neste número.\n\n" +
        "Se quiser assinar, veja as opções:",
      confirmInstall:
        "Conseguiu instalar o app? *(sim/não)*",
      confirmInstallOk:
        "Perfeito! 🎉 Seu teste de *{hours}h* já está no ar.\n\n" +
        "Aproveite! Em instantes te pergunto se deu tudo certo.\n" +
        "Quando quiser assinar, é só voltar aqui.",
      confirmInstallNo:
        "Que pena… Vamos resolver! 😊\n\n" +
        "Me conta o que apareceu (não abre, tela preta, erro…)\n" +
        "ou digite *atendente* para falar com a equipe.",
      macPrompt:
        "Perfeito! Então me envie o *MAC* que aparece no *canto inferior direito* do app.\n\n" +
        "_Formatos: *aa:bb:cc:dd:ee:ff* ou *aabbccddeeff*_",
      checkInOk:
        "Que bom! Fico feliz que deu certo. 😊\n\n" +
        "Seu teste dura *{hours}h*.\n" +
        "Quando quiser assinar, é só voltar aqui — te ajudo na hora.",
      checkInNo:
        "Que pena que travou… 😕\n\n" +
        "Me conta o que está acontecendo (tela preta, não carrega, erro…) que eu te ajudo.\n" +
        "Ou digite *atendente*.",
      pcReady:
        "✅ Teste de *{hours}h* no *computador*\n\n" +
        "1) Abra este link:\n{loginUrl}\n\n" +
        "2) Entre com:\nUsuário: *{user}*\nSenha: *{password}*",
      phoneReady:
        "✅ Teste de *{hours}h* no *celular Android*\n\n" +
        "1) Baixe o app:\n{apk}\n\n" +
        "2) Abra o *uni.apk*, instale e escolha a opção *UniPlay*\n\n" +
        "3) Conecte com:\nUsuário: *{user}*\nSenha: *{password}*",
      phoneIosReady:
        "✅ Teste de *{hours}h* no *iPhone*\n\n" +
        "1) Baixe o app *Smarters Player Lite*:\n{iosApp}\n\n" +
        "2) Abra o app e vá em *Xtream Codes*\n\n" +
        "3) Preencha:\n" +
        "• Nome: *{name}*\n" +
        "• Usuário: *{user}*\n" +
        "• Senha: *{password}*\n" +
        "• URL / DNS: *{dns}*\n\n" +
        "4) Em *PIN de acesso*, toque em *Skip* se não quiser colocar pin\n\n" +
        "5) Pronto — toque em *Assistir*",
      offerPlan: "",
      activatedMonth:
        "✅ PIX do plano — usuário *{user}*\n\n" +
        "Valor: *{amount}*\n\n" +
        "Segue o código para pagamento.\n" +
        "Assim que o pagamento for confirmado, o plano é liberado.",
      notConfigured:
        "O fluxo de teste ainda não foi configurado neste WhatsApp.",
    },
  };
}

export function formatWaTestMenu(
  menu: WaTestMenu,
  vars?: Record<string, string | number | undefined | null>,
): string {
  let intro = menu.message || "";
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      intro = intro.split(`{${k}}`).join(v == null || v === "" ? "—" : String(v));
    }
  }
  const lines = (menu.options || []).map((o) => {
    let label = o.label || "";
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        label = label
          .split(`{${k}}`)
          .join(v == null || v === "" ? "—" : String(v));
      }
    }
    return `*${o.key || "?"}* — ${label}`;
  });
  if (!lines.length) return intro.trim();
  if (!intro.trim()) return lines.join("\n");
  return `${intro.trim()}\n\n${lines.join("\n")}`;
}

function normKey(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchWaTestOption(
  text: string,
  options: WaTestMenuOption[],
): WaTestMenuOption | null {
  const t = normKey(text);
  if (!t) return null;
  const list = options || [];
  // 1) número/chave exata
  for (const opt of list) {
    if (normKey(opt.key) === t) return opt;
  }
  // 2) palavra-chave exata
  for (const opt of list) {
    const keys = (opt.keywords || "")
      .split(/[,;|/]/)
      .map((x) => normKey(x))
      .filter(Boolean);
    if (keys.some((k) => k === t)) return opt;
  }
  // 3) contém palavra (prioriza a mais longa)
  let best: WaTestMenuOption | null = null;
  let bestLen = 0;
  for (const opt of list) {
    const keys = [
      ...(opt.keywords || "")
        .split(/[,;|/]/)
        .map((x) => x.trim())
        .filter(Boolean),
      opt.label || "",
    ]
      .map(normKey)
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

export function isWaTestFlowConfigured(flow: WaTestFlowConfig | null | undefined) {
  if (!flow) return false;
  return Boolean(
    flow.triggerPhrase?.trim() &&
      (flow.deviceMenu?.options?.length || 0) > 0,
  );
}

function asOption(raw: unknown): WaTestMenuOption | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const action = String(o.action || "").trim() as WaTestOptionAction;
  if (!WA_TEST_ACTION_LABELS[action]) return null;
  const amountRaw = Number(o.amountBrl);
  const screensRaw = Number(o.screens);
  return {
    key: String(o.key ?? "").trim() || "1",
    label: String(o.label ?? "").trim(),
    keywords: String(o.keywords ?? "").trim(),
    action,
    nextMenuId: o.nextMenuId ? String(o.nextMenuId).trim() : undefined,
    amountBrl:
      Number.isFinite(amountRaw) && amountRaw > 0
        ? Math.round(amountRaw * 100) / 100
        : undefined,
    screens:
      Number.isFinite(screensRaw) && screensRaw >= 1
        ? Math.min(10, Math.floor(screensRaw))
        : undefined,
  };
}

function asMenu(raw: unknown): WaTestMenu {
  if (!raw || typeof raw !== "object") return emptyMenu();
  const m = raw as Record<string, unknown>;
  const options = Array.isArray(m.options)
    ? m.options.map(asOption).filter((x): x is WaTestMenuOption => Boolean(x))
    : [];
  return { message: String(m.message ?? ""), options };
}

function parseWaTestFlowObject(raw: Record<string, unknown>): WaTestFlowConfig {
  const empty = emptyWaTestFlow();
  const textsRaw =
    raw.texts && typeof raw.texts === "object"
      ? (raw.texts as Record<string, unknown>)
      : {};
  const appMenus = Array.isArray(raw.appMenus)
    ? raw.appMenus
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          const id = String(r.id || "").trim();
          if (!id) return null;
          return {
            id,
            title: String(r.title || id).trim(),
            menu: asMenu(r.menu),
          };
        })
        .filter((x): x is WaTestAppMenu => Boolean(x))
    : [];
  const price = Number(raw.monthPriceBrl);
  const apkRaw = String(raw.phoneApkUrl ?? "").trim();
  const phoneApkUrl =
    !apkRaw || /auxplus\.vercel\.app\/uni\.apk/i.test(apkRaw)
      ? DEFAULT_PHONE_APK_URL
      : apkRaw;
  const phoneMenuParsed = asMenu(raw.phoneMenu);
  const example = examplePhoneMenu();
  return {
    triggerPhrase: String(raw.triggerPhrase ?? "").trim(),
    monthPriceBrl:
      Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
    pcLoginUrl: String(raw.pcLoginUrl ?? "").trim(),
    phoneApkUrl,
    phoneIosUrl:
      String(raw.phoneIosUrl ?? "").trim() || DEFAULT_PHONE_IOS_URL,
    deviceMenu: asMenu(raw.deviceMenu),
    tvMenu: asMenu(raw.tvMenu),
    phoneMenu: phoneMenuParsed.options.length
      ? phoneMenuParsed
      : example,
    appMenus,
    offerMenu: asMenu(raw.offerMenu),
    texts: {
      askName: String(textsRaw.askName ?? ""),
      funReady: String(textsRaw.funReady ?? ""),
      primeReady: String(textsRaw.primeReady ?? ""),
      xcloudReady: String(textsRaw.xcloudReady ?? ""),
      macOk: String(textsRaw.macOk ?? ""),
      macOkRoku: String(textsRaw.macOkRoku ?? ""),
      macCheckIn: String(textsRaw.macCheckIn ?? ""),
      macInvalid: String(textsRaw.macInvalid ?? ""),
      alreadyUsed: String(textsRaw.alreadyUsed ?? ""),
      confirmInstall: String(textsRaw.confirmInstall ?? ""),
      confirmInstallOk: String(textsRaw.confirmInstallOk ?? ""),
      confirmInstallNo: String(textsRaw.confirmInstallNo ?? ""),
      macPrompt: String(textsRaw.macPrompt ?? ""),
      checkInOk: String(textsRaw.checkInOk ?? ""),
      checkInNo: String(textsRaw.checkInNo ?? ""),
      pcReady: String(textsRaw.pcReady ?? ""),
      phoneReady: String(textsRaw.phoneReady ?? ""),
      phoneIosReady: String(textsRaw.phoneIosReady ?? ""),
      offerPlan: String(textsRaw.offerPlan ?? ""),
      activatedMonth: String(textsRaw.activatedMonth ?? ""),
      notConfigured:
        String(textsRaw.notConfigured ?? "") || empty.texts.notConfigured,
    },
  };
}

function testFlowHasContent(flow: WaTestFlowConfig) {
  if (isWaTestFlowConfigured(flow)) return true;
  if (flow.deviceMenu.options.length || flow.tvMenu.options.length) return true;
  if (flow.appMenus.length || flow.offerMenu.options.length) return true;
  const t = flow.texts;
  return Boolean(
    t.funReady ||
      t.primeReady ||
      t.pcReady ||
      t.phoneReady ||
      t.phoneIosReady ||
      t.xcloudReady ||
      flow.pcLoginUrl ||
      flow.phoneApkUrl ||
      flow.phoneIosUrl ||
      flow.phoneMenu.options.length,
  );
}

/** Normaliza / migra testFlow a partir do JSON salvo (ou textos antigos). */
export function normalizeWaTestFlow(
  raw: unknown,
  legacyMessages?: Partial<Record<string, string>>,
  legacyMeta?: {
    triggerPhrase?: string;
    monthPriceBrl?: number;
    pcLoginUrl?: string;
    phoneApkUrl?: string;
    phoneIosUrl?: string;
  },
): WaTestFlowConfig {
  const empty = emptyWaTestFlow();
  if (raw && typeof raw === "object") {
    const parsed = parseWaTestFlowObject(raw as Record<string, unknown>);
    if (testFlowHasContent(parsed)) {
      const withPhoneDefaults = ensurePhoneFlowDefaults(parsed);
      if (isLegacyTestOfferMenu(withPhoneDefaults.offerMenu)) {
        return {
          ...withPhoneDefaults,
          monthPriceBrl:
            withPhoneDefaults.monthPriceBrl > 0
              ? withPhoneDefaults.monthPriceBrl
              : 29.9,
          offerMenu: exampleTestOfferMenu(),
        };
      }
      return withPhoneDefaults;
    }
  }

  // Migração dos textos flat antigos (conta que já tinha configurado)
  const m = legacyMessages || {};
  if (!String(m.testAskDevice || "").trim() && !legacyMeta?.triggerPhrase?.trim()) {
    return empty;
  }

  const example = exampleWaTestFlow();
  return {
    ...example,
    triggerPhrase:
      legacyMeta?.triggerPhrase?.trim() || example.triggerPhrase,
    monthPriceBrl:
      legacyMeta?.monthPriceBrl && legacyMeta.monthPriceBrl >= 1
        ? legacyMeta.monthPriceBrl
        : example.monthPriceBrl,
    pcLoginUrl: legacyMeta?.pcLoginUrl?.trim() || example.pcLoginUrl,
    phoneApkUrl: (() => {
      const legacy = legacyMeta?.phoneApkUrl?.trim() || "";
      if (!legacy || /auxplus\.vercel\.app\/uni\.apk/i.test(legacy)) {
        return example.phoneApkUrl;
      }
      return legacy;
    })(),
    phoneIosUrl: legacyMeta?.phoneIosUrl?.trim() || example.phoneIosUrl,
    deviceMenu: {
      message: stripOptionLines(String(m.testAskDevice || example.deviceMenu.message)),
      options: example.deviceMenu.options,
    },
    tvMenu: {
      message: stripOptionLines(String(m.testAskTv || example.tvMenu.message)),
      options: example.tvMenu.options,
    },
    phoneMenu: example.phoneMenu,
    appMenus: [
      {
        id: "samsung",
        title: "Apps — Samsung",
        menu: {
          message: stripOptionLines(
            String(m.testAskAppSamsung || example.appMenus[0].menu.message),
          ),
          options: example.appMenus[0].menu.options,
        },
      },
      {
        id: "rokulg",
        title: "Apps — Roku / LG",
        menu: {
          message: stripOptionLines(
            String(m.testAskAppRokuLg || example.appMenus[1].menu.message),
          ),
          options: example.appMenus[1].menu.options,
        },
      },
    ],
    offerMenu: {
      message: stripOptionLines(
        String(m.testOfferPlan || example.offerMenu.message),
      ),
      options: example.offerMenu.options,
    },
    texts: {
      askName: example.texts.askName,
      funReady: String(m.testAppFunReady || example.texts.funReady),
      primeReady: String(m.testAppPrimeReady || example.texts.primeReady),
      xcloudReady: String(m.testAppXcloudReady || example.texts.xcloudReady),
      macOk: String(m.testMacOk || example.texts.macOk),
      macOkRoku: String(
        (m as { testMacOkRoku?: string }).testMacOkRoku ||
          example.texts.macOkRoku,
      ),
      macCheckIn: example.texts.macCheckIn,
      macInvalid: String(m.testMacInvalid || example.texts.macInvalid),
      alreadyUsed: example.texts.alreadyUsed,
      confirmInstall: example.texts.confirmInstall,
      confirmInstallOk: example.texts.confirmInstallOk,
      confirmInstallNo: example.texts.confirmInstallNo,
      macPrompt: example.texts.macPrompt,
      checkInOk: example.texts.checkInOk,
      checkInNo: example.texts.checkInNo,
      pcReady: String(m.testPcReady || example.texts.pcReady),
      phoneReady: String(m.testPhoneReady || example.texts.phoneReady),
      phoneIosReady: example.texts.phoneIosReady,
      offerPlan: "",
      activatedMonth: String(
        m.testActivatedMonth || example.texts.activatedMonth,
      ),
      notConfigured: empty.texts.notConfigured,
    },
  };
}

/** Garante menu Android/iPhone + textos/links padrão em fluxos já salvos. */
function ensurePhoneFlowDefaults(flow: WaTestFlowConfig): WaTestFlowConfig {
  const example = exampleWaTestFlow();
  const apk =
    !flow.phoneApkUrl.trim() ||
    /auxplus\.vercel\.app\/uni\.apk/i.test(flow.phoneApkUrl)
      ? DEFAULT_PHONE_APK_URL
      : flow.phoneApkUrl;
  const phoneReady =
    !flow.texts.phoneReady.trim() ||
    (!/android/i.test(flow.texts.phoneReady) &&
      /celular/i.test(flow.texts.phoneReady) &&
      /uni\.apk/i.test(flow.texts.phoneReady))
      ? example.texts.phoneReady
      : flow.texts.phoneReady;
  const askNameRaw = flow.texts.askName.trim();
  const askName =
    !askNameRaw || /ex\.?:?\s*jo[aã]o|\(ex\./i.test(askNameRaw)
      ? example.texts.askName
      : flow.texts.askName;
  return {
    ...flow,
    phoneApkUrl: apk,
    phoneIosUrl: flow.phoneIosUrl.trim() || DEFAULT_PHONE_IOS_URL,
    phoneMenu: flow.phoneMenu.options.length
      ? flow.phoneMenu
      : examplePhoneMenu(),
    texts: {
      ...flow.texts,
      askName,
      phoneReady,
      phoneIosReady:
        flow.texts.phoneIosReady.trim() || example.texts.phoneIosReady,
      macCheckIn:
        flow.texts.macCheckIn.trim() || example.texts.macCheckIn,
      alreadyUsed:
        flow.texts.alreadyUsed.trim() || example.texts.alreadyUsed,
      confirmInstall:
        flow.texts.confirmInstall.trim() || example.texts.confirmInstall,
      confirmInstallOk:
        flow.texts.confirmInstallOk.trim() || example.texts.confirmInstallOk,
      confirmInstallNo:
        flow.texts.confirmInstallNo.trim() || example.texts.confirmInstallNo,
      macPrompt: flow.texts.macPrompt.trim() || example.texts.macPrompt,
      checkInOk: flow.texts.checkInOk.trim() || example.texts.checkInOk,
      checkInNo: flow.texts.checkInNo.trim() || example.texts.checkInNo,
    },
  };
}

/** Remove linhas de menu *1* — ... do texto antigo para não duplicar. */
function stripOptionLines(text: string) {
  return text
    .split("\n")
    .filter((line) => !/^\s*\*?[\dA-Za-z]+\*?\s*[—\-–:]/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function newBlankAppMenu(): WaTestAppMenu {
  return {
    id: `menu_${Date.now().toString(36)}`,
    title: "Novo menu de apps",
    menu: {
      message: "",
      options: [
        {
          key: "1",
          label: "",
          keywords: "",
          action: "app_fun",
        },
      ],
    },
  };
}

export function newBlankOption(
  key: string,
  action: WaTestOptionAction = "human",
): WaTestMenuOption {
  return { key, label: "", keywords: "", action };
}
