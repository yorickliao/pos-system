"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from '@supabase/supabase-js';
// 引入漂亮的圖示
import { ShoppingCart, Plus, Minus, ChefHat, Trash2, Utensils, User, Phone, Clock } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Category = { id: number; name: string };
type MenuItem = { id: string; name: string; price: number; category_id: number; is_available: boolean };
type CartItem = MenuItem & { quantity: number };

export default function POSPage({ menuItems, categories }: { menuItems: MenuItem[], categories: Category[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number>(0);
  const [isStoreOpen, setIsStoreOpen] = useState(true);

  // 訂單資訊
  const [diningOption, setDiningOption] = useState<"dine_in" | "take_out">("dine_in");
  const [tableNo, setTableNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupTime, setPickupTime] = useState(""); 
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

  // 監聽營業狀態 & 產生時間
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from("store_settings").select("is_open").single();
      if (data) setIsStoreOpen(data.is_open);
    };
    fetchSettings();

    const channel = supabase.channel("settings-updates")
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_settings' }, (payload: any) => {
        setIsStoreOpen(payload.new.is_open);
        if (payload.new.is_open === false) alert("⚠️ 老闆已暫停接單");
      })
      .subscribe();

    const slots = [];
    const now = new Date();
    let startMinutes = Math.ceil(now.getMinutes() / 15) * 15;
    now.setMinutes(startMinutes); now.setSeconds(0);
    for (let i = 0; i < 16; i++) {
      slots.push(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
      now.setMinutes(now.getMinutes() + 15);
    }
    setTimeSlots(slots);

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredMenuItems = useMemo(() => {
    if (selectedCategory === 0) return menuItems;
    return menuItems.filter(item => item.category_id === selectedCategory);
  }, [selectedCategory, menuItems]);

  const addToCart = (item: MenuItem) => {
    if (!isStoreOpen) return alert("抱歉，目前暫停接單");
    if (!item.is_available) return;

    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => i.id === item.id);
      return existingItem 
        ? prevCart.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prevCart, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.map((item) => item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item).filter((item) => item.quantity > 0));
  };

  const handleCheckout = async () => {
    if (!isStoreOpen) return alert("🚫 目前暫停接單");
    if (cart.length === 0) return;
    if (diningOption === "dine_in" && !tableNo) return alert("⚠️ 內用請輸入桌號！");
    if (diningOption === "take_out" && !customerName) return alert("⚠️ 外帶請輸入姓名！");

    setIsLoading(true);
    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          table_no: diningOption === "dine_in" ? tableNo : "外帶",
          dining_option: diningOption,
          customer_name: customerName,
          customer_phone: customerPhone,
          pickup_time: pickupTime || "盡快製作",
          total_amount: totalAmount,
          status: 'pending'
        })
        .select().single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: orderData.id,
        menu_item_id: item.id,
        item_name: item.name,
        price_at_time: item.price,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      const dailyNum = orderData.pickup_number ? `#${orderData.pickup_number}` : "--";
      let successMsg = `✅ 下單成功！\n\n取餐號碼：${dailyNum}\n------------------\n`;
      successMsg += diningOption === "take_out" ? `姓名：${customerName}\n預計取餐：${pickupTime || "現場等待"}` : `桌號：${tableNo}`;

      alert(successMsg);
      setCart([]); setTableNo(""); setCustomerName(""); setCustomerPhone(""); setPickupTime("");
    } catch (error: any) {
      console.error("結帳錯誤:", error);
      alert("❌ 結帳失敗：" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 font-sans relative overflow-hidden">
      
      {/* 🔴 打烊遮罩 */}
      {!isStoreOpen && (
        <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center flex-col text-white">
          <div className="bg-red-500 p-6 rounded-full mb-6 animate-pulse">
            <Utensils size={64} />
          </div>
          <h1 className="text-4xl font-bold mb-2 tracking-wide">暫停接單中</h1>
          <p className="text-xl text-slate-300">店家目前休息或忙碌中</p>
        </div>
      )}

      {/* --- 左側：菜單區 --- */}
      <div className="w-full md:w-2/3 flex flex-col h-full relative">
        {/* 頂部標題與分類 (毛玻璃效果) */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-slate-100/80 backdrop-blur-md border-b border-slate-200 pt-4 pb-2 px-6">
          <div className="flex items-center gap-2 mb-4">
            <ChefHat className="text-blue-600" />
            <h1 className="text-xl font-black text-slate-800 tracking-tight">美味點餐系統</h1>
          </div>
          
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            <button 
              onClick={() => setSelectedCategory(0)} 
              className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all duration-200 shadow-sm ${selectedCategory === 0 ? "bg-slate-800 text-white scale-105 shadow-md" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              全部餐點
            </button>
            {categories.map((cat) => (
              <button 
                key={cat.id} 
                onClick={() => setSelectedCategory(cat.id)} 
                className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all duration-200 shadow-sm ${selectedCategory === cat.id ? "bg-blue-600 text-white scale-105 shadow-blue-200" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* 菜單列表 (留上面空間給 Header) */}
        <div className="flex-1 overflow-y-auto p-6 pt-40 bg-slate-100">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
            {filteredMenuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => addToCart(item)}
                className={`group relative bg-white p-4 rounded-3xl border border-slate-100 transition-all duration-200 flex flex-col justify-between min-h-[140px] select-none
                  ${item.is_available 
                    ? "hover:shadow-xl hover:-translate-y-1 cursor-pointer hover:border-blue-200" 
                    : "opacity-60 cursor-not-allowed bg-slate-50 grayscale"}`}
              >
                {!item.is_available && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <span className="bg-slate-800/90 text-white px-4 py-1.5 rounded-full font-bold text-sm shadow-lg transform -rotate-6 backdrop-blur-sm border border-slate-600">
                      已售完
                    </span>
                  </div>
                )}
                
                <div>
                  <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1 group-hover:text-blue-700 transition-colors">{item.name}</h3>
                  <p className="text-xs text-slate-400">每日限量供應</p>
                </div>

                <div className="flex justify-between items-end mt-4">
                  <span className={`font-black text-xl ${item.is_available ? "text-slate-900" : "text-slate-400"}`}>
                    ${item.price}
                  </span>
                  {item.is_available && (
                    <div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-full flex items-center justify-center transition-all group-hover:bg-blue-600 group-hover:text-white shadow-sm">
                      <Plus size={20} strokeWidth={3} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- 右側：結帳區 (類似收據的設計) --- */}
      <div className="w-full md:w-1/3 bg-white flex flex-col h-full z-20 shadow-2xl border-l border-slate-200">
        
        {/* 切換模式 */}
        <div className="p-6 pb-4 bg-white border-b border-slate-100">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
            <button className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${diningOption === "dine_in" ? "bg-white shadow-md text-blue-600" : "text-slate-400 hover:text-slate-600"}`} onClick={() => setDiningOption("dine_in")}>
              <Utensils size={18} /> 內用
            </button>
            <button className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${diningOption === "take_out" ? "bg-white shadow-md text-green-600" : "text-slate-400 hover:text-slate-600"}`} onClick={() => setDiningOption("take_out")}>
              <ShoppingBagIcon /> 外帶
            </button>
          </div>

          <div className="space-y-4">
            {diningOption === "dine_in" ? (
              <div className="relative group">
                <div className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors"><User size={20} /></div>
                <input type="text" value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="輸入桌號" className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl py-3 pl-12 pr-4 outline-none font-bold text-lg text-slate-900 placeholder-slate-400 transition-all" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                   <div className="relative group">
                    <div className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-green-500 transition-colors"><User size={18} /></div>
                    <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="姓名" className="w-full bg-slate-50 border-2 border-transparent focus:border-green-500 focus:bg-white rounded-2xl py-3 pl-10 pr-3 outline-none font-bold text-slate-900 placeholder-slate-400 transition-all" />
                  </div>
                  <div className="relative group">
                    <div className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-green-500 transition-colors"><Phone size={18} /></div>
                    <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="電話" className="w-full bg-slate-50 border-2 border-transparent focus:border-green-500 focus:bg-white rounded-2xl py-3 pl-10 pr-3 outline-none font-bold text-slate-900 placeholder-slate-400 transition-all" />
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-green-500 transition-colors"><Clock size={20} /></div>
                  <select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-green-500 focus:bg-white rounded-2xl py-3 pl-12 pr-4 outline-none font-bold text-lg text-slate-900 cursor-pointer appearance-none transition-all">
                    <option value="">⚡️ 盡快製作 (現場)</option>
                    {timeSlots.map(time => <option key={time} value={time}>{time}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 購物車內容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
              <div className="bg-slate-50 p-6 rounded-full"><ShoppingCart size={48} /></div>
              <p className="font-bold">尚未點餐</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="group flex justify-between items-center bg-white border border-slate-100 p-3 pr-2 rounded-2xl hover:border-slate-300 transition-colors shadow-sm">
                <div>
                  <div className="font-bold text-slate-800 text-base">{item.name}</div>
                  <div className="text-xs text-slate-400 mt-1">${item.price}</div>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-xl">
                   <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 rounded-lg bg-white text-slate-600 shadow-sm flex items-center justify-center hover:text-red-500 hover:bg-red-50 transition-colors"><Minus size={16} /></button>
                   <span className="font-bold w-6 text-center text-slate-800">{item.quantity}</span>
                   <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-lg bg-white text-blue-600 shadow-sm flex items-center justify-center hover:bg-blue-50 transition-colors"><Plus size={16} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部按鈕 */}
        <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-30">
          <div className="flex justify-between items-end mb-6">
            <span className="text-slate-500 font-bold text-sm">訂單總金額</span>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900">${cart.reduce((sum, item) => sum + item.price * item.quantity, 0)}</span>
            </div>
          </div>
          <button 
            onClick={handleCheckout} 
            disabled={cart.length === 0 || isLoading || !isStoreOpen} 
            className={`w-full py-4 rounded-2xl text-xl font-bold shadow-xl shadow-blue-200 transition-all transform active:scale-[0.98] flex items-center justify-center gap-3
              ${cart.length === 0 || isLoading || !isStoreOpen 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                : diningOption === 'take_out' 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-green-200' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-200'}`}
          >
            {isLoading ? "處理中..." : diningOption === 'take_out' ? "確認外帶" : "確認內用"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 輔助圖示
function ShoppingBagIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
  )
}