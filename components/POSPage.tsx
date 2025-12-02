"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from '@supabase/supabase-js';
import { ShoppingCart, Plus, Minus, ChefHat, Utensils, User, Phone, Clock, ShoppingBag, X, ChevronDown } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- 資料型別 ---
type Category = { id: number; name: string; sort_order: number };
type MenuItem = { id: string; name: string; price: number; category_id: number; is_available: boolean };

type CartItem = MenuItem & { 
  quantity: number;
  options?: {
    spiciness?: string;
    note?: string;
    addons?: { name: string; price: number; quantity: number }[];
  };
  finalPrice: number;
};

// --- 1. 定義「通用」加料清單 ---
const FULL_ADDONS_LIST = [
  { name: "蟹肉棒", price: 20 }, { name: "鱈魚丸", price: 20 },
  { name: "北海翅", price: 20 }, { name: "鑫鑫腸", price: 20 },
  { name: "金針菇", price: 10 }, { name: "臭豆腐", price: 20 },
  { name: "貢丸",   price: 20 }, { name: "魚餃",   price: 20 },
  { name: "蒸餃",   price: 20 }, { name: "黑輪",   price: 20 },
  { name: "米血",   price: 20 }, { name: "鴨血",   price: 20 },
  { name: "蝦球",   price: 20 }, { name: "大腸",   price: 50 },
  { name: "豆皮",   price: 30 }, { name: "豬肉",   price: 40 },
  { name: "高麗菜", price: 20 }, { name: "科學麵", price: 15 },
  { name: "冬粉",   price: 10 }, { name: "白飯",   price: 10 },
];

// --- 2. 定義「牛雜鍋專屬」加料清單 ---
const BEEF_OFFAL_ADDONS = [
  { name: "金針菇", price: 10 },
  { name: "臭豆腐", price: 20 },
  { name: "鴨血",   price: 20 },
  { name: "豆皮",   price: 30 },
  { name: "高麗菜", price: 20 },
];

const ALL_SPICINESS = ["不辣", "微辣", "小辣", "中辣", "大辣"];

export default function POSPage({ menuItems, categories }: { menuItems: MenuItem[], categories: Category[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number>(0);
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // 訂單資訊
  const [diningOption, setDiningOption] = useState<"dine_in" | "take_out">("dine_in");
  const [tableNo, setTableNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupTime, setPickupTime] = useState(""); 
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

  // Modal 狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [modalSpiciness, setModalSpiciness] = useState("不辣");
  const [modalNote, setModalNote] = useState("");
  const [modalAddons, setModalAddons] = useState<{[key: string]: number}>({});

  // 動態選項狀態
  const [currentSpicinessOptions, setCurrentSpicinessOptions] = useState<string[]>([]);
  const [currentAddonsList, setCurrentAddonsList] = useState(FULL_ADDONS_LIST);

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

  const categoriesDisplay = useMemo(() => {
    if (selectedCategory === 0) return categories;
    return categories.filter(c => c.id === selectedCategory);
  }, [selectedCategory, categories]);

  // --- 點擊商品 ---
  const handleItemClick = (item: MenuItem) => {
    if (!isStoreOpen) return alert("抱歉，目前暫停接單");
    if (!item.is_available) return;

    const categoryName = categories.find(c => c.id === item.category_id)?.name || "";
    const isSimpleItem = categoryName.includes("主食") || categoryName.includes("單點") || categoryName.includes("飲料");

    if (isSimpleItem) {
      addToCartDirectly(item);
    } else {
      openModal(item);
    }
  };

  const addToCartDirectly = (item: MenuItem) => {
    setCart((prevCart) => {
      const existingItemIndex = prevCart.findIndex((i) => i.id === item.id && (!i.options || Object.keys(i.options).length === 0));
      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        newCart[existingItemIndex].quantity += 1;
        return newCart;
      } else {
        return [...prevCart, { ...item, quantity: 1, finalPrice: item.price }];
      }
    });
  };

  const openModal = (item: MenuItem) => {
    setSelectedItem(item);
    setModalQuantity(1);
    setModalNote("");
    setModalAddons({});

    if (item.name === "牛雜鍋") {
      setCurrentAddonsList(BEEF_OFFAL_ADDONS);
    } else {
      setCurrentAddonsList(FULL_ADDONS_LIST);
    }

    if (item.name.includes("泡菜")) {
      const spicyOptions = ALL_SPICINESS.filter(opt => opt !== "不辣");
      setCurrentSpicinessOptions(spicyOptions);
      setModalSpiciness("微辣"); 
    } else {
      setCurrentSpicinessOptions(ALL_SPICINESS);
      setModalSpiciness("不辣");
    }

    setIsModalOpen(true);
  };

  const confirmModalAdd = () => {
    if (!selectedItem) return;
    const addonsList = Object.entries(modalAddons)
      .filter(([_, qty]) => qty > 0)
      .map(([name, qty]) => {
        const addon = currentAddonsList.find(a => a.name === name);
        return { name, price: addon?.price || 0, quantity: qty };
      });
    const addonsTotal = addonsList.reduce((sum, a) => sum + (a.price * a.quantity), 0);
    const finalPrice = selectedItem.price + addonsTotal;

    const newItem: CartItem = {
      ...selectedItem,
      quantity: modalQuantity,
      finalPrice: finalPrice,
      options: { spiciness: modalSpiciness, note: modalNote, addons: addonsList }
    };
    setCart((prev) => [...prev, newItem]);
    setIsModalOpen(false);
  };

  const updateAddonQty = (name: string, delta: number) => {
    setModalAddons(prev => {
      const current = prev[name] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) { const { [name]: _, ...rest } = prev; return rest; }
      return { ...prev, [name]: next };
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (!isStoreOpen) return alert("🚫 目前暫停接單");
    if (cart.length === 0) return;
    if (diningOption === "dine_in" && !tableNo) return alert("⚠️ 內用請輸入桌號！");
    if (diningOption === "take_out" && !customerName) return alert("⚠️ 外帶請輸入姓名！");

    setIsLoading(true);
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
        price_at_time: item.finalPrice,
        quantity: item.quantity,
        options: item.options
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      const dailyNum = orderData.pickup_number ? `#${orderData.pickup_number}` : "--";
      let successMsg = `✅ 下單成功！\n\n取餐號碼：${dailyNum}\n------------------\n`;
      successMsg += diningOption === "take_out" ? `姓名：${customerName}\n預計取餐：${pickupTime || "現場等待"}` : `桌號：${tableNo}`;

      alert(successMsg);
      setCart([]); setTableNo(""); setCustomerName(""); setCustomerPhone(""); setPickupTime("");
      setIsMobileCartOpen(false);
    } catch (error: any) {
      console.error("結帳錯誤:", error);
      alert("❌ 結帳失敗：" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 font-sans relative overflow-hidden">
      
      {/* 打烊遮罩 */}
      {!isStoreOpen && (
        <div className="absolute inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center flex-col text-white">
          <div className="bg-red-500 p-6 rounded-full mb-6 animate-pulse"><Utensils size={64} /></div>
          <h1 className="text-4xl font-bold mb-2 tracking-wide">暫停接單中</h1>
          <p className="text-xl text-slate-300">店家目前休息或忙碌中</p>
        </div>
      )}

      {/* --- 加購選單 (Modal) 修復版 --- */}
      {isModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm md:p-4 animate-fade-in">
          
          {/* 高度改回 85dvh，避免太高頂到上面 */}
          <div className="bg-white w-full max-w-2xl rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85dvh] md:h-auto md:max-h-[90vh] animate-slide-up">
            
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10 flex-shrink-0">
              <h2 className="text-2xl font-black text-slate-800">{selectedItem.name}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={24} className="text-gray-600" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-8 flex-1">
              <div>
                <h3 className="text-lg font-bold text-slate-700 mb-3">選擇辣度</h3>
                <div className="flex flex-wrap gap-3">
                  {currentSpicinessOptions.map(spicy => (
                    <button key={spicy} onClick={() => setModalSpiciness(spicy)} className={`px-4 py-2 rounded-lg border font-bold transition-all ${modalSpiciness === spicy ? "bg-red-500 text-white border-red-500 shadow-md transform scale-105" : "bg-white text-gray-600 border-gray-200 hover:border-red-300"}`}>{spicy}</button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-700 mb-3">加點配料</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentAddonsList.map(addon => {
                    const qty = modalAddons[addon.name] || 0;
                    return (
                      <div key={addon.name} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${qty > 0 ? "border-blue-500 bg-blue-50" : "border-gray-100 bg-white"}`}>
                        <div><div className="font-bold text-slate-800">{addon.name}</div><div className="text-sm text-slate-500">${addon.price}</div></div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateAddonQty(addon.name, -1)} className={`w-8 h-8 rounded-full flex items-center justify-center transition ${qty > 0 ? "bg-white text-blue-600 shadow" : "bg-gray-100 text-gray-400"}`} disabled={qty === 0}><Minus size={16} /></button>
                          <span className={`w-6 text-center font-bold ${qty > 0 ? "text-blue-700" : "text-gray-300"}`}>{qty}</span>
                          <button onClick={() => updateAddonQty(addon.name, 1)} className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-700"><Plus size={16} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <div><h3 className="text-lg font-bold text-slate-700 mb-2">備註</h3><textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 focus:outline-blue-500 text-slate-800" placeholder="例如：不要蔥..." rows={2}/></div>
                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl"><span className="font-bold text-lg text-slate-700">份數</span><div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200"><button onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))} className="text-gray-600 hover:text-blue-600"><Minus /></button><span className="text-xl font-black text-slate-800 w-8 text-center">{modalQuantity}</span><button onClick={() => setModalQuantity(modalQuantity + 1)} className="text-gray-600 hover:text-blue-600"><Plus /></button></div></div>
              </div>
            </div>

            {/* Modal Footer (增加 pb-10 安全距離) */}
            <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0 z-10 flex justify-between items-center gap-4 pb-10 md:pb-4 flex-shrink-0">
              <div className="flex flex-col"><span className="text-xs text-gray-500 font-bold">小計</span><span className="text-2xl font-black text-slate-900">${ (selectedItem.price + Object.entries(modalAddons).reduce((acc, [name, q]) => acc + (currentAddonsList.find(a=>a.name===name)?.price||0)*q, 0)) * modalQuantity }</span></div>
              <button onClick={confirmModalAdd} className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition shadow-lg">加入購物車</button>
            </div>
          </div>
        </div>
      )}

      {/* --- 左側：菜單區 --- */}
      <div className="w-full md:w-2/3 flex flex-col h-full relative z-10">
        <div className="absolute top-0 left-0 right-0 z-10 bg-slate-100/90 backdrop-blur-md border-b border-slate-200 pt-4 pb-2 px-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><ChefHat className="text-blue-600" /><h1 className="text-xl font-black text-slate-800 tracking-tight">326</h1></div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            <button onClick={() => setSelectedCategory(0)} className={`px-5 py-2.5 rounded-2xl font-bold text-sm whitespace-nowrap transition ${selectedCategory === 0 ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>全部餐點</button>
            {categories.map((cat) => (<button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-5 py-2.5 rounded-2xl font-bold text-sm whitespace-nowrap transition ${selectedCategory === cat.id ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{cat.name}</button>))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-44 bg-slate-100 pb-32">
          {categoriesDisplay.map((cat) => {
            const itemsInCat = menuItems.filter(item => item.category_id === cat.id);
            if (itemsInCat.length === 0) return null;
            return (
              <div key={cat.id} className="mb-10">
                <div className="flex items-center mb-4 pl-1"><div className="w-1.5 h-6 bg-blue-600 rounded-full mr-3"></div><h2 className="text-xl font-black text-slate-800 tracking-wide">{cat.name}</h2></div>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {itemsInCat.map((item) => (
                    <div key={item.id} onClick={() => handleItemClick(item)} className={`group relative bg-white p-4 rounded-3xl border border-slate-100 transition-all duration-200 flex flex-col justify-between min-h-[140px] select-none ${item.is_available ? "hover:shadow-xl hover:-translate-y-1 cursor-pointer hover:border-blue-200 active:scale-95" : "opacity-60 cursor-not-allowed bg-slate-50 grayscale"}`}>
                      {!item.is_available && <div className="absolute inset-0 z-20 flex items-center justify-center"><span className="bg-slate-800/90 text-white px-4 py-1.5 rounded-full font-bold text-sm shadow-lg transform -rotate-6 backdrop-blur-sm border border-slate-600">已售完</span></div>}
                      <div><h3 className="font-bold text-slate-800 text-lg leading-tight mb-1 group-hover:text-blue-700 transition-colors">{item.name}</h3></div>
                      <div className="flex justify-between items-end mt-4"><span className={`font-black text-xl ${item.is_available ? "text-slate-900" : "text-slate-400"}`}>${item.price}</span>{item.is_available && <div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-full flex items-center justify-center transition-all group-hover:bg-blue-600 group-hover:text-white shadow-sm"><Plus size={20} strokeWidth={3} /></div>}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {categoriesDisplay.length === 0 && <div className="text-center text-slate-400 mt-20">暫無菜單資料</div>}
        </div>
      </div>

      {/* --- 手機版底部按鈕 --- */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 z-30">
        <button onClick={() => setIsMobileCartOpen(true)} className="w-full bg-slate-900 text-white py-4 px-6 rounded-full shadow-2xl flex justify-between items-center transition active:scale-95 border border-slate-700">
          <div className="flex items-center gap-3"><div className="bg-white text-slate-900 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">{totalQty}</div><span className="font-bold text-lg">查看購物車</span></div>
          <span className="font-bold text-xl">${totalAmount}</span>
        </button>
      </div>

      {/* --- 右側：結帳區 --- */}
      <div className={`
        fixed inset-0 z-50 bg-white transition-transform duration-300 transform 
        md:relative md:transform-none md:w-1/3 md:flex md:flex-col md:h-full md:z-auto md:shadow-2xl md:border-l md:border-slate-200 md:inset-auto md:translate-y-0
        ${isMobileCartOpen ? "translate-y-0" : "translate-y-full"}
      `}>
        <div className="md:hidden p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-lg text-slate-800">訂單明細</h2>
          <button onClick={() => setIsMobileCartOpen(false)} className="p-2 bg-white rounded-full shadow text-slate-600"><ChevronDown /></button>
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="p-6 pb-4 bg-white border-b border-slate-100 flex-shrink-0">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
              <button className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${diningOption === "dine_in" ? "bg-white shadow-md text-blue-600" : "text-slate-400"}`} onClick={() => setDiningOption("dine_in")}><Utensils size={18} /> 內用</button>
              <button className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${diningOption === "take_out" ? "bg-white shadow-md text-green-600" : "text-slate-400"}`} onClick={() => setDiningOption("take_out")}><ShoppingBag size={18} /> 外帶</button>
            </div>
            <div className="space-y-4">
              {diningOption === "dine_in" ? (
                <div className="relative group"><div className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500"><User size={20} /></div><input type="text" value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="輸入桌號" className="w-full bg-slate-50 rounded-2xl py-3 pl-12 pr-4 font-bold text-lg text-black outline-none focus:bg-white border-2 border-transparent focus:border-blue-500 transition" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative group"><div className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-green-500"><User size={18} /></div><input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="姓名" className="w-full bg-slate-50 rounded-2xl py-3 pl-10 pr-3 font-bold text-black outline-none focus:bg-white border-2 border-transparent focus:border-green-500 transition" /></div>
                    <div className="relative group"><div className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-green-500"><Phone size={18} /></div><input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="電話" className="w-full bg-slate-50 rounded-2xl py-3 pl-10 pr-3 font-bold text-black outline-none focus:bg-white border-2 border-transparent focus:border-green-500 transition" /></div>
                  </div>
                  <div className="relative group"><div className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-green-500"><Clock size={20} /></div><select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="w-full bg-slate-50 rounded-2xl py-3 pl-12 pr-4 font-bold text-lg text-black outline-none focus:bg-white border-2 border-transparent focus:border-green-500 cursor-pointer appearance-none transition"><option value="">⚡️ 盡快製作 (現場)</option>{timeSlots.map(time => <option key={time} value={time}>{time}</option>)}</select></div>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white pb-32 md:pb-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                <div className="bg-slate-50 p-6 rounded-full"><ShoppingCart size={48} /></div>
                <p className="font-bold">尚未點餐</p>
                <button onClick={() => setIsMobileCartOpen(false)} className="md:hidden text-blue-500 font-bold">← 返回菜單</button>
              </div>
            ) : (
              cart.map((item, index) => (
                <div key={index} className="group flex flex-col bg-white border border-slate-100 p-3 rounded-2xl hover:border-slate-300 transition-colors shadow-sm relative">
                  <button onClick={() => removeFromCart(index)} className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><X size={16} /></button>
                  <div className="flex justify-between items-start pr-8">
                    <div>
                      <div className="font-bold text-slate-800 text-lg">{item.name}</div>
                      <div className="text-sm text-slate-500 mt-1 space-y-0.5">
                        {item.options?.spiciness && item.options.spiciness !== "不辣" && <span className="text-red-500 font-bold mr-2">{item.options.spiciness}</span>}
                        {item.options?.addons?.map((addon, idx) => (<div key={idx} className="flex gap-1"><span>+ {addon.name}</span><span className="text-slate-400">x{addon.quantity}</span></div>))}
                        {item.options?.note && <div className="text-slate-400 italic">備註: {item.options.note}</div>}
                      </div>
                    </div>
                    <div className="text-right"><div className="font-bold text-slate-900">${item.finalPrice * item.quantity}</div><div className="text-xs text-slate-400">單價 ${item.finalPrice}</div></div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-dashed border-slate-100 flex justify-between items-center"><div className="text-xs text-slate-400">數量</div><div className="font-black text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">x {item.quantity}</div></div>
                </div>
              ))
            )}
          </div>

          <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-30 flex-shrink-0 pb-10 md:pb-6">
            <div className="flex justify-between items-end mb-6"><span className="text-slate-500 font-bold text-sm">訂單總金額</span><div className="flex items-baseline gap-1"><span className="text-4xl font-black text-slate-900">${totalAmount}</span></div></div>
            <button onClick={handleCheckout} disabled={cart.length === 0 || isLoading || !isStoreOpen} className={`w-full py-4 rounded-2xl text-xl font-bold shadow-xl shadow-blue-200 transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 ${cart.length === 0 || isLoading || !isStoreOpen ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : diningOption === 'take_out' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-green-200' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-200'}`}>{isLoading ? "處理中..." : diningOption === 'take_out' ? "確認外帶" : "確認內用"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}