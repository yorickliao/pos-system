import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public', // 產生的檔案放到 public 資料夾
  register: true, // 自動註冊 Service Worker
  skipWaiting: true, // 自動更新
  disable: process.env.NODE_ENV === 'development', // 開發模式下不啟用 PWA (避免一直緩存)
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 你原本的設定寫在這裡...
};

export default withPWA(nextConfig);