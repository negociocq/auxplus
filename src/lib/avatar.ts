import type { AppData } from "@/types";

/** Redimensiona e compacta a foto para caber no banco (data URL). */
export async function fileToAvatarDataUrl(
  file: File,
  maxSize = 256,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione uma imagem (JPG ou PNG)");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Imagem muito grande (máx. 8 MB)");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  if (jpeg.length < 400_000) return jpeg;
  return canvas.toDataURL("image/jpeg", 0.7);
}

const KEY = "auxplus-avatar";

export function loadLocalAvatar(userId: string): string | null {
  try {
    return localStorage.getItem(`${KEY}:${userId}`);
  } catch {
    return null;
  }
}

export function saveLocalAvatar(userId: string, dataUrl: string | null) {
  try {
    const k = `${KEY}:${userId}`;
    if (!dataUrl) localStorage.removeItem(k);
    else localStorage.setItem(k, dataUrl);
  } catch {
    /* ignore quota */
  }
}

/** Mescla foto do banco com a cópia local (fallback sem migration). */
export function mergeLocalAvatars(data: AppData): AppData {
  return {
    ...data,
    users: data.users.map((u) => ({
      ...u,
      avatarUrl: u.avatarUrl || loadLocalAvatar(u.id),
    })),
  };
}
