"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import PinGuard from "@/components/PinGuard";
import { Trash2, Edit2, Save, X, Plus, Utensils, List } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Category = { id: number; name: string; sort_order: number };
type MenuItem = {
  id: string; // uuid in DB
  name: string;
  price: number;
  category_id: number;
  is_available: boolean;
};

export default function AdminPage() {
  return (
    <PinGuard>
      <AdminContent />
    </PinGuard>
  );
}

function AdminContent() {
  // 控制分頁：預設在 "items" (菜色管理)
  const [activeTab, setActiveTab] = useState<"items" | "categories" | "addons">("items");

  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  // --- 新增菜色表單 ---
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<number>(0);

  // --- 菜色編輯狀態 ---
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemPrice, setEditItemPrice] = useState("");

  // --- 分類編輯狀態 ---
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatOrder, setEditCatOrder] = useState("");

  // --- 新增分類表單 ---
  const [newCatName, setNewCatName] = useState("");
  const [newCatOrder, setNewCatOrder] = useState("0");

  // --- 加點設定狀態 ---
  const [selectedBaseItemId, setSelectedBaseItemId] = useState<string>("");
  const [addonChecked, setAddonChecked] = useState<Record<string, boolean>>({});
  const [isSavingAddons, setIsSavingAddons] = useState(false);

  useEffect(() => {
    fetchData();
    fetchStoreSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStoreSettings = async () => {
    const { data } = await supabase.from("store_settings").select("is_open").single();
    if (data) setIsOpen(!!data.is_open);
  };

  const toggleStoreStatus = async () => {
    const newState = !isOpen;
    setIsOpen(newState);
    await supabase.from("store_settings").update({ is_open: newState }).eq("id", 1);
  };

  const fetchData = async () => {
    // 1. 抓取分類 (依照 sort_order 排序)
    const { data: catData, error: catErr } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (catErr) {
      alert("抓分類失敗：" + catErr.message);
      return;
    }

    if (catData) {
      setCategories(catData as any);
      if (catData.length > 0 && newItemCategory === 0) setNewItemCategory(catData[0].id);
    }

    // 2. 抓取菜色
    const { data: itemData, error: itemErr } = await supabase
      .from("menu_items")
      .select("*")
      .order("category_id")
      .order("name");

    if (itemErr) {
      alert("抓菜色失敗：" + itemErr.message);
      return;
    }
    if (itemData) setItems(itemData as any);
  };

  // --- 菜色相關功能 ---
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return alert("請填寫完整資訊");

    setIsLoading(true);
    const { error } = await supabase.from("menu_items").insert({
      name: newItemName,
      price: parseInt(newItemPrice, 10),
      category_id: newItemCategory,
      is_available: true,
    });

    if (error) alert("新增失敗：" + error.message);
    else {
      alert("✅ 新增成功！");
      setNewItemName("");
      setNewItemPrice("");
      await fetchData();
    }
    setIsLoading(false);
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    // optimistic UI
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_available: !currentStatus } : i)));

    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: !currentStatus })
      .eq("id", id);

    if (error) {
      alert("更新失敗：" + error.message);
      await fetchData();
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`確定要刪除「${name}」嗎？`)) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) alert("刪除失敗：" + error.message);
    else await fetchData();
  };

  const startEditItem = (item: MenuItem) => {
    setEditingItemId(item.id);
    setEditItemName(item.name);
    setEditItemPrice(String(item.price));
  };

  const saveEditItem = async (id: string) => {
    if (!editItemName || !editItemPrice) return alert("請填寫完整資訊");

    const { error } = await supabase
      .from("menu_items")
      .update({
        name: editItemName,
        price: parseInt(editItemPrice, 10),
      })
      .eq("id", id);

    if (error) alert("更新失敗：" + error.message);
    else {
      setEditingItemId(null); // 關閉編輯模式
      await fetchData();      // 重新拉取最新資料
    }
  };

  // --- 分類相關功能 ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return alert("請輸入分類名稱");

    setIsLoading(true);
    const { error } = await supabase.from("categories").insert({
      name: newCatName,
      sort_order: parseInt(newCatOrder, 10) || 0,
    });

    if (error) alert("新增失敗：" + error.message);
    else {
      alert("✅ 分類新增成功！");
      setNewCatName("");
      setNewCatOrder("0");
      await fetchData();
    }
    setIsLoading(false);
  };

  const startEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatOrder(String(cat.sort_order));
  };

  const saveEditCategory = async (id: number) => {
    const { error } = await supabase
      .from("categories")
      .update({
        name: editCatName,
        sort_order: parseInt(editCatOrder, 10) || 0,
      })
      .eq("id", id);

    if (error) alert("更新失敗：" + error.message);
    else {
      setEditingCatId(null);
      await fetchData();
    }
  };

  const handleDeleteCategory = async (id: number, name: string) => {
    const hasItems = items.some((i) => i.category_id === id);
    if (hasItems) {
      alert(`⚠️ 無法刪除「${name}」！\n請先將該分類底下的菜色刪除或移到別的分類。`);
      return;
    }

    if (!confirm(`確定要刪除分類「${name}」嗎？`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) alert("刪除失敗：" + error.message);
    else await fetchData();
  };

  // -----------------------------
  // 加點：資料來源與儲存
  // -----------------------------
  const addonCategoryId = useMemo(() => {
    // 你可以把分類名稱固定叫「加點」
    const cat = categories.find((c) => c.name === "加點");
    return cat?.id ?? null;
  }, [categories]);

  const addonItems = useMemo(() => {
    if (!addonCategoryId) return [];
    return items.filter((it) => it.category_id === addonCategoryId);
  }, [items, addonCategoryId]);

  const baseHotpotItems = useMemo(() => {
    // 最小做法：品名包含「鍋」就視為可設定加點的 base item
    return items.filter((it) => (it.name || "").includes("鍋"));
  }, [items]);

  async function loadAddonMapping(baseItemId: string) {
    const { data, error } = await supabase
      .from("item_addons")
      .select("addon_item_id,is_enabled")
      .eq("base_item_id", baseItemId);

    if (error) {
      alert("讀取加點設定失敗：" + error.message);
      return;
    }

    const checked: Record<string, boolean> = {};
    for (const row of (data as any[]) || []) {
      if (row.is_enabled) checked[row.addon_item_id] = true;
    }
    setAddonChecked(checked);
  }

  async function saveAddonMapping(baseItemId: string) {
    setIsSavingAddons(true);

    try {
      const wantAddonIds = Object.entries(addonChecked)
        .filter(([_, v]) => v)
        .map(([id]) => id);

      // 現有 mapping
      const { data: cur, error: curErr } = await supabase
        .from("item_addons")
        .select("addon_item_id")
        .eq("base_item_id", baseItemId);

      if (curErr) throw curErr;

      const curIds = new Set(((cur as any[]) || []).map((r) => r.addon_item_id));
      const wantIds = new Set(wantAddonIds);

      const toDelete = [...curIds].filter((id) => !wantIds.has(id));
      const toUpsert = [...wantIds].map((addonId, idx) => ({
        base_item_id: baseItemId,
        addon_item_id: addonId,
        is_enabled: true,
        sort_order: idx * 10,
      }));

      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from("item_addons")
          .delete()
          .eq("base_item_id", baseItemId)
          .in("addon_item_id", toDelete);

        if (delErr) throw delErr;
      }

      if (toUpsert.length) {
        const { error: upErr } = await supabase
          .from("item_addons")
          .upsert(toUpsert, { onConflict: "base_item_id,addon_item_id" });

        if (upErr) throw upErr;
      }

      alert("✅ 加點設定已儲存");
      // 重新讀一次，確保 UI 同步
      await loadAddonMapping(baseItemId);
    } catch (e: any) {
      alert("儲存失敗：" + (e?.message || String(e)));
    } finally {
      setIsSavingAddons(false);
    }
  }

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

          <button
            onClick={() => setActiveTab("addons")}
            className={`pb-3 px-4 font-bold text-lg flex items-center gap-2 transition ${
              activeTab === "addons"
                ? "text-blue-600 border-b-4 border-blue-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <List size={20} /> 加點設定
          </button>
        </div>

        {/* ================= 頁面 1: 菜色管理 ================= */}
        {activeTab === "items" && (
          <>
            {/* 新增菜色 */}
            <div className="bg-white p-6 rounded-xl shadow-md mb-8">
              <h2 className="text-xl font-bold mb-4 text-black flex items-center gap-2">
                <Plus className="bg-blue-100 text-blue-600 rounded p-1" size={28} /> 新增菜色
              </h2>

              <form onSubmit={handleAddItem} className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:w-1/4">
                  <label className="block text-sm font-bold text-black mb-1">分類</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(parseInt(e.target.value, 10))}
                    className="w-full p-2 border border-gray-300 rounded text-black font-bold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full md:w-2/4">
                  <label className="block text-sm font-bold text-black mb-1">菜名</label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="例如：紅燒獅子頭"
                    className="w-full p-2 border border-gray-300 rounded text-black"
                  />
                </div>

                <div className="w-full md:w-1/4">
                  <label className="block text-sm font-bold text-black mb-1">價格</label>
                  <input
                    type="number"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    placeholder="100"
                    className="w-full p-2 border border-gray-300 rounded text-black"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full md:w-auto bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap"
                >
                  新增
                </button>
              </form>
            </div>

            {/* 菜單列表 */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-black">📋 現有菜單 ({items.length})</h2>
                <button onClick={fetchData} className="text-blue-600 text-sm hover:underline">
                  重新整理
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-black text-sm uppercase">
                      <th className="p-4">狀態</th>
                      <th className="p-4">分類</th>
                      <th className="p-4">菜名</th>
                      <th className="p-4">價格</th>
                      <th className="p-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 border-b last:border-0">
                        {editingItemId === item.id ? (
                          /* --- 編輯模式 --- */
                          <>
                            <td className="p-4 text-gray-400 text-sm">編輯中...</td>
                            <td className="p-4 text-gray-800 text-sm font-bold">
                              {categories.find((c) => c.id === item.category_id)?.name}
                            </td>
                            <td className="p-4">
                              <input
                                type="text"
                                value={editItemName}
                                onChange={(e) => setEditItemName(e.target.value)}
                                className="w-full p-1 border rounded text-black font-bold focus:border-blue-500 outline-none"
                                autoFocus
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="number"
                                value={editItemPrice}
                                onChange={(e) => setEditItemPrice(e.target.value)}
                                className="w-20 p-1 border rounded text-black font-bold text-blue-600 focus:border-blue-500 outline-none"
                              />
                            </td>
                            <td className="p-4 flex justify-end gap-2">
                              <button
                                onClick={() => saveEditItem(item.id)}
                                className="bg-green-100 text-green-700 px-3 py-1 rounded flex items-center gap-1 font-bold hover:bg-green-200"
                              >
                                <Save size={16} /> 儲存
                              </button>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="bg-gray-100 text-gray-600 px-3 py-1 rounded flex items-center gap-1 hover:bg-gray-200"
                              >
                                <X size={16} /> 取消
                              </button>
                            </td>
                          </>
                        ) : (
                          /* --- 一般檢視模式 --- */
                          <>
                            <td className="p-4">
                              <button
                                onClick={() => toggleAvailability(item.id, item.is_available)}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  item.is_available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                }`}
                              >
                                {item.is_available ? "販售中" : "已售完"}
                              </button>
                            </td>
                            <td className="p-4 text-gray-800 text-sm font-bold">
                              {categories.find((c) => c.id === item.category_id)?.name}
                            </td>
                            <td className="p-4 font-bold text-black text-lg">{item.name}</td>
                            <td className="p-4 font-mono text-blue-600 font-bold">${item.price}</td>
                            <td className="p-4 text-right flex justify-end gap-1">
                              {/* 新增的編輯按鈕 */}
                              <button
                                onClick={() => startEditItem(item)}
                                className="text-blue-500 hover:text-blue-700 p-2 bg-blue-50 rounded hover:bg-blue-100"
                                title="編輯"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id, item.name)}
                                className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"
                                title="刪除"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </>
                        )}
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
                <Plus className="bg-orange-100 text-orange-600 rounded p-1" size={28} /> 新增分類
              </h2>

              <form onSubmit={handleAddCategory} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-black mb-1">分類名稱</label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="例如：主食、飲料、加點"
                    className="w-full p-2 border border-gray-300 rounded text-black"
                  />
                </div>

                <div className="w-32">
                  <label className="block text-sm font-bold text-black mb-1">排序 (數字小在前)</label>
                  <input
                    type="number"
                    value={newCatOrder}
                    onChange={(e) => setNewCatOrder(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-black"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-orange-600 text-white px-6 py-2 rounded font-bold hover:bg-orange-700 whitespace-nowrap disabled:bg-gray-400"
                >
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
                        <>
                          <td className="p-4">
                            <input
                              type="number"
                              value={editCatOrder}
                              onChange={(e) => setEditCatOrder(e.target.value)}
                              className="w-16 p-1 border rounded text-black text-center"
                            />
                          </td>
                          <td className="p-4">
                            <input
                              type="text"
                              value={editCatName}
                              onChange={(e) => setEditCatName(e.target.value)}
                              className="w-full p-1 border rounded text-black font-bold"
                              autoFocus
                            />
                          </td>
                          <td className="p-4 flex justify-end gap-2">
                            <button
                              onClick={() => saveEditCategory(cat.id)}
                              className="bg-green-100 text-green-700 px-3 py-1 rounded flex items-center gap-1 font-bold hover:bg-green-200"
                            >
                              <Save size={16} /> 儲存
                            </button>
                            <button
                              onClick={() => setEditingCatId(null)}
                              className="bg-gray-100 text-gray-600 px-3 py-1 rounded flex items-center gap-1 hover:bg-gray-200"
                            >
                              <X size={16} /> 取消
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-4 text-gray-500 font-mono">{cat.sort_order}</td>
                          <td className="p-4 font-bold text-black text-lg">{cat.name}</td>
                          <td className="p-4 flex justify-end gap-2">
                            <button
                              onClick={() => startEditCategory(cat)}
                              className="text-blue-500 hover:text-blue-700 p-2 bg-blue-50 rounded"
                              title="編輯"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat.id, cat.name)}
                              className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"
                              title="刪除"
                            >
                              <Trash2 size={18} />
                            </button>
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

        {/* ================= 頁面 3: 加點設定 ================= */}
        {activeTab === "addons" && (
          <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold mb-2 text-black">加點設定</h2>
            <div className="text-sm text-gray-600 mb-6">
              用「分類：加點」建立加點品項；售完切「已售完」後，POS 端會自動禁用該加點。
            </div>

            {!addonCategoryId && (
              <div className="mb-6 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 font-bold">
                找不到分類「加點」。請先到「分類管理」新增一個分類名稱叫「加點」。
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-black mb-1">選擇火鍋（可加點的主品）</label>
                <select
                  value={selectedBaseItemId}
                  onChange={async (e) => {
                    const id = e.target.value;
                    setSelectedBaseItemId(id);
                    setAddonChecked({});
                    if (id) await loadAddonMapping(id);
                  }}
                  className="w-full p-2 border border-gray-300 rounded text-black font-bold"
                >
                  <option value="">請選擇火鍋品項（品名包含「鍋」）</option>
                  {baseHotpotItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => selectedBaseItemId && saveAddonMapping(selectedBaseItemId)}
                disabled={!selectedBaseItemId || isSavingAddons}
                className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isSavingAddons ? "儲存中..." : "儲存設定"}
              </button>
            </div>

            <div className="mt-6">
              <div className="text-sm font-bold text-gray-700 mb-2">加點清單</div>

              {addonItems.length === 0 ? (
                <div className="text-gray-500">
                  目前沒有加點品項。請到「菜單管理」新增菜色，分類選「加點」。
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {addonItems.map((a) => {
                    const checked = !!addonChecked[a.id];
                    return (
                      <label
                        key={a.id}
                        className={`flex items-center justify-between border rounded-lg p-3 ${
                          selectedBaseItemId ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
                        } ${checked ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}
                      >
                        <div>
                          <div className="font-bold text-black">{a.name}</div>
                          <div className="text-sm text-gray-600">${a.price}</div>

                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.preventDefault();
                                toggleAvailability(a.id, a.is_available);
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                a.is_available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              }`}
                            >
                              {a.is_available ? "販售中" : "已售完"}
                            </button>
                          </div>
                        </div>

                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setAddonChecked((prev) => ({ ...prev, [a.id]: e.target.checked }));
                          }}
                          disabled={!selectedBaseItemId}
                          className="w-5 h-5"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
