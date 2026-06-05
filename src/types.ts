export interface InventoryItem {
  code: string;
  name: string;
  stock: number;
}

export interface BotConfig {
  token: string;
  adminId: string;
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

export interface AppState {
  config: BotConfig;
  inventory: InventoryItem[];
  customers: CustomerRequest[];
  isRunning: boolean;
}

