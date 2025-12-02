"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import PinGuard from "@/components/PinGuard"; // 引入密碼鎖

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Category = { id: number; name: string };
type MenuItem = { id: string; name: string; price: number; category_id: number; is_available: boolean };

export default function AdminPage() {
  return (
    // ⭐️ 用密碼鎖包住整個頁面
    <PinGuard>
      <AdminContent />
    </PinGuard>
  );
}

// 把原本的內容拆成一個子元件
function AdminContent() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // 🆕 營業狀態
  const [isOpen, setIsOpen] = useState(true);

  // 新增表單狀態
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<number>(0);

  useEffect(() => {
    fetchData();
    fetchStoreSettings();
  }, []);

  const fetchStoreSettings = async () => {
    const { data } = await supabase.from("store_settings").select("is_open").single();
    if (data) setIsOpen(data.is_open);
  };

  const toggleStoreStatus = async () => {
    const newState = !isOpen;
    setIsOpen(newState); // 前端先變
    // 假設 id 為 1，如果你的 id 不一樣要改
    await supabase.from("store_settings").update({ is_open: newState }).eq("id", 1);
  };

  const fetchData = async () => {
    const { data: catData } = await supabase.from("categories").select("*").order("sort_order");
    if (catData) {
      setCategories(catData);
      if (catData.length > 0) setNewItemCategory(catData[0].id);
    }
    const { data: itemData } = await supabase.from("menu_items").select("*").order("category_id").order("name");
    if (itemData) setItems(itemData);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return alert("請填寫完整資訊");
    setIsLoading(true);
    const { error } = await supabase.from("menu_items").insert({
      name: newItemName,
      price: parseInt(newItemPrice),
      category_id: newItemCategory,
      is_available: true,
    });
    if (error) alert("新增失敗：" + error.message);
    else {
      alert("✅ 新增成功！");
      setNewItemName(""); setNewItemPrice(""); fetchData();
    }
    setIsLoading(false);
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    setItems(items.map(i => i.id === id ? { ...i, is_available: !currentStatus } : i));
    await supabase.from("menu_items").update({ is_available: !currentStatus }).eq("id", id);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`確定要刪除「${name}」嗎？`)) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (!error) fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        {/* 標題與營業開關 */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-black">🛠️ 餐廳後台管理</h1>
          
          <button
            onClick={toggleStoreStatus}
            className={`px-6 py-3 rounded-full font-bold text-xl shadow-lg transition transform active:scale-95 flex items-center gap-2 ${
              isOpen 
                ? "bg-green-500 text-white hover:bg-green-600" 
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {isOpen ? "🟢 營業中 (接單)" : "🔴 已打烊 (拒單)"}
          </button>
        </div>

        {/* 新增商品表單 */}
        <div className="bg-white p-6 rounded-xl shadow-md mb-8">
          <h2 className="text-xl font-bold mb-4 text-black">➕ 新增菜色</h2>
          <form onSubmit={handleAddItem} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-1/4">
              <label className="block text-sm font-bold text-black mb-1">分類</label>
              <select value={newItemCategory} onChange={(e) => setNewItemCategory(parseInt(e.target.value))} className="w-full p-2 border border-gray-300 rounded text-black">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="w-full md:w-2/4">
              <label className="block text-sm font-bold text-black mb-1">菜名</label>
              <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-black" />
            </div>
            <div className="w-full md:w-1/4">
              <label className="block text-sm font-bold text-black mb-1">價格</label>
              <input type="number" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-black" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full md:w-auto bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap">
              {isLoading ? "..." : "新增"}
            </button>
          </form>
        </div>

        {/* 菜單列表 */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-black">📋 現有菜單 ({items.length})</h2>
            <button onClick={fetchData} className="text-blue-600 text-sm hover:underline">重新整理</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-black text-sm uppercase"><th className="p-4">狀態</th><th className="p-4">分類</th><th className="p-4">菜名</th><th className="p-4">價格</th><th className="p-4 text-right">操作</th></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 border-b last:border-0">
                    <td className="p-4"><button onClick={() => toggleAvailability(item.id, item.is_available)} className={`px-3 py-1 rounded-full text-xs font-bold ${item.is_available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.is_available ? "販售中" : "已售完"}</button></td>
                    <td className="p-4 text-gray-800 text-sm">{categories.find(c => c.id === item.category_id)?.name}</td>
                    <td className="p-4 font-bold text-black">{item.name}</td>
                    <td className="p-4 font-mono text-blue-600 font-bold">${item.price}</td>
                    <td className="p-4 text-right"><button onClick={() => handleDelete(item.id, item.name)} className="text-red-400 hover:text-red-600 text-sm font-bold">刪除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}