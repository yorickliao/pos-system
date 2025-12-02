"use client";

import { useState, useEffect } from "react";

const CORRECT_PIN = "1113";

export default function PinGuard({ children }: { children: React.ReactNode }) {
  const [pin, setPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);

  // 避免每次重新整理都要輸入，可以存個簡單的 session
  useEffect(() => {
    const savedStatus = sessionStorage.getItem("admin_unlocked");
    if (savedStatus === "true") setIsUnlocked(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === CORRECT_PIN) {
      setIsUnlocked(true);
      sessionStorage.setItem("admin_unlocked", "true");
    } else {
      alert("❌ 密碼錯誤");
      setPin("");
    }
  };

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm text-center">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">🔒 系統鎖定</h2>
        <p className="text-gray-500 mb-4">請輸入管理密碼</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN Code"
            className="w-full text-center text-3xl tracking-widest font-bold border-b-2 border-gray-300 focus:border-blue-600 outline-none py-2 text-black"
            autoFocus
          />
          <button
            type="submit"
            className="w-full bg-gray-800 text-white py-3 rounded-lg font-bold hover:bg-black transition"
          >
            解鎖
          </button>
        </form>
      </div>
    </div>
  );
}