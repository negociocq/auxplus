import { addMonths, format } from "date-fns";
import type { AppData, Item } from "@/types";
import { createItem, updateItem } from "@/lib/storage";
import { paymentsAfterDueChange, withEmbeddedPayments } from "@/lib/payments";
import {
  fixUtf8Mojibake,
  isIptvTestOrTrialUser,
  parseIptvExpToDateTime,
  resolveTestAccessLinks,
  type IptvRemoteUser,
} from "@/lib/iptvPanelApi";
import { ymdOnly, parseLocalYmd } from "@/lib/whatsappAutomation";

export type IptvJobKind = "renew" | "test";
export type IptvJobStatus = "pending" | "doing" | "done" | "failed";

export interface IptvJob {
  id: string;
  kind: IptvJobKind;
  status: IptvJobStatus;
  /** id interno do item AuxPlus (vazio se avulso) */
  itemRefId: string;
  clientName: string;
  /** Usuário no painel IPTV (geralmente o campo Usuário do item) */
  panelUsername: string;
  /** Id remoto no UniPlay (users-iptv) — facilita apagar o teste */
  panelRemoteId?: string | number;
  /** Senha gerada no teste (só jobs de teste) */
  panelPassword?: string;
  /** Link M3U do teste */
  m3u?: string;
  /** DNS Smarters do teste */
  dnsSmarters?: string;
  phone: string;
  dueDate: string | null;
  months: number;
  testHours: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

const JOBS_KEY = "auxplus-iptv-jobs";

function uid() {
  return `iptv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadIptvJobs(userId: string): IptvJob[] {
  try {
    const raw = localStorage.getItem(`${JOBS_KEY}:${userId}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as IptvJob[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveIptvJobs(userId: string, jobs: IptvJob[]) {
  // Mantém os 200 mais recentes
  const trimmed = [...jobs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 200);
  localStorage.setItem(`${JOBS_KEY}:${userId}`, JSON.stringify(trimmed));
}

export function createIptvJob(
  partial: Omit<IptvJob, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: IptvJobStatus;
  },
): IptvJob {
  const now = new Date().toISOString();
  return {
    ...partial,
    id: uid(),
    status: partial.status || "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export function patchIptvJob(
  jobs: IptvJob[],
  id: string,
  patch: Partial<IptvJob>,
): IptvJob[] {
  return jobs.map((j) =>
    j.id === id
      ? { ...j, ...patch, updatedAt: new Date().toISOString() }
      : j,
  );
}

/** Nova data de vencimento após N meses (a partir do vencimento atual ou hoje). */
export function nextDueAfterRenew(
  currentDue: string | null | undefined,
  months: number,
  now = new Date(),
): string {
  const todayKey = format(now, "yyyy-MM-dd");
  const dueKey = ymdOnly(currentDue) || todayKey;
  const base =
    dueKey < todayKey ? parseLocalYmd(todayKey) : parseLocalYmd(dueKey);
  return format(addMonths(base, Math.max(1, months)), "yyyy-MM-dd");
}

/** Aplica renovação no item AuxPlus (vencimento + histórico de pagamento). */
export function applyRenewalToItem(item: Item, months: number): Item {
  const newDue = nextDueAfterRenew(item.dueDate, months);
  const draft: Item = { ...item, dueDate: newDue };
  const payments = paymentsAfterDueChange(item, draft);
  return withEmbeddedPayments({ ...draft, payments });
}

/** Atualiza vencimento do lembrete a partir da data do painel (ou +meses). */
export function applyPanelDueToItem(
  item: Item,
  opts: { panelExp?: string | null; months?: number },
): Item {
  const fromPanel = parseIptvExpToDateTime(opts.panelExp);
  if (fromPanel) {
    const draft: Item = { ...item, dueDate: fromPanel };
    const payments = paymentsAfterDueChange(item, draft);
    return withEmbeddedPayments({ ...draft, payments });
  }
  return applyRenewalToItem(item, opts.months ?? 1);
}

export type SyncIptvResult = {
  data: AppData;
  created: number;
  updated: number;
  skipped: number;
};

/**
 * Sincroniza só a partir dos usuários do UniPlay.
 * - Já existe → atualiza vencimento e nome (nota do painel)
 * - Não existe → cria com usuário, nome (nota) e vencimento
 * - Não apaga nem altera clientes que não estão no painel
 */
export function syncIptvUsersToFolder(
  data: AppData,
  folderId: string,
  users: IptvRemoteUser[],
  opts?: { /** Logins excluídos manualmente — não recriar */ excludedUsernames?: Set<string> },
): SyncIptvResult {
  let next = data;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const excluded = opts?.excludedUsernames;

  const folderItems = () =>
    next.items.filter((i) => i.folderId === folderId && i.isActive !== false);

  for (const remote of users) {
    if (isIptvTestOrTrialUser(remote)) {
      skipped += 1;
      continue;
    }
    const username = String(remote.username || remote.user || "").trim();
    if (!username) {
      skipped += 1;
      continue;
    }
    const dueDate = parseIptvExpToDateTime(
      remote.exp_date ?? remote.expDate,
    );
    const nota = String(remote.nota ?? "").trim();
    const name =
      nota ||
      (remote.name && String(remote.name).trim()) ||
      username;

    const existing = folderItems().find(
      (i) => i.itemId.trim().toLowerCase() === username.toLowerCase(),
    );

    if (!existing && excluded?.has(username.toLowerCase())) {
      skipped += 1;
      continue;
    }

    if (existing) {
      const patch: Partial<typeof existing> = {};
      const existingDue = existing.dueDate
        ? parseIptvExpToDateTime(existing.dueDate) ||
          `${ymdOnly(existing.dueDate)} 00:00:00`
        : "";
      if (dueDate && existingDue !== dueDate) {
        patch.dueDate = dueDate;
      }
      if (name && name !== (existing.name || "").trim()) {
        patch.name = name;
      } else {
        const fixedLocal = fixUtf8Mojibake(existing.name || "");
        if (fixedLocal && fixedLocal !== existing.name) {
          patch.name = fixedLocal;
        }
      }
      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }
      next = updateItem(next, { ...existing, ...patch });
      updated += 1;
    } else {
      next = createItem(next, {
        folderId,
        itemId: username,
        name,
        dueDate,
        phone: "",
        price: 0,
        isActive: true,
      });
      created += 1;
    }
  }

  return { data: next, created, updated, skipped };
}

export type SyncPanelTestsResult = {
  jobs: IptvJob[];
  created: number;
  updated: number;
  removed: number;
};

/**
 * Espelha os testes da lista UniPlay na fila local (jobs kind=test).
 * - Cria/atualiza cada teste encontrado no painel
 * - Remove jobs de teste cujo login não está mais na lista de testes
 * - Não mexe em jobs de renovação
 */
export function mergePanelTestsIntoJobs(
  jobs: IptvJob[],
  remoteUsers: IptvRemoteUser[],
  opts?: { m3uHost?: string; dnsFallback?: string },
): SyncPanelTestsResult {
  const tests = remoteUsers.filter((u) => isIptvTestOrTrialUser(u));
  const renewJobs = jobs.filter((j) => j.kind !== "test");
  const existingTests = jobs.filter((j) => j.kind === "test");
  const usedJobIds = new Set<string>();
  const nextTests: IptvJob[] = [];
  let created = 0;
  let updated = 0;

  const matchExisting = (remote: IptvRemoteUser): IptvJob | undefined => {
    const username = String(remote.username || remote.user || "")
      .trim()
      .toLowerCase();
    const rid = remote.id != null ? String(remote.id) : "";
    return existingTests.find((j) => {
      if (usedJobIds.has(j.id)) return false;
      if (rid && j.panelRemoteId != null && String(j.panelRemoteId) === rid) {
        return true;
      }
      return (
        Boolean(username) &&
        j.panelUsername.trim().toLowerCase() === username
      );
    });
  };

  for (const remote of tests) {
    const username = String(remote.username || remote.user || "").trim();
    if (!username) continue;

    const row = remote as Record<string, unknown>;
    const dueDate =
      parseIptvExpToDateTime(remote.exp_date ?? remote.expDate) || null;
    const nota = String(remote.nota ?? "").trim();
    const clientName =
      nota ||
      (remote.name && String(remote.name).trim()) ||
      username ||
      "Teste UniPlay";
    const password =
      (typeof remote.password === "string" && remote.password.trim()) ||
      "";
    const testHoursRaw = Number(row.test_hours ?? row.testHours ?? 0);
    const testHours =
      Number.isFinite(testHoursRaw) && testHoursRaw > 0
        ? Math.max(1, Math.min(6, Math.round(testHoursRaw)))
        : 6;
    const links = resolveTestAccessLinks({
      username,
      password,
      m3u:
        typeof row.m3u === "string"
          ? row.m3u
          : typeof row.url_m3u === "string"
            ? row.url_m3u
            : undefined,
      dnsSmarters:
        typeof row.dns === "string"
          ? row.dns
          : typeof row.dns_smarters === "string"
            ? row.dns_smarters
            : undefined,
      m3uHost: opts?.m3uHost,
      dnsFallback: opts?.dnsFallback,
    });

    const existing = matchExisting(remote);
    if (existing) {
      usedJobIds.add(existing.id);
      nextTests.push({
        ...existing,
        status: existing.status === "failed" ? "done" : existing.status,
        panelUsername: username,
        panelRemoteId: remote.id ?? existing.panelRemoteId,
        panelPassword: password || existing.panelPassword,
        m3u: links.m3u || existing.m3u,
        dnsSmarters: links.dnsSmarters || existing.dnsSmarters,
        clientName,
        dueDate: dueDate ?? existing.dueDate,
        testHours,
        note: `UniPlay · ${username}${password ? ` / ${password}` : ""}`,
        updatedAt: new Date().toISOString(),
      });
      updated += 1;
    } else {
      nextTests.push(
        createIptvJob({
          kind: "test",
          status: "done",
          itemRefId: "",
          clientName,
          panelUsername: username,
          panelRemoteId: remote.id,
          panelPassword: password || undefined,
          m3u: links.m3u || undefined,
          dnsSmarters: links.dnsSmarters || undefined,
          phone: "",
          dueDate,
          months: 1,
          testHours,
          note: `UniPlay · ${username}${password ? ` / ${password}` : ""}`,
        }),
      );
      created += 1;
    }
  }

  const removed = existingTests.filter((j) => !usedJobIds.has(j.id)).length;
  // Mantém testes locais ainda "em aberto" que não apareceram (ex.: acabou de gerar)
  const keepOpenMissing = existingTests.filter(
    (j) =>
      !usedJobIds.has(j.id) &&
      (j.status === "pending" || j.status === "doing"),
  );

  const jobsOut = [...renewJobs, ...nextTests, ...keepOpenMissing].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );

  return {
    jobs: jobsOut,
    created,
    updated,
    removed: removed - keepOpenMissing.length,
  };
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
