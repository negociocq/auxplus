/** Confirmed against the UniPlay panel on 2026-11-08. No activation is performed here. */
export type ActivePartnerApp = "zuxo" | "pixel" | "utm";

export function partnerActivationRequest(app: ActivePartnerApp, userId: string | number | undefined | null, device: string, deviceKey?: string) {
  if (!["zuxo", "pixel", "utm"].includes(app)) throw new Error("Aplicativo indisponível. Escolha Zuxo Player, Pixel Player ou UTM Play.");
  if (userId == null || String(userId).trim() === "") throw new Error("Cliente IPTV sem ID no painel. Atualize o cliente antes de ativar o aplicativo.");
  if (app === "pixel") return { path: "/activate-pixel", body: { id_usuario: userId, device_identifier: device } };
  if (app === "utm") return { path: "/activate-utm", body: { id_usuario: userId, mac: device, device_key: deviceKey } };
  // Zuxo uses id_user; Pixel and UTM use id_usuario. These are not interchangeable.
  return { path: "/activate-zuxo", body: { id_user: userId, mac: device } };
}
