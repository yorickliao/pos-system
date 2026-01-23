// 2) 把「營業中/已打烊」做成一個可直接丟到 kitchen 頁的元件
// 檔案：components/StoreOpenToggle.tsx

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function StoreOpenToggle() {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("store_settings").select("is_open").single();
      if (!error && data) setIsOpen(!!data.is_open);
    })();
  }, []);

  const toggleStoreStatus = async () => {
    const newState = !isOpen;
    setIsOpen(newState);
    setLoading(true);
    await supabase.from("store_settings").update({ is_open: newState }).eq("id", 1);
    setLoading(false);
  };

  return (
    <button
      onClick={toggleStoreStatus}
      disabled={loading}
      className={`px-6 py-3 rounded-full font-bold text-xl shadow-lg transition flex items-center gap-2 disabled:opacity-60 ${
        isOpen ? "bg-green-500 text-white hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600"
      }`}
    >
      {isOpen ? "營業中" : "已打烊"}
    </button>
  );
}
