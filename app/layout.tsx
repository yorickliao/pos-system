import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google"; // 1. 引入字體
import "./globals.css";

// 2. 設定字體
const notoSansTC = Noto_Sans_TC({ 
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "POS 點餐系統",
  description: "Next.js POS System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      {/* 3. 套用字體 className */}
      <body className={notoSansTC.className}>{children}</body>
    </html>
  );
}