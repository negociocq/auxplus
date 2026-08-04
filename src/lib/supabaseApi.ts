import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type {
  AppData,
  Folder,
  FolderMessage,
  FolderSettings,
  Item,
  ItemStatus,
  Ticket,
  User,
  WhatsappMessage,
} from "@/types";
import { verifyPassword } from "@/lib/password";
import { extractDebtFromNotes } from "@/lib/debts";
import { extractPaymentsFromNotes } from "@/lib/payments";
import { extractPlanMonths, getPlanSegments } from "@/lib/planMonths";
import { extractScreens } from "@/lib/itemScreens";
import { extractResellerCreditsBought } from "@/lib/resellerCredits";
import { computeItemStatus, refreshItemStatuses } from "@/lib/storage";

const VALID_STATUS: ItemStatus[] = [
  "Longe de Vencer",
  "Perto de Vencer",
  "Já Vencido",
  "Sem Vencimento",
];

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    username: String(row.username),
    email: row.email ? String(row.email) : null,
    pendingEmail: row.pending_email ? String(row.pending_email) : null,
    password: String(row.password ?? ""),
    isAdmin: Boolean(row.is_admin),
    isActive: row.is_active !== false,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  };
}

function normalizeFolderType(raw: unknown, name: string): Folder["type"] {
  const t = String(raw ?? "");
  if (t === "Dívida" || t === "Divida") return "Dívida";
  // Migração: pasta "Dívidas" antiga vinha como Produto
  if (/^d[ií]vidas?$/i.test(name.trim())) return "Dívida";
  // Pasta "Produto" não existe mais — vira Cliente
  return "Cliente";
}

function mapFolder(row: Record<string, unknown>): Folder {
  const name = String(row.name ?? "");
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: normalizeFolderType(row.type, name),
    name,
    whatsappMessage: (row.whatsapp_message as string) ?? null,
  };
}

function normalizeDueDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const s = value.trim();
    const m = s.match(
      /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (!m) return null;
    if (!m[2]) return m[1];
    return `${m[1]} ${m[2]}:${m[3]}:${m[4] ?? "00"}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // timestamp sem tz: preferir componentes locais se houver hora
    const hasTime =
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0;
    if (!hasTime) {
      // legado date (meia-noite UTC) — manter dia civil via UTC
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, "0");
      const d = String(value.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    const hh = String(value.getHours()).padStart(2, "0");
    const mm = String(value.getMinutes()).padStart(2, "0");
    const ss = String(value.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }
  return null;
}

function mapItem(row: Record<string, unknown>): Item {
  const statusRaw = String(row.status || "");
  const notes = String(row.notes ?? "");
  const payments = extractPaymentsFromNotes(notes);
  const debt = extractDebtFromNotes(notes);
  const resellerCreditsBought = extractResellerCreditsBought(notes);
  const planMonths = extractPlanMonths(notes);
  const screens = extractScreens(notes);
  const base = {
    id: String(row.id),
    folderId: String(row.folder_id),
    itemId: String(row.item_id ?? ""),
    name: String(row.name ?? ""),
    dueDate: normalizeDueDate(row.due_date),
    phone: String(row.phone ?? ""),
    price: Number(row.price) || 0,
    status: VALID_STATUS.includes(statusRaw as ItemStatus)
      ? (statusRaw as ItemStatus)
      : "Sem Vencimento",
    notes,
    createdAt: row.created_at ? String(row.created_at) : null,
    isActive: row.is_active !== false,
    payments: payments.length ? payments : undefined,
    planMonths: planMonths ?? 1,
    screens: screens ?? null,
    resellerCreditsBought: resellerCreditsBought ?? null,
    debt: debt ?? undefined,
  };
  const planHistory = getPlanSegments(base);
  return { ...base, planHistory };
}

function mapTicket(row: Record<string, unknown>): Ticket {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    question: String(row.question ?? ""),
    response: row.response ? String(row.response) : null,
    createdAt: row.created_at
      ? String(row.created_at)
      : new Date().toISOString(),
    respondedAt: row.responded_at ? String(row.responded_at) : null,
  };
}

export async function fetchAppDataFromSupabase(): Promise<AppData> {
  if (!supabase) throw new Error("Supabase não configurado");

  const [
    usersRes,
    foldersRes,
    settingsRes,
    itemsRes,
    ticketsRes,
    folderMsgRes,
    waRes,
  ] = await Promise.all([
    supabase.from("users").select("*").order("id"),
    supabase.from("folders").select("*").order("id"),
    supabase.from("folder_settings").select("*"),
    supabase.from("items").select("*").order("id"),
    supabase.from("tickets").select("*").order("id", { ascending: false }),
    supabase.from("folder_messages").select("*"),
    supabase.from("whatsapp_messages").select("*"),
  ]);

  const errors = [
    usersRes.error,
    foldersRes.error,
    settingsRes.error,
    itemsRes.error,
    ticketsRes.error,
    folderMsgRes.error,
    waRes.error,
  ].filter(Boolean);

  if (errors.length) {
    throw new Error(errors.map((e) => e!.message).join(" | "));
  }

  const folderSettings: FolderSettings[] = (settingsRes.data || []).map(
    (row) => ({
      folderId: String(row.folder_id),
      nearDueDays: Number(row.near_due_days) || 3,
      farDueDays: Number(row.far_due_days) || 3,
    }),
  );

  const folderMessages: FolderMessage[] = (folderMsgRes.data || []).map(
    (row) => ({
      id: String(row.id),
      folderId: String(row.folder_id),
      message: String(row.message ?? ""),
    }),
  );

  const whatsappMessages: WhatsappMessage[] = (waRes.data || []).map((row) => ({
    userId: String(row.user_id),
    folderId: String(row.folder_id),
    message: String(row.message ?? ""),
  }));

  const data: AppData = {
    users: (usersRes.data || []).map(mapUser),
    folders: (foldersRes.data || []).map(mapFolder),
    folderSettings,
    folderMessages,
    whatsappMessages,
    items: (itemsRes.data || []).map(mapItem),
    tickets: (ticketsRes.data || []).map(mapTicket),
  };

  return refreshItemStatuses(data);
}

async function syncTable(
  table: string,
  rows: Record<string, unknown>[],
  idKey: string,
) {
  if (!supabase) return;
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) throw error;
  }
  const { data: existing, error: listErr } = await supabase
    .from(table)
    .select(idKey);
  if (listErr) throw listErr;
  const keep = new Set(rows.map((r) => String(r[idKey])));
  const toDelete = (existing || [])
    .map((r) => String((r as Record<string, unknown>)[idKey]))
    .filter((id) => !keep.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from(table).delete().in(idKey, toDelete);
    if (error) throw error;
  }
}

export async function persistAppDataToSupabase(data: AppData): Promise<void> {
  if (!supabase) throw new Error("Supabase não configurado");

  const settingsMap = new Map(
    data.folderSettings.map((s) => [
      s.folderId,
      { near: s.nearDueDays, far: s.farDueDays ?? s.nearDueDays },
    ]),
  );

  await syncTable(
    "users",
    data.users.map((u) => ({
      id: Number(u.id),
      username: u.username,
      password: u.password,
      is_admin: u.isAdmin,
      is_active: u.isActive,
    })),
    "id",
  );

  // Campos opcionais (migrations: avatar / email / pending_email)
  // E-mail confirmado só é gravado via finalizeEmailConfirmation (após o link).
  for (const u of data.users) {
    const patch: Record<string, unknown> = {};
    if (u.avatarUrl !== undefined) patch.avatar_url = u.avatarUrl ?? null;
    if (u.email?.trim()) {
      patch.email = u.email.trim().toLowerCase();
      patch.pending_email = null;
    } else if (u.pendingEmail !== undefined) {
      patch.pending_email = u.pendingEmail?.trim().toLowerCase() || null;
    }
    if (!Object.keys(patch).length) continue;
    const { error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", Number(u.id));
    if (
      error &&
      !/avatar_url|email|pending_email|schema cache/i.test(error.message)
    ) {
      console.warn("[AuxPlus] user extras sync:", error.message);
    }
  }

  await syncTable(
    "folders",
    data.folders.map((f) => ({
      id: Number(f.id),
      user_id: Number(f.userId),
      type: f.type,
      name: f.name,
      whatsapp_message: f.whatsappMessage ?? null,
    })),
    "id",
  );

  await syncTable(
    "folder_settings",
    data.folderSettings.map((s) => ({
      folder_id: Number(s.folderId),
      near_due_days: s.nearDueDays,
      far_due_days: s.farDueDays,
    })),
    "folder_id",
  );

  await syncTable(
    "items",
    data.items.map((i) => {
      const th = settingsMap.get(i.folderId) ?? { near: 3, far: 3 };
      const status = computeItemStatus(i.dueDate, th.near, th.far);
      return {
        id: Number(i.id),
        folder_id: Number(i.folderId),
        item_id: i.itemId,
        name: i.name,
        due_date: i.dueDate,
        phone: i.phone || null,
        status,
        price: i.price || 0,
        notes: i.notes || null,
        created_at: i.createdAt
          ? String(i.createdAt).replace("T", " ").slice(0, 19)
          : null,
        is_active: i.isActive !== false,
      };
    }),
    "id",
  );

  await syncTable(
    "tickets",
    data.tickets.map((t) => ({
      id: Number(t.id),
      user_id: Number(t.userId),
      question: t.question,
      status: t.response ? "answered" : "pending",
      created_at: t.createdAt
        ? String(t.createdAt).replace("T", " ").slice(0, 19)
        : null,
      response: t.response,
      responded_at: t.respondedAt
        ? String(t.respondedAt).replace("T", " ").slice(0, 19)
        : null,
    })),
    "id",
  );

  if (data.folderMessages) {
    await syncTable(
      "folder_messages",
      data.folderMessages.map((m) => ({
        id: Number(m.id),
        folder_id: Number(m.folderId),
        message: m.message,
      })),
      "id",
    );
  }

  // whatsapp_messages: chave composta — recria tudo
  await supabase.from("whatsapp_messages").delete().gte("user_id", 0);
  if (data.whatsappMessages?.length) {
    const { error } = await supabase.from("whatsapp_messages").insert(
      data.whatsappMessages.map((m) => ({
        user_id: Number(m.userId),
        folder_id: Number(m.folderId),
        message: m.message,
      })),
    );
    if (error) throw error;
  }
}

export async function loginWithSupabase(
  login: string,
  password: string,
): Promise<{ user?: User; error?: string }> {
  if (!supabase) return { error: "Supabase não configurado" };

  const id = login.trim();
  if (!id) return { error: "Informe usuário ou e-mail." };

  let row: Record<string, unknown> | null = null;

  const byUser = await supabase
    .from("users")
    .select("*")
    .ilike("username", id)
    .limit(1)
    .maybeSingle();
  if (byUser.error) return { error: byUser.error.message };
  row = (byUser.data as Record<string, unknown> | null) ?? null;

  // Se não achou por usuário, tenta e-mail
  if (!row) {
    const byEmail = await supabase
      .from("users")
      .select("*")
      .ilike("email", id)
      .limit(1)
      .maybeSingle();
    // Coluna email pode ainda não existir
    if (byEmail.error && !/email/i.test(byEmail.error.message)) {
      return { error: byEmail.error.message };
    }
    row = (byEmail.data as Record<string, unknown> | null) ?? null;
  }

  if (!row) return { error: "Usuário/e-mail ou senha inválidos." };

  const user = mapUser(row);
  const ok = await verifyPassword(password, user.password);
  if (!ok) {
    return { error: "Usuário/e-mail ou senha inválidos." };
  }
  if (!user.isActive) {
    return { error: "Sua conta está desativada. Entre em contato com o suporte." };
  }
  return { user };
}

export { isSupabaseConfigured };
