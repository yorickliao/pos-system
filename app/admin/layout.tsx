// src/app/admin/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "326後台", // 👈 後台顯示這個
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}