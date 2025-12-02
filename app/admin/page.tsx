"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import PinGuard from "@/components/PinGuard";
import { Trash2, Edit2, Save, X, Plus, Utensils, List } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Category = { id: number; name: string; sort_order: number };
type MenuItem = { id: string; name: string; price: number; category_id: number; is_available: boolean };

export default function AdminPage() {
  return (
    <PinGuard>
      <AdminContent />
    </PinGuard>
  );
}

function AdminContent() {
  // 控制分頁：預設在 "items" (菜色管理)
  const [activeTab, setActiveTab] = useState<"items" | "categories">("items");
  
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  // --- 新增菜色表單 ---
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<number>(0);

  // --- 分類編輯狀態 ---
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatOrder, setEditCatOrder] = useState("");
  
  // --- 新增分類表單 ---
  const [newCatName, setNewCatName] = useState("");
  const [newCatOrder, setNewCatOrder] = useState("0");

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
    setIsOpen(newState);
    await supabase.from("store_settings").update({ is_open: newState }).eq("id", 1);
  };

  const fetchData = async () => {
    // 1. 抓取分類 (依照 sort_order 排序)
    const { data: catData } = await supabase.from("categories").select("*").order("sort_order", { ascending: true });
    if (catData) {
      setCategories(catData);
      // 如果還沒選過分類，預設選第一個
      if (catData.length > 0 && newItemCategory === 0) setNewItemCategory(catData[0].id);
    }

    // 2. 抓取菜色
    const { data: itemData } = await supabase.from("menu_items").select("*").order("category_id").order("name");
    if (itemData) setItems(itemData);
  };

  // --- 菜色相關功能 ---
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

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`確定要刪除「${name}」嗎？`)) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (!error) fetchData();
  };

  // --- 🆕 分類相關功能 ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return alert("請輸入分類名稱");
    
    setIsLoading(true);
    const { error } = await supabase.from("categories").insert({
      name: newCatName,
      sort_order: parseInt(newCatOrder) || 0
    });

    if (error) alert("新增失敗：" + error.message);
    else {
      alert("✅ 分類新增成功！");
      setNewCatName(""); setNewCatOrder("0"); fetchData();
    }
    setIsLoading(false);
  };

  const startEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatOrder(cat.sort_order.toString());
  };

  const saveEditCategory = async (id: number) => {
    const { error } = await supabase.from("categories").update({
      name: editCatName,
      sort_order: parseInt(editCatOrder) || 0
    }).eq("id", id);

    if (error) alert("更新失敗");
    else {
      setEditingCatId(null);
      fetchData();
    }
  };

  const handleDeleteCategory = async (id: number, name: string) => {
    // 檢查是否有菜色正在使用這個分類
    const hasItems = items.some(i => i.category_id === id);
    if (hasItems) {
      alert(`⚠️ 無法刪除「${name}」！\n請先將該分類底下的菜色刪除或移到別的分類。`);
      return;
    }

    if (!confirm(`確定要刪除分類「${name}」嗎？`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (!error) fetchData();
    else alert(error.message);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* 頂部 Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-black">326後台</h1>
          <button
            onClick={toggleStoreStatus}
            className={`px-6 py-3 rounded-full font-bold text-xl shadow-lg transition flex items-center gap-2 ${
              isOpen ? "bg-green-500 text-white hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {isOpen ? "🟢 營業中" : "🔴 已打烊"}
          </button>
        </div>

        {/* 分頁切換 Tab */}
        <div className="flex gap-4 mb-6 border-b border-gray-300 pb-1">
          <button 
            onClick={() => setActiveTab("items")}
            className={`pb-3 px-4 font-bold text-lg flex items-center gap-2 transition ${
              activeTab === "items" 
                ? "text-blue-600 border-b-4 border-blue-600" 
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Utensils size={20} /> 菜單管理
          </button>
          <button 
            onClick={() => setActiveTab("categories")}
            className={`pb-3 px-4 font-bold text-lg flex items-center gap-2 transition ${
              activeTab === "categories" 
                ? "text-blue-600 border-b-4 border-blue-600" 
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <List size={20} /> 分類管理
          </button>
        </div>

        {/* ================= 頁面 1: 菜色管理 ================= */}
        {activeTab === "items" && (
          <>
            {/* 新增菜色 */}
            <div className="bg-white p-6 rounded-xl shadow-md mb-8">
              <h2 className="text-xl font-bold mb-4 text-black flex items-center gap-2">
                <Plus className="bg-blue-100 text-blue-600 rounded p-1" size={28}/> 新增菜色
              </h2>
              <form onSubmit={handleAddItem} className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:w-1/4">
                  <label className="block text-sm font-bold text-black mb-1">分類</label>
                  <select value={newItemCategory} onChange={(e) => setNewItemCategory(parseInt(e.target.value))} className="w-full p-2 border border-gray-300 rounded text-black font-bold">
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="w-full md:w-2/4">
                  <label className="block text-sm font-bold text-black mb-1">菜名</label>
                  <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="例如：紅燒獅子頭" className="w-full p-2 border border-gray-300 rounded text-black" />
                </div>
                <div className="w-full md:w-1/4">
                  <label className="block text-sm font-bold text-black mb-1">價格</label>
                  <input type="number" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} placeholder="100" className="w-full p-2 border border-gray-300 rounded text-black" />
                </div>
                <button type="submit" disabled={isLoading} className="w-full md:w-auto bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap">
                  新增
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
                        <td className="p-4 text-gray-800 text-sm font-bold">{categories.find(c => c.id === item.category_id)?.name}</td>
                        <td className="p-4 font-bold text-black text-lg">{item.name}</td>
                        <td className="p-4 font-mono text-blue-600 font-bold">${item.price}</td>
                        <td className="p-4 text-right"><button onClick={() => handleDeleteItem(item.id, item.name)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={18} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ================= 頁面 2: 分類管理 ================= */}
        {activeTab === "categories" && (
          <>
            {/* 新增分類 */}
            <div className="bg-white p-6 rounded-xl shadow-md mb-8 border-l-4 border-orange-500">
              <h2 className="text-xl font-bold mb-4 text-black flex items-center gap-2">
                <Plus className="bg-orange-100 text-orange-600 rounded p-1" size={28}/> 新增分類
              </h2>
              <form onSubmit={handleAddCategory} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-black mb-1">分類名稱</label>
                  <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="例如：主食、飲料" className="w-full p-2 border border-gray-300 rounded text-black" />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-bold text-black mb-1">排序 (數字小在前)</label>
                  <input type="number" value={newCatOrder} onChange={(e) => setNewCatOrder(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-black" />
                </div>
                <button type="submit" disabled={isLoading} className="bg-orange-600 text-white px-6 py-2 rounded font-bold hover:bg-orange-700 whitespace-nowrap">
                  新增分類
                </button>
              </form>
            </div>

            {/* 分類列表 */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-black">📂 分類列表 ({categories.length})</h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-black text-sm uppercase">
                    <th className="p-4">排序</th>
                    <th className="p-4">分類名稱</th>
                    <th className="p-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-gray-50 border-b last:border-0">
                      {editingCatId === cat.id ? (
                        // 編輯模式
                        <>
                          <td className="p-4">
                            <input type="number" value={editCatOrder} onChange={(e) => setEditCatOrder(e.target.value)} className="w-16 p-1 border rounded text-black text-center" />
                          </td>
                          <td className="p-4">
                            <input type="text" value={editCatName} onChange={(e) => setEditCatName(e.target.value)} className="w-full p-1 border rounded text-black font-bold" autoFocus />
                          </td>
                          <td className="p-4 flex justify-end gap-2">
                            <button onClick={() => saveEditCategory(cat.id)} className="bg-green-100 text-green-700 px-3 py-1 rounded flex items-center gap-1 font-bold hover:bg-green-200"><Save size={16}/> 儲存</button>
                            <button onClick={() => setEditingCatId(null)} className="bg-gray-100 text-gray-600 px-3 py-1 rounded flex items-center gap-1 hover:bg-gray-200"><X size={16}/> 取消</button>
                          </td>
                        </>
                      ) : (
                        // 顯示模式
                        <>
                          <td className="p-4 text-gray-500 font-mono">{cat.sort_order}</td>
                          <td className="p-4 font-bold text-black text-lg">{cat.name}</td>
                          <td className="p-4 flex justify-end gap-2">
                            <button onClick={() => startEditCategory(cat)} className="text-blue-500 hover:text-blue-700 p-2 bg-blue-50 rounded"><Edit2 size={18} /></button>
                            <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </div>
  );
}