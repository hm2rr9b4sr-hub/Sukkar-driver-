"use client";
import { createBrowserClient } from "@supabase/ssr";

// تطبيق Sukkar Driver مستقل تماماً (دومين/مشروع Vercel خاص به) — لا يشارك
// المتصفح مع أي تطبيق آخر من عائلة سُكّر، فلا حاجة لعزل كوكيز الجلسة أو
// isSingleton:false كما كان مطلوباً حين كان هذا التطبيق مساراً داخل موقع
// سُكّر الرئيسي (راجع سجل الفصل — Sukkar Fleet). عميل واحد قياسي يكفي.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
