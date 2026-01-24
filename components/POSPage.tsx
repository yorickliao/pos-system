"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ShoppingCart,
  Plus,
  Minus,
  ChefHat,
  Utensils,
  User,
  Phone,
  Clock,
  ShoppingBag,
  X,
  ChevronDown,
} from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- 資料型別 ---
type Category = { id: number; name: string; sort_order: number };
type MenuItem = {
  id: string;
  name: string;
  price: number;
  category_id: number;
  is_available: boolean;
};

type CartItem = MenuItem & {
  quantity: number;
  options?: {
    spiciness?: string;
    note?: string;
    addons?: { name: string; price: number; quantity: number }[];
  };
  finalPrice: number;
};

type TimeSlot = { value: string; label: string; disabled: boolean; used: number; remaining: number; hhmm: string };
const CAPACITY_PER_SLOT = 7;
const DAILY_BEEF_OFFAL_LIMIT = 50;
const BEEF_OFFAL_NAME = "牛雜鍋";


// --- 1. 定義「通用」加料清單 ---
const FULL_ADDONS_LIST = [
  { name: "蟹肉棒", price: 20 },
  { name: "鱈魚丸", price: 20 },
  { name: "北海翅", price: 20 },
  { name: "鑫鑫腸", price: 20 },
  { name: "金針菇", price: 10 },
  { name: "臭豆腐", price: 20 },
  { name: "貢丸", price: 20 },
  { name: "魚餃", price: 20 },
  { name: "蒸餃", price: 20 },
  { name: "黑輪", price: 20 },
  { name: "米血", price: 20 },
  { name: "鴨血", price: 20 },
  { name: "蝦球", price: 20 },
  { name: "大腸", price: 50 },
  { name: "豆皮", price: 30 },
  { name: "豬肉", price: 40 },
  { name: "高麗菜", price: 20 },
  { name: "科學麵", price: 15 },
  { name: "冬粉", price: 10 },
  { name: "白飯", price: 10 },
];

// --- 2. 定義「牛雜鍋專屬」加料清單 ---
const BEEF_OFFAL_ADDONS = [
  { name: "金針菇", price: 10 },
  { name: "臭豆腐", price: 20 },
  { name: "鴨血", price: 20 },
  { name: "豆皮", price: 30 },
  { name: "高麗菜", price: 20 },
];

const ALL_SPICINESS = ["不辣", "微辣", "小辣", "中辣", "大辣"];

// --- 本地 timestamp（不帶時區）工具 ---
function toLocalTimestampString(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`; // 例如 2026-01-22T17:45:00
}

function safeParseDate(s: string) {
  // Supabase 可能回 "YYYY-MM-DD HH:mm:ss"（有空白），JS/Safari 會不穩定，這裡統一轉 ISO-like
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatPickupDateWeekTime(s: string) {
  const d = safeParseDate(s);
  if (!d) return "-";
  const date = d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekday = d.toLocaleDateString("zh-TW", { weekday: "short" }); // 例：週六
  const time = d.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date}（${weekday}）${time}`; // 例：2026/01/24（週六）20:30
}

function buildCartSummaryLines(cart: CartItem[]) {
  const lines: string[] = [];

  for (const item of cart) {
    lines.push(`${item.name} x${item.quantity}  $${item.finalPrice * item.quantity}`);

    // 辣度
    if (item.options?.spiciness && item.options.spiciness !== "不辣") {
      lines.push(`  - 辣度：${item.options.spiciness}`);
    }

    // 加料
    if (item.options?.addons?.length) {
      for (const a of item.options.addons) {
        lines.push(`  - +${a.name} x${a.quantity}`);
      }
    }

    // 備註
    if (item.options?.note) {
      lines.push(`  - 備註：${item.options.note}`);
    }
  }

  return lines.join("\n");
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

type ServiceDay = "WED" | "SAT";

function dateKeyLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// JS: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
function isWed(d: Date) { return d.getDay() === 3; }
function isSat(d: Date) { return d.getDay() === 6; }

// 找下一個「營業日」（週三/週六）
function nextServiceDate(from: Date) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    if (isWed(d) || isSat(d)) return new Date(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

// 判斷目前是否在「可預訂窗口」內，並回傳這次要預訂的營業日 dateKey
// 規則：
// - 週二 00:00 起 -> 預訂週三
// - 週五 00:00 起 -> 預訂週六
// - 營業日當天：也允許下單到 20:30（你若想 20:30 後關閉可再加條件）
function getActiveBookingServiceDate(now: Date) {
  const day = now.getDay();
  const hh = now.getHours();
  const mi = now.getMinutes();

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // 週二：開放預訂週三
  if (day === 2) {
    const wed = new Date(today);
    wed.setDate(wed.getDate() + 1);
    return { isOpen: true, serviceDate: wed };
  }

  // 週五：開放預訂週六
  if (day === 5) {
    const sat = new Date(today);
    sat.setDate(sat.getDate() + 1);
    return { isOpen: true, serviceDate: sat };
  }

  // 週三：營業日本日也可下單（16:30–20:30）
  if (day === 3) {
    return { isOpen: true, serviceDate: today };
  }

  // 週六：營業日本日也可下單（16:30–20:30）
  if (day === 6) {
    return { isOpen: true, serviceDate: today };
  }

  // 其他日：不開放
  return { isOpen: false, serviceDate: null as Date | null };
}

function buildPickupSlotsForServiceDate(
  serviceDate: Date,
  usage: Record<string, number>,
  now: Date
) {
  const dateKey = dateKeyLocal(serviceDate);
  const start = new Date(`${dateKey}T16:30:00`);
  const end = new Date(`${dateKey}T20:30:00`);

  const nowKey = dateKeyLocal(now);
  const isSameDay = nowKey === dateKey; // 只有 serviceDate 是今天才限制

  const slots: TimeSlot[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 15 * 60 * 1000)) {
    const k = hhmmKey(d); // "16:30"

    const used = usage[k] || 0;
    const remaining = Math.max(0, CAPACITY_PER_SLOT - used);
    const full = remaining <= 0;

    // ✅ 只有 serviceDate 是「今天」才禁選早於現在的時段（週三/週六當天）
    const past = isSameDay && d.getTime() < now.getTime();

    const disabled = full || past;

    slots.push({
      value: toLocalTimestampString(d),
      hhmm: k,
      used,
      remaining,
      disabled,
      label: k,
    });
  }
  return slots;
}



function hhmmKey(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 鍋數規則：品名包含「鍋」才算鍋數（quantity 累加）
function computePotsFromOrderItems(items: { item_name: string; quantity: number }[]) {
  let pots = 0;
  for (const it of items || []) {
    if ((it.item_name || "").includes("鍋")) {
      pots += Number(it.quantity || 0);
    }
  }
  return pots;
}

async function fetchUsedPotsForSlot(serviceDateKey: string, hhmm: string) {
  const from = `${serviceDateKey}T00:00:00`;
  const d = new Date(`${serviceDateKey}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const to = `${dateKeyLocal(d)}T00:00:00`;

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      pickup_time, status,
      order_items ( item_name, quantity )
    `
    )
    .gte("pickup_time", from)
    .lt("pickup_time", to)
    .in("status", ["pending", "served"]);

  if (error) throw error;

  let used = 0;

  for (const o of (data as any[]) || []) {
    if (!o.pickup_time) continue;
    const dt = safeParseDate(o.pickup_time);
    if (!dt) continue;

    const k = hhmmKey(dt);
    if (k !== hhmm) continue;

    used += computePotsFromOrderItems(o.order_items || []);
  }

  return used; // 這個 hhmm 的已用鍋數（DB 即時）
}

async function fetchSlotUsageForServiceDate(serviceDateKey: string) {
  const from = `${serviceDateKey}T00:00:00`;
  const d = new Date(`${serviceDateKey}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const to = `${dateKeyLocal(d)}T00:00:00`;

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, pickup_time, status,
      order_items ( item_name, quantity )
    `
    )
    .gte("pickup_time", from)
    .lt("pickup_time", to)
    .in("status", ["pending", "served"]);

  if (error) throw error;

  const usage: Record<string, number> = {};
  let beefUsed = 0;

  for (const o of (data as any[]) || []) {
    if (!o.pickup_time) continue;
    const dt = safeParseDate(o.pickup_time);
    if (!dt) continue;

    const k = hhmmKey(dt);

    // 時段鍋數
    const pots = computePotsFromOrderItems(o.order_items || []);
    usage[k] = (usage[k] || 0) + pots;

    // 牛雜鍋日總量（用 quantity 累加）
    for (const it of o.order_items || []) {
      if ((it.item_name || "") === BEEF_OFFAL_NAME) {
        beefUsed += Number(it.quantity || 0);
      }
    }
  }

  return { usage, beefOffalUsed: beefUsed };
}




export default function POSPage({
  menuItems,
  categories,
}: {
  menuItems: MenuItem[];
  categories: Category[];
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number>(0);
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [slotUsage, setSlotUsage] = useState<Record<string, number>>({}); // key: "HH:mm" -> used pots

  // 訂單資訊
  const [diningOption, setDiningOption] = useState<"dine_in" | "take_out">(
    "dine_in"
  );
  const [tableNo, setTableNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupTime, setPickupTime] = useState<string>(""); // 存本地 timestamp 字串（或空字串=盡快）
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  const [bookingOpen, setBookingOpen] = useState<boolean>(false);
  const [serviceDateKey, setServiceDateKey] = useState<string>(""); // 這次預訂的營業日 YYYY-MM-DD

  // Modal 狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [modalSpiciness, setModalSpiciness] = useState("不辣");
  const [modalNote, setModalNote] = useState("");
  const [modalAddons, setModalAddons] = useState<{ [key: string]: number }>(
    {}
  );
  const [successOpen, setSuccessOpen] = useState(false);
  const [successText, setSuccessText] = useState("");
  const [beefOffalUsed, setBeefOffalUsed] = useState(0);
  const beefOffalRemaining = Math.max(0, DAILY_BEEF_OFFAL_LIMIT - beefOffalUsed);
  const [liveMenuItems, setLiveMenuItems] = useState<MenuItem[]>(menuItems);
  const [liveCategories, setLiveCategories] = useState<Category[]>(categories);


  // 動態選項狀態
  const [currentSpicinessOptions, setCurrentSpicinessOptions] = useState<
    string[]
  >([]);
  const [currentAddonsList, setCurrentAddonsList] =
    useState(FULL_ADDONS_LIST);

  // 公告彈窗
  const ANNOUNCE_KEY = "pos_announcement_v1"; // 內容改了就換 v2
  // 公告彈窗（打開頁面顯示一次；打烊時不顯示）
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [didInitAnnouncement, setDidInitAnnouncement] = useState(false);

  useEffect(() => {
    // 等店家狀態讀到之後，只做一次初始化
    if (didInitAnnouncement) return;

    if (isStoreOpen) {
      setShowAnnouncement(true);
    } else {
      setShowAnnouncement(false);
    }
    setDidInitAnnouncement(true);
  }, [isStoreOpen, didInitAnnouncement]);

  useEffect(() => {
    // 若營業中->打烊，強制把公告關掉（確保遮罩下看不到）
    if (!isStoreOpen) setShowAnnouncement(false);
  }, [isStoreOpen]);

  const closeAnnouncement = () => setShowAnnouncement(false);


  // 讀取店家營業狀態（store_settings.id=1）
  const fetchStoreOpen = async () => {
    const { data, error } = await supabase
      .from("store_settings")
      .select("is_open")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("讀取店家狀態失敗:", error);
      return;
    }
    setIsStoreOpen(!!data?.is_open);
  };

  useEffect(() => {
    // 初次進來先讀一次
    fetchStoreOpen();

    // 即時監聽 store_settings 變化（跟 kitchen 同步）
    const channel = supabase
      .channel("store-settings-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_settings", filter: "id=eq.1" },
        (payload) => {
          const next = (payload.new as any)?.is_open;
          if (typeof next === "boolean") setIsStoreOpen(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
    
  useEffect(() => {
  let alive = true;

  const tick = async () => {
    const now = new Date();
    const { isOpen, serviceDate } = getActiveBookingServiceDate(now);

    setBookingOpen(isOpen);

    if (isOpen && serviceDate) {
      const key = dateKeyLocal(serviceDate);
      setServiceDateKey(key);

      try {
        const res = await fetchSlotUsageForServiceDate(key);
        if (!alive) return;

        setSlotUsage(res.usage);
        setBeefOffalUsed(res.beefOffalUsed);

        const slots = buildPickupSlotsForServiceDate(serviceDate, res.usage, now);
        setTimeSlots(slots);

        if (pickupTime) {
          const found = slots.find((s) => s.value === pickupTime);
          if (!found || found.disabled) setPickupTime("");
        }
      } catch (e) {
        console.error(e);

        // ✅ fallback：查不到 usage 時，就當作全部 0
        setSlotUsage({});
        setBeefOffalUsed(0);

        const slots = buildPickupSlotsForServiceDate(serviceDate, {}, now);
        setTimeSlots(slots);

        if (pickupTime) {
          const found = slots.find((s) => s.value === pickupTime);
          if (!found || found.disabled) setPickupTime("");
        }
      }
    } else {
      setServiceDateKey("");
      setTimeSlots([]);
      setSlotUsage({});
      setPickupTime("");
    }
  };

  tick();
  const timer = setInterval(tick, 30 * 1000);
  return () => {
    alive = false;
    clearInterval(timer);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pickupTime]);



  const categoriesDisplay = useMemo(() => {
    if (selectedCategory === 0) return liveCategories;
    return liveCategories.filter((c) => c.id === selectedCategory);
  }, [selectedCategory, liveCategories]);


  // --- 點擊商品 ---
  const handleItemClick = async (item: MenuItem) => {
    if (!isStoreOpen) return alert("抱歉，目前暫停接單");
    if (!item.is_available) return;

    if (item.name === BEEF_OFFAL_NAME && beefOffalUsed >= DAILY_BEEF_OFFAL_LIMIT) {
      return alert(`抱歉，${BEEF_OFFAL_NAME} 今日限量 ${DAILY_BEEF_OFFAL_LIMIT} 鍋，已售完`);
    }

    // ✅ 用 DB 即時擋：只要是「鍋」類，先擋容量
    if (pickupTime && (item.name || "").includes("鍋")) {
      const ok = await guardSlotCapacityOrAlert(1);
      if (!ok) return;
    }

    const categoryName = liveCategories.find((c) => c.id === item.category_id)?.name || "";
    const isSimpleItem =
      categoryName.includes("主食") ||
      categoryName.includes("單點") ||
      categoryName.includes("飲料");

    if (isSimpleItem) addToCartDirectly(item);
    else openModal(item);
  };


  const addToCartDirectly = (item: MenuItem) => {
    setCart((prevCart) => {
      // ✅ 強制用 prevCart 算，才能擋住快速連點
      if (pickupTime && (item.name || "").includes("鍋")) {
        const remain = selectedSlotRemaining ?? 0; // 這個 remain 是該時段「剩餘容量」
        const prevPots = countPotsInCart(prevCart); // ✅ prevCart 當下的鍋數

        if (prevPots + 1 > remain) {
          alert(fullSlotMsg(pickupTime));
          return prevCart; // ✅ 不加進去
        }
      }

      const existingItemIndex = prevCart.findIndex(
        (i) => i.id === item.id && (!i.options || Object.keys(i.options).length === 0)
      );

      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        newCart[existingItemIndex].quantity += 1;
        return newCart;
      }

      return [...prevCart, { ...item, quantity: 1, finalPrice: item.price }];
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
      const spicyOptions = ALL_SPICINESS.filter((opt) => opt !== "不辣");
      setCurrentSpicinessOptions(spicyOptions);
      setModalSpiciness("微辣");
    } else {
      setCurrentSpicinessOptions(ALL_SPICINESS);
      setModalSpiciness("不辣");
    }

    setIsModalOpen(true);
  };

  const confirmModalAdd = async () => {
      if (!selectedItem) return;

      // ✅ 用 DB 即時擋：一次加 modalQuantity
      if (pickupTime && (selectedItem.name || "").includes("鍋")) {
        const ok = await guardSlotCapacityOrAlert(modalQuantity);
        if (!ok) return;
      }

      // 牛雜鍋日限量
      if (
        selectedItem.name === BEEF_OFFAL_NAME &&
        beefOffalUsed + modalQuantity > DAILY_BEEF_OFFAL_LIMIT
      ) {
        const remain = Math.max(0, DAILY_BEEF_OFFAL_LIMIT - beefOffalUsed);
        alert(`抱歉，${BEEF_OFFAL_NAME} 今日剩餘 ${remain} 鍋`);
        return;
      }

    const addonsList = Object.entries(modalAddons)
      .filter(([_, qty]) => qty > 0)
      .map(([name, qty]) => {
        const addon = currentAddonsList.find((a) => a.name === name);
        return { name, price: addon?.price || 0, quantity: qty };
      });

    const addonsTotal = addonsList.reduce((sum, a) => sum + a.price * a.quantity, 0);
    const finalPrice = selectedItem.price + addonsTotal;

    const newItem: CartItem = {
      ...selectedItem,
      quantity: modalQuantity,
      finalPrice,
      options: { spiciness: modalSpiciness, note: modalNote, addons: addonsList },
    };

    setCart((prevCart) => {
      // ✅ 強制用 prevCart 算，才能擋住「一次加 7 份」或連點確認
      if (pickupTime && (selectedItem.name || "").includes("鍋")) {
        const remain = selectedSlotRemaining ?? 0;
        const prevPots = countPotsInCart(prevCart);

        if (prevPots + modalQuantity > remain) {
          alert(fullSlotMsg(pickupTime));
          return prevCart; // ✅ 不加
        }
      }

      return [...prevCart, newItem];
    });

    setIsModalOpen(false);
  };


  const updateAddonQty = (name: string, delta: number) => {
    setModalAddons((prev) => {
      const current = prev[name] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [name]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: next };
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };
  function slotKeyFromPickupTime(pickupTime: string) {
    const dt = safeParseDate(pickupTime);
    if (!dt) return "";
    return hhmmKey(dt); // "HH:mm"
  }

  function countPotsInCart(items: CartItem[]) {
    return items.reduce((acc, it) => {
      if ((it.name || "").includes("鍋")) return acc + Number(it.quantity || 0);
      return acc;
    }, 0);
  }
  // 購物車內「鍋」數（品名包含「鍋」才算）
  const cartPots = useMemo(() => {
    return cart.reduce((acc, it) => {
      if ((it.name || "").includes("鍋")) return acc + Number(it.quantity || 0);
      return acc;
    }, 0);
  }, [cart]);

  // 目前選的取餐時段剩餘容量（若未選時段就回 null）
  const selectedSlotRemaining = useMemo(() => {
    if (!pickupTime) return null;
    const k = slotKeyFromPickupTime(pickupTime);
    if (!k) return null;
    const used = slotUsage[k] || 0;
    return Math.max(0, CAPACITY_PER_SLOT - used);
  }, [pickupTime, slotUsage]);

  async function guardSlotCapacityOrAlert(addPots: number) {
    if (!pickupTime) return true; // 沒選時間就不檢查（你原本規則）
    if (!serviceDateKey) return true;

    const slotKey = slotKeyFromPickupTime(pickupTime);
    if (!slotKey) return true;

    // ✅ DB 即時查：該時段目前已用鍋數
    const usedNow = await fetchUsedPotsForSlot(serviceDateKey, slotKey);
    const remainNow = Math.max(0, CAPACITY_PER_SLOT - usedNow);

    // 你購物車已經有的鍋數 + 這次要加的鍋數
    const nextTotal = cartPots + addPots;

    if (nextTotal > remainNow) {
      alert(`此取餐時段剩餘 ${remainNow} 鍋容量，你的購物車目前已有 ${cartPots} 鍋`);
      alert(`您選擇的 ${slotKey} 時段已額滿，請改選其他取餐時間。`);
      return false;
    }

    return true;
  }


  function fullSlotMsg(pickupTime: string) {
    const k = slotKeyFromPickupTime(pickupTime) || "--:--";
    return `您選擇的 ${k} 時段已額滿，請改選其他取餐時間。`;
  }

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.finalPrice * item.quantity,
    0
  );
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
  if (!bookingOpen) return alert("目前未開放預訂");
  if (!isStoreOpen) return alert("目前暫停接單");
  if (cart.length === 0) return;

  if (!customerName) return alert("外帶請輸入姓名");
  if (!customerPhone) return alert("請輸入電話");
  if (!pickupTime) return alert("請選擇取餐時間");

  // 安全：確保 pickupTime 落在本次營業日 slots 內
  const ok = timeSlots.some((s) => s.value === pickupTime);
  if (!ok) return alert("取餐時間不合法，請重新選擇");

  const picked = timeSlots.find((s) => s.value === pickupTime);
  if (!picked) return alert("取餐時間不合法，請重新選擇");
  if (picked.disabled) return alert("此取餐時段已滿，請選其他時段");
  // ✅ 結帳前最後確認：用 DB 即時查
  const slotKey = slotKeyFromPickupTime(pickupTime);
  if (slotKey) {
    const usedNow = await fetchUsedPotsForSlot(serviceDateKey, slotKey);
    const remainNow = Math.max(0, CAPACITY_PER_SLOT - usedNow);
    if (cartPots > remainNow) {
      
      alert(`您選擇的 ${slotKey} 時段已額滿，請改選其他取餐時間。`);
      return;
    }
  }

  
  // 結帳前再確認一次店家是否營業（防止剛好切換狀態）
  const { data: ss, error: ssErr } = await supabase
    .from("store_settings")
    .select("is_open")
    .eq("id", 1)
    .single();

  if (ssErr) {
    alert("無法確認店家狀態，請稍後再試");
    return;
  }

  if (!ss?.is_open) {
    setIsStoreOpen(false); // 立刻同步 UI
    alert("店家已打烊，暫停接單");
    return;
  }


  setIsLoading(true);
  try {
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        table_no: "外帶",
        dining_option: "take_out",
        customer_name: customerName,
        customer_phone: customerPhone,
        pickup_time: pickupTime, // 本地 timestamp（不帶時區）
        total_amount: totalAmount,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const orderItems = cart.map((item) => ({
      order_id: orderData.id,
      menu_item_id: item.id,
      item_name: item.name,
      price_at_time: item.finalPrice,
      quantity: item.quantity,
      options: item.options,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) throw itemsError;

    const dailyNum = orderData.pickup_number ? `#${orderData.pickup_number}` : "--";
    const pickupText = pickupTime ? formatPickupDateWeekTime(pickupTime) : "-";

    // ✅ 餐點內容（用結帳當下的 cart）
    const itemsText = buildCartSummaryLines(cart);

    let successMsg = `取餐號碼：${dailyNum}\n------------------\n`;
    successMsg += `姓名：${customerName}\n電話：${customerPhone}\n取餐時間：${pickupText}\n\n`;
    successMsg += `餐點內容：\n${itemsText}\n\n`;
    successMsg += `總金額：$${totalAmount}`;

    setSuccessText(successMsg);
    setSuccessOpen(true);


    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setPickupTime("");
    setIsMobileCartOpen(false);
  } catch (error: any) {
    console.error("結帳錯誤:", error);
    alert("結帳失敗：" + error.message);
  } finally {
    setIsLoading(false);
  }
};


  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 font-sans relative overflow-hidden">
      {/* 公告彈窗（進頁面顯示） */}
      {showAnnouncement && (
        <div className="fixed inset-0 z-[50] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="text-lg font-black text-slate-900">公告</div>
              <button
                onClick={closeAnnouncement}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
                aria-label="close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 text-slate-800 space-y-4">
              <ul className="list-disc pl-5 space-y-2 font-bold">
                <li>一律不附白飯／冬粉／科學麵</li>
                <li>僅收現金</li>
                <li>僅限外帶</li>
                <li>請勿提早到（不好停車）</li>
              </ul>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="font-black text-slate-900 mb-2">營業地點</div>
                <div className="space-y-2 text-sm font-bold text-slate-700 leading-6">
                  <div>永大夜市｜週一、四 18:00～22:00</div>
                  <div>善化夜市｜週二、週五 18:00～22:00</div>
                  <div>安南區工作室｜週三、六 16:30～20:30</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={closeAnnouncement}
                className="px-5 py-2.5 rounded-2xl bg-slate-900 text-white font-black hover:bg-black transition"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 打烊遮罩 */}
      {!isStoreOpen && (
        <div className="absolute inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center flex-col text-white">
          <div className="bg-red-500 p-6 rounded-full mb-6 animate-pulse">
            <Utensils size={64} />
          </div>
          <h1 className="text-4xl font-bold mb-2 tracking-wide">暫停接單中</h1>
          <p className="text-xl text-slate-300">店家目前休息或忙碌中</p>
        </div>
      )}

      {/* --- 加購選單 (Modal) --- */}
      {isModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm md:p-4 animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85dvh] md:h-auto md:max-h-[90vh] animate-slide-up">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10 flex-shrink-0">
              <h2 className="text-2xl font-black text-slate-800">
                {selectedItem.name}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8 flex-1">
              <div>
                <h3 className="text-lg font-bold text-slate-700 mb-3">
                  選擇辣度
                </h3>
                <div className="flex flex-wrap gap-3">
                  {currentSpicinessOptions.map((spicy) => (
                    <button
                      key={spicy}
                      onClick={() => setModalSpiciness(spicy)}
                      className={`px-4 py-2 rounded-lg border font-bold transition-all ${
                        modalSpiciness === spicy
                          ? "bg-red-500 text-white border-red-500 shadow-md transform scale-105"
                          : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
                      }`}
                    >
                      {spicy}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-700 mb-3">
                  加點配料
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentAddonsList.map((addon) => {
                    const qty = modalAddons[addon.name] || 0;
                    return (
                      <div
                        key={addon.name}
                        className={`flex justify-between items-center p-3 rounded-xl border transition-all ${
                          qty > 0
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-100 bg-white"
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-800">
                            {addon.name}
                          </div>
                          <div className="text-sm text-slate-500">
                            ${addon.price}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => updateAddonQty(addon.name, -1)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                              qty > 0
                                ? "bg-white text-blue-600 shadow"
                                : "bg-gray-100 text-gray-400"
                            }`}
                            disabled={qty === 0}
                          >
                            <Minus size={16} />
                          </button>
                          <span
                            className={`w-6 text-center font-bold ${
                              qty > 0 ? "text-blue-700" : "text-gray-300"
                            }`}
                          >
                            {qty}
                          </span>
                          <button
                            onClick={() => updateAddonQty(addon.name, 1)}
                            className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-700"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-700 mb-2">備註</h3>
                  <textarea
                    value={modalNote}
                    onChange={(e) => setModalNote(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-blue-500 text-slate-800"
                    placeholder="例如：不要蔥..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl">
                  <span className="font-bold text-lg text-slate-700">份數</span>
                  <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
                    <button
                      onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                      className="text-gray-600 hover:text-blue-600"
                    >
                      <Minus />
                    </button>
                    <span className="text-xl font-black text-slate-800 w-8 text-center">
                      {modalQuantity}
                    </span>
                    <button
                      onClick={() => setModalQuantity(modalQuantity + 1)}
                      className="text-gray-600 hover:text-blue-600"
                    >
                      <Plus />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0 z-10 flex justify-between items-center gap-4 pb-14 md:pb-4 flex-shrink-0">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 font-bold">小計</span>
                <span className="text-2xl font-black text-slate-900">
                  $
                  {(selectedItem.price +
                    Object.entries(modalAddons).reduce((acc, [name, q]) => {
                      return (
                        acc +
                        (currentAddonsList.find((a) => a.name === name)?.price || 0) *
                          q
                      );
                    }, 0)) *
                    modalQuantity}
                </span>
              </div>
              <button
                onClick={confirmModalAdd}
                className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition shadow-lg"
              >
                加入購物車
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 左側：菜單區 --- */}
      <div className="w-full md:w-2/3 flex flex-col h-full relative z-10">
        <div className="absolute top-0 left-0 right-0 z-10 bg-slate-100/90 backdrop-blur-md border-b border-slate-200 pt-4 pb-2 px-6 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <ChefHat className="text-blue-600 mt-0.5" />
            <div className="leading-tight">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">326</h1>
                <div className="text-xs font-bold text-slate-500">
                  營業時間: 週三、六 16:30-20:30
                </div>
              </div>

              <div className="text-xs font-bold text-slate-500 mt-1">
                地址: 台南市安南區安通路四段119巷30弄2號
              </div>

              <div className="text-xs font-bold text-slate-500 mt-1">
                LINE:{" "}
                <a
                  href="https://line.me/R/ti/p/@077vslag?from=page&searchId=077vslag"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  @077vslag
                </a>
              </div>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            <button
              onClick={() => setSelectedCategory(0)}
              className={`px-5 py-2.5 rounded-2xl font-bold text-sm whitespace-nowrap transition ${
                selectedCategory === 0
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              全部餐點
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-5 py-2.5 rounded-2xl font-bold text-sm whitespace-nowrap transition ${
                  selectedCategory === cat.id
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-44 bg-slate-100 pb-32">
          {categoriesDisplay.map((cat) => {
            const itemsInCat = liveMenuItems.filter((item) => item.category_id === cat.id);
            if (itemsInCat.length === 0) return null;
            return (
              <div key={cat.id} className="mb-10">
                <div className="flex items-center mb-4 pl-1">
                  <div className="w-1.5 h-6 bg-blue-600 rounded-full mr-3"></div>
                  <h2 className="text-xl font-black text-slate-800 tracking-wide">
                    {cat.name}
                  </h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {itemsInCat.map((item) => {
                  const soldOutByDailyLimit =
                    item.name === BEEF_OFFAL_NAME && beefOffalUsed >= DAILY_BEEF_OFFAL_LIMIT;

                  const canClick = item.is_available && !soldOutByDailyLimit && isStoreOpen;

                  return (
                    <div
                      key={item.id}
                      onClick={() => canClick && handleItemClick(item)}
                      className={`group relative bg-white p-4 rounded-3xl border border-slate-100 transition-all duration-200 flex flex-col justify-between min-h-[140px] select-none ${
                        canClick
                          ? "hover:shadow-xl hover:-translate-y-1 cursor-pointer hover:border-blue-200 active:scale-95"
                          : "opacity-60 cursor-not-allowed bg-slate-50 grayscale"
                      }`}
                    >
                      {(!item.is_available || soldOutByDailyLimit) && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center">
                          <span className="bg-slate-800/90 text-white px-4 py-1.5 rounded-full font-bold text-sm shadow-lg transform -rotate-6 backdrop-blur-sm border border-slate-600">
                            今日已售完
                          </span>
                        </div>
                      )}


                      <div>
                        <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1 group-hover:text-blue-700 transition-colors">
                          {item.name}
                        </h3>
                        {/* 你想的話可以顯示牛雜剩餘 */}
                        {/* {item.name === BEEF_OFFAL_NAME && (
                          <div className="text-xs font-bold text-slate-500 mt-1">
                            今日剩餘：{beefOffalRemaining} / {DAILY_BEEF_OFFAL_LIMIT}
                          </div>
                        )} */}
                      </div>

                      <div className="flex justify-between items-end mt-4">
                        <span
                          className={`font-black text-xl ${
                            canClick ? "text-slate-900" : "text-slate-400"
                          }`}
                        >
                          ${item.price}
                        </span>

                        {canClick && (
                          <div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-full flex items-center justify-center transition-all group-hover:bg-blue-600 group-hover:text-white shadow-sm">
                            <Plus size={20} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
          {categoriesDisplay.length === 0 && (
            <div className="text-center text-slate-400 mt-20">暫無菜單資料</div>
          )}
        </div>
      </div>

      {/* --- 手機版底部按鈕 --- */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 z-30">
        <button
          onClick={() => setIsMobileCartOpen(true)}
          className="w-full bg-slate-900 text-white py-4 px-6 rounded-full shadow-2xl flex justify-between items-center transition active:scale-95 border border-slate-700"
        >
          <div className="flex items-center gap-3">
            <div className="bg-white text-slate-900 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
              {totalQty}
            </div>
            <span className="font-bold text-lg">查看購物車</span>
          </div>
          <span className="font-bold text-xl">${totalAmount}</span>
        </button>
      </div>

      {/* --- 右側：結帳區 --- */}
      <div
        className={`
        fixed inset-0 z-50 bg-white transition-transform duration-300 transform 
        md:relative md:transform-none md:w-1/3 md:flex md:flex-col md:h-full md:z-auto md:shadow-2xl md:border-l md:border-slate-200 md:inset-auto md:translate-y-0
        ${isMobileCartOpen ? "translate-y-0" : "translate-y-full"}
      `}
      >
        <div className="md:hidden p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-lg text-slate-800">訂單明細</h2>
          <button
            onClick={() => setIsMobileCartOpen(false)}
            className="p-2 bg-white rounded-full shadow text-slate-600"
          >
            <ChevronDown />
          </button>
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="p-6 pb-4 bg-white border-b border-slate-100 flex-shrink-0">
            <div className="mb-4">
              <div className="text-sm font-black text-slate-800">外帶預訂</div>
              {serviceDateKey ? (
                <div className="text-xs text-slate-500 mt-1">
                  本次營業日：{serviceDateKey}（16:30–20:30）
                </div>
              ) : (
                <div className="text-xs text-slate-500 mt-1">
                  目前未開放預訂
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative group">
                  <div className="absolute left-3 top-3.5 text-slate-400"><User size={18} /></div>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="姓名"
                    className="w-full bg-slate-50 rounded-2xl py-3 pl-10 pr-3 font-bold text-black outline-none focus:bg-white border-2 border-transparent focus:border-green-500 transition"
                  />
                </div>
                <div className="relative group">
                  <div className="absolute left-3 top-3.5 text-slate-400"><Phone size={18} /></div>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="電話"
                    className="w-full bg-slate-50 rounded-2xl py-3 pl-10 pr-3 font-bold text-black outline-none focus:bg-white border-2 border-transparent focus:border-green-500 transition"
                  />
                </div>
              </div>

              <div className="relative group">
                <div className="absolute left-4 top-3.5 text-slate-400"><Clock size={20} /></div>
                <select
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  disabled={!bookingOpen}
                  className="w-full bg-slate-50 rounded-2xl py-3 pl-12 pr-4 font-bold text-lg text-black outline-none focus:bg-white border-2 border-transparent focus:border-green-500 cursor-pointer appearance-none transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">請選取餐時間</option>
                  {timeSlots.map((slot) => (
                    <option key={slot.value} value={slot.value} disabled={slot.disabled}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>


          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white pb-32 md:pb-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                <div className="bg-slate-50 p-6 rounded-full">
                  <ShoppingCart size={48} />
                </div>
                <p className="font-bold">尚未點餐</p>
                <button
                  onClick={() => setIsMobileCartOpen(false)}
                  className="md:hidden text-blue-500 font-bold"
                >
                  ← 返回菜單
                </button>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={index}
                  className="group flex flex-col bg-white border border-slate-100 p-3 rounded-2xl hover:border-slate-300 transition-colors shadow-sm relative"
                >
                  <button
                    onClick={() => removeFromCart(index)}
                    className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex justify-between items-start pr-8">
                    <div>
                      <div className="font-bold text-slate-800 text-lg">
                        {item.name}
                      </div>
                      <div className="text-sm text-slate-500 mt-1 space-y-0.5">
                        {item.options?.spiciness &&
                          item.options.spiciness !== "不辣" && (
                            <span className="text-red-500 font-bold mr-2">
                              {item.options.spiciness}
                            </span>
                          )}
                        {item.options?.addons?.map((addon, idx) => (
                          <div key={idx} className="flex gap-1">
                            <span>+ {addon.name}</span>
                            <span className="text-slate-400">x{addon.quantity}</span>
                          </div>
                        ))}
                        {item.options?.note && (
                          <div className="text-slate-400 italic">
                            備註: {item.options.note}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900">
                        ${item.finalPrice * item.quantity}
                      </div>
                      <div className="text-xs text-slate-400">
                        單價 ${item.finalPrice}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-dashed border-slate-100 flex justify-between items-center">
                    <div className="text-xs text-slate-400">數量</div>
                    <div className="font-black text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">
                      x {item.quantity}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-30 flex-shrink-0 pb-20 md:pb-6">
            <div className="flex justify-between items-end mb-6">
              <span className="text-slate-500 font-bold text-sm">訂單總金額</span>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-slate-900">
                  ${totalAmount}
                </span>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isLoading || !isStoreOpen}
              className={`w-full py-4 rounded-2xl text-xl font-bold shadow-xl shadow-blue-200 transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 ${
                cart.length === 0 || isLoading || !isStoreOpen
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : diningOption === "take_out"
                    ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-green-200"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-200"
              }`}
            >
              {isLoading ? "處理中..." : "確認送出"}
            </button>
          </div>
        </div>
      </div>

      {successOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-lg font-black text-slate-900">下單成功</div>
            </div>

            <div className="px-5 py-4">
              {/* successText 是用 \n 組的，這裡用 whitespace-pre-line 保留換行 */}
              <div className="text-slate-700 text-base whitespace-pre-line leading-7">
                {successText}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setSuccessOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-black transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
