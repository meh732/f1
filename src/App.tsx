import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Bot, Upload, Settings, List, Save, Play, Square, Server, CheckCircle2, AlertCircle, Info, Users } from 'lucide-react';
import type { AppState, BotConfig, InventoryItem, CustomerRequest } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'settings' | 'inventory' | 'customers' | 'deploy'>('settings');
  const [state, setState] = useState<AppState | null>(null);
  const [config, setConfig] = useState<BotConfig>({ token: '', adminId: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchState();
  }, []);

  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      const data: AppState = await res.json();
      setState(data);
      setConfig(data.config);
    } catch (err) {
      console.error(err);
      showMessage('خطا در دریافت اطلاعات از سرور', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveConfig = async () => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setState(prev => prev ? { ...prev, config, isRunning: data.isRunning } : null);
      showMessage('تنظیمات با موفقیت ذخیره شد!', 'success');
    } catch (err) {
      showMessage('خطا در ذخیره تنظیمات', 'error');
    }
  };

  const toggleBot = async () => {
    if (!state) return;
    const action = state.isRunning ? 'stop' : 'start';
    try {
      const res = await fetch(`/api/bot/${action}`, { method: 'POST' });
      const data = await res.json();
      setState(prev => prev ? { ...prev, isRunning: data.isRunning } : null);
      showMessage(data.isRunning ? 'ربات روشن شد' : 'ربات خاموش شد', 'success');
    } catch (err) {
      showMessage('خطا در تغییر وضعیت ربات', 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Convert to array of arrays first to map correctly
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (data.length < 2) throw new Error("فایل اکسل خالی است یا فرمت مناسبی ندارد");
        
        // Find column indices
        const headers = data[0].map((h: string) => h?.toString().toLowerCase().trim());
        const codeIdx = headers.findIndex(h => h === 'کد' || h === 'code');
        const nameIdx = headers.findIndex(h => h === 'نام' || h === 'name' || h === 'title' || h === 'عنوان');
        const stockIdx = headers.findIndex(h => h === 'موجودی' || h === 'stock' || h === 'qty' || h === 'تعداد');

        if (codeIdx === -1 || stockIdx === -1) {
          throw new Error("ستون 'کد' یا 'موجودی' در ردیف اول فایل اکسل پیدا نشد.");
        }

        const newInventory: InventoryItem[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0 || !row[codeIdx]) continue;
          
          newInventory.push({
            code: String(row[codeIdx]).trim(),
            name: nameIdx !== -1 ? String(row[nameIdx] || 'بدون نام') : 'بدون نام',
            stock: Number(row[stockIdx]) || 0
          });
        }

        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newInventory),
        });
        
        if (res.ok) {
          setState(prev => prev ? { ...prev, inventory: newInventory } : null);
          showMessage(`تعداد ${newInventory.length} کالا با موفقیت بروزرسانی شد`, 'success');
        } else {
          throw new Error("خطا در ذخیره در سرور");
        }
      } catch (err: any) {
        showMessage(err.message || 'خطا در پردازش فایل اکسل', 'error');
      } finally {
        setIsUploading(false);
        // Reset input
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      showMessage('خطا در خواندن فایل', 'error');
      setIsUploading(false);
    };
    reader.readAsBinaryString(file);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-800" dir="rtl"><span className="text-xl">در حال بارگذاری...</span></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Bot size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold">دستیار تلگرامی موجودی کالا</h1>
              <span className={`text-sm flex items-center gap-1 mt-1 ${state?.isRunning ? 'text-green-600' : 'text-red-500'}`}>
                {state?.isRunning ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                {state?.isRunning ? 'ربات در حال اجرا است' : 'ربات خاموش است'}
              </span>
            </div>
          </div>
          
          {/* Status Controls */}
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleBot}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors
                ${state?.isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}
              `}
            >
              {state?.isRunning ? <Square size={16} className="fill-current" /> : <Play size={16} className="fill-current" />}
              {state?.isRunning ? 'توقف ربات' : 'اجرای ربات'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.type === 'success' ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}
            {message.text}
          </div>
        )}

        {/* Custom Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 pb-px">
          {[
            { id: 'settings', icon: Settings, label: 'تنظیمات ربات' },
            { id: 'inventory', icon: List, label: 'موجودی کالاها' },
            { id: 'customers', icon: Users, label: 'مشتریان' },
            { id: 'deploy', icon: Server, label: 'آموزش راه‌اندازی' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2
                ${activeTab === tab.id 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          
          {activeTab === 'settings' && (
            <div className="p-6">
              <h2 className="text-lg font-bold mb-6">پیکربندی حساب تلگرام</h2>
              
              <div className="space-y-6 max-w-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">توکن ربات (Bot Token)</label>
                  <input 
                    type="password"
                    value={config.token}
                    onChange={e => setConfig({...config, token: e.target.value})}
                    placeholder="1234567890:AAH..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-left dir-ltr"
                  />
                  <p className="mt-2 text-xs text-gray-500">این توکن را از BotFather@ در تلگرام دریافت کنید.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">آیدی عددی مدیر (Admin Chat ID)</label>
                  <input 
                    type="text"
                    value={config.adminId}
                    onChange={e => setConfig({...config, adminId: e.target.value})}
                    placeholder="12345678"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-left"
                  />
                  <p className="mt-2 text-xs text-gray-500">برای پیدا کردن آیدی عددی خود، از ربات userinfobot@ یا مشابه آن استفاده کنید. پیام‌های درخواست خرید به این آیدی ارسال می‌شود.</p>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <button 
                    onClick={handleSaveConfig}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                  >
                    <Save size={18} />
                    ذخیره تنظیمات
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="p-0">
              <div className="p-6 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">مدیریت لیست محصولات</h2>
                  <p className="text-sm text-gray-500 mt-1">یک فایل اکسل شامل ستون‌های "کد"، "نام" و "موجودی" آپلود کنید.</p>
                </div>
                
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isUploading}
                  />
                  <button className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isUploading ? 'bg-gray-300 text-gray-600' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    <Upload size={18} />
                    {isUploading ? 'در حال پردازش...' : 'آپلود فایل اکسل'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 font-medium">کد کالا</th>
                      <th className="px-6 py-3 font-medium">نام کالا</th>
                      <th className="px-6 py-3 font-medium">موجودی</th>
                      <th className="px-6 py-3 font-medium">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {state?.inventory && state.inventory.length > 0 ? (
                      state.inventory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-gray-600">{item.code}</td>
                          <td className="px-6 py-4 font-medium">{item.name}</td>
                          <td className="px-6 py-4">{item.stock}</td>
                          <td className="px-6 py-4">
                            {item.stock > 0 
                              ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">موجود</span>
                              : <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-200">ناموجود</span>
                            }
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          هیچ کالایی در سیستم ثبت نشده است. لطفاً فایل اکسل خود را آپلود کنید.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'customers' && (
            <div className="p-0">
              <div className="p-6 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-bold">لیست درخواست‌های مشتریان</h2>
                <p className="text-sm text-gray-500 mt-1">اطلاعات کسانی که در گروه‌ها کد کالاهای موجود را ارسال کرده‌اند.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 font-medium">زمان درخواست</th>
                      <th className="px-6 py-3 font-medium">کاربر</th>
                      <th className="px-6 py-3 font-medium">گروه</th>
                      <th className="px-6 py-3 font-medium">کالا</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {state?.customers && state.customers.length > 0 ? (
                      [...state.customers].reverse().map((req, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500" dir="ltr">{new Date(req.date).toLocaleString('fa-IR')}</td>
                          <td className="px-6 py-4">
                            <div className="font-medium">@{req.username}</div>
                            <div className="text-xs text-gray-500 font-mono mt-1">{req.userId}</div>
                          </td>
                          <td className="px-6 py-4">{req.chatTitle}</td>
                          <td className="px-6 py-4">
                            <div className="font-medium">{req.itemName}</div>
                            <div className="text-xs text-gray-500 font-mono mt-1">کد: {req.itemCode}</div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          تا کنون هیچ درخواستی ثبت نشده است.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'deploy' && (
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">نحوه اجرای ربات روی هاست اشتراکی (cPanel / DirectAdmin)</h2>
              
              <div className="prose prose-blue max-w-none text-gray-700 text-sm leading-relaxed">
                <p className="mb-4 text-base">بر خلاف سایت‌های PHP، ربات‌های نود جی‌اس به امکانات خاصی در هاست نیاز دارند. برای اجرای این ربات در یک هاست اشتراکی (مثل سی‌پنل)، مراحل زیر را دنبال کنید:</p>
                
                <h3 className="text-md font-bold mt-6 mb-2 text-gray-900">پیش‌نیاز</h3>
                <p className="mb-4">هاست شما باید ابزار <strong>Setup Node.js App</strong> (مدیریت NodeJS) را در کنترل‌پنل خود داشته باشد.</p>

                <h3 className="text-md font-bold mt-6 mb-2 text-gray-900">مراحل نصب در سی‌پنل (cPanel)</h3>
                <ol className="list-decimal list-outside ms-5 space-y-2">
                  <li>ابتدا این دستور را در پروژه روی سیستم خود (یا در محیط توسعه فعلی) اجرا کنید تا پروژه بیلْد شود:<br/>
                      <code className="bg-gray-100 px-2 py-0.5 rounded dir-ltr border block mt-1 w-fit">npm run build</code>
                  </li>
                  <li>وارد cPanel شوید و بخش <strong>Setup Node.js App</strong> را باز کنید.</li>
                  <li>روی <strong>Create Application</strong> کلیک کنید.</li>
                  <li>
                    تنظیمات را اینگونه وارد کنید:
                    <ul className="list-disc list-outside ms-4 mt-2 mb-2">
                      <li><strong>Node.js version:</strong> نسخه‌ی 18 یا بالاتر</li>
                      <li><strong>Application mode:</strong> Production</li>
                      <li><strong>Application root:</strong> یک پوشه مانند <code>bot-app</code> ایجاد کرده و مسیر آن را وارد کنید.</li>
                      <li><strong>Application URL:</strong> آدرس یکی از دامنه‌ها یا ساب‌دامین‌هایتان.</li>
                      <li><strong>Application startup file:</strong> <code>dist/server.cjs</code></li>
                    </ul>
                  </li>
                  <li>روی دکمه <strong>Create</strong> کلیک کنید.</li>
                  <li>حالا از طریق <strong>File Manager</strong> در سی‌پنل به پوشه‌ای که روی هاست ساخته‌اید (مثل <code>bot-app</code>) بروید.</li>
                  <li>فقط این دو فایل/پوشه را از سیستم خود در پوشه‌ی هاست آپلود کنید:
                    <ul className="list-disc list-outside ms-4 mt-2">
                      <li>فایل <code>package.json</code></li>
                      <li>کل محتویات پوشه‌ی <code>dist/</code> (تولید شده توسط دستور build)</li>
                    </ul>
                  </li>
                  <li>در بخش <strong>Setup Node.js App</strong> روی دکمه‌ی <strong>Run NPM Install</strong> کلیک کنید تا متغیرها و کتابخانه‌ها نصب شوند.</li>
                  <li>در نهایت در همان صفحه روی دکمه‌ی <strong>Start App</strong> یا <strong>Restart</strong> کلیک کنید.</li>
                  <li className="text-blue-700 bg-blue-50 p-2 rounded">
                    <strong>نکته مهم:</strong> هر زمان که یک فایل اکسل از جانب ادمین به تلگرام ارسال شود، سیستم اطلاعات را در فایلی به نام <code>bot-data.json</code> در همان مسیر هاست ذخیره می‌کند تا در صورت ری‌استارت شدن هاست، موجودی‌ها صفر نشود.
                  </li>
                </ol>

                <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-bold flex items-center gap-2 mb-2 text-blue-900"><Info size={18}/> نحوه کارکرد ربات</h4>
                  <p>ربات بصورت خودکار تمامی پیام‌های ارسالی کاربران در گروه‌هایی که عضو آن است را می‌خواند. اگر پیامی حاوی کلمه‌ای باشد که دقیقا با «کد کالا» یکی از محصولات شما تطابق داشته باشد (و آن کالا در اکسل موجودی بیشتر از ۰ داشته باشد)، ربات فورا پیامی به آیدی خصوصی شما می‌فرستد.</p>
                  <p className="mt-2 text-green-700 font-bold border-t border-blue-200 pt-2">آپدیت جدید: حالا ادمین می‌تواند فایل اکسل موجودی را در پی‌وی (Private Chat) ربات ارسال کند و ربات بلافاصله موجودی اجناس را به‌روز خواهد کرد.</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

