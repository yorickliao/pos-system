"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import PinGuard from "@/components/PinGuard";
import { History, X, Trash2, Undo2, Search, CheckCircle2 } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type OrderItem = {
  id: string;
  item_name: string;
  quantity: number;
  price_at_time: number;
  options: any;
};

type Order = {
  id: string;
  table_no: string;
  customer_name: string;
  customer_phone: string;
  dining_option: string;
  pickup_time: string | null;
  pickup_number: number | null;
  total_amount: number;
  created_at: string;
  status: string;
  order_items: OrderItem[];
};

type Addon = { name: string; price?: number; quantity: number };
type ItemOptions = { spiciness?: string; note?: string; addons?: Addon[] };

function parseOptions(raw: any): ItemOptions | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as ItemOptions;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ItemOptions;
    } catch {
      return null;
    }
  }
  return null;
}

const CAPACITY_PER_SLOT = 7;
const SLOT_MINUTES = 15;

// 營業時段（依你規則固定 16:30–20:30，每 15 分鐘）
const SERVICE_START = { hh: 16, mm: 30 };
const SERVICE_END = { hh: 20, mm: 30 };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(dateKey: string) {
  return `${dateKey}T00:00:00`;
}

function nextDay(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${dateKeyLocal(d)}T00:00:00`;
}

function parseLocal(ts: string) {
  // 你的資料是 timestamp without time zone（本地時間字串）
  // new Date("YYYY-MM-DDTHH:mm:ss") 會以本地解析，符合你「都在台北」的用法
  return new Date(ts);
}

function formatHHmm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function floorToSlot(d: Date) {
  const ms = d.getTime();
  const slotMs = SLOT_MINUTES * 60 * 1000;
  return new Date(Math.floor(ms / slotMs) * slotMs);
}
function safeParseDate(s: string) {
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatLocalTime(s: string) {
  const d = safeParseDate(s);
  if (!d) return "-";
  return d.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildServiceSlots(dateKey: string) {
  const start = new Date(`${dateKey}T${pad2(SERVICE_START.hh)}:${pad2(SERVICE_START.mm)}:00`);
  const end = new Date(`${dateKey}T${pad2(SERVICE_END.hh)}:${pad2(SERVICE_END.mm)}:00`);

  const slots: { key: string; label: string; start: Date }[] = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + SLOT_MINUTES * 60 * 1000)) {
    const label = formatHHmm(t);
    const key = `${dateKey}T${label}:00`;
    slots.push({ key, label, start: new Date(t) });
  }
  return slots;
}

// 鍋數計算規則（可依你菜單調整）
// 目前：品名包含「鍋」才算鍋數，並加總 quantity
function computePots(order: Order) {
  let pots = 0;
  for (const it of order.order_items || []) {
    if ((it.item_name || "").includes("鍋")) {
      pots += Number(it.quantity || 0);
    }
  }
  return pots;
}

export default function KitchenPage() {
  return (
    <PinGuard>
      <KitchenContent />
    </PinGuard>
  );
}

function KitchenContent() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 新增：日期 + 搜尋 + 顯示已完成
  const [selectedDate, setSelectedDate] = useState(() => dateKeyLocal(new Date()));
  const [search, setSearch] = useState("");
  const [showServedInMain, setShowServedInMain] = useState(true);

  // 抓取「當日」訂單（pending + served）
  const fetchOrders = async () => {
    const from = startOfDay(selectedDate);
    const to = nextDay(selectedDate);

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        *,
        order_items (
          id, item_name, quantity, price_at_time, options
        )
      `
      )
      .gte("pickup_time", from)
      .lt("pickup_time", to)
      .in("status", ["pending", "served"])
      .order("pickup_time", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) console.error("抓取訂單失敗:", error);
    else setOrders((data as any) || []);
  };

  // 只抓最近 50 筆 served（維持你原本 modal 行為）
  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        *,
        order_items (
          id, item_name, quantity, price_at_time, options
        )
      `
      )
      .eq("status", "served")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) console.error("抓取歷史失敗:", error);
    else setHistoryOrders((data as any) || []);
  };

  const markAsServed = async (orderId: string) => {
    // 立刻更新 UI：把狀態改成 served（留在主畫面）
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "served" } : o))
    );

    const { error } = await supabase
      .from("orders")
      .update({ status: "served" })
      .eq("id", orderId);

    if (error) {
      // 如果 DB 更新失敗，rollback
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "pending" } : o))
      );
      alert("更新失敗：" + error.message);
    }

    if (showHistory) fetchHistory();
  };


  const undoOrder = async (orderId: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: "pending" } : o)));
    const { error } = await supabase.from("orders").update({ status: "pending" }).eq("id", orderId);
    if (error) {
      alert("復原失敗：" + error.message);
      fetchOrders();
      return;
    }
    fetchOrders();
    if (showHistory) fetchHistory();
    alert("訂單已復原至待處理區！");
  };

  const deleteOrder = async (orderId: string) => {
    if (!confirm("確定要永久刪除這張訂單嗎？無法復原喔！")) return;

    await supabase.from("order_items").delete().eq("order_id", orderId);
    const { error } = await supabase.from("orders").delete().eq("id", orderId);

    if (error) {
      alert("刪除失敗：" + error.message);
    } else {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setHistoryOrders((prev) => prev.filter((o) => o.id !== orderId));
    }
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kitchen-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        setTimeout(() => {
          fetchOrders();
          if (showHistory) fetchHistory();
        }, 500);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, showHistory]);

  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory]);

  const slots = useMemo(() => buildServiceSlots(selectedDate), [selectedDate]);

  // 搜尋過濾
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((o) => {
      const pn = o.pickup_number != null ? String(o.pickup_number) : "";
      const name = (o.customer_name || "").toLowerCase();
      const phone = (o.customer_phone || "").toLowerCase();
      const table = (o.table_no || "").toLowerCase();
      const items = (o.order_items || []).map((it) => it.item_name || "").join(" ").toLowerCase();

      return pn.includes(q) || name.includes(q) || phone.includes(q) || table.includes(q) || items.includes(q);
    });
  }, [orders, search]);

  // 依 15 分鐘區塊分組
  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const s of slots) map.set(s.key, []);

    for (const o of filteredOrders) {
      if (!o.pickup_time) continue;
      const dt = parseLocal(o.pickup_time);
      const floored = floorToSlot(dt);
      const key = `${selectedDate}T${formatHHmm(floored)}:00`;
      if (!map.has(key)) continue;

      if (!showServedInMain && o.status === "served") continue;
      map.get(key)!.push(o);
    }

    // slot 內排序：pickup_time -> created_at
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const ta = a.pickup_time ? parseLocal(a.pickup_time).getTime() : 0;
        const tb = b.pickup_time ? parseLocal(b.pickup_time).getTime() : 0;
        if (ta !== tb) return ta - tb;

        const ca = parseLocal(a.created_at).getTime();
        const cb = parseLocal(b.created_at).getTime();
        return ca - cb;
      });
      map.set(k, arr);
    }

    return map;
  }, [filteredOrders, slots, selectedDate, showServedInMain]);

  // 容量統計：用「全部(含 served)」計算，符合你截圖那種時段容量概念
  const slotUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const s of slots) usage.set(s.key, 0);

    for (const o of filteredOrders) {
      if (!o.pickup_time) continue;
      const dt = parseLocal(o.pickup_time);
      const floored = floorToSlot(dt);
      const key = `${selectedDate}T${formatHHmm(floored)}:00`;
      if (!usage.has(key)) continue;
      usage.set(key, (usage.get(key) || 0) + computePots(o));
    }
    return usage;
  }, [filteredOrders, slots, selectedDate]);

  const pendingCount = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white font-sans relative">
      {/* 頂部導覽列（沿用舊風格） */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-yellow-400">326訂單管理</h1>
            <span className="bg-gray-700 px-3 py-1 rounded-full text-sm text-gray-300">
              待處理: {pendingCount}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition border border-gray-700"
            >
              <History size={20} />
              已完成訂單
            </button>

            <div className="flex items-center gap-2 text-green-400">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              即時連線中
            </div>
          </div>
        </div>

        {/* 新增：日期 / 搜尋 / 顯示已完成（配色沿用舊頁） */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-300 font-bold">日期</div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-10 px-3 rounded-lg bg-gray-800 border border-gray-700 text-white font-bold"
            />
          </div>

          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={18} />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋：取餐號碼 / 姓名 / 電話 / 品項"
              className="w-full h-10 pl-10 pr-3 rounded-lg bg-gray-800 border border-gray-700 text-white font-bold placeholder:text-gray-500"
            />
          </div>

          <button
            onClick={() => setShowServedInMain((v) => !v)}
            className={`h-10 px-4 rounded-lg font-bold border transition ${
              showServedInMain
                ? "bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200"
                : "bg-yellow-500 border-yellow-400 hover:bg-yellow-400 text-black"
            }`}
          >
            {showServedInMain ? "隱藏已完成" : "顯示已完成"}
          </button>
        </div>
      </div>

      {/* 歷史紀錄彈窗（保留舊版） */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-gray-800 h-full p-6 overflow-y-auto shadow-2xl border-l border-gray-700 animate-slide-in-right">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <History /> 已出餐紀錄
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-gray-700 rounded-full">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {historyOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-10">尚無紀錄</p>
              ) : (
                historyOrders.map((order) => (
                  <div key={order.id} className="bg-gray-700 p-4 rounded-xl border border-gray-600 opacity-75 hover:opacity-100 transition">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-lg font-bold text-white">#{order.pickup_number || "-"}</span>
                        <span className="ml-2 text-sm text-gray-400">
                          {order.created_at
                            ? parseLocal(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => undoOrder(order.id)}
                          className="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded transition"
                          title="復原至待處理"
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="p-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded transition"
                          title="永久刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="text-sm text-gray-300">
                      {order.dining_option === "take_out" ? `外帶 - ${order.customer_name}` : `內用 - 桌號 ${order.table_no}`}
                    </div>
                    <div className="mt-2 space-y-2">
                      {order.order_items.map((item) => {
                        const opt = parseOptions(item.options);

                        return (
                          <div key={item.id} className="text-xs text-gray-200">
                            <div className="flex justify-between">
                              <span className="font-semibold">
                                {item.item_name}
                                {opt?.spiciness && opt.spiciness !== "不辣" ? (
                                  <span className="ml-1 text-red-300">（{opt.spiciness}）</span>
                                ) : null}
                              </span>
                              <span className="text-gray-400">x{item.quantity}</span>
                            </div>

                            {/* 加點 */}
                            {!!opt?.addons?.length && (
                              <div className="mt-1 space-y-0.5 pl-3 text-gray-300">
                                {opt.addons.map((a, idx) => (
                                  <div key={idx}>
                                    + {a.name} <span className="text-gray-400">x{a.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 備註 */}
                            {opt?.note ? (
                              <div className="mt-1 pl-3 text-gray-300 italic">
                                備註：{opt.note}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 主畫面：依取餐時段分組 */}
      <div className="space-y-6">
        {slots.map((slot) => {
          const list = grouped.get(slot.key) || [];
          const used = slotUsage.get(slot.key) || 0;
          const ratio = Math.min(1, used / CAPACITY_PER_SLOT);

          return (
            <div key={slot.key} className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              {/* 時段標頭 + 容量 */}
              <div className="flex items-start justify-between gap-4">
                <div className="text-2xl font-black text-white">{slot.label}</div>
                <div className="text-sm font-bold text-gray-300">
                  容量 {used}/{CAPACITY_PER_SLOT}
                </div>
              </div>

              {/* 進度條（沿用暗色 + 黃色重點） */}
              <div className="mt-3 h-2 rounded-full bg-gray-700 overflow-hidden">
                <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${ratio * 100}%` }} />
              </div>

              {/* 訂單列表 */}
              <div className="mt-5">
                {list.length === 0 ? (
                  <div className="text-gray-500 text-sm py-3">此時段目前沒有訂單</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {list.map((order) => {
                      const done = order.status === "served";
                      const pots = computePots(order);
                      const isServed = order.status === "served";
                      return (
                        <div
                          key={order.id}
                          className={[
                            "bg-white text-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col border-l-8 relative group animate-fade-in-up transition",
                            isServed ? "border-slate-300 opacity-55 grayscale-[0.15]" : "border-yellow-500 opacity-100",
                          ].join(" ")}
                        >
                          {/* 刪除 */}
                          <button
                            onClick={() => deleteOrder(order.id)}
                            className="absolute top-2 right-2 p-2 bg-white/50 hover:bg-red-100 text-gray-400 hover:text-red-600 rounded-full transition z-10"
                            title="刪除此單"
                          >
                            <Trash2 size={18} />
                          </button>

                          {/* 卡片頭部（沿用舊色塊，但外帶固定用綠） */}
                          <div className="p-3 flex flex-col bg-green-100">
                            <div className="w-full pr-8">
                              <div className="flex flex-wrap gap-2 mb-2">
                                {/* 取餐時間（該 slot 時段） */}
                                <span className="bg-yellow-400 text-black px-2 py-1 rounded text-xs font-bold flex items-center">
                                  {slot.label} 取餐
                                </span>
                              </div>

                              <div className="flex items-center justify-between">
                                <div className="text-xl font-bold text-gray-800 truncate flex-1">
                                  {order.customer_name || "未填姓名"}
                                </div>
                                <div className="text-3xl font-black text-green-700 bg-white/50 px-2 rounded">
                                  #{order.pickup_number || "-"}
                                </div>
                              </div>

                              <div className="text-sm text-gray-600 font-mono">{order.customer_phone}</div>
                            </div>
                          </div>

                          {/* 訂單明細 */}
                          <div className="p-4 flex-1 bg-white">
                            <ul className="space-y-3">
                              {order.order_items.map((item) => {
                                const opt = parseOptions(item.options);

                                return (
                                  <li
                                    key={item.id}
                                    className="flex justify-between items-start border-b border-dashed border-gray-200 pb-3 last:border-0"
                                  >
                                    <div className="flex-1 pr-3">
                                      <div className="font-bold text-lg leading-tight text-gray-800">
                                        {item.item_name}
                                        {opt?.spiciness && opt.spiciness !== "不辣" ? (
                                          <span className="ml-2 text-sm font-bold text-red-600">
                                            （{opt.spiciness}）
                                          </span>
                                        ) : null}
                                      </div>

                                      <div className="text-xs text-gray-400 mt-1">
                                        ${item.price_at_time} / 份
                                      </div>

                                      {/* 加點 */}
                                      {!!opt?.addons?.length && (
                                        <div className="mt-2 space-y-1">
                                          {opt.addons.map((a, idx) => (
                                            <div key={idx} className="text-sm text-gray-700">
                                              + {a.name} <span className="text-gray-500">x{a.quantity}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* 備註 */}
                                      {opt?.note ? (
                                        <div className="mt-2 text-sm text-gray-600 italic">
                                          備註：{opt.note}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="flex flex-col items-end">
                                      <span className="bg-red-100 text-red-600 px-3 py-1 rounded-lg font-bold text-lg min-w-[2.5rem] text-center">
                                        x{item.quantity}
                                      </span>
                                      <span className="text-xs text-gray-400 mt-1 font-mono">
                                        ${item.price_at_time * item.quantity}
                                      </span>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>

                          {/* 底部總計與按鈕 */}
                          <div className="p-4 bg-gray-50 border-t border-gray-200">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-gray-500 font-bold text-sm">訂單總計</span>
                              <span className="text-2xl font-extrabold text-gray-800">
                                ${order.total_amount}
                              </span>
                            </div>

                            {!done ? (
                              <button
                                onClick={() => markAsServed(order.id)}
                                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-lg text-lg transition active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 size={18} />
                                出餐完成
                              </button>
                            ) : (
                              <button
                                onClick={() => undoOrder(order.id)}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg text-lg transition active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
                              >
                                <Undo2 size={18} />
                                復原至待處理
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
