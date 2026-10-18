import type { PartnerApp } from "./partnerDevicePhoto.ts";

export function partnerDeviceGuide(app: PartnerApp, acceptsPhoto: boolean): string {
  const location = app === "prime"
    ? "*Prime IPTV — encontre seu MAC*\n\nAbra o aplicativo e olhe o *canto de baixo, à direita*. Procure a linha *Endereço MAC*."
    : app === "utm"
    ? "*UTM Play — encontre MAC e Device Key*\n\nNa primeira tela, procure *Your TV MAC Address* e *Your Device Key*.\n\nJá saiu dessa tela?\n1. Abra *Settings* (Configurações).\n2. Entre em *User Account* (Conta do usuário).\n3. Procure o *MAC* e o *Device Key*."
    : "*Pixel Player — encontre o Device ID*\n\nAbra a tela de escolher o perfil (*Select Your Profile*). Olhe o lado direito, *abaixo do QR Code*, e procure *Device ID*.";
  const photo = app === "prime"
    ? "Fotografe o canto de baixo, à direita, deixando a linha *Endereço MAC* inteira e legível."
    : app === "utm"
    ? "Fotografe a parte que mostra *MAC e Device Key juntos*. Os dois precisam aparecer inteiros e legíveis na mesma foto."
    : "Fotografe a parte escrita *Device ID*. Se o código estiver em *duas linhas*, mostre as *duas linhas inteiras* na mesma foto. O QR Code não é necessário.";
  const typing = app === "prime"
    ? "Envie somente o *Endereço MAC*. Pode ser com ou sem os dois-pontos (:). Não precisa enviar a chave do dispositivo."
    : app === "utm"
    ? "Envie o *MAC*, um espaço e o *Device Key de 6 números*, tudo na mesma mensagem. O MAC pode ser com ou sem os dois-pontos (:)."
    : "Envie o *Device ID completo*. Se estiver em duas linhas, junte as duas sem espaço. Mantenha todas as letras, números e traços, inclusive os zeros do começo.";
  return `${location}\n\n${acceptsPhoto ? `*Você escolhe: foto OU digitar.*\n\n📷 *Se mandar foto:*\n${photo}\n\n⌨️ *Se preferir digitar:*\n` : "*O que digitar:*\n"}${typing}\n\n${acceptsPhoto ? "Use os dados da *SUA TV*. Se mandar foto, tire de perto e sem reflexo.\n\n" : ""}Se não encontrar, escreva *atendente*.`;
}

export function partnerGuideUrl(base: string, app: PartnerApp): string | undefined {
  if (!base.trim()) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return undefined;
    return `${url.href.replace(/\/$/, "")}/atendimento/${app}-device-guide.png`;
  } catch { return undefined; }
}
