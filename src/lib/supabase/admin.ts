import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// عميل service_role — يتجاوز RLS بالكامل، سيرفر فقط. نفس النمط الحرفي
// المستخدم بمشروع سُكّر الرئيسي (src/lib/supabase/admin.ts هناك). لازم هنا
// حصراً لإجراءات auth.admin.* (تعطيل حساب المندوب عند طلب الحذف) التي لا
// تغطيها أي صلاحية RLS عادية لأنها تمس auth.users مباشرة.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
