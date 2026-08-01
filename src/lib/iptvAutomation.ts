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
import { supabase } from "@/integrations/supabase/client";

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
const jobsDbKey = (userId: string) => `iptv_jobs_user_${userId}`;

function uid() {
  return `iptv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function trimJobs(jobs: IptvJob[]): IptvJob[] {
  return [...jobs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 200);
}

function isJob(v: unknown): v is IptvJob {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.kind === "renew" || o.kind === "test") &&
    typeof o.status === "string"
  );
}

/** Une listas por id, ficando com o registro mais recente (updatedAt). */
export function mergeIptvJobs(a: IptvJob[], b: IptvJob[]): IptvJob[] {
  const map = new Map<string, IptvJob>();
  for (const job of [...a, ...b]) {
    if (!isJob(job)) continue;
    const prev = map.get(job.id);
    if (!prev || job.updatedAt > prev.updatedAt) map.set(job.id, job);
  }
  return trimJobs([...map.values()]);
}

export function loadIptvJobs(userId: string): IptvJob[] {
  try {
    const raw = localStorage.getItem(`${JOBS_KEY}:${userId}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as IptvJob[];
    return Array.isArray(list) ? list.filter(isJob) : [];
  } catch {
    return [];
  }
}

function writeLocalJobs(userId: string, jobs: IptvJob[]) {
  localStorage.setItem(
    `${JOBS_KEY}:${userId}`,
    JSON.stringify(trimJobs(jobs)),
  );
}

async function persistJobsRemote(
  userId: string,
  jobs: IptvJob[],
): Promise<{ ok: boolean; warning?: string }> {
  if (!supabase || !userId) {
    return {
      ok: true,
      warning: "Fila salva só neste navegador (Supabase indisponível).",
    };
  }
  try {
    const { error } = await supabase.from("platform_settings").upsert(
      {
        key: jobsDbKey(userId),
        value: { jobs: trimJobs(jobs) },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) {
      return {
        ok: true,
        warning: `Salvo localmente. Nuvem: ${error.message}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: true,
      warning:
        e instanceof Error
          ? e.message
          : "Salvo localmente; falha ao gravar na nuvem.",
    };
  }
}

/**
 * Carrega fila/log: nuvem (conta) + local, mesclados.
 * Assim localhost e domínio veem as mesmas renovações.
 */
export async function loadIptvJobsRemote(userId: string): Promise<IptvJob[]> {
  const local = loadIptvJobs(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", jobsDbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      if (local.length) void persistJobsRemote(userId, local);
      return local;
    }
    const raw =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as { jobs?: unknown })
        : (data.value as { jobs?: unknown });
    const remote = Array.isArray(raw?.jobs)
      ? (raw.jobs as unknown[]).filter(isJob)
      : [];
    const merged = mergeIptvJobs(local, remote);
    writeLocalJobs(userId, merged);
    // Se o local tinha algo a mais, sobe o merge
    if (local.length && merged.length !== remote.length) {
      void persistJobsRemote(userId, merged);
    } else if (
      local.some((j) => {
        const r = remote.find((x) => x.id === j.id);
        return !r || j.updatedAt > r.updatedAt;
      })
    ) {
      void persistJobsRemote(userId, merged);
    }
    return merged;
  } catch {
    return local;
  }
}

/** Salva local + nuvem (vinculado à conta AuxPlus). */
export function saveIptvJobs(userId: string, jobs: IptvJob[]) {
  const trimmed = trimJobs(jobs);
  writeLocalJobs(userId, trimmed);
  void persistJobsRemote(userId, trimmed);
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
