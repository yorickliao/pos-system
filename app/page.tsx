import { createClient } from '@supabase/supabase-js';
import POSPage from '@/components/POSPage';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 1. 抓取資料的函式 (改成一次抓兩樣東西)
async function getData() {
  // 用 Promise.all 同時發出兩個請求，速度比較快
  const [menuResponse, categoryResponse] = await Promise.all([
    supabase.from('menu_items').select('*').order('name'),
    supabase.from('categories').select('*').order('sort_order')
  ]);

  return {
    menuItems: menuResponse.data || [],
    categories: categoryResponse.data || []
  };
}

export default async function Home() {
  // 2. 伺服器端抓好資料
  const { menuItems, categories } = await getData();

  // 3. 把兩包資料都丟給前端元件
  return <POSPage menuItems={menuItems} categories={categories} />;
}