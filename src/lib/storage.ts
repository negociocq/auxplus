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

const STORAGE_KEY = "auxplus-data-v1";
const SESSION_KEY = "auxplus-session-v1";

function uid(): string {
  return crypto.randomUUID();
}

function seedData(): AppData {
  const adminId = uid();
  const userId = uid();
  const folderId = uid();

  return {
    users: [
      {
        id: adminId,
        username: "admin",
        password: "admin123",
        isAdmin: true,
        isActive: true,
      },
      {
        id: userId,
        username: "demo",
        password: "demo123",
        isAdmin: false,
        isActive: true,
      },
    ],
    folders: [
      {
        id: folderId,
        userId,
        type: "Cliente",
        name: "IPTV",
      },
    ],
    folderSettings: [
      { folderId, nearDueDays: 3, farDueDays: 10 },
    ],
    items: [
      {
        id: uid(),
        folderId,
        itemId: "1001",
        name: "Cliente Exemplo",
        dueDate: new Date().toISOString().slice(0, 10),
        phone: "+5571999999999",
        price: 35,
        status: "Perto de Vencer",
      },
      {
        id: uid(),
        folderId,
        itemId: "1002",
        name: "Cliente Longe",
        dueDate: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
        phone: "+5571888888888",
        price: 40,
        status: "Longe de Vencer",
      },
      {
        id: uid(),
        folderId,
        itemId: "1003",
        name: "Cliente Vencido",
        dueDate: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
        phone: "+5571777777777",
        price: 30,
        status: "Já Vencido",
      },
    ],
    tickets: [],
  };
}

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedData();
    saveData(seeded);
    return seeded;
  }
  try {
    return JSON.parse(raw) as AppData;
  } catch {
    const seeded = seedData();
    saveData(seeded);
    return seeded;
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    id: uid(),
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
  const folder: Folder = { id: uid(), userId, name, type };
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
    id: uid(),
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
    id: uid(),
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
