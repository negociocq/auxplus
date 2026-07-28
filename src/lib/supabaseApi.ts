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
    password: String(row.password ?? ""),
    isAdmin: Boolean(row.is_admin),
    isActive: row.is_active !== false,
  };
}

function mapFolder(row: Record<string, unknown>): Folder {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: row.type === "Produto" ? "Produto" : "Cliente",
    name: String(row.name ?? ""),
    whatsappMessage: (row.whatsapp_message as string) ?? null,
  };
}

function mapItem(row: Record<string, unknown>): Item {
  const statusRaw = String(row.status || "");
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    itemId: String(row.item_id ?? ""),
    name: String(row.name ?? ""),
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    phone: String(row.phone ?? ""),
    price: Number(row.price) || 0,
    status: VALID_STATUS.includes(statusRaw as ItemStatus)
      ? (statusRaw as ItemStatus)
      : "Sem Vencimento",
    notes: String(row.notes ?? ""),
    createdAt: row.created_at ? String(row.created_at) : null,
    isActive: row.is_active !== false,
  };
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
    data.folderSettings.map((s) => [s.folderId, s.nearDueDays]),
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
      const near = settingsMap.get(i.folderId) ?? 3;
      const status = computeItemStatus(i.dueDate, near);
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
  username: string,
  password: string,
): Promise<{ user?: User; error?: string }> {
  if (!supabase) return { error: "Supabase não configurado" };

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .ilike("username", username.trim())
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Nome de usuário ou senha inválidos." };

  const user = mapUser(data as Record<string, unknown>);
  if (user.password !== password) {
    return { error: "Nome de usuário ou senha inválidos." };
  }
  if (!user.isActive) {
    return { error: "Sua conta está desativada. Entre em contato com o suporte." };
  }
  return { user };
}

export { isSupabaseConfigured };
