"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import PinGuard from "@/components/PinGuard";
// 引入新圖示
import { History, X, Trash2, Undo2 } from "lucide-react";

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
  pickup_time: string;
  pickup_number: number;
  total_amount: number;
  created_at: string;
  status: string;
  order_items: OrderItem[];
};

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
  const [showHistory, setShowHistory] = useState(false); // 控制彈窗顯示

  // 1. 抓取「待處理」訂單
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id, item_name, quantity, price_at_time, options
        )
      `)
      .eq("status", "pending")
      .order("pickup_time", { ascending: true }) 
      .order("created_at", { ascending: true });

    if (error) console.error("抓取訂單失敗:", error);
    else setOrders(data as any || []);
  };

  // 2. 抓取「已完成」訂單 (只抓最近 50 筆)
  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id, item_name, quantity, price_at_time, options
        )
      `)
      .eq("status", "served") // 抓取已出餐狀態
      .order("created_at", { ascending: false }) // 新的在前
      .limit(50);

    if (error) console.error("抓取歷史失敗:", error);
    else setHistoryOrders(data as any || []);
  };

  // 3. 標記為「已出餐」
  const markAsServed = async (orderId: string) => {
    // 樂觀更新 UI (讓使用者覺得很快)
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    
    await supabase.from("orders").update({ status: "served" }).eq("id", orderId);
    // 更新完順便重抓一下歷史紀錄
    if (showHistory) fetchHistory();
  };

  // 4. 復原訂單 (從歷史紀錄 -> 待處理)
  const undoOrder = async (orderId: string) => {
    await supabase.from("orders").update({ status: "pending" }).eq("id", orderId);
    fetchHistory(); // 刷新歷史
    fetchOrders();  // 刷新主畫面
    alert("訂單已復原至待處理區！");
  };

  // 5. 刪除訂單 (連同明細一起刪)
  const deleteOrder = async (orderId: string) => {
    if (!confirm("⚠️ 確定要永久刪除這張訂單嗎？無法復原喔！")) return;

    // 因為資料庫可能有 Foreign Key 限制，標準做法是先刪明細，再刪主單
    // (除非你在資料庫有設定 Cascade Delete，但為了保險我們手動做)
    await supabase.from("order_items").delete().eq("order_id", orderId);
    const { error } = await supabase.from("orders").delete().eq("id", orderId);

    if (error) {
      alert("刪除失敗：" + error.message);
    } else {
      // 從 UI 移除
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setHistoryOrders((prev) => prev.filter((o) => o.id !== orderId));
    }
  };

  // 6. 監聽訂單變化
  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload: any) => {
          // 簡單暴力：只要有變動就重新抓取
          // 延遲一下確保關聯資料寫入完畢
          setTimeout(() => {
            fetchOrders();
            if (showHistory) fetchHistory(); // 如果彈窗開著，也順便更新
          }, 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showHistory]); // 依賴 showHistory，確保彈窗狀態正確

  // 當打開彈窗時，抓取歷史資料
  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory]);

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white font-sans relative">
      
      {/* 頂部導覽列 */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-yellow-400">👨‍🍳 廚房接單系統</h1>
          <span className="bg-gray-700 px-3 py-1 rounded-full text-sm text-gray-300">
            待處理: {orders.length}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* 歷史紀錄按鈕 */}
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

      {/* --- 歷史紀錄彈窗 (Modal) --- */}
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
                          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {/* 復原按鈕 */}
                        <button 
                          onClick={() => undoOrder(order.id)}
                          className="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded transition"
                          title="復原至待處理"
                        >
                          <Undo2 size={16} />
                        </button>
                        {/* 刪除按鈕 */}
                        <button 
                          onClick={() => deleteOrder(order.id)}
                          className="p-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded transition"
                          title="永久刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    {/* 簡化顯示內容 */}
                    <div className="text-sm text-gray-300">
                      {order.dining_option === 'take_out' 
                        ? `外帶 - ${order.customer_name}` 
                        : `內用 - 桌號 ${order.table_no}`
                      }
                    </div>
                    <div className="mt-2 space-y-1">
                      {order.order_items.map(item => (
                        <div key={item.id} className="text-xs flex justify-between">
                          <span>{item.item_name}</span>
                          <span className="text-gray-400">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- 主畫面：待處理訂單列表 --- */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-600">
          <span className="text-6xl mb-4">🥣</span>
          <p className="text-2xl font-bold">目前沒有新訂單</p>
          <p className="mt-2">可以稍微休息一下...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {orders.map((order) => (
            <div key={order.id} className="bg-white text-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col border-l-8 border-yellow-500 relative group animate-fade-in-up">
              
              {/* 🆕 刪除訂單按鈕 (右上角) */}
              <button
                onClick={() => deleteOrder(order.id)}
                className="absolute top-2 right-2 p-2 bg-white/50 hover:bg-red-100 text-gray-400 hover:text-red-600 rounded-full transition z-10"
                title="刪除此單"
              >
                <Trash2 size={18} />
              </button>

              {/* 卡片頭部 */}
              <div className={`p-3 flex flex-col ${order.dining_option === 'take_out' ? 'bg-green-100' : 'bg-blue-50'}`}>
                <div className="flex justify-between items-start">
                  <div className="w-full pr-8"> {/* pr-8 是為了避開刪除按鈕 */}
                    {order.dining_option === 'take_out' ? (
                      <>
                         <div className="flex flex-wrap gap-2 mb-2">
                          <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">外帶</span>
                          {order.pickup_time && order.pickup_time !== "盡快製作" && (
                            <span className="bg-yellow-400 text-black px-2 py-1 rounded text-xs font-bold animate-pulse flex items-center">
                              ⏰ {order.pickup_time} 取餐
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xl font-bold text-gray-800 truncate flex-1">
                            {order.customer_name || "未填姓名"}
                          </div>
                          <div className="text-3xl font-black text-green-700 bg-white/50 px-2 rounded">
                            #{order.pickup_number || "-"}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 font-mono">
                          {order.customer_phone}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold mb-1 inline-block">內用</span>
                        <div className="flex justify-between items-center">
                          <div className="text-2xl font-bold text-gray-800">
                            桌號：{order.table_no}
                          </div>
                          <div className="text-xl font-bold text-gray-400">
                            #{order.pickup_number || "-"}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 訂單明細 */}
              <div className="p-4 flex-1 bg-white">
                <ul className="space-y-3">
                  {order.order_items.map((item) => (
                    <li key={item.id} className="flex justify-between items-start border-b border-dashed border-gray-200 pb-2 last:border-0">
                      <div className="flex-1 pr-2">
                        <div className="font-bold text-lg leading-tight text-gray-800">
                          {item.item_name}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          ${item.price_at_time} / 份
                        </div>
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
                  ))}
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
                
                <button
                  onClick={() => markAsServed(order.id)}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-lg text-lg transition active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
                >
                  <span>✅</span> 出餐完成
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}