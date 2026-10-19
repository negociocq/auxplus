import type { PartnerApp } from "./partnerDevicePhoto.ts";

export function partnerDeviceGuide(app: PartnerApp, acceptsPhoto: boolean): string {
  const name = app === "prime" ? "Prime IPTV" : app === "utm" ? "UTM Play" : "Pixel Player";
  const target = app === "prime" ? "MAC" : app === "utm" ? "MAC e Device Key" : "Device ID";
  const action = acceptsPhoto ? `📷 *Mande uma foto do ${target} ou digite ${app === "utm" ? "os dois juntos" : "o código completo"}.*` : `*Digite ${app === "utm" ? "o MAC e o Device Key juntos" : `o ${target} completo`}.*`;
  const location = app === "prime"
    ? "Procure *Endereço MAC* no canto de baixo, à direita."
    : app === "utm"
    ? "Não achou? Abra *Settings → User Account*."
    : "Ele fica abaixo do QR Code. Se ocupar *duas linhas*, envie as duas.";
  return `Instale e abra o *${name}*.\n\n${action}\n\n${location}\n\nPrecisa de ajuda? Digite *ajuda*.`;
}

export function partnerDeviceHelp(app: PartnerApp, acceptsPhoto: boolean): string {
  const location = app === "prime"
    ? "No Prime, procure *Endereço MAC* no canto inferior direito."
    : app === "utm"
    ? "No UTM, abra a engrenagem *Settings* (Configurações) → *User Account* (Conta do usuário). Lá estão o *MAC* e o *Device Key de 6 números*."
    : "No Pixel, vá à tela de escolher o perfil. O *Device ID* fica abaixo do QR Code. Pode ser curto, como um MAC, ou ocupar duas linhas. Envie o código inteiro.";
  return `${location}\n\n${acceptsPhoto ? "Mande uma foto dessa parte da TV ou digite os dados." : "Digite os dados aqui."}\n\nAinda não instalou? Digite *instalar*.\nPara falar com a equipe, digite *atendente*.`;
}

export function partnerGuideUrl(base: string, app: PartnerApp): string | undefined {
  if (!base.trim()) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return undefined;
    return `${url.href.replace(/\/$/, "")}/atendimento/${app}-device-guide.png`;
  } catch { return undefined; }
}
