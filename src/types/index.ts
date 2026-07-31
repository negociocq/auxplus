export type FolderType = "Cliente" | "Produto" | "Dívida";

/** Pastas que entram no lucro (receita). Dívida = gasto. */
export function isRevenueFolderType(type: FolderType): boolean {
  return type === "Cliente" || type === "Produto";
}

export function isExpenseFolderType(type: FolderType): boolean {
  return type === "Dívida";
}

export type ItemStatus =
  | "Longe de Vencer"
  | "Perto de Vencer"
  | "Já Vencido"
  | "Sem Vencimento";

export interface User {
  id: string;
  username: string;
  password: string;
  isAdmin: boolean;
  isActive: boolean;
}

export interface Folder {
  id: string;
  userId: string;
  type: FolderType;
  name: string;
  whatsappMessage?: string | null;
}

export interface FolderSettings {
  folderId: string;
  nearDueDays: number;
  farDueDays: number;
}

export interface FolderMessage {
  id: string;
  folderId: string;
  message: string;
}

export interface WhatsappMessage {
  userId: string;
  folderId: string;
  message: string;
}

export interface ItemPayment {
  paidAt: string;
  amount: number;
}

export interface DebtInstallment {
  n: number;
  amount: number;
  dueDate: string;
  paidAt: string | null;
}

export interface DebtPlan {
  spentAt: string;
  /** Total (fixo) ou valor mensal (ilimitado) */
  total: number;
  /** fixed = N parcelas | unlimited = recorrente até encerrar */
  mode?: "fixed" | "unlimited";
  /** equal = mesmo valor | variable = valor diferente por parcela */
  amountMode?: "equal" | "variable";
  monthlyAmount?: number;
  /** null = ilimitada */
  installmentCount?: number | null;
  /** Encerrou (saiu do aluguel, cancelou plano, etc.) */
  closedAt?: string | null;
  installments: DebtInstallment[];
}

export interface Item {
  id: string;
  folderId: string;
  itemId: string;
  name: string;
  dueDate: string | null;
  phone: string;
  price: number;
  status: ItemStatus;
  notes?: string;
  createdAt?: string | null;
  isActive?: boolean;
  /** Histórico de pagamentos/renovações (para o gráfico mensal) */
  payments?: ItemPayment[];
  /** Plano de parcelas (pastas Dívida) */
  debt?: DebtPlan;
}

export interface Ticket {
  id: string;
  userId: string;
  question: string;
  response: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface AppData {
  users: User[];
  folders: Folder[];
  folderSettings: FolderSettings[];
  folderMessages: FolderMessage[];
  whatsappMessages: WhatsappMessage[];
  items: Item[];
  tickets: Ticket[];
}
