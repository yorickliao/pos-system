"use client"; // 這行很重要，代表這是在瀏覽器端執行

import { usePathname } from "next/navigation";

export default function DynamicManifest() {
  const pathname = usePathname();

  // 預設給客人的
  let manifestUrl = "/manifest.json";

  // 判斷路徑
  if (pathname?.startsWith("/kitchen")) {
    manifestUrl = "/manifest-kitchen.json";
  } else if (pathname?.startsWith("/admin")) {
    manifestUrl = "/manifest-admin.json";
  }

  // 回傳 HTML 標籤
  return <link rel="manifest" href={manifestUrl} />;
}