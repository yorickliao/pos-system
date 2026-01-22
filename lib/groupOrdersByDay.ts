// lib/groupOrdersByDay.ts
export type OrderWithCreatedAt = {
  id: string;
  created_at: string; // ISO string from Supabase
  // 其他欄位你原本有什麼就放著，不影響分組
  [k: string]: any;
};

function getDateKey(iso: string, timeZone = "Asia/Taipei") {
  // 以指定時區切日，輸出 YYYY-MM-DD
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${day}`;
}

export function groupOrdersByDay<T extends OrderWithCreatedAt>(
  orders: T[],
  opts?: {
    timeZone?: string;
    sort?: "desc" | "asc"; // 日期分組順序
  }
) {
  const timeZone = opts?.timeZone ?? "Asia/Taipei";
  const sort = opts?.sort ?? "desc";

  const map = new Map<string, T[]>();

  for (const o of orders) {
    const key = getDateKey(o.created_at, timeZone);
    const arr = map.get(key);
    if (arr) arr.push(o);
    else map.set(key, [o]);
  }

  const keys = Array.from(map.keys()).sort((a, b) => {
    // YYYY-MM-DD 字串可直接比
    return sort === "desc" ? (a < b ? 1 : -1) : (a > b ? 1 : -1);
  });

  return keys.map((key) => ({
    dateKey: key,
    orders: map.get(key)!,
  }));
}

export function formatDateHeader(dateKey: string) {
  // dateKey: YYYY-MM-DD -> 顯示 YYYY/MM/DD (週X)
  const [y, m, d] = dateKey.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][dt.getUTCDay()];
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}（${weekday}）`;
}
