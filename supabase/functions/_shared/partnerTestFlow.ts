/** Catálogo compartilhado entre o editor AuxPlus e o webhook WhatsApp. */
export function parsePartnerDeviceText(app: "pixel" | "prime" | "utm", text: string) {
  const macMatch = text.match(/\b(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}\b|\b[a-f0-9]{12}\b/i);
  if (app === "pixel") {
    const fullId = text.trim().replace(/^(device\s*id|id|mac)\s*[:=]\s*/i, "").replace(/\r?\n\s*/g, "");
    const device = /\s/.test(fullId) ? macMatch?.[0] || fullId : fullId;
    if (device.length < 10 || /\s/.test(device)) throw new Error("Envie o Device ID ou MAC exatamente como aparece no Pixel Player.");
    return { device, deviceKey: undefined };
  }
  if (!macMatch) throw new Error(app === "utm" ? "Envie o MAC e o Device Key de 6 números do UTM na mesma mensagem." : "Envie o MAC exibido no Prime IPTV.");
  const device = macMatch[0].replace(/[:-]/g, "").match(/.{2}/g)!.join(":");
  const deviceKey = text.replace(macMatch[0], " ").match(/\b\d{6}\b/)?.[0];
  if (app === "utm" && !deviceKey) throw new Error("Faltou o Device Key UTM. Envie novamente o MAC e a chave de 6 números juntos.");
  return { device, deviceKey };
}

function upgradeAppCatalog<T>(input: T): T {
  if (!input || typeof input !== "object") return input;
  const flow = input as Record<string, unknown>;
  if (flow.appCatalogVersion === 2) return input;
  const texts = (flow.texts || {}) as Record<string, unknown>;
  const migrateMenu = (value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const menu = value as Record<string, unknown>;
    return { ...menu, options: Array.isArray(menu.options) ? menu.options.map((raw) => {
      const option = raw as Record<string, unknown>;
      return { ...option, action: option.action === "app_fun" ? "app_pixel" : option.action === "app_xcloud" ? "app_utm" : option.action };
    }) : [] };
  };
  const appOptions = () => [
    { key: "1", label: "Prime IPTV", keywords: "prime,prime iptv", action: "app_prime" },
    { key: "2", label: "Pixel Player", keywords: "pixel,pixel player", action: "app_pixel" },
    { key: "3", label: "UTM Play", keywords: "utm,utm play", action: "app_utm" },
    { key: "0", label: "Voltar", keywords: "voltar,menu", action: "back" },
  ];
  return {
    ...flow, appCatalogVersion: 2,
    deviceMenu: migrateMenu(flow.deviceMenu),
    phoneMenu: migrateMenu(flow.phoneMenu),
    tvMenu: { message: "Qual é o aparelho em que você vai assistir?", options: [
      { key: "1", label: "Samsung", keywords: "samsung", action: "ask_app", nextMenuId: "samsung" },
      { key: "2", label: "LG", keywords: "lg", action: "ask_app", nextMenuId: "lg" },
      { key: "3", label: "Roku", keywords: "roku", action: "ask_app", nextMenuId: "roku" },
      { key: "4", label: "Android / Google TV / TV Box", keywords: "android,google,box,tv box", action: "app_pixel" },
      { key: "0", label: "Voltar", keywords: "voltar,menu", action: "back" },
    ] },
    appMenus: ["samsung", "lg", "roku"].map((id) => ({ id,
      title: `Apps — ${id === "lg" ? "LG" : id === "roku" ? "Roku" : "Samsung"}`,
      menu: { message: "Qual app você quer usar?", options: appOptions() },
    })),
    texts: { ...texts,
      pixelReady: "✅ Teste de *{hours}h* — *Pixel Player*\n\nInstale o Pixel Player, abra o aplicativo e localize o *Device ID* ou MAC exibido na tela. Vamos usá-lo para ativar sua lista.",
      primeReady: "✅ Teste de *{hours}h* — *Prime IPTV*\n\nInstale o Prime IPTV, abra o aplicativo e localize o *MAC* exibido na tela.",
      utmReady: "✅ Teste de *{hours}h* — *UTM Play*\n\nInstale o UTM Play e abra o aplicativo. Para ativar, vamos precisar do *MAC* e do *Device Key de 6 números* exibidos na TV.",
      macPrompt: "Envie o identificador exibido no app: *MAC* no Prime, *Device ID ou MAC* no Pixel, ou *MAC e Device Key* no UTM. No UTM, envie os dois na mesma mensagem.",
      macInvalid: "Não consegui reconhecer o identificador. Confira os dados exibidos no aplicativo e envie novamente.",
      phoneReady: "Instale o *Pixel Player* no Android e abra o aplicativo para localizar seu *Device ID*.",
    },
  } as T;
}

/** Reuses ordinary menus so installation help follows the same persisted flow. */
const tvStoreSteps: Record<string, string[]> = {
  samsung: ["Pegue o controle da TV e aperte o botão da casinha 🏠 (Home).", "Use as setas para procurar *Apps* ou *Aplicativos* na tela.", "Quando estiver em Apps, aperte o botão do meio das setas (OK / Selecionar).", "Procure a *lupa 🔎* e aperte OK. Ela abre a busca."],
  lg: ["Pegue o controle da TV e aperte o botão da casinha 🏠 (Home).", "Use as setas para procurar *Apps* ou *LG Content Store* na tela.", "Aperte o botão *OK* no meio das setas. No controle com rodinha, aperte a rodinha.", "Dentro da loja, procure a *lupa 🔎* e aperte OK."],
  roku: ["Pegue o controle do Roku e aperte o botão da casinha 🏠.", "Use as setas para ir até *Loja de streaming* ou *Canais de streaming*. Em alguns modelos aparece *Loja*.", "Aperte *OK* para entrar.", "Procure *Pesquisar* ou *Buscar canais* e aperte OK."],
  android: ["Pegue o controle da TV ou TV Box e aperte o botão da casinha 🏠 (Home).", "Use as setas para ir até *Apps* ou *Aplicativos* e aperte OK.", "No Google TV, escolha *Pesquisar apps*. No Android TV / TV Box, abra *Google Play Store* e escolha a lupa 🔎."],
};

function clarifyAppSelection<T>(input: T): T {
  const flow = input as Record<string, unknown>;
  const brands: Record<string, string> = { samsung: "Samsung", lg: "LG", roku: "Roku", android: "Android / Google TV / TV Box" };
  return { ...flow, appCatalogVersion: 5,
    appMenus: ((flow.appMenus || []) as Array<Record<string, unknown>>).map(menu => {
      const id = String(menu.id);
      if (id.startsWith("guide_")) {
        const [, brand, app] = id.split("_");
        const appName = ({ prime: "Prime IPTV", pixel: "Pixel Player", utm: "UTM Play" } as Record<string, string>)[app];
        if (!tvStoreSteps[brand] || !appName) return menu;
        const steps = [...tvStoreSteps[brand],
          `Vai aparecer um teclado na tela. Use as setas para escolher cada letra e aperte OK. Escreva *${appName}*.`,
          "Escolha o aplicativo nos resultados e aperte OK.",
          `Escolha *${brand === "roku" ? "Adicionar app / Adicionar canal" : "Instalar"}* e aperte OK. Espere terminar.`,
          "Depois, escolha *Abrir*. Se essa opção não aparecer, volte à tela da casinha e procure o aplicativo instalado."];
        return { ...menu, menu: { ...(menu.menu as object), message:
          `*Vamos instalar ${appName}* 😊\n\nA TV precisa estar conectada à internet.\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n")}\n\nConseguiu abrir o aplicativo? Responda *1*.\n\nSe a sua tela for diferente ou você não conseguir, responda *2* para pedir ajuda.` } };
      }
      const brandId = id.replace(/^help_/, "");
      if (!brands[brandId]) return menu;
      const current = menu.menu as { message: string; options: Array<Record<string, unknown>> };
      const android = brandId === "android";
      const opening = id.startsWith("help_")
        ? `*Vou te ajudar a abrir a loja da sua TV ${brands[brandId]}* 😊\n\n${tvStoreSteps[brandId].map((step, index) => `${index + 1}. ${step}`).join("\n\n")}\n\nAgora procure ${android ? "o aplicativo abaixo" : "um dos aplicativos abaixo"}. Vai aparecer um teclado na TV: use as setas para escolher as letras e aperte OK em cada uma.`
        : `*Estes são os aplicativos para procurar na sua TV ${brands[brandId]}* 📺`;
      const guidance = `${opening}\n\n${android ? "Pesquise o nome do aplicativo na loja." : "Pesquise um nome de cada vez. Se não encontrar o primeiro, tente o próximo."}\n\nVocê só precisa de *um aplicativo*.\n\nEncontrou? Responda com o *número dele na lista abaixo*.${id.startsWith("help_") ? " Eu te ensino a instalar." : ""}\n\nNão encontrou ${android ? "o aplicativo" : "nenhum"} ou ficou com dificuldade? Responda *9* para pedir ajuda.`;
      return { ...menu, menu: { ...current, message: guidance, options: [
        ...current.options.filter(option => option.key !== "9" && option.action !== "back"),
        { key: "9", label: "Não encontrei / preciso de ajuda", keywords: "nao encontrei,não encontrei,nenhum,ajuda,nao consigo,não consigo", action: "human" },
        ...current.options.filter(option => option.action === "back"),
      ] } };
    }),
  } as T;
}

function compactPartnerFlow<T>(input: T): T {
  const flow = input as Record<string, unknown>;
  const brands: Record<string, string> = { samsung: "Samsung", lg: "LG", roku: "Roku", android: "Android / Google TV" };
  const stores: Record<string, string> = { samsung: "Apps", lg: "Apps / LG Content Store", roku: "Loja / Canais de streaming", android: "Apps / Play Store" };
  const tv = flow.tvMenu as { options: Array<Record<string, unknown>> };
  return { ...flow, appCatalogVersion: 6,
    deviceMenu: { ...(flow.deviceMenu as object), message: "Onde vai assistir?" },
    tvMenu: { ...tv, message: "Qual é sua TV?", options: tv.options.map(option => {
      const id = String(option.nextMenuId || "").replace(/^install_/, "");
      if (!brands[id]) return option;
      return id === "android" ? { ...option, action: "app_pixel", nextMenuId: undefined } : { ...option, action: "ask_app", nextMenuId: id };
    }) },
    appMenus: ((flow.appMenus || []) as Array<Record<string, unknown>>).map(menu => {
      const id = String(menu.id);
      const current = menu.menu as { message: string; options: Array<Record<string, unknown>> };
      if (id.startsWith("guide_")) {
        const [, brand, app] = id.split("_");
        const name = ({ prime: "Prime IPTV", pixel: "Pixel Player", utm: "UTM Play" } as Record<string, string>)[app];
        if (!name || !stores[brand]) return menu;
        return { ...menu, menu: { ...current,
          message: `*Instalar ${name}*\n\n1. Aperte a casinha 🏠 no controle.\n2. Abra *${stores[brand]}* e procure a lupa 🔎.\n3. Busque *${name}*, ${brand === "roku" ? "adicione" : "instale"} e abra.`,
          options: current.options.map(option => ({ ...option, label: option.key === "1" ? "Já abri o app" : option.key === "2" ? "Preciso de um atendente" : option.label })),
        } };
      }
      if (brands[id]) return { ...menu, menu: { ...current,
        message: `*${brands[id]}*: qual app encontrou na loja?\nInstale apenas *um* deles.`,
        options: current.options.map(option => option.key === "9" ? { ...option, label: "Não sei instalar", keywords: "ajuda,instalar,nao sei instalar,não sei instalar", action: "ask_app", nextMenuId: `help_${id}` } : option),
      } };
      if (id.startsWith("help_") && brands[id.slice(5)]) return { ...menu, menu: { ...current,
        message: "Qual app quer instalar?",
        options: current.options.map(option => option.key === "9" ? { ...option, label: "Chamar atendente" } : option),
      } };
      if (id.startsWith("install_")) return { ...menu, menu: { ...current, message: "Você sabe instalar apps?" } };
      return menu;
    }),
  } as T;
}

export function upgradePartnerTestFlow<T>(input: T): T {
  if (!input || typeof input !== "object") return input;
  const original = input as Record<string, unknown>;
  if (Number(original.appCatalogVersion) >= 6) return input;
  if (Number(original.appCatalogVersion) >= 3) return compactPartnerFlow(clarifyAppSelection(input));
  const flow = upgradeAppCatalog(input) as Record<string, unknown>;
  const menus = ((flow.appMenus || []) as Array<Record<string, unknown>>).filter(menu => !/^(install_|help_|guide_)/.test(String(menu.id)) && menu.id !== "android");
  const brands = [
    { id: "samsung", name: "Samsung", store: "a loja de aplicativos da TV (Apps)" },
    { id: "lg", name: "LG", store: "a loja de aplicativos da TV (Apps / LG Content Store)" },
    { id: "roku", name: "Roku", store: "a loja de aplicativos/canais do Roku" },
    { id: "android", name: "Android / Google TV / TV Box", store: "a loja de aplicativos (Google Play Store)" },
  ];
  const apps = [
    { id: "prime", name: "Prime IPTV" },
    { id: "pixel", name: "Pixel Player" },
    { id: "utm", name: "UTM Play" },
  ];
  const back = { key: "0", label: "Voltar", keywords: "voltar,menu", action: "back" };
  for (const brand of brands) {
    const available = brand.id === "android" ? apps.filter(app => app.id === "pixel") : apps;
    menus.push({ id: `install_${brand.id}`, title: `Instalar — ${brand.name}`, menu: {
      message: `Você sabe baixar e instalar aplicativos na sua ${brand.name}?`,
      options: [
        { key: "1", label: "Sim, sei instalar", keywords: "sim,sei,sei instalar", action: "ask_app", nextMenuId: brand.id },
        { key: "2", label: "Não, preciso de ajuda", keywords: "nao,não,ajuda,nao sei,não sei", action: "ask_app", nextMenuId: `help_${brand.id}` },
        back,
      ],
    } });
    menus.push({ id: `help_${brand.id}`, title: `Ajuda — ${brand.name}`, menu: {
      message: "Vou te ensinar passo a passo 😊\n\nQual aplicativo você quer instalar?",
      options: [...available.map((app, index) => ({ key: String(index + 1), label: app.name,
        keywords: app.name.toLowerCase(), action: "ask_app", nextMenuId: `guide_${brand.id}_${app.id}` })), back],
    } });
    for (const app of available) {
      menus.push({ id: `guide_${brand.id}_${app.id}`, title: `${brand.name} — ${app.name}`, menu: {
        message: `📺 *Como instalar ${app.name} na ${brand.name}*\n\n1. Conecte a TV à internet.\n2. No controle, aperte o botão de início (Home / casinha).\n3. Abra ${brand.store}. Os nomes podem variar conforme o modelo.\n4. Na busca (lupa), digite *${app.name}*.\n5. Selecione o aplicativo e escolha instalar/adicionar.\n6. Quando terminar, abra o aplicativo.\n\nConseguiu instalar e abrir? Se não encontrar o app na loja, escolha ajuda para conferirmos seu modelo.`,
        options: [
          { key: "1", label: "Instalei e abri o aplicativo", keywords: "sim,instalei,consegui,pronto", action: `app_${app.id}` },
          { key: "2", label: "Não consegui / não encontrei", keywords: "nao,não,ajuda,nao encontrei,não encontrei", action: "human" },
          back,
        ],
      } });
    }
  }
  menus.push({ id: "android", title: "Apps — Android", menu: {
    message: "No Android, vamos usar o Pixel Player. Instale e abra o aplicativo para continuar.",
    options: [{ key: "1", label: "Pixel Player", keywords: "pixel,pixel player", action: "app_pixel" }, back],
  } });
  const tvMenu = flow.tvMenu as { options: Array<Record<string, unknown>> };
  return compactPartnerFlow(clarifyAppSelection({ ...flow, appCatalogVersion: 3, appMenus: menus,
    tvMenu: { ...tvMenu, options: tvMenu.options.map(option => {
      const brand = brands.find(b => option.nextMenuId === b.id || (b.id === "android" && option.action === "app_pixel"));
      return brand ? { ...option, action: "ask_app", nextMenuId: `install_${brand.id}` } : option;
    }) },
  } as T));
}
