import type { AppData } from "@/types";
import type { IptvJob } from "@/lib/iptvAutomation";

export type RecreatedIptvAccess = {
  username: string; password: string; m3u: string; dnsSmarters: string;
  remoteId?: string | number;
};
const marker = /<!--AXIPTV:[\s\S]*?-->/g;

export function stripItemIptvAccess(notes?: string | null): string {
  return (notes || "").replace(marker, "");
}

export function preserveItemIptvAccess(notes: string | undefined, previous?: string): string | undefined {
  const saved = previous?.match(/<!--AXIPTV:[\s\S]*?-->/)?.[0];
  return saved && !notes?.includes("<!--AXIPTV:") ? `${notes || ""}${saved}` : notes;
}

export function readItemIptvAccess(notes?: string): RecreatedIptvAccess | null {
  try {
    const raw = notes?.match(/<!--AXIPTV:([\s\S]*?)-->/)?.[1];
    return raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch { return null; }
}

export function replaceRecreatedItemAccess(data: AppData, original: string, access: RecreatedIptvAccess): AppData {
  const login = original.trim().toLowerCase();
  return { ...data, items: data.items.map((item) => {
    if (item.itemId.trim().toLowerCase() !== login) return item;
    const notes = (item.notes || "").replace(marker, "");
    return { ...item, itemId: access.username,
      notes: `${notes}<!--AXIPTV:${encodeURIComponent(JSON.stringify(access))}-->` };
  }) };
}

export function replaceRecreatedJobAccess(jobs: IptvJob[], original: string, access: RecreatedIptvAccess, jobId?: string): IptvJob[] {
  const login = original.trim().toLowerCase();
  return jobs.map((job) => job.id === jobId || job.panelUsername.trim().toLowerCase() === login ? {
    ...job, panelUsername: access.username, panelPassword: access.password,
    panelRemoteId: access.remoteId ?? job.panelRemoteId, m3u: access.m3u, dnsSmarters: access.dnsSmarters,
  } : job);
}
