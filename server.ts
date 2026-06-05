import express from "express";
import path from "path";
import fs from "fs";
import { Telegraf } from "telegraf";
import * as XLSX from "xlsx";

interface InventoryItem {
  code: string;
  name: string;
  stock: number;
}
interface BotConfig {
  token: string;
  adminId: string;
}
interface CustomerRequest {
  userId: string;
  username: string;
  chatId: string;
  chatTitle: string;
  itemCode: string;
  itemName: string;
  date: string;
}
interface AppState {
  config: BotConfig;
  inventory: InventoryItem[];
  customers: CustomerRequest[];
  isRunning: boolean;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

const DATA_FILE = path.join(process.cwd(), "bot-data.json");

let state: AppState = {
  config: { token: "", adminId: "" },
  inventory: [],
  customers: [],
  isRunning: false,
};

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const saved = JSON.parse(raw);
    state = { ...state, ...saved };
  }
} catch (e) {
  console.error("Failed to load state", e);
}

function saveState() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

let bot: any = null;

async function startBot() {
  if (bot) {
    try {
      bot.stop();
    } catch (e) {}
  }

  if (!state.config.token || !state.config.adminId) {
    state.isRunning = false;
    saveState();
    return false;
  }

  try {
    bot = new Telegraf(state.config.token);

    // Command handle to test if bot reacts to admin
    bot.command('start', (ctx: any) => {
      if (ctx.chat.type === "private" && String(ctx.from.id) === state.config.adminId) {
        ctx.reply("سلام مدیر! برای بروزرسانی موجودی، فایل اکسل (xlsx) خود را ارسال کنید.\nبرای دریافت بکاپ از موجودی و مشتریان دستور /backup را ارسال کنید.");
      }
    });

    bot.command('backup', async (ctx: any) => {
      if (ctx.chat.type === "private" && String(ctx.from.id) === state.config.adminId) {
         try {
            ctx.reply("در حال آماده‌سازی فایل بکاپ...");
            
            const wb = XLSX.utils.book_new();
            
            // Sheet 1: Inventory
            const wsInv = XLSX.utils.json_to_sheet(state.inventory || []);
            XLSX.utils.book_append_sheet(wb, wsInv, "Inventory");

            // Sheet 2: Customers
            const wsCust = XLSX.utils.json_to_sheet(state.customers || []);
            XLSX.utils.book_append_sheet(wb, wsCust, "Customers");

            const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

            await ctx.replyWithDocument({
              source: buffer,
              filename: `backup_${new Date().toISOString().split('T')[0]}.xlsx`
            }, { caption: "✅ فایل بکاپ شامل موجودی فعلی و لیست درخواست‌های مشتریان" });

         } catch (e: any) {
             console.error(e);
             ctx.reply("❌ خطا در گرفتن بکاپ: " + e.message);
         }
      }
    });

    bot.on("document", async (ctx: any) => {
      if (ctx.chat.type === "private" && String(ctx.from.id) === state.config.adminId) {
        const doc = ctx.message.document;
        if (doc.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || doc.file_name?.endsWith('.xlsx') || doc.file_name?.endsWith('.xls')) {
           ctx.reply("در حال بررسی و بروزرسانی موجودی...");
           try {
              const fileLink = await ctx.telegram.getFileLink(doc.file_id);
              const response = await fetch(fileLink.toString());
              const arrayBuffer = await response.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              
              const wb = XLSX.read(buffer, { type: 'buffer' });
              const wsname = wb.SheetNames[0];
              const ws = wb.Sheets[wsname];
              const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
              
              if (data.length < 2) {
                return ctx.reply("❌ فایل اکسل خالی است یا ستون‌های مناسب را ندارد.");
              }

              const headers = data[0].map((h: string) => h?.toString().toLowerCase().trim());
              const codeIdx = headers.findIndex((h: string) => h === 'کد' || h === 'code');
              const nameIdx = headers.findIndex((h: string) => h === 'نام' || h === 'name' || h === 'title' || h === 'عنوان');
              const stockIdx = headers.findIndex((h: string) => h === 'موجودی' || h === 'stock' || h === 'qty' || h === 'تعداد');

              if (codeIdx === -1) {
                return ctx.reply("❌ ستون 'کد' (یا code) در ردیف اول فایل اکسل پیدا نشد.");
              }

              const newInventory: InventoryItem[] = [];
              for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0 || !row[codeIdx]) continue;
                
                // If stock column/value is missing, default it to 1 so the item is in-stock by default.
                let itemStock = 1;
                if (stockIdx !== -1 && row[stockIdx] !== undefined && row[stockIdx] !== null && String(row[stockIdx]).trim() !== "") {
                  const numValue = Number(row[stockIdx]);
                  itemStock = isNaN(numValue) ? 0 : numValue;
                }

                newInventory.push({
                  code: String(row[codeIdx]).trim(),
                  name: nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : 'بدون نام',
                  stock: itemStock
                });
              }

              state.inventory = newInventory;
              saveState();
              ctx.reply(`✅ موجودی با موفقیت از طریق فایل در تلگرام بروزرسانی شد.\nتعداد کل کالاها: ${newInventory.length}`);
           } catch (e: any) {
              console.error(e);
              ctx.reply("❌ خطا در پردازش فایل: " + e.message);
           }
        } else {
           ctx.reply("❌ لطفا یک فایل اکسل با فرمت xlsx ارسال کنید.");
        }
      }
    });

    bot.on("text", async (ctx: any) => {
      // Admin talking in private
      if (ctx.chat.type === "private" && String(ctx.from.id) === state.config.adminId) {
         if (!ctx.message.text.startsWith('/')) {
            ctx.reply("برای بروزرسانی موجودی‌ها، کافیست فایل اکسل را بفرستید.");
         }
         return;
      }

      if (ctx.chat.type === "private") return; // Ignore regular private messages

      const text = ctx.message.text || "";
      const words = text.split(/\s+/);

      // Check if any word perfectly matches an inventory item code
      const foundItems = state.inventory.filter((item) =>
        words.some((w) => w.trim() === String(item.code).trim())
      );

      if (foundItems.length > 0) {
        let msg = `🚨 *درخواست کالا در گروه*\n`;
        msg += `کاربر: @${ctx.from.username || "بدون‌یوزرنیم"} (آیدی: \`${ctx.from.id}\`)\n`;
        msg += `گروه: ${ctx.chat.title}\n\n`;

        let hasAvailable = false;
        foundItems.forEach((item) => {
          if (Number(item.stock) > 0) {
            hasAvailable = true;
            
            if (!state.customers) state.customers = [];
            state.customers.push({
               userId: String(ctx.from.id),
               username: ctx.from.username || "بدون‌نام",
               chatId: String(ctx.chat.id),
               chatTitle: ctx.chat.title || "گروه ناشناس",
               itemCode: String(item.code),
               itemName: String(item.name),
               date: new Date().toISOString()
            });

            msg += `✅ کالا: ${item.name}\n- کد: \`${item.code}\`\n- موجودی: ${item.stock}\n\n`;
          }
        });

        if (hasAvailable) {
          saveState();
          try {
            await bot?.telegram.sendMessage(state.config.adminId, msg, { parse_mode: 'Markdown' });
          } catch (err) {
            console.error("Failed to map msg to admin", err);
          }
        }
      }
    });

    bot.catch((err: any) => {
      console.error("Bot Error", err);
    });

    // We use long polling
    await bot.launch();
    state.isRunning = true;
    saveState();
    console.log("Bot started successfully");
    return true;
  } catch (e) {
    console.error("Failed to start bot", e);
    state.isRunning = false;
    saveState();
    return false;
  }
}

// Auto-start on boot if configured
if (state.config.token && state.config.adminId) {
  startBot().catch(console.error);
}

// API Routes
app.get("/api/state", (req, res) => {
  res.json({
    config: state.config,
    inventory: state.inventory,
    customers: state.customers || [],
    isRunning: state.isRunning,
  });
});

app.get("/api/download-deploy", (req, res) => {
  const filePath = path.join(process.cwd(), "dist", "cpanel-deploy.zip");
  if (fs.existsSync(filePath)) {
    res.download(filePath, "cpanel-deploy.zip");
  } else {
    res.status(404).send("فایل زیپ بیلد هنوز ساخته نشده است. لطفا ابتدا پروژه را در AI Studio بیلد کنید.");
  }
});

app.post("/api/config", async (req, res) => {
  state.config = req.body;
  saveState();
  const started = await startBot();
  res.json({ success: true, isRunning: started });
});

app.post("/api/bot/stop", (req, res) => {
  if (bot) {
    try { bot.stop(); } catch(e) {}
  }
  state.isRunning = false;
  saveState();
  res.json({ success: true, isRunning: false });
});

app.post("/api/bot/start", async (req, res) => {
  const started = await startBot();
  res.json({ success: started, isRunning: started });
});

app.post("/api/inventory", (req, res) => {
  if (!Array.isArray(req.body)) {
    // using Express v4 style return since return typing with express res usually breaks in simple scripts without full types
    res.status(400).json({ error: "Invalid inventory format" });
    return;
  }
  state.inventory = req.body;
  saveState();
  res.json({ success: true, inventoryCount: state.inventory.length });
});

async function startServer() {
  if (process.env.NODE_ENV === "development") {
    const vite = await import("vite").then(m => (m as any).createServer({
      server: { middlewareMode: true },
      appType: "spa",
    }));
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Support Vue/React router proxy to index.html
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (typeof PORT === "string" && (PORT.startsWith("/") || PORT.startsWith("\\") || !/^\d+$/.test(PORT))) {
    // Unix domain socket for cPanel / Phusion Passenger (or named socket)
    app.listen(PORT, () => {
      console.log(`Server running on Unix socket: ${PORT}`);
    });
  } else {
    // Standard TCP port
    const numericPort = Number(PORT) || 3000;
    app.listen(numericPort, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${numericPort}`);
    });
  }
}

startServer();
