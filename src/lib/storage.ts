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
import {
  embedDebtInNotes,
  extractDebtFromNotes,
  nextOpenDue,
  stripDebtMarker,
} from "@/lib/debts";
import {
  embedPaymentsInNotes,
  getItemPayments,
  paymentsAfterDueChange,
  paymentsForNewItem,
  stripPaymentMarker,
} from "@/lib/payments";

function stripAllMarkers(notes?: string | null): string {
  return stripDebtMarker(stripPaymentMarker(notes));
}

function composeNotes(
  notes: string | null | undefined,
  payments: { paidAt: string; amount: number }[],
  debt: ReturnType<typeof extractDebtFromNotes> | undefined,
): string {
  let next = stripAllMarkers(notes);
  if (debt?.installments?.length) next = embedDebtInNotes(next, debt);
  next = embedPaymentsInNotes(next, payments);
  return next;
}

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

/** Data local YYYY-MM-DD (evita fuso UTC que atrasa 1 dia no Brasil). */
export function parseLocalDateOnly(value: string): Date {
  const raw = value.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return parseISO(raw);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfTodayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Espelha o CASE do items.php: Longe = dias > far; Perto = 0..near; senão Vencido. */
export function computeItemStatus(
  dueDate: string | null,
  nearDueDays: number,
  farDueDays: number = nearDueDays,
): ItemStatus {
  if (!dueDate) return "Sem Vencimento";
  const days = differenceInCalendarDays(
    parseLocalDateOnly(dueDate),
    startOfTodayLocal(),
  );
  if (days < 0) return "Já Vencido";
  if (days <= nearDueDays) return "Perto de Vencer";
  if (days > farDueDays) return "Longe de Vencer";
  // Intervalo (near, far]: no PHP cai no ELSE → vencido
  return "Já Vencido";
}

function folderThresholds(
  data: AppData,
  folderId: string,
): { near: number; far: number } {
  const s = data.folderSettings.find((x) => x.folderId === folderId);
  return {
    near: s?.nearDueDays ?? 3,
    far: s?.farDueDays ?? s?.nearDueDays ?? 3,
  };
}

export function refreshItemStatuses(data: AppData): AppData {
  return {
    ...data,
    items: data.items.map((item) => {
      const { near, far } = folderThresholds(data, item.folderId);
      return { ...item, status: computeItemStatus(item.dueDate, near, far) };
    }),
  };
}

function emailTakenByOther(
  data: AppData,
  normalizedEmail: string,
  exceptUserId?: string,
) {
  return data.users.some((u) => {
    if (exceptUserId && u.id === exceptUserId) return false;
    const confirmed = u.email?.trim().toLowerCase();
    const pending = u.pendingEmail?.trim().toLowerCase();
    return confirmed === normalizedEmail || pending === normalizedEmail;
  });
}

export function createUser(
  data: AppData,
  username: string,
  password: string,
  email: string,
): { data: AppData; error?: string; user?: User } {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { data, error: "Informe um e-mail." };
  }
  if (
    data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())
  ) {
    return { data, error: "Nome de usuário já existe." };
  }
  if (emailTakenByOther(data, normalizedEmail)) {
    return { data, error: "Este e-mail já está em uso." };
  }
  const user: User = {
    id: nextId(data.users.map((u) => u.id)),
    username,
    email: null,
    pendingEmail: normalizedEmail,
    password,
    isAdmin: false,
    isActive: true,
  };
  return { data: { ...data, users: [...data.users, user] }, user };
}

export { emailTakenByOther };

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
  const { near, far } = folderThresholds(data, input.folderId);
  const payments = input.payments?.length
    ? input.payments
    : paymentsForNewItem(input);
  const debt =
    input.debt ??
    extractDebtFromNotes(input.notes) ??
    undefined;
  const dueDate = debt ? nextOpenDue(debt) ?? input.dueDate : input.dueDate;
  const item: Item = {
    ...input,
    debt: debt ?? undefined,
    dueDate,
    price: debt?.total ?? input.price,
    payments,
    notes: composeNotes(input.notes, payments, debt),
    isActive: input.isActive !== false,
    id: nextId(data.items.map((i) => i.id)),
    status: computeItemStatus(dueDate, near, far),
  };
  return { ...data, items: [...data.items, item] };
}

export function updateItem(data: AppData, item: Item): AppData {
  const { near, far } = folderThresholds(data, item.folderId);
  const previous = data.items.find((i) => i.id === item.id);
  const oldDue = previous?.dueDate?.slice(0, 10) ?? null;
  const newDue = item.dueDate?.slice(0, 10) ?? null;
  const renewed = Boolean(oldDue && newDue && newDue > oldDue);

  const paymentsFinal = previous
    ? renewed
      ? paymentsAfterDueChange(previous, item)
      : getItemPayments(previous)
    : item.payments?.length
      ? item.payments
      : paymentsForNewItem(item);

  const debt =
    item.debt ??
    extractDebtFromNotes(item.notes) ??
    (previous ? extractDebtFromNotes(previous.notes) : null) ??
    undefined;

  // Se tem plano de dívida, dueDate = próxima parcela em aberto
  const dueDate = debt?.installments?.length
    ? nextOpenDue(debt)
    : item.dueDate;

  const updated: Item = {
    ...item,
    debt: debt ?? undefined,
    dueDate,
    price: debt?.total ?? item.price,
    payments: paymentsFinal,
    notes: composeNotes(item.notes, paymentsFinal, debt ?? undefined),
    status: computeItemStatus(dueDate, near, far),
  };
  return {
    ...data,
    items: data.items.map((i) => (i.id === item.id ? updated : i)),
  };
}

export function deleteItem(data: AppData, itemId: string): AppData {
  return { ...data, items: data.items.filter((i) => i.id !== itemId) };
}

export function deleteAllItemsInFolder(
  data: AppData,
  folderId: string,
): AppData {
  return {
    ...data,
    items: data.items.filter((i) => i.folderId !== folderId),
  };
}

export function upsertWhatsappMessage(
  data: AppData,
  userId: string,
  folderId: string,
  message: string,
): AppData {
  const others = (data.whatsappMessages ?? []).filter(
    (m) => !(m.userId === userId && m.folderId === folderId),
  );
  return {
    ...data,
    whatsappMessages: [...others, { userId, folderId, message }],
  };
}

export function moveItem(
  data: AppData,
  itemId: string,
  targetFolderId: string,
): AppData {
  const { near, far } = folderThresholds(data, targetFolderId);
  return {
    ...data,
    items: data.items.map((i) => {
      if (i.id !== itemId) return i;
      const next = { ...i, folderId: targetFolderId };
      return { ...next, status: computeItemStatus(next.dueDate, near, far) };
    }),
  };
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
