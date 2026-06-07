export interface InventoryItem {
  code: string;
  name: string;
  stock: number;
}

export interface BotConfig {
  token: string;
  adminId: string;
  groupId?: string;
  customerMessage?: string;
  groupAccess?: 'all' | 'admin' | 'group_admins';
  botEnabled?: boolean;
  disableCustomerPm?: boolean;
}

export interface CustomerRequest {
  userId: string;
  username: string;
  chatId: string;
  chatTitle: string;
  itemCode: string;
  itemName: string;
  date: string;
}

export interface DetectedGroup {
  id: string;
  title: string;
  username?: string;
  lastActive: string;
}

export interface AppState {
  config: BotConfig;
  inventory: InventoryItem[];
  customers: CustomerRequest[];
  isRunning: boolean;
  groups?: DetectedGroup[];
}

