import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  PhoneOff,
  Search,
  Settings2,
  Trash2,
  Upload,
  MessageSquareText,
  StickyNote,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import {
  computeItemStatus,
  createItem,
  deleteAllItemsInFolder,
  deleteItem,
  moveItem,
  updateFolderSettings,
  updateItem,
  upsertWhatsappMessage,
} from "@/lib/storage";
import {
  formatBrDate,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/format";
import { normSearch } from "@/lib/utils";
import { useHideBalance } from "@/hooks/useHideBalance";
import {
  annualPaymentBalance,
  getRecordedPayments,
  stripPaymentMarker,
  sumPaymentsByMonth,
  sumRecordedPaymentsByMonth,
} from "@/lib/payments";
import {
  getResellerCreditsBought,
  resellerCreditsValueBrl,
  stripResellerMarker,
  sumResellerCreditsValueByItems,
} from "@/lib/resellerCredits";
import {
  getPlanMonths,
  planCycleProgress,
  planPixAmount,
  stripPlanMarker,
} from "@/lib/planMonths";
import { getItemScreens, stripScreensMarker } from "@/lib/itemScreens";
import { stripDebtMarker } from "@/lib/debts";
import type { Item, ItemStatus } from "@/types";

/** Nota que o usuário vê/edita — sem marcadores internos (plano, pagamentos, etc.). */
function notesForDisplay(notes?: string | null): string {
  return stripScreensMarker(
    stripPlanMarker(
      stripResellerMarker(stripDebtMarker(stripPaymentMarker(notes))),
    ),
  );
}

/** Sem número útil (vazio, só +55, ou incompleto). */
function isMissingPhone(phone?: string | null): boolean {
  const raw = String(phone || "").trim();
  if (!raw || raw === "+55" || raw === "55") return true;
  const d = raw.replace(/\D/g, "");
  if (d.length <= 2) return true;
  if (d === "55") return true;
  return d.length < 10;
}

type ListFilter = "all" | ItemStatus | "no-phone";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DebtFolderView } from "@/components/debt/DebtFolderView";
import { isExpenseFolderType } from "@/types";
import {
  isUniplayConnected,
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
  saveAutomationsConfig,
} from "@/lib/automationsConfig";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import {
  ensureIptvToken,
  formatIptvCredits,
  getLastIssuedIptvToken,
  listIptvResellers,
  listIptvUsers,
  type IptvResellerMovement,
} from "@/lib/iptvPanelApi";
import {
  applyResellerMovementsToFolder,
  buildPriceMapFromMpOrders,
  syncIptvResellersToFolder,
  syncIptvUsersToFolder,
} from "@/lib/iptvAutomation";
import { ResellerMovementsDialog } from "@/components/shared/ResellerMovementsDialog";
import {
  excludeFromSync,
  excludedUsernamesForFolder,
  includeInSync,
  isFolderSyncDisabled,
  loadSyncDisabledRemote,
  loadSyncExclusionsRemote,
  setFolderSyncDisabled,
} from "@/lib/syncExclusions";
import { loadMpOrdersRemote } from "@/lib/mercadoPagoOrders";

type DueMode = "com" | "sem";

const emptyForm = {
  itemId: "",
  name: "",
  createdAt: "",
  dueMode: "com" as DueMode,
  dueDate: "",
  phone: "+55",
  price: "",
  /** Meses liberados no painel — ex.: 3 meses por R$ 130 → preço 130 e 3 meses */
  planMonths: "1",
  /** Telas / ativações de app (só com UniPlay) */
  screens: "1",
  /** Créditos já comprados (histórico) — pasta revendedores */
  creditsBought: "",
  notes: "",
};

const STATUS_ORDER: Record<ItemStatus, number> = {
  "Longe de Vencer": 0,
  "Perto de Vencer": 1,
  "Já Vencido": 2,
  "Sem Vencimento": 3,
};

/** Barra lateral + fundo do card: forte no início → fraco no meio → sem cor no fim */
const STATUS_BAR: Record<ItemStatus, string> = {
  "Longe de Vencer": "bg-success",
  "Perto de Vencer": "bg-warning",
  "Já Vencido": "bg-destructive",
  "Sem Vencimento": "bg-muted-foreground/50",
};

const STATUS_FIELD: Record<ItemStatus, string> = {
  "Longe de Vencer":
    "bg-[linear-gradient(90deg,hsl(var(--success)_/_0.12)_0%,hsl(var(--success)_/_0.04)_35%,transparent_70%)]",
  "Perto de Vencer":
    "bg-[linear-gradient(90deg,hsl(var(--warning)_/_0.14)_0%,hsl(var(--warning)_/_0.05)_35%,transparent_70%)]",
  "Já Vencido":
    "bg-[linear-gradient(90deg,hsl(var(--destructive)_/_0.12)_0%,hsl(var(--destructive)_/_0.04)_35%,transparent_70%)]",
  "Sem Vencimento":
    "bg-[linear-gradient(90deg,hsl(var(--muted-foreground)_/_0.08)_0%,transparent_65%)]",
};

function defaultWhatsapp(folderType: string) {
  if (folderType === "Produto") {
    return `{getGreeting}

Gostaríamos de lembrá-lo(a) sobre o vencimento do seguinte produto:

Produto: {name}

{dateText} {due_date}

Por favor, tome as medidas necessárias para gerenciar este produto antes da data de vencimento. Se precisar de mais informações ou assistência, estamos à disposição.

Obrigado pela atenção.`;
  }
  return `{getGreeting}

🔔 Lembrete da "Empresa" 🔔

Usuário: {item_id}

{dateText} {due_date}

Não esqueça de renovar para continuar assistindo sem interrupções.

Aproveite seus programas favoritos! 📺✨

> Obrigado pela sua preferência! 🌟`;
}

function getGreeting() {
  const hours = new Date().getHours();
  if (hours < 12) return "Bom dia,";
  if (hours < 18) return "Boa tarde,";
  return "Boa noite,";
}

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

function sendReminder(item: Item, template: string) {
  const phone = phoneDigits(item.phone || "");
  if (!phone) {
    toast.error("Este item não tem telefone cadastrado.");
    return;
  }
  if (!item.dueDate) {
    toast.error("Este item não tem data de vencimento.");
    return;
  }

  const dueKey = String(item.dueDate).slice(0, 10);
  const due = parseISO(dueKey);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueCmp = new Date(due);
  dueCmp.setHours(0, 0, 0, 0);
  const isExpired = dueCmp < today;
  const dateText = isExpired ? "Venceu em:" : "Vai vencer em:";
  const formattedDue = formatBrDate(item.dueDate);

  const message = template
    .replace(/\{getGreeting\}/g, getGreeting())
    .replace(/\{item_id\}/g, item.itemId)
    .replace(/\{name\}/g, item.name)
    .replace(/\{dateText\}/g, dateText)
    .replace(/\{due_date\}/g, formattedDue);

  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) window.location.href = url;
  else window.open(url, "_blank");
  toast.success("Abrindo WhatsApp…");
}

export default function FolderItems() {
  const { folderId } = useParams();
  const { user, data, setData } = useApp();
  const {
    hidden: hideSensitive,
    money,
    num,
    text,
    phone: maskPhone,
    user: maskUser,
  } = useHideBalance();
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [showTools, setShowTools] = useState(false);
  const [showAnnualChart, setShowAnnualChart] = useState(false);
  const [showStatusSlide, setShowStatusSlide] = useState(false);
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsOpen, setWhatsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [moveItemId, setMoveItemId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [nearDays, setNearDays] = useState(3);
  const [farDays, setFarDays] = useState(3);
  const [whatsMsg, setWhatsMsg] = useState("");
  const [syncingUniplay, setSyncingUniplay] = useState(false);
  const [syncDisabled, setSyncDisabled] = useState(() =>
    user ? isFolderSyncDisabled(user.id, folderId) : false,
  );
  const [syncFolderIdCloud, setSyncFolderIdCloud] = useState("");
  const [syncResellersFolderIdCloud, setSyncResellersFolderIdCloud] =
    useState("");
  const [uniplayLinked, setUniplayLinked] = useState(false);
  const [resellerCreditPriceBrl, setResellerCreditPriceBrl] = useState(8.5);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsUsername, setMovementsUsername] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const folder = data.folders.find(
    (f) => f.id === folderId && f.userId === user?.id,
  );

  useEffect(() => {
    if (!user) return;
    void loadAutomationsConfigRemote(user.id).then((cfg) => {
      setSyncFolderIdCloud(cfg.syncFolderId);
      setSyncResellersFolderIdCloud(cfg.syncResellersFolderId);
      setUniplayLinked(isUniplayConnected(cfg));
      setResellerCreditPriceBrl(cfg.resellerCreditPriceBrl || 8.5);
    });
    void loadSyncExclusionsRemote(user.id);
    void loadSyncDisabledRemote(user.id).then(() => {
      setSyncDisabled(
        user ? isFolderSyncDisabled(user.id, folderId) : false,
      );
    });
  }, [user, folderId]);

  const uniplaySyncMode = useMemo(() => {
    if (!user || !folder || folder.type !== "Cliente") {
      return null as null | "clients" | "resellers";
    }
    const local = loadAutomationsConfig(user.id);
    const clientsId = syncFolderIdCloud || local.syncFolderId;
    const resellersId =
      syncResellersFolderIdCloud || local.syncResellersFolderId;
    if (resellersId && resellersId === folder.id) return "resellers";
    if (clientsId && clientsId === folder.id) return "clients";
    return null;
  }, [user, folder, syncFolderIdCloud, syncResellersFolderIdCloud]);

  /** Botão de sync só com UniPlay conectada. */
  const uniplaySyncEnabled = uniplaySyncMode != null && uniplayLinked;
  const isResellerFolder = uniplaySyncMode === "resellers";

  const openMovements = (item: Item) => {
    setMovementsUsername(item.itemId);
    setMovementsOpen(true);
  };

  /** Aplica as movimentações no item (créditos + receitas por mês). */
  const applyMovementsItem = (moves: IptvResellerMovement[]) => {
    const uname = String(movementsUsername || "").trim().toLowerCase();
    if (!folder || !uname) return;
    setData((prev) =>
      applyResellerMovementsToFolder(
        prev,
        folder.id,
        new Map<string, IptvResellerMovement[]>([[uname, moves]]),
      ),
    );
    toast.success("Recargas aplicadas (créditos + receitas por mês)");
    setMovementsOpen(false);
  };

  const formatItemAmount = (value: number) =>
    isResellerFolder
      ? `${num(formatIptvCredits(value))} créd.`
      : money(value);

  const syncUniplay = async () => {
    if (!user || !folder) return;
    if (folder.type !== "Cliente") {
      toast.error("Sincronização só funciona em pastas de Cliente");
      return;
    }
    const mode = uniplaySyncMode;
    if (!mode) return;
    setSyncingUniplay(true);
    try {
      const cfg = await loadAutomationsConfigRemote(user.id);
      const plat = await loadIptvPlatformConfig();
      if (!cfg.iptvUsername.trim() || !cfg.iptvPassword) {
        toast.error(
          "Conecte a conta UniPlay em Conexões antes de sincronizar",
        );
        return;
      }
      const ensured = await ensureIptvToken({
        apiBaseUrl: plat.apiBaseUrl,
        bearerToken: cfg.iptvBearerToken,
        username: cfg.iptvUsername,
        password: cfg.iptvPassword,
        defaultPackage: plat.packageId || "1",
        regPassword: plat.regPassword || undefined,
        apiProxyUrl: plat.apiProxyUrl || undefined,
      });
      if (ensured.renewed || ensured.token !== cfg.iptvBearerToken) {
        saveAutomationsConfig(user.id, {
          ...cfg,
          iptvBearerToken: ensured.token,
        });
      }
      const creds = {
        apiBaseUrl: plat.apiBaseUrl,
        bearerToken: ensured.token,
        username: cfg.iptvUsername,
        password: cfg.iptvPassword,
        defaultPackage: plat.packageId || "1",
        regPassword: plat.regPassword || undefined,
        apiProxyUrl: plat.apiProxyUrl || undefined,
      };
      const excluded = excludedUsernamesForFolder(user.id, folder.id);
      let created = 0;
      let updated = 0;
      let skipped = 0;

      if (mode === "resellers") {
        const rows = await listIptvResellers(creds);
        const issued = getLastIssuedIptvToken();
        if (issued) {
          saveAutomationsConfig(user.id, {
            ...loadAutomationsConfig(user.id),
            iptvBearerToken: issued,
          });
        }
        setData((prev) => {
          const result = syncIptvResellersToFolder(prev, folder.id, rows, {
            excludedUsernames: excluded,
          });
          created = result.created;
          updated = result.updated;
          skipped = result.skipped;
          return result.data;
        });
        toast.success(
          `Revendedores: ${updated} atualizado(s) · ${created} novo(s)` +
            (skipped ? ` · ${skipped} sem mudança` : ""),
        );
      } else {
        const users = await listIptvUsers(creds, { activeOnly: true });
        const issued = getLastIssuedIptvToken();
        if (issued) {
          saveAutomationsConfig(user.id, {
            ...loadAutomationsConfig(user.id),
            iptvBearerToken: issued,
          });
        }
        // Carrega pedidos para extrair preços de test_activate
        const orders = await loadMpOrdersRemote(user.id);
        const priceMap = buildPriceMapFromMpOrders(orders);

        setData((prev) => {
          const result = syncIptvUsersToFolder(prev, folder.id, users, {
            excludedUsernames: excluded,
            priceByUsername: priceMap,
          });
          created = result.created;
          updated = result.updated;
          skipped = result.skipped;
          return result.data;
        });
        toast.success(
          `UniPlay: ${updated} vencimento(s) · ${created} novo(s)` +
            (skipped ? ` · ${skipped} sem mudança` : ""),
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Falha ao sincronizar UniPlay",
      );
    } finally {
      setSyncingUniplay(false);
    }
  };

  // Sync automático: ao abrir a pasta, se é pasta de sync UniPlay e Sync ON.
  // Com Sync OFF, não sincroniza sozinho (o botão manual continua funcionando).
  useEffect(() => {
    if (!user || !folder) return;
    if (!uniplaySyncMode || !uniplayLinked || syncDisabled) return;
    const t = window.setTimeout(() => void syncUniplay(), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder?.id, uniplaySyncMode, uniplayLinked, syncDisabled]);

  const settings = data.folderSettings.find((s) => s.folderId === folderId);
  const nearDueDays = settings?.nearDueDays ?? 3;
  const farDueDays = settings?.farDueDays ?? nearDueDays;
  const userFolders = useMemo(
    () => data.folders.filter((f) => f.userId === user?.id && f.id !== folderId),
    [data.folders, user?.id, folderId],
  );

  // Status sempre ao vivo (igual items.php / DATEDIFF), não confia no campo salvo
  const folderItems = useMemo(
    () =>
      data.items
        .filter((i) => i.folderId === folderId)
        .map((i) => ({
          ...i,
          status: computeItemStatus(i.dueDate, nearDueDays, farDueDays),
        })),
    [data.items, folderId, nearDueDays, farDueDays],
  );

  const counts = useMemo(() => {
    const c = {
      all: folderItems.length,
      "Longe de Vencer": 0,
      "Perto de Vencer": 0,
      "Já Vencido": 0,
      "Sem Vencimento": 0,
      noPhone: 0,
    };
    for (const i of folderItems) {
      c[i.status] += 1;
      if (isMissingPhone(i.phone)) c.noPhone += 1;
    }
    return c;
  }, [folderItems]);

  const items = useMemo(() => {
    return folderItems
      .filter((i) => {
        if (listFilter === "no-phone") {
          if (!isMissingPhone(i.phone)) return false;
        } else if (listFilter !== "all" && i.status !== listFilter) {
          return false;
        }
        if (!search.trim()) return true;
        const q = normSearch(search);
        return (
          normSearch(i.name).includes(q) ||
          normSearch(i.itemId).includes(q) ||
          normSearch(i.phone).includes(q) ||
          normSearch(notesForDisplay(i.notes)).includes(q)
        );
      })
      .sort((a, b) => {
        // Original PHP: Longe → Perto → Vencido → Sem; due_date DESC
        const byStatus =
          (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        if (byStatus !== 0) return byStatus;
        if (!a.dueDate && !b.dueDate) return a.name.localeCompare(b.name);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        const byDate = b.dueDate.localeCompare(a.dueDate);
        if (byDate !== 0) return byDate;
        return (
          Number(a.itemId) - Number(b.itemId) || a.name.localeCompare(b.name)
        );
      });
  }, [folderItems, search, listFilter]);

  const chartYears = useMemo(() => {
    const yNow = new Date().getFullYear();
    const years = new Set<number>([yNow]);
    for (const item of folderItems) {
      for (const raw of [item.createdAt, item.dueDate]) {
        if (!raw) continue;
        const y = Number(String(raw).slice(0, 4));
        if (y >= 2020 && y <= yNow + 1) years.add(y);
      }
      for (const p of getRecordedPayments(item)) {
        const y = Number(String(p.paidAt).slice(0, 4));
        if (y >= 2020 && y <= yNow + 1) years.add(y);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [folderItems]);

  const chartData = useMemo(
    () =>
      isResellerFolder
        ? sumRecordedPaymentsByMonth(folderItems, chartYear)
        : sumPaymentsByMonth(folderItems, chartYear),
    [chartYear, folderItems, isResellerFolder],
  );

  const annualBalance = useMemo(
    () =>
      isResellerFolder
        ? sumResellerCreditsValueByItems(folderItems, resellerCreditPriceBrl)
        : annualPaymentBalance(folderItems, chartYear),
    [
      chartYear,
      folderItems,
      isResellerFolder,
      resellerCreditPriceBrl,
    ],
  );

  const statusChartData = useMemo(() => {
    const rows: { status: ItemStatus; name: string; color: string }[] = [
      { status: "Longe de Vencer", name: "Longe", color: "#1f8a5b" },
      { status: "Perto de Vencer", name: "Perto", color: "#c9841a" },
      { status: "Já Vencido", name: "Vencido", color: "#c94b3a" },
      { status: "Sem Vencimento", name: "Sem", color: "#6b7f86" },
    ];
    return rows.map((row) => ({
      name: row.name,
      fullName: row.status,
      count: counts[row.status],
      price: folderItems
        .filter((item) => item.status === row.status)
        .reduce((s, item) => s + (item.price || 0), 0),
      color: row.color,
    }));
  }, [counts, folderItems]);

  const totalPrice = useMemo(() => {
    // Lucro ativo: sem já vencidos (dívidas mantêm a soma completa dos gastos)
    const list =
      folder?.type === "Dívida"
        ? folderItems
        : folderItems.filter((i) => i.status !== "Já Vencido");
    return list.reduce((s, i) => s + (i.price || 0), 0);
  }, [folder?.type, folderItems]);

  if (!folder || !user) return <Navigate to="/dashboard" replace />;

  const debtFolder =
    isExpenseFolderType(folder.type) ||
    /^d[ií]vidas?$/i.test(folder.name.trim());
  if (debtFolder) {
    return (
      <DebtFolderView
        folder={
          folder.type === "Dívida" ? folder : { ...folder, type: "Dívida" }
        }
      />
    );
  }

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      createdAt: format(new Date(), "yyyy-MM-dd"),
      dueMode: isResellerFolder ? "sem" : "com",
      creditsBought: "0",
    });
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      itemId: item.itemId,
      name: item.name,
      createdAt: item.createdAt
        ? String(item.createdAt).slice(0, 10)
        : format(new Date(), "yyyy-MM-dd"),
      dueMode:
        isResellerFolder || item.status === "Sem Vencimento" || !item.dueDate
          ? "sem"
          : "com",
      dueDate: toDatetimeLocalValue(item.dueDate),
      phone: item.phone || "+55",
      price: item.price != null ? String(item.price) : "",
      planMonths: String(getPlanMonths(item, 1)),
      screens: String(getItemScreens(item, 1)),
      creditsBought: String(getResellerCreditsBought(item)),
      notes: notesForDisplay(item.notes),
    });
    setFormOpen(true);
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const noDue = isResellerFolder || form.dueMode === "sem";
    const price = Number(String(form.price).replace(",", ".")) || 0;
    const planMonths = Math.max(
      1,
      Math.min(24, Math.floor(Number(form.planMonths) || 1)),
    );
    const screens = Math.max(
      1,
      Math.min(10, Math.floor(Number(form.screens) || 1)),
    );
    const creditsBought = Math.max(
      0,
      Math.floor(
        Number(String(form.creditsBought).replace(",", ".")) || 0,
      ),
    );
    const payload = {
      folderId: folder.id,
      itemId: form.itemId.trim(),
      name: form.name.trim(),
      dueDate: noDue ? null : fromDatetimeLocalValue(form.dueDate),
      phone: form.phone.trim(),
      price,
      planMonths,
      ...(uniplayLinked && !isResellerFolder ? { screens } : {}),
      notes: form.notes.trim(),
      createdAt: form.createdAt
        ? `${form.createdAt}T00:00:00`
        : new Date().toISOString(),
      isActive: true,
      ...(isResellerFolder
        ? {
            resellerCreditsBought: creditsBought,
            // remove lixo antigo que somava saldo como R$
            payments: (editing ? getRecordedPayments(editing) : []).filter(
              (p) => Number(p.amount) >= 10,
            ),
          }
        : {}),
    };
    if (user && payload.itemId) {
      includeInSync(user.id, folder.id, payload.itemId);
    }
    if (editing) {
      setData((prev) => updateItem(prev, { ...editing, ...payload }));
      toast.success("Item atualizado");
    } else {
      setData((prev) => createItem(prev, payload));
      toast.success("Item adicionado");
    }
    setFormOpen(false);
  };

  const reminderTemplate = () => {
    const existing = data.whatsappMessages?.find(
      (m) => m.userId === user.id && m.folderId === folder.id,
    );
    return existing?.message || defaultWhatsapp(folder.type);
  };

  const openWhats = () => {
    setWhatsMsg(reminderTemplate());
    setWhatsOpen(true);
  };

  const onImportCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("CSV vazio ou inválido");
      return;
    }
    let imported = 0;
    setData((prev) => {
      let next = prev;
      for (const line of lines.slice(1)) {
        const cols = line
          .split(/[;,]/)
          .map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < 2) continue;
        const [itemId, name, dueDate, phone, price, notes] = cols;
        const uid = itemId || name;
        if (user && uid) includeInSync(user.id, folder.id, uid);
        next = createItem(next, {
          folderId: folder.id,
          itemId: uid,
          name: name || itemId,
          dueDate: dueDate || null,
          phone: phone || "",
          price: Number(String(price || "0").replace(",", ".")) || 0,
          notes: notes || "",
          createdAt: new Date().toISOString(),
          isActive: true,
        });
        imported += 1;
      }
      return next;
    });
    toast.success(
      imported === 1
        ? "1 item importado"
        : `${imported} itens importados`,
    );
  };

  const filterChips: {
    key: ListFilter;
    label: string;
    count: number;
  }[] = [
    { key: "all", label: "Todos", count: counts.all },
    {
      key: "Longe de Vencer",
      label: "Longe",
      count: counts["Longe de Vencer"],
    },
    {
      key: "Perto de Vencer",
      label: "Perto",
      count: counts["Perto de Vencer"],
    },
    { key: "Já Vencido", label: "Vencido", count: counts["Já Vencido"] },
    {
      key: "Sem Vencimento",
      label: "Sem prazo",
      count: counts["Sem Vencimento"],
    },
    { key: "no-phone", label: "Sem telefone", count: counts.noPhone },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={folder.name}
        description="Vencimentos, lembretes e valores desta pasta."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Voltar para Pastas
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowTools((v) => !v)}
            >
              {showTools ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showTools ? "Ocultar Conteúdo" : "Mostrar Conteúdo"}
            </Button>
            {uniplaySyncEnabled ? (
              <>
                <Button
                  variant="secondary"
                  disabled={syncingUniplay}
                  onClick={() => void syncUniplay()}
                >
                  {syncingUniplay ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {uniplaySyncMode === "resellers"
                    ? "Sincronizar revendedores"
                    : "Sincronizar UniPlay"}
                </Button>
                <Button
                  type="button"
                  variant={syncDisabled ? "secondary" : "outline"}
                  onClick={() => {
                    if (!user) return;
                    const next = !syncDisabled;
                    setFolderSyncDisabled(user.id, folder.id, next);
                    setSyncDisabled(next);
                  }}
                  title={
                    syncDisabled
                      ? "Reativar sincronização automática"
                      : "Desativar sincronização automática (para editar à mão)"
                  }
                >
                  {syncDisabled ? (
                    <PowerOff className="h-4 w-4" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  Sync {syncDisabled ? "OFF" : "ON"}
                </Button>
              </>
            ) : null}
            <Button onClick={() => setShowStatusSlide(true)}>
              <ChartColumn className="h-4 w-4" />
              Mostrar Gráfico
            </Button>
          </div>
        }
      />

      {/* Filtros (únicos — sem select duplicado na busca) */}
      <div className="flex flex-wrap gap-2">
        {filterChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setListFilter(chip.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              listFilter === chip.key
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {chip.key === "all" ? (
              <Badge variant="secondary" className="font-normal">
                Todos
              </Badge>
            ) : chip.key === "no-phone" ? (
              <Badge variant="outline" className="gap-1 font-normal">
                <PhoneOff className="h-3 w-3" />
                Sem tel.
              </Badge>
            ) : (
              <StatusBadge status={chip.key} />
            )}
            <span className="tabular-nums">{num(chip.count)}</span>
          </button>
        ))}
      </div>

      {/* Tools panel */}
      <AnimatePresence initial={false}>
        {showTools && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="ax-surface flex flex-wrap gap-2 p-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImportCsv(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Importar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      "Tem certeza que deseja excluir todos os itens desta pasta?",
                    )
                  ) {
                    if (user) {
                      for (const it of data.items) {
                        if (it.folderId === folder.id && it.itemId) {
                          excludeFromSync(user.id, folder.id, it.itemId);
                        }
                      }
                    }
                    setData((prev) =>
                      deleteAllItemsInFolder(prev, folder.id),
                    );
                    toast.success("Todos os itens foram excluídos");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Excluir Todos
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Adicionar Novo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNearDays(settings?.nearDueDays ?? 3);
                  setFarDays(settings?.farDueDays ?? 3);
                  setSettingsOpen(true);
                }}
              >
                <Settings2 className="h-4 w-4" />
                Editar Prazo de Vencimento
              </Button>
              <Button variant="outline" size="sm" onClick={openWhats}>
                <MessageSquareText className="h-4 w-4" />
                Editar Mensagem do WhatsApp
              </Button>
              {uniplaySyncEnabled ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={syncingUniplay}
                  onClick={() => void syncUniplay()}
                >
                  {syncingUniplay ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {uniplaySyncMode === "resellers"
                    ? "Sincronizar revendedores"
                    : "Sincronizar UniPlay"}
                </Button>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Annual chart */}
      <div className="ax-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold tracking-tight">Consultar Anual</h2>
            <p className="text-sm text-muted-foreground">
              {folder.type === "Dívida"
                ? "Gastos por mês (dívidas) — não entra no lucro da página inicial"
                : isResellerFolder
                  ? `Cada crédito comprado = ${money(resellerCreditPriceBrl)} (ajuste o valor em UniPlay → Conta). Edite o total comprado em cada revendedor.`
                  : "Lucro até o vencimento · já vencidos não entram no mês atual"}
            </p>
            <p className="mt-2 text-lg font-bold tracking-tight text-primary">
              {isResellerFolder
                ? `Créditos comprados: ${money(annualBalance)}`
                : `Saldo anual ${chartYear}: ${money(annualBalance)}`}
            </p>
            {isResellerFolder ? (
              <p className="text-xs text-muted-foreground">
                Soma de (créditos comprados × {money(resellerCreditPriceBrl)}).
                O gráfico mensal abaixo mostra só recargas novas com PIX.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(chartYear)}
              onValueChange={(v) => {
                setChartYear(Number(v));
                setShowAnnualChart(true);
              }}
            >
              <SelectTrigger className="w-[120px]" id="yearSelect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chartYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnnualChart((v) => !v)}
            >
              <CalendarDays className="h-4 w-4" />
              {showAnnualChart ? "Esconder Gráfico" : "Mostrar Gráfico"}
            </Button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {showAnnualChart && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="h-[260px] pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      stroke="hsl(var(--border))"
                      tickFormatter={(v) => num(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => [
                        money(Number(value)),
                        "Total",
                      ]}
                    />
                    <Bar
                      dataKey="total"
                      fill="hsl(var(--primary))"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Pesquisar por nome, usuário, telefone ou nota…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Item list */}
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum item encontrado"
          description={
            search || listFilter !== "all"
              ? listFilter === "no-phone"
                ? "Nenhum cliente sem telefone (ou a busca não achou)."
                : "Ajuste a busca ou o filtro."
              : "Adicione o primeiro item desta pasta."
          }
          action={
            !search && listFilter === "all" ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Adicionar Novo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2 sm:space-y-3">
          <AnimatePresence mode="popLayout">
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{
                  duration: 0.2,
                  delay: Math.min(index * 0.02, 0.2),
                }}
                className={cn(
                  "ax-surface group relative flex overflow-hidden",
                  STATUS_FIELD[item.status],
                )}
              >
                <span
                  className={cn(
                    "w-1 shrink-0 self-stretch sm:w-1.5",
                    STATUS_BAR[item.status],
                  )}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-2.5 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:p-4">
                  <div className="min-w-0 space-y-0.5 sm:space-y-2">
                    <div className="flex items-start justify-between gap-2 sm:block">
                      <div className="min-w-0 space-y-0.5 sm:space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          {!isResellerFolder ? (
                            <StatusBadge status={item.status} />
                          ) : (
                            <Badge
                              variant="secondary"
                              className="font-normal text-[11px] sm:text-xs"
                            >
                              Revendedor
                            </Badge>
                          )}
                          <span className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                            <span className="sm:hidden">
                              {maskUser(item.itemId)}
                            </span>
                            <span className="hidden sm:inline">
                              Usuário:{" "}
                              <span className="text-foreground">
                                {maskUser(item.itemId)}
                              </span>
                            </span>
                          </span>
                        </div>
                        <h3 className="truncate text-sm font-semibold tracking-tight sm:text-base">
                          {isResellerFolder &&
                          item.name.trim().toLowerCase() ===
                            item.itemId.trim().toLowerCase()
                            ? notesForDisplay(item.notes)
                                ?.match(/^E-mail:\s*(.+)$/im)?.[1]
                                ?.trim() || item.name
                            : item.name}
                        </h3>
                      </div>
                      <div className="flex shrink-0 items-start gap-0.5 sm:hidden">
                        <div className="pr-0.5 pt-1 text-right">
                          <p className="text-sm font-bold tabular-nums tracking-tight whitespace-nowrap">
                            {formatItemAmount(item.price || 0)}
                          </p>
                          {!isResellerFolder ? (
                            <p className="text-[10px] font-medium tabular-nums text-muted-foreground">
                              {(() => {
                                const m = getPlanMonths(item, 1);
                                const prog = planCycleProgress(item);
                                const telas =
                                  uniplayLinked
                                    ? ` · ${getItemScreens(item, 1)} tela${getItemScreens(item, 1) > 1 ? "s" : ""}`
                                    : "";
                                return prog
                                  ? `${m} ${m === 1 ? "mês" : "meses"} · ${prog.label}${telas}`
                                  : `${m} ${m === 1 ? "mês" : "meses"}${telas}`;
                              })()}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Ações"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => openEdit(item)}
                              >
                                <Pencil className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              {isResellerFolder ? (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => openMovements(item)}
                                >
                                  <History className="h-4 w-4" />
                                  Movimentações
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() =>
                                  sendReminder(item, reminderTemplate())
                                }
                              >
                                <Bell className="h-4 w-4" />
                                Lembrar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => {
                                  setMoveItemId(item.id);
                                  setMoveOpen(true);
                                }}
                              >
                                <ArrowLeftRight className="h-4 w-4" />
                                Mover
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (confirm(`Excluir "${item.name}"?`)) {
                                    if (user && item.itemId) {
                                      excludeFromSync(
                                        user.id,
                                        folder.id,
                                        item.itemId,
                                      );
                                    }
                                    setData((prev) => deleteItem(prev, item.id));
                                    toast.success("Item excluído");
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {notesForDisplay(item.notes) ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-primary"
                                  aria-label="Ver notas"
                                  title="Ver notas"
                                >
                                  <StickyNote className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                className="w-80 max-w-[min(20rem,calc(100vw-2rem))]"
                              >
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                  <StickyNote className="h-4 w-4 text-primary" />
                                  Notas
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                  {notesForDisplay(item.notes)}
                                </p>
                              </PopoverContent>
                            </Popover>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0 text-[11px] leading-snug text-muted-foreground sm:gap-x-4 sm:gap-y-1 sm:text-sm sm:leading-normal">
                      <span>
                        <span className="sm:hidden">Criado </span>
                        <span className="hidden sm:inline">Criado em: </span>
                        <span className="font-medium text-foreground">
                          {formatBrDate(
                            String(item.createdAt || "").slice(0, 10),
                          )}
                        </span>
                      </span>
                      {!isResellerFolder ? (
                        <>
                          <span>
                            <span className="sm:hidden">Vence </span>
                            <span className="hidden sm:inline">
                              Vencimento:{" "}
                            </span>
                            <span className="font-medium text-foreground">
                              {item.status === "Sem Vencimento" || !item.dueDate
                                ? "Indefinido"
                                : formatBrDate(item.dueDate)}
                            </span>
                          </span>
                          <span>
                            <span className="sm:hidden">Plano </span>
                            <span className="hidden sm:inline">Plano: </span>
                            <span className="font-medium text-foreground">
                              {(() => {
                                const m = getPlanMonths(item, 1);
                                const prog = planCycleProgress(item);
                                return prog
                                  ? `${m} ${m === 1 ? "mês" : "meses"} · ${prog.label}`
                                  : `${m} ${m === 1 ? "mês" : "meses"}`;
                              })()}
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          {notesForDisplay(item.notes)
                            ?.match(/^Ativos:\s*(.+)$/im)?.[1]
                            ?.trim() ? (
                            <span>
                              <span className="sm:hidden">Ativos </span>
                              <span className="hidden sm:inline">Ativos: </span>
                              <span className="font-medium text-foreground">
                                {notesForDisplay(item.notes)
                                  ?.match(/^Ativos:\s*(.+)$/im)?.[1]
                                  ?.trim()}
                              </span>
                            </span>
                          ) : null}
                          {notesForDisplay(item.notes)
                            ?.match(/^Última recarga:\s*(.+)$/im)?.[1]
                            ?.trim() ? (
                            <span>
                              <span className="sm:hidden">Recarga </span>
                              <span className="hidden sm:inline">
                                Última recarga:{" "}
                              </span>
                              <span className="font-medium text-foreground">
                                {notesForDisplay(item.notes)
                                  ?.match(/^Última recarga:\s*(.+)$/im)?.[1]
                                  ?.trim()}
                              </span>
                            </span>
                          ) : null}
                          <span>
                            <span className="sm:hidden">Comprados </span>
                            <span className="hidden sm:inline">
                              Comprados:{" "}
                            </span>
                            <span className="font-medium text-foreground">
                              {num(
                                String(getResellerCreditsBought(item)),
                              )}{" "}
                              ·{" "}
                              {money(
                                resellerCreditsValueBrl(
                                  getResellerCreditsBought(item),
                                  resellerCreditPriceBrl,
                                ),
                              )}
                            </span>
                          </span>
                        </>
                      )}
                      <span>
                        <span className="sm:hidden">
                          {isResellerFolder ? "Zap " : "Tel "}
                        </span>
                        <span className="hidden sm:inline">
                          {isResellerFolder ? "WhatsApp: " : "Telefone: "}
                        </span>
                        <span className="font-medium text-foreground">
                          {maskPhone(item.phone)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="hidden items-center justify-between gap-3 sm:flex sm:flex-col sm:items-end">
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums tracking-tight whitespace-nowrap">
                        {formatItemAmount(item.price || 0)}
                      </p>
                      {!isResellerFolder ? (
                        <p className="text-xs font-medium tabular-nums text-muted-foreground">
                          {(() => {
                            const m = getPlanMonths(item, 1);
                            const prog = planCycleProgress(item);
                            return prog
                              ? `${m} ${m === 1 ? "mês" : "meses"} · ${prog.label}`
                              : `${m} ${m === 1 ? "mês" : "meses"}`;
                          })()}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {notesForDisplay(item.notes) ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary"
                              aria-label="Ver notas"
                              title="Ver notas"
                            >
                              <StickyNote className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-80 max-w-[min(20rem,calc(100vw-2rem))]"
                          >
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                              <StickyNote className="h-4 w-4 text-primary" />
                              Notas
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {notesForDisplay(item.notes)}
                            </p>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Ações"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          {isResellerFolder ? (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => openMovements(item)}
                            >
                              <History className="h-4 w-4" />
                              Movimentações
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() =>
                              sendReminder(item, reminderTemplate())
                            }
                          >
                            <Bell className="h-4 w-4" />
                            Lembrar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => {
                              setMoveItemId(item.id);
                              setMoveOpen(true);
                            }}
                          >
                            <ArrowLeftRight className="h-4 w-4" />
                            Mover
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => {
                              if (confirm(`Excluir "${item.name}"?`)) {
                                if (user && item.itemId) {
                                  excludeFromSync(
                                    user.id,
                                    folder.id,
                                    item.itemId,
                                  );
                                }
                                setData((prev) => deleteItem(prev, item.id));
                                toast.success("Item excluído");
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Create / Edit item */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md fixed inset-x-0 top-0 bottom-auto max-h-[80vh] overflow-y-auto rounded-b-2xl sm:inset-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Item" : "Adicionar Novo Item"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSave}>
            <div className="space-y-2">
              <Label htmlFor="item-user">Usuário</Label>
              <Input
                id="item-user"
                type={hideSensitive ? "password" : "text"}
                value={form.itemId}
                onChange={(e) => setForm({ ...form, itemId: e.target.value })}
                required
                readOnly={hideSensitive}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-name">Nome</Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            {editing && (
              <div className="space-y-2">
                <Label htmlFor="item-created">Data de Criação</Label>
                <Input
                  id="item-created"
                  type="date"
                  value={form.createdAt}
                  onChange={(e) =>
                    setForm({ ...form, createdAt: e.target.value })
                  }
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.dueMode}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    dueMode: v as DueMode,
                    dueDate: v === "sem" ? "" : form.dueDate,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="com">Com Vencimento</SelectItem>
                  <SelectItem value="sem">Sem Vencimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.dueMode === "com" && (
              <div className="space-y-2">
                <Label htmlFor="item-due">Data e hora de vencimento</Label>
                <Input
                  id="item-due"
                  type="datetime-local"
                  step={1}
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm({ ...form, dueDate: e.target.value })
                  }
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="item-phone">
                {isResellerFolder ? "WhatsApp" : "Telefone"}
              </Label>
              <Input
                id="item-phone"
                type={hideSensitive ? "password" : "text"}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                readOnly={hideSensitive}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-price">
                {isResellerFolder ? "Saldo de créditos (atual)" : "Preço do plano"}
              </Label>
              <Input
                id="item-price"
                type={hideSensitive ? "password" : "text"}
                value={form.price}
                placeholder={isResellerFolder ? "0" : "0.00"}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                readOnly={hideSensitive}
              />
              {!isResellerFolder ? (
                <p className="text-[11px] text-muted-foreground">
                  Valor do PIX (ex.: R$ 130). Se mudar preço ou meses, o gráfico
                  mantém o passado e só aplica o novo valor a partir de hoje.
                </p>
              ) : null}
            </div>
            {!isResellerFolder ? (
              <div className="space-y-2">
                <Label htmlFor="item-plan-months">Meses do plano</Label>
                <Input
                  id="item-plan-months"
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  value={form.planMonths}
                  onChange={(e) =>
                    setForm({ ...form, planMonths: e.target.value })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Tempo liberado no painel / PIX. Ex.: preço 130 + 3 meses → PIX
                  R${" "}
                  {(() => {
                    const total = planPixAmount(
                      Number(String(form.price).replace(",", ".")) || 0,
                    );
                    const months = Math.max(
                      1,
                      Math.min(24, Math.floor(Number(form.planMonths) || 1)),
                    );
                    return total > 0
                      ? `${total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${months} ${months === 1 ? "mês" : "meses"}`
                      : "—";
                  })()}
                </p>
              </div>
            ) : null}
            {uniplayLinked && !isResellerFolder ? (
              <div className="space-y-2">
                <Label htmlFor="item-screens">Telas (ativações de app)</Label>
                <Input
                  id="item-screens"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={form.screens}
                  onChange={(e) =>
                    setForm({ ...form, screens: e.target.value })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Quantas TVs/aparelhos este plano pode ativar (MAC). Ex.:
                  Básico 1 · Padrão 2. Só aparece com UniPlay conectada.
                </p>
              </div>
            ) : null}
            {isResellerFolder ? (
              <div className="space-y-2">
                <Label htmlFor="item-credits-bought">
                  Créditos já comprados (histórico)
                </Label>
                <Input
                  id="item-credits-bought"
                  type="number"
                  min={0}
                  step={1}
                  value={form.creditsBought}
                  onChange={(e) =>
                    setForm({ ...form, creditsBought: e.target.value })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Inclui compras antigas. Valor na anual:{" "}
                  {money(
                    resellerCreditsValueBrl(
                      Number(form.creditsBought) || 0,
                      resellerCreditPriceBrl,
                    ),
                  )}{" "}
                  ({money(resellerCreditPriceBrl)} por crédito).
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="item-notes">Notas</Label>
              <Textarea
                id="item-notes"
                value={form.notes}
                placeholder="Adicione suas notas aqui..."
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editing ? "Atualizar Item" : "Adicionar Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Settings: near/far days */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Prazos de Vencimento</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setData(
                updateFolderSettings(data, folder.id, nearDays, farDays),
              );
              setSettingsOpen(false);
              toast.success("Configurações atualizadas");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="near-days">
                Prazos Perto de Vencer (dias)
              </Label>
              <Input
                id="near-days"
                type="number"
                min={1}
                value={nearDays}
                onChange={(e) => setNearDays(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="far-days">
                Prazos Longe de Vencer (dias)
              </Label>
              <Input
                id="far-days"
                type="number"
                min={1}
                value={farDays}
                onChange={(e) => setFarDays(Number(e.target.value))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit">Atualizar Configurações</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WhatsApp message */}
      <Dialog open={whatsOpen} onOpenChange={setWhatsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Mensagem do WhatsApp</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={12}
            value={whatsMsg}
            onChange={(e) => setWhatsMsg(e.target.value)}
            className="font-mono text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWhatsMsg(defaultWhatsapp(folder.type))}
            >
              Restaurar Mensagem Padrão
            </Button>
            <Button
              type="button"
              onClick={() => {
                setData(
                  upsertWhatsappMessage(data, user.id, folder.id, whatsMsg),
                );
                setWhatsOpen(false);
                toast.success("Mensagem salva");
              }}
            >
              Salvar Mensagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move item */}
      <Dialog
        open={moveOpen && !!moveItemId}
        onOpenChange={(open) => {
          setMoveOpen(open);
          if (!open) setMoveItemId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escolha uma Pasta para Mover o Item</DialogTitle>
          </DialogHeader>
          {userFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma outra pasta.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {userFolders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
                    onClick={() => {
                      if (!moveItemId) return;
                      const moving = data.items.find(
                        (i) => i.id === moveItemId,
                      );
                      if (user && moving?.itemId) {
                        excludeFromSync(user.id, folder.id, moving.itemId);
                        includeInSync(user.id, f.id, moving.itemId);
                      }
                      setData((prev) => moveItem(prev, moveItemId, f.id));
                      setMoveOpen(false);
                      setMoveItemId(null);
                      toast.success(`Item movido para ${f.name}`);
                    }}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ResellerMovementsDialog
        open={movementsOpen}
        onOpenChange={(open) => {
          if (!open) setMovementsOpen(false);
        }}
        user={user}
        username={movementsUsername || undefined}
        displayName={folder?.name}
        onApply={applyMovementsItem}
      />

      {/* Status charts sheet */}
      <Sheet open={showStatusSlide} onOpenChange={setShowStatusSlide}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Status dos Itens</SheetTitle>
            <SheetDescription>
              Visão consolidada de quantidade e valores por status.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total de Itens
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {num(counts.all)}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {folder.type === "Dívida" ? "Total de gastos" : "Valor ativo"}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums leading-tight">
                  {money(totalPrice)}
                </p>
                {folder.type !== "Dívida" && counts["Já Vencido"] > 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {text(`Sem os ${counts["Já Vencido"]} já vencidos`)}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Status dos Itens</h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => num(v)}
                    />
                    <Tooltip
                      formatter={(value: number) => [num(value), "Itens"]}
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.fullName ?? "")
                      }
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusChartData.map((entry) => (
                        <Cell key={entry.fullName} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Preço Total por Status
              </h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => num(v)}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        money(Number(value)),
                        "Preço",
                      ]}
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.fullName ?? "")
                      }
                    />
                    <Bar dataKey="price" radius={[4, 4, 0, 0]}>
                      {statusChartData.map((entry) => (
                        <Cell key={`p-${entry.fullName}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Preço Total por Status
              </h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={statusChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => num(v)}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        money(Number(value)),
                        "Preço",
                      ]}
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.fullName ?? "")
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
