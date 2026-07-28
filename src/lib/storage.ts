import seed from "@/data/seed.json";
import type {
  AppData,
  Folder,
  FolderSettings,
  Item,
  ItemStatus,
  Ticket,
  User,
} from "@/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

const STORAGE_KEY = "auxplus-data-v2";
const SESSION_KEY = "auxplus-session-v1";

function nextId(ids: string[]): string {
  const max = ids.reduce((m, id) => {
    const n = Number(id);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return String(max + 1);
}

function seedData(): AppData {
  return refreshItemStatuses({
    users: seed.users as User[],
    folders: seed.folders as Folder[],
    folderSettings: seed.folderSettings as FolderSettings[],
    folderMessages: seed.folderMessages ?? [],
    whatsappMessages: seed.whatsappMessages ?? [],
    items: (seed.items as Item[]).map((item) => ({
      ...item,
      notes: item.notes ?? "",
      isActive: item.isActive !== false,
    })),
    tickets: seed.tickets as Ticket[],
  });
}

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedData();
    saveData(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as AppData;
    return refreshItemStatuses({
      ...parsed,
      folderMessages: parsed.folderMessages ?? [],
      whatsappMessages: parsed.whatsappMessages ?? [],
    });
  } catch {
    const seeded = seedData();
    saveData(seeded);
    return seeded;
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetToSeed(): AppData {
  const seeded = seedData();
  saveData(seeded);
  return seeded;
}

export function getSessionUserId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(userId: string | null): void {
  if (userId) localStorage.setItem(SESSION_KEY, userId);
  else localStorage.removeItem(SESSION_KEY);
}

export function computeItemStatus(
  dueDate: string | null,
  nearDueDays: number,
): ItemStatus {
  if (!dueDate) return "Sem Vencimento";
  const days = differenceInCalendarDays(parseISO(dueDate), new Date());
  if (days < 0) return "Já Vencido";
  if (days <= nearDueDays) return "Perto de Vencer";
  return "Longe de Vencer";
}

export function refreshItemStatuses(data: AppData): AppData {
  const settingsMap = new Map(
    data.folderSettings.map((s) => [s.folderId, s.nearDueDays]),
  );
  return {
    ...data,
    items: data.items.map((item) => {
      const near = settingsMap.get(item.folderId) ?? 3;
      return { ...item, status: computeItemStatus(item.dueDate, near) };
    }),
  };
}

export function createUser(
  data: AppData,
  username: string,
  password: string,
): { data: AppData; error?: string; user?: User } {
  if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { data, error: "Nome de usuário já existe." };
  }
  const user: User = {
    id: nextId(data.users.map((u) => u.id)),
    username,
    password,
    isAdmin: false,
    isActive: true,
  };
  return { data: { ...data, users: [...data.users, user] }, user };
}

export function createFolder(
  data: AppData,
  userId: string,
  name: string,
  type: Folder["type"],
): AppData {
  const folder: Folder = {
    id: nextId(data.folders.map((f) => f.id)),
    userId,
    name,
    type,
  };
  const settings: FolderSettings = {
    folderId: folder.id,
    nearDueDays: 3,
    farDueDays: 10,
  };
  return {
    ...data,
    folders: [...data.folders, folder],
    folderSettings: [...data.folderSettings, settings],
  };
}

export function updateFolder(
  data: AppData,
  folderId: string,
  name: string,
  type: Folder["type"],
): AppData {
  return {
    ...data,
    folders: data.folders.map((f) =>
      f.id === folderId ? { ...f, name, type } : f,
    ),
  };
}

export function deleteFolder(data: AppData, folderId: string): AppData {
  return {
    ...data,
    folders: data.folders.filter((f) => f.id !== folderId),
    folderSettings: data.folderSettings.filter((s) => s.folderId !== folderId),
    items: data.items.filter((i) => i.folderId !== folderId),
    folderMessages: (data.folderMessages ?? []).filter(
      (m) => m.folderId !== folderId,
    ),
    whatsappMessages: (data.whatsappMessages ?? []).filter(
      (m) => m.folderId !== folderId,
    ),
  };
}

export function createItem(
  data: AppData,
  input: Omit<Item, "id" | "status">,
): AppData {
  const near =
    data.folderSettings.find((s) => s.folderId === input.folderId)?.nearDueDays ??
    3;
  const item: Item = {
    ...input,
    notes: input.notes ?? "",
    isActive: input.isActive !== false,
    id: nextId(data.items.map((i) => i.id)),
    status: computeItemStatus(input.dueDate, near),
  };
  return { ...data, items: [...data.items, item] };
}

export function updateItem(data: AppData, item: Item): AppData {
  const near =
    data.folderSettings.find((s) => s.folderId === item.folderId)?.nearDueDays ??
    3;
  const updated = {
    ...item,
    status: computeItemStatus(item.dueDate, near),
  };
  return {
    ...data,
    items: data.items.map((i) => (i.id === item.id ? updated : i)),
  };
}

export function deleteItem(data: AppData, itemId: string): AppData {
  return { ...data, items: data.items.filter((i) => i.id !== itemId) };
}

export function updateFolderSettings(
  data: AppData,
  folderId: string,
  nearDueDays: number,
  farDueDays: number,
): AppData {
  const exists = data.folderSettings.some((s) => s.folderId === folderId);
  const folderSettings = exists
    ? data.folderSettings.map((s) =>
        s.folderId === folderId ? { ...s, nearDueDays, farDueDays } : s,
      )
    : [...data.folderSettings, { folderId, nearDueDays, farDueDays }];
  return refreshItemStatuses({ ...data, folderSettings });
}

export function createTicket(
  data: AppData,
  userId: string,
  question: string,
): AppData {
  const ticket: Ticket = {
    id: nextId(data.tickets.map((t) => t.id)),
    userId,
    question,
    response: null,
    createdAt: new Date().toISOString(),
    respondedAt: null,
  };
  return { ...data, tickets: [ticket, ...data.tickets] };
}

export function respondTicket(
  data: AppData,
  ticketId: string,
  response: string,
): AppData {
  return {
    ...data,
    tickets: data.tickets.map((t) =>
      t.id === ticketId
        ? { ...t, response, respondedAt: new Date().toISOString() }
        : t,
    ),
  };
}
