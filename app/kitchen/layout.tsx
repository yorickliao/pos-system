// src/app/kitchen/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "326訂單管理", // 👈 廚房頁顯示這個
};

export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}