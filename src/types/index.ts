export type FolderType = "Cliente" | "Produto";

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
