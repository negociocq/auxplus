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
import {
  embedResellerCreditsBought,
  extractResellerCreditsBought,
  stripResellerMarker,
} from "@/lib/resellerCredits";
import {
  embedPlanState,
  extractPlanMonths,
  resolvePlanSegmentsOnSave,
  stripPlanMarker,
  type PlanSegment,
} from "@/lib/planMonths";
import {
  clampScreens,
  embedScreensInNotes,
  extractScreens,
  stripScreensMarker,
} from "@/lib/itemScreens";
import {
  PRORROGA_MARKER_PREFIX,
  PRORROGA_MARKER_SUFFIX,
} from "@/lib/itemExtensions";

function stripProrrogaMarker(notes?: string | null): string {
  if (!notes) return notes || "";
  const start = notes.indexOf(PRORROGA_MARKER_PREFIX);
  if (start === -1) return notes;
  const end = notes.indexOf(PRORROGA_MARKER_SUFFIX, start);
  if (end === -1) return notes;
  return (
    notes.slice(0, start) +
    notes.slice(end + PRORROGA_MARKER_SUFFIX.length)
  );
}

function stripAllMarkers(notes?: string | null): string {
  return stripScreensMarker(
    stripPlanMarker(
      stripResellerMarker(
        stripDebtMarker(stripPaymentMarker(stripProrrogaMarker(notes))),
      ),
    ),
  );
}

function composeNotes(
  notes: string | null | undefined,
  payments: { paidAt: string; amount: number }[],
  debt: ReturnType<typeof extractDebtFromNotes> | undefined,
  resellerCreditsBought?: number | null,
  planMonths?: number | null,
  planSegments?: PlanSegment[] | null,
  screens?: number | null,
): string {
  const boughtFromNotes = extractResellerCreditsBought(notes);
  const bought =
    resellerCreditsBought != null && Number.isFinite(Number(resellerCreditsBought))
      ? Math.max(0, Math.floor(Number(resellerCreditsBought)))
      : boughtFromNotes;
  const planFromNotes = extractPlanMonths(notes);
  const plan =
    planMonths != null && Number.isFinite(Number(planMonths))
      ? Math.max(1, Math.min(24, Math.floor(Number(planMonths))))
      : planFromNotes ?? 1;
  const screensFromNotes = extractScreens(notes);
  const screenCount =
    screens != null && Number.isFinite(Number(screens))
      ? clampScreens(screens, 0)
      : screensFromNotes;
  let next = stripAllMarkers(notes);
  if (debt?.installments?.length) next = embedDebtInNotes(next, debt);
  next = embedPaymentsInNotes(next, payments);
  if (bought != null) next = embedResellerCreditsBought(next, bought);
  if (planSegments?.length) next = embedPlanState(next, plan, planSegments);
  else if (plan > 1) next = embedPlanState(next, plan, []);
  if (screenCount != null && screenCount >= 1) {
    next = embedScreensInNotes(next, screenCount);
  }
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
  // `payments: []` explícito = sem histórico (ex.: revendedor novo)
  const payments =
    input.payments != null ? input.payments : paymentsForNewItem(input);
  const debt =
    input.debt ??
    extractDebtFromNotes(input.notes) ??
    undefined;
  const dueDate = debt ? nextOpenDue(debt) ?? input.dueDate : input.dueDate;
  const planMonths =
    input.planMonths != null
      ? Math.max(1, Math.min(24, Math.floor(Number(input.planMonths) || 1)))
      : extractPlanMonths(input.notes) ?? 1;
  const price = debt?.total ?? input.price;
  const planHistory = resolvePlanSegmentsOnSave(null, {
    price,
    planMonths,
    createdAt: input.createdAt,
  });
  const screens =
    input.screens != null
      ? clampScreens(input.screens, 1)
      : extractScreens(input.notes);
  const item: Item = {
    ...input,
    debt: debt ?? undefined,
    dueDate,
    price,
    payments,
    planMonths,
    planHistory,
    screens: screens ?? null,
    resellerCreditsBought: input.resellerCreditsBought ?? null,
    notes: composeNotes(
      input.notes,
      payments,
      debt,
      input.resellerCreditsBought,
      planMonths,
      planHistory,
      screens,
    ),
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

  const prevPays = previous ? getItemPayments(previous) : [];
  const incomingPays = item.payments != null ? item.payments : null;
  const paymentsFinal = previous
    ? renewed
      ? paymentsAfterDueChange(previous, item)
      : // `payments` explícito no item (mesmo vazio) prevalece
        incomingPays != null
        ? incomingPays
        : prevPays
    : incomingPays != null
      ? incomingPays
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

  const bought =
    item.resellerCreditsBought != null
      ? item.resellerCreditsBought
      : previous?.resellerCreditsBought ??
        extractResellerCreditsBought(item.notes ?? previous?.notes);

  const planMonths =
    item.planMonths != null
      ? Math.max(1, Math.min(24, Math.floor(Number(item.planMonths) || 1)))
      : previous?.planMonths ??
        extractPlanMonths(item.notes ?? previous?.notes) ??
        1;

  const price = debt?.total ?? item.price;
  const planHistory = resolvePlanSegmentsOnSave(previous, {
    price,
    planMonths,
    createdAt: item.createdAt ?? previous?.createdAt,
  });

  const screens =
    item.screens != null
      ? clampScreens(item.screens, 1)
      : previous?.screens ??
        extractScreens(item.notes ?? previous?.notes);

  const updated: Item = {
    ...item,
    debt: debt ?? undefined,
    dueDate,
    price,
    payments: paymentsFinal,
    planMonths,
    planHistory,
    screens: screens ?? null,
    resellerCreditsBought: bought ?? null,
    notes: composeNotes(
      item.notes,
      paymentsFinal,
      debt ?? undefined,
      bought,
      planMonths,
      planHistory,
      screens,
    ),
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
