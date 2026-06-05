import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Bot, Upload, Settings, List, Save, Play, Square, Server, CheckCircle2, AlertCircle, Info, Users, Plus, Edit, Trash, FileDown } from 'lucide-react';
import type { AppState, BotConfig, InventoryItem, CustomerRequest } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'settings' | 'inventory' | 'customers' | 'deploy'>('settings');
  const [state, setState] = useState<AppState | null>(null);
  const [config, setConfig] = useState<BotConfig>({ token: '', adminId: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // States for manual product entry
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualStock, setManualStock] = useState('');
  const [isEditing, setIsEditing] = useState(false);

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

  const downloadSampleExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const sheetData = [
        ["کد", "نام", "موجودی"],
        ["SH-101", "تیشرت مشکی مردانه", "15"],
        ["SH-102", "شلوار جین آبی", "5"],
        ["SH-103", "کفش ورزشی سفید (موجودی صفر یعنی ناموجود)", "0"],
        ["SH-104", "جوراب نخی (نام اختیاری - بدون موجودی یعنی موجود)", ""]
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, "Inventory_Template");
      XLSX.writeFile(wb, "Inventory_Sample_Template.xlsx");
      showMessage('فایل نمونه اکسل با موفقیت دانلود شد', 'success');
    } catch (err) {
      showMessage('خطا در ایجاد و دانلود فایل نمونه', 'error');
    }
  };

  const handleAddOrUpdateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      showMessage('کد کالا الزامی است', 'error');
      return;
    }
    
    if (!state) return;
    
    const formattedCode = manualCode.trim();
    const formattedName = manualName.trim() || 'بدون نام';
    const formattedStock = manualStock.trim() === '' ? 1 : Number(manualStock);

    let updatedInventory = [...(state.inventory || [])];
    const existingIndex = updatedInventory.findIndex(item => item.code.trim() === formattedCode);

    if (existingIndex !== -1) {
      // Update existing
      updatedInventory[existingIndex] = {
        code: formattedCode,
        name: formattedName,
        stock: formattedStock
      };
      showMessage('کالا با موفقیت بروزرسانی شد', 'success');
    } else {
      // Add new
      updatedInventory.push({
        code: formattedCode,
        name: formattedName,
        stock: formattedStock
      });
      showMessage('کالا جدید با موفقیت اضافه شد', 'success');
    }

    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedInventory),
      });
      if (res.ok) {
        setState(prev => prev ? { ...prev, inventory: updatedInventory } : null);
        setManualCode('');
        setManualName('');
        setManualStock('');
        setIsEditing(false);
      } else {
         showMessage('خطا در همگام‌سازی با سرور', 'error');
      }
    } catch (err) {
       showMessage('خطا در ذخیره کالای جدید', 'error');
    }
  };

  const handleDeleteItem = async (codeToDelete: string) => {
    if (!state) return;
    if (!window.confirm('آیا از حذف این کالا اطمینان دارید؟')) return;

    const updatedInventory = state.inventory.filter(item => item.code !== codeToDelete);

    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedInventory),
      });
      if (res.ok) {
        setState(prev => prev ? { ...prev, inventory: updatedInventory } : null);
        showMessage('کالا با موفقیت حذف شد', 'success');
      } else {
        showMessage('خطا در بروزرسانی لیست کالاها روی هاست', 'error');
      }
    } catch (err) {
      showMessage('خطا در برقراری ارتباط با سرور', 'error');
    }
  };

  const handleSelectForEdit = (item: InventoryItem) => {
    setManualCode(item.code);
    setManualName(item.name === 'بدون نام' ? '' : item.name);
    setManualStock(String(item.stock));
    setIsEditing(true);
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

        if (codeIdx === -1) {
          throw new Error("ستون 'کد' (یا code) در ردیف اول فایل اکسل پیدا نشد.");
        }

        const newInventory: InventoryItem[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0 || !row[codeIdx]) continue;
          
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-left font-mono"
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
              <div className="p-6 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">مدیریت لیست محصولات</h2>
                  <p className="text-sm text-gray-500 mt-1">امکان آپلود اکسل و یا مدیریت دستی کالاها وجود دارد (نام و موجودی اختیاری هستند).</p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={downloadSampleExcel}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100 transition-colors"
                  >
                    <FileDown size={18} />
                    دانلود فایل نمونه اکسل
                  </button>

                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isUploading}
                    />
                    <button className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isUploading ? 'bg-gray-300 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      <Upload size={18} />
                      {isUploading ? 'در حال پردازش...' : 'آپلود فایل اکسل جدید'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Manual Product Registration Form */}
              <div className="p-6 border-b border-gray-200 bg-white">
                <h3 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
                  {isEditing ? <Edit size={16} className="text-amber-500" /> : <Plus size={16} className="text-blue-500" />}
                  {isEditing ? 'ویرایش کالا انتخاب شده' : 'ثبت دستی محصول جدید'}
                </h3>
                <form onSubmit={handleAddOrUpdateManual} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">کد کالا <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      placeholder="مثال: SH-101"
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value)}
                      disabled={isEditing} // Prevent editing code, to edit delete and re-create.
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-mono placeholder:font-sans"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">نام کالا (اختیاری)</label>
                    <input 
                      type="text" 
                      placeholder="مثال: تیشرت مشکی" 
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">موجودی کالا (اختیاری - خالی یعنی موجود)</label>
                    <input 
                      type="number" 
                      placeholder="مثال: 15" 
                      value={manualStock}
                      onChange={e => setManualStock(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="submit" 
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg font-medium text-sm text-white transition-colors ${isEditing ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      <Save size={16} />
                      {isEditing ? 'بروزرسانی کالا' : 'ثبت دستی'}
                    </button>
                    {isEditing && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setManualCode('');
                          setManualName('');
                          setManualStock('');
                          setIsEditing(false);
                        }}
                        className="py-2 px-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition-colors"
                      >
                        انصراف
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 font-medium">کد کالا</th>
                      <th className="px-6 py-3 font-medium">نام کالا</th>
                      <th className="px-6 py-3 font-medium">موجودی</th>
                      <th className="px-6 py-3 font-medium">وضعیت</th>
                      <th className="px-6 py-3 font-medium text-center">عملیات</th>
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
                          <td className="px-6 py-4 text-center">
                            <div className="inline-flex gap-2">
                              <button 
                                onClick={() => handleSelectForEdit(item)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="ویرایش کالا"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteItem(item.code)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="حذف کالا"
                              >
                                <Trash size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                          هیچ کالایی در سیستم ثبت نشده است. کالاها را به صورت دستی ثبت کنید یا فایل اکسل خود را آپلود کنید.
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
              <h2 className="text-lg font-bold mb-4 text-blue-800">آموزش گام‌به‌گام رفع پیام «It works! NodeJS» و اجرای نهایی ربات در سی‌پنل (cPanel)</h2>
              
              <div className="prose prose-blue max-w-none text-gray-700 text-sm leading-relaxed space-y-4">
                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg">
                  <h3 className="font-bold text-sm mb-1 flex items-center gap-2">⚠️ چرا پیام «It works! NodeJS» را می‌بینید؟</h3>
                  <p className="text-xs">
                    وقتی شما در سی‌پنل یک برنامه NodeJS ایجاد می‌کنید، خود سی‌پنل یک فایل پیش‌فرض به نام <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">app.js</code> در ریشه پوشه می‌سازد که آن صفحه تست آبی‌رنگ را نشان می‌دهد. 
                    همچنین، وب‌سرور هاست شما (Phusion Passenger) این صفحه را کش می‌کند. برای بالا آمدن سیستم واقعی، باید فایل جدید ما جایگزین آن شده و برنامه ری‌استارت شود.
                  </p>
                </div>

                <h3 className="text-md font-bold mt-6 text-gray-900 border-b pb-1">مراحل ۳ دقیقه‌ای و فوق‌العاده مطمئن برای اجرا:</h3>
                
                <div className="space-y-4">
                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">۱</span>
                    <div>
                      <h4 className="font-bold text-gray-900">دانلود کدهای خروجی (Build) از منو بالا:</h4>
                      <p className="text-gray-600">ابتدا از منوی سمت راست بالای همین صفحه (Settings یا آیکون چرخ‌دنده)، روی گزینه <strong>Export to ZIP</strong> کلیک کرده و فایل زیپ پروژه دانلودشده جدید را روی سیستم خود ذخیره کنید. (ما در این نسخه فایل‌های کمکی <code className="bg-gray-100 px-1 rounded font-mono">app.js</code> و <code className="bg-gray-100 px-1 rounded font-mono">index.js</code> را در ریشه قرار داده‌ایم تا همه‌چیز خودکار لود شود).</p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">۲</span>
                    <div>
                      <h4 className="font-bold text-gray-900">تنظیمات در Setup Node.js App سی‌پنل:</h4>
                      <p className="text-gray-600">وارد سی‌پنل شوید، بخش <strong>Setup Node.js App</strong> را باز کنید و روی نام برنامه‌ی خود کلیک کنید تا وارد تنظیمات شوید:</p>
                      <ul className="list-disc list-outside ms-6 mt-2 space-y-1 text-gray-600">
                        <li><strong>Application root:</strong> این فیلد را به هیچ وجه تغییر ندهید (مثلاً همان <code className="bg-gray-100 px-1 rounded">my-bot</code> بگذارید).</li>
                        <li><strong>Application startup file:</strong> این فیلد را می‌توانید روی <code className="bg-gray-100 px-1.5 py-0.5 text-blue-600 rounded font-mono">app.js</code> یا <code className="bg-gray-100 px-1.5 py-0.5 text-blue-600 rounded font-mono">dist/server.cjs</code> بگذارید. فرقی نمی‌کند چون ما هر دو حالت را برایتان هوشمندانه پیاده کرده‌ایم!</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">۳</span>
                    <div>
                      <h4 className="font-bold text-gray-900">آپلود و استخراج فایل‌ها در File Manager (بسیار مهم):</h4>
                      <p className="text-gray-600">وارد <strong>File Manager</strong> در سی‌پنل شوید. وارد پوشه‌ای که در ریشه هاست شما ساخته شده (مثلاً <code className="bg-gray-100 px-1 rounded font-mono">my-bot</code>) شوید.</p>
                      <p className="text-amber-800 font-semibold mb-2">💡 برای جلوگیری از هرگونه تداخل، ابتدا فایل‌های <code className="bg-gray-100 px-1 rounded font-mono text-gray-900">app.js</code> یا <code className="bg-gray-100 px-1 rounded font-mono text-gray-900">index.js</code> قدیمی و ترجیحا هر فایلی که در پوشه هست را کلاً دلیت (حذف) کنید.</p>
                      <p className="text-gray-600">حالا فایل زیپی که از این پنل دانلود کرده بودید را در همین پوشه آپلود کرده و سپس دکمه <strong>Extract</strong> را بزنید تا جایگزین شود.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">۴</span>
                    <div>
                      <h4 className="font-bold text-gray-900">پاکسازی کش و ری‌استارت برنامه:</h4>
                      <p className="text-gray-600">پس از آپلود و استخراج فایل‌ها، دوباره به بخش <strong>Setup Node.js App</strong> در سی‌پنل بروید.</p>
                      <p className="text-gray-600">در بالای صفحه، روی دکمه‌ی چرخشی و نارنجی‌رنگ <strong>Restart</strong> (یا دکمه‌ی قرمز رنگ Stop App و سپس Start App) کلیک کنید.</p>
                      <p className="text-green-700 font-bold mt-1">این کار باعث می‌شود وب‌سرور فایل تست قدیمی را فراموش کرده و ربات پرقدرت شما را بالا بیاورد!</p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">۵</span>
                    <div>
                      <h4 className="font-bold text-gray-900">ورود و تنظیمات آسان:</h4>
                      <p className="text-gray-600">حالا آدرس و دامنه را باز کنید؛ بلافاصله پنل مدیریت زیبای ربات شما لود می‌شود! به تب <strong>تنظیمات ربات</strong> بروید، توکن ربات تلگرام و آیدی عددی ادمین خود را وارد کرده و دکمه ذخیره را بزنید. کار تمام است!</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                  <h4 className="font-bold flex items-center gap-2 mb-2 text-teal-900"><Info size={18}/> ویژگی‌های فوق العاده‌ی پنل و ربات شما</h4>
                  <p className="text-gray-700">۱. <strong>بای‌پس محدودیت فضا (Disk Quota):</strong> پورتفولیوی کدهای شما بهینه‌سازی و باندل شده است، یعنی نیازی به اجرای "NPM Install" سنگین روی هاست ندارید!</p>
                  <p className="text-gray-700 mt-1">۲. <strong>دانلود نمونه اکسل آماده:</strong> در بالای بخش کالاها دکمه دانلود نمونه فراهم شد. می‌توانید کالاها را با اکسل یا به صورت کلاً دستی/پنلی بدون اکسل مدیریت کنید.</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

