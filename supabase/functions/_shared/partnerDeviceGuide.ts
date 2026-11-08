import type { PartnerApp } from "./partnerDevicePhoto.ts";

export function partnerDeviceGuide(app: PartnerApp, acceptsPhoto: boolean): string {
  const name = app === "zuxo" ? "Zuxo Player" : app === "utm" ? "UTM Play" : "Pixel Player";
  const target = app === "zuxo" ? "MAC" : app === "utm" ? "MAC e Device Key" : "Device ID";
  const action = acceptsPhoto ? `📷 *Mande uma foto do ${target} ou digite ${app === "utm" ? "os dois juntos" : "o código completo"}.*` : `*Digite ${app === "utm" ? "o MAC e o Device Key juntos" : `o ${target} completo`}.*`;
  const location = app === "zuxo"
    ? "Na tela de ativação do Zuxo Player, procure o campo *MAC*."
    : app === "utm"
    ? "Não achou? Abra *Settings → User Account*."
    : "Ele fica abaixo do QR Code. Se ocupar *duas linhas*, envie as duas.";
  return `Instale e abra o *${name}*.\n\n${action}\n\n${location}\n\nPrecisa de ajuda? Digite *ajuda*.`;
}

export function partnerDeviceHelp(app: PartnerApp, acceptsPhoto: boolean): string {
  const location = app === "zuxo"
    ? "Abra o Zuxo Player e procure o campo *MAC* na tela de ativação. Envie os 12 caracteres, mantendo os dois-pontos quando aparecerem."
    : app === "utm"
    ? "No UTM, abra a engrenagem *Settings* (Configurações) → *User Account* (Conta do usuário). Lá estão o *MAC* e o *Device Key de 6 números*."
    : "No Pixel, vá à tela de escolher o perfil. O *Device ID* fica abaixo do QR Code. Pode ser curto, como um MAC, ou ocupar duas linhas. Envie o código inteiro.";
  return `${location}\n\n${acceptsPhoto ? "Mande uma foto dessa parte da TV ou digite os dados." : "Digite os dados aqui."}\n\nAinda não instalou? Digite *instalar*.\nPara falar com a equipe, digite *atendente*.`;
}

export function partnerGuideUrl(base: string, app: PartnerApp, device = "tv"): string | undefined {
  if (!base.trim()) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return undefined;
    const name = app === "zuxo" ? `zuxo-${["ios", "android", "samsung"].includes(device) ? device : "tv-v2"}-guide.png` : `${app}-device-guide.png`;
    return `${url.href.replace(/\/$/, "")}/atendimento/${name}`;
  } catch { return undefined; }
}
