import express from "express";
import path from "path";
import fs from "fs";
import { Telegraf, Markup } from "telegraf";
import * as XLSX from "xlsx";

interface InventoryItem {
  code: string;
  name: string;
  stock: number;
}
interface BotConfig {
  token: string;
  adminId: string;
  groupId?: string;
  customerMessage?: string;
  groupAccess?: "all" | "admin" | "group_admins";
  botEnabled?: boolean;
  disableCustomerPm?: boolean;
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
interface DetectedGroup {
  id: string;
  title: string;
  username?: string;
  lastActive: string;
}
interface AppState {
  config: BotConfig;
  inventory: InventoryItem[];
  customers: CustomerRequest[];
  isRunning: boolean;
  groups?: DetectedGroup[];
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

const DATA_FILE = path.join(process.cwd(), "bot-data.json");

let state: AppState = {
  config: { token: "", adminId: "", groupId: "", customerMessage: "", groupAccess: "all", botEnabled: true, disableCustomerPm: false },
  inventory: [],
  customers: [],
  isRunning: false,
  groups: [],
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

process.on('uncaughtException', (err) => {
  console.error("Uncaught Exception (Ignored to keep bot running):", err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("Unhandled Rejection (Ignored to keep bot running):", reason);
});

let bot: any = null;
let botMe: any = null;

const userMessageBuffer = new Map<string, { text: string, timestamp: number, triggeredCodes: Set<string> }>();

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

    // Retrieve bot details and configure command list (Menu button next to chat box)
    try {
      botMe = await bot.telegram.getMe();
      
      // Clear global commands for everyone
      await bot.telegram.setMyCommands([]);
      
      // Set commands specifically only in the private chat scopes so they don't show up in groups
      const adminCommands = [
        { command: 'start', description: 'شروع ربات و منوی راهنما' },
        { command: 'add', description: 'افزودن دستی کالا' },
        { command: 'delete', description: 'حذف دستی کالا' },
        { command: 'backup', description: 'دریافت بکاپ' },
        { command: 'settings', description: 'تنظیمات ربات' },
        { command: 'setmsg', description: 'تغییر پیام ارسال' },
        { command: 'help', description: 'راهنما' }
      ];
      
      await bot.telegram.setMyCommands(adminCommands, { scope: { type: 'all_private_chats' } });
      
      console.log(`Bot @${botMe.username} is connected.`);
    } catch (cmdErr) {
      console.error("Failed to get bot details or set commands menu", cmdErr);
    }

    // Command handle to test if bot reacts to admin or user
    bot.command('start', (ctx: any) => {
      if (ctx.chat.type === "private") {
        if (state.config.adminId && String(ctx.from.id) === state.config.adminId) {
          ctx.reply(
            "سلام مدیر محترم! 🌹\n" +
            "به بخش کنترل انبار و سفارش‌ها خوش آمدید.\n\n" +
            "📌 برای مدیریت سریع‌تر، می‌توانید از گرید منوی شیک زیر برای انجام کارها استفاده کنید یا به سادگی دستورات را ارسال دارید:\n\n" +
            "📥 ۱. ثبت دسته‌جمعی کالاها:\n" +
            "کافیست فایل اکسل خود را مستقیماً به همینجا بفرستید تا فوراً جایگزین شود.\n\n" +
            "✍️ ۲. افزودن/ویرایش دستی کالا:\n" +
            "فرمت دستور: \n`/add کد کالا | نام کالا | تعداد موجودی`\n" +
            "مثال: `/add SH-101 | تیشرت مردانه | 15`\n\n" +
            "🗑 ۳. حذف دستی کالا:\n" +
            "فرمت دستور: `/delete کد کالا`\n\n" +
            "📥 ۴. پشتیبان‌گیری:\n" +
            "روی دکمه دریافت پشتیبان بزنید تا بلافاصله آخرین وضعیت اکسل انبار و مشتریان ارسال شود.",
            Markup.keyboard([
              ["✍️ ثبت و ویرایش دستی کالا", "🗑️ حذف دستی کالا"],
              ["📤 آپلود موجودی انبار (اکسل)", "📥 دریافت فایل پشتیبان انبار"],
              ["⚙️ تنظیمات ربات", "💡 راهنمای کامل"]
            ]).resize()
          );
        } else {
          ctx.reply(`سلام گرامی! خوش آمدید. 🌸\nشما امکان دسترسی به پنل مدیریتی این ربات را ندارید. ربات در گروه‌های کاری تنظیم‌شده فعال است و کدهای کالا را پایش می‌نماید.`);
        }
      }
    });

    // Custom Button Listeners for Admin Menu
    bot.hears("✍️ ثبت و ویرایش دستی کالا", (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        ctx.replyWithMarkdown(
          "✍️ *راهنمای افزودن/ویرایش دستی کالا:*\n\n" +
          "کافیست دستور `/add` را به همراه مشخصات کالا با علامت خط عمودی `|` به ربات بفرستید.\n\n" +
          "👉 `/add کد کالا | نام کالا | تعداد موجودی`\n\n" +
          "*نمونه‌ها برای کپی آسان (لمس و جایگذاری کنید):*\n" +
          "👉 `/add SH-101 | تیشرت نخی قرمز | 15`\n" +
          "👉 `/add SH-102 | شلوار نخی | 5`\n" +
          "👉 `/add SH-103 | پیراهن سفید | 0` (موجودی صفر یعنی ناموجود)"
        );
      } else {
        ctx.reply("❌ دسترسی برای شما غیرمجاز است.");
      }
    });

    bot.hears("🗑️ حذف دستی کالا", (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        ctx.replyWithMarkdown(
          "🗑️ *راهنمای حذف دستی یک محصول:*\n\n" +
          "کافیست دستور `/delete` را به همراه کد محصول مدنظر برای ربات ارسال کنید:\n\n" +
          "👉 `/delete کد کالا`\n\n" +
          "*مثال:* `/delete SH-101`"
        );
      } else {
        ctx.reply("❌ دسترسی برای شما غیرمجاز است.");
      }
    });

    bot.hears("📤 آپلود موجودی انبار (اکسل)", (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        ctx.replyWithMarkdown(
          "📤 *بارگذاری دسته‌جمعی لیست کالاها از اکسل:*\n\n" +
          "شما می‌توانید یک فایل اکسل با فرمت `.xlsx` که شامل حداقل سه ستون `کد`، `نام` و `موجودی` است را مستقیماً همینجا در بات ارسال کنید تا موجودی انبار بلافاصله بروز و جایگزین شود.\n\n" +
          "همین حالا می‌توانید فایل اکسل خود را بفرستید. 📎👇"
        );
      } else {
        ctx.reply("❌ دسترسی برای شما غیرمجاز است.");
      }
    });

    bot.hears("📥 دریافت فایل پشتیبان انبار", async (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
         try {
            ctx.reply("در حال بازیابی اطلاعات و ساخت فایل اکسل پشتیبان...");
            
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
            }, { caption: "✅ فایل پشتیبان شامل آخرین تغییرات موجودی انبار و لیست تقاضای مشتریان مجاز." });

         } catch (e: any) {
              console.error(e);
              ctx.reply("❌ خطا در اجرای پشتیبان‌گیری: " + e.message);
         }
      } else {
        ctx.reply("❌ دسترسی برای شما غیرمجاز است.");
      }
    });

    bot.hears("💡 راهنمای کامل", (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        ctx.reply(
          "💡 *راهنمای کامل سیستم پایش هوشمند انبار:*\n\n" +
          "۱. ربات را وارد گروه‌ها یا سوپرگروه‌های مبادلات و فروش خود کنید.\n" +
          "۲. بر روی یکی از کدهای ارسال‌شده کالا کلیک یا پایش کنید. ربات پیام گروه را اسکن کرده و چنانچه با لیست انبار مطابقت داشته باشد، فرایند ثبت شروع می‌شود.\n" +
          "۳. ربات جزئیات محصول و توضیحات انتخابی شما را مستقیماً و به شکل پیام خصوصی (PV) به دست مشتری واگذار می‌کند.\n" +
          "۴. همزمان یک گزارش دقیق حاوی کد محصول، نام دقیق و آیدی عددی خریدار برای پیگیری نهایی برای پی‌وی شما (مدیر محترم) مخابره خواهد شد.\n" +
          "۵. در صورتی که مشتری پیشتر دکمه استارت ربات را در پی‌وی نزده باشد، ربات به او در گروه یادآور می‌شود تا ربات را استارت کند.",
          { parse_mode: 'Markdown' }
        );
      } else {
        ctx.reply("❌ دسترسی غیرمجاز.");
      }
    });

    const showAdminSettingsKeyboard = (ctx: any) => {
      const isScanOn = state.config.botEnabled !== false;
      const isPmEnabled = !state.config.disableCustomerPm;
      
      let msg = `⚙️ *تنظیمات و پیکربندی ربات مانیتورینگ:*\n\n`;
      msg += `🤖 *وضعیت اسکن و پایش کدها:* ${isScanOn ? "🟢 *روشن (فعال)*" : "🔴 *خاموش (غیرفعال)*"}\n`;
      msg += `💬 *ارسال پیام به خریدار در پی‌وی:* ${isPmEnabled ? "🟢 *فعال*" : "🔴 *غیرفعال (فقط اطلاع‌رسانی به ادمین)*"}\n\n`;
      
      const currentMsg = state.config.customerMessage && state.config.customerMessage.trim() !== ""
        ? state.config.customerMessage
        : `سلام دوست گرامی، درخواست شما برای خرید کالای «*{name}*» با کد «*{code}*» با موفقیت ثبت شد.\nمدیریت ربات به زودی برای هماهنگی‌های لازم با شما ارتباط می‌گیرد.🌸`;
      
      msg += `📝 *متن پیام ارسالی به خریدار (قالب):*\n_${currentMsg}_\n\n`;
      msg += `💡 *دکمه‌های زیر را برای تغییر وضعیت‌های بالا انتخاب کنید:*`;

      return ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `🔄 اسکن کالا: ${isScanOn ? "روشن 🟢" : "خاموش 🔴"}`,
            "toggle_scan"
          )
        ],
        [
          Markup.button.callback(
            `🔄 پیام به خریدار: ${isPmEnabled ? "ارسال شود 🟢" : "ارسال نشود 🔴"}`,
            "toggle_pm"
          )
        ],
        [
          Markup.button.callback(
            "✍️ ویرایش متن پیام خریدار",
            "edit_msg_template"
          )
        ]
      ]));
    };

    bot.hears("⚙️ تنظیمات ربات", (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        showAdminSettingsKeyboard(ctx);
      } else {
        ctx.reply("❌ دسترسی برای شما غیرمجاز است.");
      }
    });

    bot.command("settings", (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        showAdminSettingsKeyboard(ctx);
      } else {
        ctx.reply("❌ دسترسی برای شما غیرمجاز است.");
      }
    });

    bot.command("setmsg", (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        const text = ctx.message.text || "";
        const pfx = "/setmsg";
        const newMsg = text.slice(pfx.length).trim();
        if (!newMsg) {
          return ctx.reply("❌ لطفاً قالب متن مدنظرتان را بعد از دستور `/setmsg` بنویسید.\n\nمثال:\n`/setmsg سفارش خرید کالا {name} ثبت شد.`", { parse_mode: 'Markdown' });
        }
        state.config.customerMessage = newMsg;
        saveState();
        ctx.reply(`✅ قالب متن پیام خریدار با موفقیت بروزرسانی شد:\n\n«${newMsg}»`);
      }
    });

    bot.action("toggle_scan", async (ctx: any) => {
      if (state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        state.config.botEnabled = state.config.botEnabled === false ? true : false;
        saveState();
        await ctx.answerCbQuery(`پایش اسکن کد کالا به ${state.config.botEnabled ? "روشن" : "خاموش"} تغییر یافت.`);
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        showAdminSettingsKeyboard(ctx);
      } else {
        await ctx.answerCbQuery("❌ دسترسی غیرمجاز", { show_alert: true });
      }
    });

    bot.action("toggle_pm", async (ctx: any) => {
      if (state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        state.config.disableCustomerPm = !state.config.disableCustomerPm;
        saveState();
        await ctx.answerCbQuery(`ارسال پیام به خریدار ${state.config.disableCustomerPm ? "غیرفعال" : "فعال"} شد.`);
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        showAdminSettingsKeyboard(ctx);
      } else {
        await ctx.answerCbQuery("❌ دسترسی غیرمجاز", { show_alert: true });
      }
    });

    bot.action("edit_msg_template", async (ctx: any) => {
      if (state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        await ctx.answerCbQuery();
        ctx.reply(
          "✍️ *دستور تغییر متن ارسالی به خریدار:*\n\n" +
          "برای ثبت قالب دلخواه جدید، دستور `/setmsg` را در ابتدای پیام قرار داده و در ادامه متن مدنظرتان را بنویسید.\n\n" +
          "👉 `/setmsg سلام سفارش کالا {name} با موفقیت ثبت شد.`\n\n" +
          "💡 *نکته:* می‌توانید در متن از کلمات کلیدی `{code}` و `{name}` استفاده کنید تا خودکار جایگزین شوند.",
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.answerCbQuery("❌ دسترسی غیرمجاز", { show_alert: true });
      }
    });

    bot.command('add', (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        const text = ctx.message.text || "";
        const parts = text.slice(5).split('|'); // skip '/add '
        if (parts.length < 2) {
          return ctx.reply(
            "✍️ *راهنمای ثبت و ویرایش دستی کالا:*\n\n" +
            "فرمت دستور به شکل زیر است:\n" +
            "👉 `/add کد کالا | نام کالا | تعداد موجودی`\n\n" +
            "مثال: `/add SH-101 | تیشرت نخی قرمز | 15`"
          );
        }

        const code = parts[0].trim();
        const name = parts[1].trim();
        const stockStr = parts[2] ? parts[2].trim() : "1";
        const stock = isNaN(Number(stockStr)) ? 1 : Number(stockStr);

        if (!state.inventory) state.inventory = [];
        const existingIdx = state.inventory.findIndex(item => item.code.trim().toLowerCase() === code.toLowerCase());

        if (existingIdx !== -1) {
          state.inventory[existingIdx] = { code, name, stock };
          ctx.reply(`✅ کالا با موفقیت ویرایش شد:\nکد: \`${code}\`\nنام: ${name}\nموجودی جدید: ${stock}`);
        } else {
          state.inventory.push({ code, name, stock });
          ctx.reply(`✅ کالا با موفقیت افزوده شد:\nکد: \`${code}\`\nنام: ${name}\nموجودی: ${stock}`);
        }
        saveState();
      } else {
        if (ctx.chat.type === "private") {
          ctx.reply("❌ این دستور مخصوص مدیر ربات است.");
        }
      }
    });

    bot.command('delete', (ctx: any) => {
      if (ctx.chat.type === "private" && state.config.adminId && String(ctx.from.id) === state.config.adminId) {
        const text = ctx.message.text || "";
        const code = text.slice(7).trim(); // skip '/delete'
        if (!code) {
          return ctx.reply(
            "✍️ *راهنمای حذف دستی کالا:*\n\n" +
            "کافیست دستور را به همراه کد محصول مربوطه قرار دهید:\n" +
            "👈 `/delete کد کالا`\n\n" +
            "مثال: `/delete SH-101`"
          );
        }

        if (!state.inventory) state.inventory = [];
        const existingIdx = state.inventory.findIndex(item => item.code.trim().toLowerCase() === code.toLowerCase());
        if (existingIdx !== -1) {
          const deletedItem = state.inventory[existingIdx];
          state.inventory.splice(existingIdx, 1);
          saveState();
          ctx.reply(`✅ کالا با کد \`${code}\` (${deletedItem.name}) با موفقیت از انبار حذف شد.`);
        } else {
          ctx.reply(`❌ کالایی با کد \`${code}\` در لیست انبار یافت نشد.`);
        }
      } else {
        if (ctx.chat.type === "private") {
          ctx.reply("❌ این دستور مخصوص مدیر ربات است.");
        }
      }
    });

    bot.command('help', (ctx: any) => {
      if (ctx.chat.type === "private") {
        if (state.config.adminId && String(ctx.from.id) === state.config.adminId) {
          ctx.reply("💡 راهنمای استفاده از ربات مانیتورینگ موجودی کالا:\n\n۱. برای شروع، ربات را در گروه‌های کاری خود عضو کنید.\n۲. هر کدی که در چت گروه نوشته شود و دقیقاً با یکی از کدهای تعریف‌ شده در انبار همخوانی داشته باشد توسط ربات اسکن می‌گردد.\n۳. بلافاصله مشخصات محصول برای کاربر ارسال شده و برای مدیر نیز یک پیام اطلاع‌رسانی فرستاده خواهد شد.\n۴. در صورتی که کاربر ربات را استارت نکرده باشد، ربات در همان گروه به او یادآوری می‌کند تا ابتدا ربات را استارت نماید.");
        } else {
          ctx.reply(`سلام! این ربات برای پیدا کردن کدهای انبار در گروه‌های مبادله‌ای تعریف شده است. پیامی شامل کد صحیح محصول بفرستید تا اطلاعات خرید به چت شخصی شما فرستاده شود.`);
        }
      }
    });

    // Helper commands to get Group ID or User ID easily
    bot.command(['myid', 'getid', 'groupid', 'id'], async (ctx: any) => {
      const senderId = String(ctx.from.id);
      const adminId = state.config.adminId;

      if (ctx.chat.type === "private") {
        ctx.reply(`🆔 آیدی عددی شما: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
        return;
      }

      // In group/supergroup: Only answer if sender is the bot admin to prevent regular members access
      if (adminId && senderId === adminId) {
        ctx.reply(
          `👥 *اطلاعات گروه فعلی شما:*\n\n` +
          `🔹 *عنوان گروه:* ${ctx.chat.title || 'بدون نام'}\n` +
          `🆔 *آیدی عددی گروه:* \`${ctx.chat.id}\` ${ctx.chat.username ? `\n🔗 *یوزرنیم گروه:* @${ctx.chat.username}` : ""}\n\n` +
          `💡 برای اینکه اسکن کالاها محدود به همین گروه شود، این آیدی عددی را در بخش گروه هدف پنل مدیریت ذخیره کنید.`,
          { parse_mode: 'Markdown' }
        );
      }
    });

    // Event listener when bot is added to a new group/supergroup
    bot.on("new_chat_members", async (ctx: any) => {
      const meAdmin = botMe?.username;
      const addedMembers = ctx.message?.new_chat_members || [];
      const wasBotAdded = addedMembers.some((member: any) => member.username === meAdmin);

      if (wasBotAdded && ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
        const grpId = String(ctx.chat.id);
        const grpTitle = ctx.chat.title || "گروه بدون نام";
        const grpUsername = ctx.chat.username ? String(ctx.chat.username) : "";

        if (!state.groups) state.groups = [];
        const existingGrpIdx = state.groups.findIndex(g => String(g.id) === grpId);
        const groupInfo = {
          id: grpId,
          title: grpTitle,
          username: grpUsername ? `@${grpUsername}` : undefined,
          lastActive: new Date().toISOString()
        };

        if (existingGrpIdx !== -1) {
          state.groups[existingGrpIdx] = groupInfo;
        } else {
          state.groups.push(groupInfo);
        }
        saveState();

        // Inform admin about newly joined group ID securely in PV
        if (state.config.adminId) {
          try {
            await bot.telegram.sendMessage(state.config.adminId, 
              `🔔 *ربات به گروه جدیدی اضافه شد!*\n\n` +
              `👥 نام گروه: *${grpTitle}*\n` +
              `🆔 آیدی عددی گروه (Group ID): \`${grpId}\` ${grpUsername ? `\n🔗 یوزرنیم گروه: @${grpUsername}` : ""}\n\n` +
              `💡 برای اسکن کالاها فقط در این گروه خاص، می‌توانید این آیدی عددی را کپی کرده و در بخش تنظیمات پنل مدیریت ذخیره کنید تا فعال شود.`,
              { parse_mode: 'Markdown' }
            );
          } catch (err) {
            console.error("Failed to notify admin on new_chat_members", err);
          }
        }
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
           ctx.reply("در حال بررسی و بروزرسانی موجودی انبار...");
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
                return ctx.reply("❌ ستون 'کد' (یا code) in ردیف اول فایل اکسل پیدا نشد.");
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

              // Replace existing inventory completely
              state.inventory = newInventory;
              saveState();
              ctx.reply(`✅ موجودی انبار با موفقیت با فایل اکسل جایگزین شد.\nتعداد ${newInventory.length} کالا در انبار ثبت شد.`);
           } catch (e: any) {
              console.error(e);
              ctx.reply("❌ خطا در پردازش فایل: " + e.message);
           }
        } else {
           ctx.reply("❌ لطفا یک فایل اکسل با فرمت xlsx ارسال کنید.");
        }
      }
    });

    function isPurchaseRequest(rawText: string, isReply: boolean): boolean {
      const normText = rawText.toLowerCase().replace(/\u200c/g, ' ').trim();

      // Negative keywords (seller responses, transaction status, or administrative confirmations)
      const sellerKeywords = [
        "موجوده",
        "موجود دارم",
        "موجود داریم",
        "موجود شد",
        "بردارید",
        "بردار",
        "تقدیم",
        "فروخته",
        "فروختم",
        "فروخته شد",
        "ارسال شد",
        "فرستاده شد",
        "فرستادم",
        "ارسال کردم",
        "ثبت شد",
        "ثبت گردید",
        "تایید شد",
        "تایید گردید",
        "حواله",
        "حواله شد",
        "واریز",
        "واریز شد",
        "رسید",
        "کارت بفرست",
        "شماره کارت",
        "کارت به کارت",
        "فروختیم",
        "موجود نیست",
        "تموم شد",
        "تمام شد",
        "ناموجود",
        "تمام کردیم",
        "بفروشم",
        "فروشی نیست"
      ];

      for (const kw of sellerKeywords) {
        if (normText.includes(kw)) {
          return false; // Identified as a seller or admin message
        }
      }

      // If it is a reply inside a group, it is highly likely an answering/commenting message.
      // We only consider it a purchase if it explicitly includes buyer intent words.
      if (isReply) {
        const buyerKeywords = [
          "میخوام",
          "می‌خوام",
          "بخرم",
          "خرید",
          "سفارش",
          "چند",
          "چنده",
          "قیمت",
          "فی",
          "موجودی",
          "دارین",
          "دارید",
          "برای من",
          "واسه من",
          "رزرو",
          "تعداد"
        ];
        
        const hasBuyerIntent = buyerKeywords.some(kw => normText.includes(kw));
        if (!hasBuyerIntent) {
          return false; // Lacks buyer intent in a reply message, ignore
        }
      }

      return true;
    }

    bot.on("text", async (ctx: any) => {
      const text = ctx.message.text || "";

      if (ctx.chat.type === "private") {
        if (state.config.adminId && String(ctx.from.id) === state.config.adminId) {
          // If admin types a raw text message that doesn't match our custom menu buttons
          const btnTitles = ["✍️ ثبت و ویرایش دستی کالا", "🗑️ حذف دستی کالا", "📥 دریافت فایل پشتیبان انبار", "⚙️ تنظیمات ربات", "💡 راهنمای کامل"];
          if (!text.startsWith('/') && !btnTitles.includes(text)) {
             ctx.reply("مدیر گرامی، برای بروزرسانی موجودی انبار کافیست فایل اکسل جدید انبار (.xlsx) خود را مستقیماً به همینجا بفرستید.");
          }
          return;
        } else {
          // Non-admin talking in private (PV)
          ctx.reply("⚠️ شما دسترسی به پنل مدیریت یا اطلاعات در پی‌وی ندارید.\nاین ربات صرفاً فرمان‌های پایش کد کالا را در گروه‌های کاری متصل‌شده پردازش می‌کند.");
          return;
        }
      }

      // Ignore all slash commands in groups to prevent command clutter and false scanners
      if (text.startsWith('/')) {
        return;
      }

      // Check if scanner bot scanning is disabled (turned off)
      if (state.config.botEnabled === false) {
        return;
      }

      // Automatically register group for auto-discovery
      if (ctx.chat && (ctx.chat.type === "group" || ctx.chat.type === "supergroup")) {
        const grpId = String(ctx.chat.id);
        const grpTitle = ctx.chat.title || "گروه بدون نام";
        const grpUsername = ctx.chat.username ? String(ctx.chat.username) : "";

        if (!state.groups) state.groups = [];
        const existingGrpIdx = state.groups.findIndex(g => String(g.id) === grpId);
        const groupInfo = {
          id: grpId,
          title: grpTitle,
          username: grpUsername ? `@${grpUsername}` : undefined,
          lastActive: new Date().toISOString()
        };

        if (existingGrpIdx !== -1) {
          state.groups[existingGrpIdx] = groupInfo;
        } else {
          state.groups.push(groupInfo);
          saveState();

          // Securing notice to admin on discovering a new group in background
          if (state.config.adminId) {
            try {
              await bot.telegram.sendMessage(state.config.adminId, 
                `🔔 *ربات در گروه جدیدی فعالیت خود را آغاز کرد!*\n\n` +
                `👥 نام گروه: *${grpTitle}*\n` +
                `🆔 آیدی عددی گروه (Group ID): \`${grpId}\` ${grpUsername ? `\n🔗 یوزرنیم گروه: @${grpUsername}` : ""}\n\n` +
                `💡 برای محدود کردن اسکن کالاها به همین گروه، می‌توانید هم‌اکنون این آیدی را در تنظیمات پنل کپی و ذخیره کنید.`,
                { parse_mode: 'Markdown' }
              );
            } catch (err) {
              console.error("Failed to notify admin on group text detection", err);
            }
          }
        }
      }

      // Optional Group ID restriction check
      if (state.config.groupId && state.config.groupId.trim() !== "") {
         const configGroup = state.config.groupId.trim();
         const currentChatId = String(ctx.chat.id);
         const currentChatUsername = ctx.chat.username ? String(ctx.chat.username) : "";

         const isGroupMatch = currentChatId === configGroup || 
                             (currentChatUsername && (configGroup === `@${currentChatUsername}` || configGroup === currentChatUsername));
         
         if (!isGroupMatch) {
            return; // Ignore updates from other non-registered groups
         }
      }

      const userId = String(ctx.from.id);
      const now = Date.now();
      let buffer = userMessageBuffer.get(userId);
      if (!buffer || now - buffer.timestamp > 3 * 60 * 1000) {
        buffer = { text: "", timestamp: now, triggeredCodes: new Set() };
      }
      buffer.text = (buffer.text + " \n " + text).slice(-1500);
      buffer.timestamp = now;
      userMessageBuffer.set(userId, buffer);

      const searchContext = buffer.text;

      // Smart intent filter: only process actual buyer requests, skip replies by sellers/admins
      const isReply = !!ctx.message.reply_to_message;
      if (!isPurchaseRequest(searchContext, isReply)) {
        return; // Ignore
      }

      const foundItems = state.inventory.filter((item) => {
         const code = String(item.code).trim();
         if (!code || Number(item.stock) <= 0) return false;
         if (buffer!.triggeredCodes.has(code.toLowerCase())) return false;

         try {
           const cleanCode = code.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '');
           if (!cleanCode) return false;
           const regexPattern = cleanCode.split('').join('[ \\-\\.]*');
           const regex = new RegExp(`(?:^|[^a-zA-Z0-9\\u0600-\\u06FF])${regexPattern}(?:$|[^a-zA-Z0-9\\u0600-\\u06FF])`, 'i');
           return regex.test(searchContext);
         } catch (err) {
           return searchContext.toLowerCase().includes(code.toLowerCase());
         }
      });

      const escapeHtml = (text: string | undefined): string => {
        if (!text) return "";
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      };

      if (foundItems.length > 0) {
        let adminNotifyMsg = `📥 <b>ثبت درخواست خرید جدید در گروه!</b>\n\n`;
        adminNotifyMsg += `👥 <b>مشخصات گروه:</b> ${escapeHtml(ctx.chat.title || "بدون نام")}\n`;
        adminNotifyMsg += `🆔 <b>آیدی گروه:</b> <code>${ctx.chat.id}</code>\n\n`;
        adminNotifyMsg += `👤 <b>مشخصات خریدار:</b>\n`;
        adminNotifyMsg += `🔹 نام: <b>${escapeHtml((ctx.from.first_name || "") + " " + (ctx.from.last_name || "").trim())}</b>\n`;
        adminNotifyMsg += `🔹 نام کاربری: ${ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : "بدو‌ن‌یوزرنیم"}\n`;
        adminNotifyMsg += `🆔 <b>آیدی عددی خریدار:</b> <code>${ctx.from.id}</code>\n\n`;
        adminNotifyMsg += `📦 <b>کالاهای اسکن‌شده:</b> \n\n`;

        let hasAvailable = false;
        
        for (const item of foundItems) {
          if (Number(item.stock) > 0) {
            hasAvailable = true;
            
            // Add customer request record to local database
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

            adminNotifyMsg += `✅ <b>کد محصول:</b> <code>${escapeHtml(item.code)}</code>\n`;
            adminNotifyMsg += `🔸 <b>نام محصول:</b> ${escapeHtml(item.name)}\n`;
            adminNotifyMsg += `🔢 <b>موجودی در انبار:</b> <b>${escapeHtml(String(item.stock))}</b>\n\n`;

            // Prepare customized private message text to customer
            let pmText = state.config.customerMessage && state.config.customerMessage.trim() !== ""
              ? state.config.customerMessage
              : `سلام دوست گرامی، درخواست شما برای خرید کالای «<b>{name}</b>» با کد «<b>{code}</b>» با موفقیت ثبت شد.\nمدیریت ربات به زودی برای هماهنگی‌های لازم با شما ارتباط می‌گیرد.🌸`;
            
            pmText = pmText
              .replace(/{code}/g, item.code)
              .replace(/{name}/g, item.name);

            // Send in private chat with user (PV) unless disabled by admin
            if (state.config.disableCustomerPm === true) {
              console.log("Customer PM alerts are disabled, forwarding only to admin");
            } else {
              try {
                await bot.telegram.sendMessage(ctx.from.id, pmText, { parse_mode: 'HTML' });
              } catch (pvError: any) {
                console.warn("Failed to send PM directly to user, completely silent in group per admin preference.", pvError);
              }
            }
          }
        }

        if (hasAvailable) {
          saveState();
          
          foundItems.forEach(item => {
            if (Number(item.stock) > 0) {
              buffer!.triggeredCodes.add(String(item.code).trim().toLowerCase());
            }
          });

          adminNotifyMsg += `📝 <b>مجموع پیام‌های اخیر کاربر:</b>\n« ${escapeHtml(searchContext)} »\n\n`;

          try {
            await bot?.telegram.sendMessage(state.config.adminId, adminNotifyMsg, { parse_mode: 'HTML' });
            
            // Forward the original triggering message from the group to the admin PV
            if (ctx.message && ctx.message.message_id) {
               try {
                  await bot?.telegram.forwardMessage(state.config.adminId, ctx.chat.id, ctx.message.message_id);
               } catch (fwdErr) {
                  // Forwarding might fail if the user hid their account or the group restricts forwarding.
                  console.warn("Could not forward original message", fwdErr);
               }
            }
          } catch (err) {
            console.error("Failed to forward requesting message to admin", err);
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
    groups: state.groups || [],
    isRunning: state.isRunning,
  });
});

app.get("/api/download-deploy", (req, res) => {
  const possiblePaths = [
    path.join(process.cwd(), "dist", "cpanel-deploy.zip"),
    path.join(__dirname, "dist", "cpanel-deploy.zip"),
    path.join(__dirname, "cpanel-deploy.zip"),
    path.resolve("dist", "cpanel-deploy.zip"),
    "/dist/cpanel-deploy.zip"
  ];
  
  let validPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      validPath = p;
      break;
    }
  }

  if (validPath) {
    res.download(validPath, "cpanel-deploy.zip");
  } else {
    res.status(404).send("فایل زیپ بیلد هنوز ساخته نشده است. لطفا پروژه را در AI Studio مجدداً کامپایل/بیلد کنید.");
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
