import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreateDriverResult, DriverIdentity, DriverStore, PasswordSignIn } from "./types";

// التنفيذ الحقيقي لـDriverStore فوق عميل service_role. يطابق آخر 9 أرقام من drivers.phone
// (نفس تطبيع 0071)، ويقرأ البريد وعلامة التفعيل من auth.users عبر id صف المندوب — فلا يهمّ شكل
// البريد القديم (الحسابات السابقة اشتُقّ بريدها من الرقم كما أُدخل).
export function supabaseDriverStore(admin: SupabaseClient): DriverStore {
  return {
    async findDriverByLocalPhone(local): Promise<DriverIdentity | null> {
      const { data, error } = await admin.from("drivers").select("id, phone").like("phone", `%${local}`);
      if (error) throw new Error("driver-lookup-failed");
      const matches = (data ?? []).filter((r) => String(r.phone).replace(/\D/g, "").slice(-9) === local);
      if (matches.length !== 1) return null; // غائب أو ملتبس ⇒ كأنه غير موجود
      const { data: u, error: ue } = await admin.auth.admin.getUserById(matches[0].id);
      const user = u?.user;
      if (ue || !user?.email) return null;
      if (user.banned_until && Date.parse(user.banned_until) > Date.now()) return null; // حساب محذوف/محظور
      return { id: user.id, email: user.email, activated: Boolean(user.app_metadata?.driver_password_set_at) };
    },

    async isPhoneAvailable(local) {
      const { data, error } = await admin.rpc("phone_available", { p_phone: local });
      if (error) throw new Error("phone-available-failed");
      return data !== false;
    },

    async activateDriver(id, password) {
      const { error } = await admin.auth.admin.updateUserById(id, {
        password,
        app_metadata: { driver_password_set_at: new Date().toISOString() },
      });
      return { ok: !error };
    },

    async createDriver(input): Promise<CreateDriverResult> {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${input.local}-driver@sukkar.app`,
        password: input.password,
        email_confirm: true,
        user_metadata: { role: "driver", full_name: input.fullName, phone: input.local },
        app_metadata: { driver_password_set_at: new Date().toISOString() },
      });
      if (error || !created?.user) return { ok: false, code: /already|registered|exists/i.test(error?.message ?? "") ? "phone-taken" : "failed" };

      const { error: insertError } = await admin.from("drivers").insert({
        id: created.user.id,
        region_id: input.regionId,
        full_name: input.fullName,
        phone: input.local,
        vehicle_type: input.vehicleType ?? null,
        plate_number: input.plateNumber ?? null,
        // approval_status غير مذكور عمداً ⇒ الافتراضي 'pending' (0058): الموافقة قرار الأدمن وحده.
      });
      if (insertError) {
        // لا حساب يتيم: نحذف مستخدم auth الذي أُنشئ للتو (نحن من أنشأه ولا شيء مرتبط به بعد).
        await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
        if (insertError.code === "23505" || /phone-already-registered/.test(insertError.message)) return { ok: false, code: "phone-taken" };
        if (insertError.code === "23503") return { ok: false, code: "region-invalid" };
        return { ok: false, code: "failed" };
      }
      return { ok: true };
    },
  };
}

// تسجيل الدخول بكلمة المرور عبر عميل anon بلا جلسة محفوظة: الغرض الوحيد استخراج توكنات الجلسة
// لتسليمها للمتصفح (setSession). ⚠️ GoTrue يرى عنوان Vercel لا المستخدم، فحدّه لكل IP مشترك بين
// كل المناديب — مقبول بحجم اليوم، ويُراجَع إن كبر عدد عمليات الدخول المتزامنة.
export function supabasePasswordSignIn(): PasswordSignIn {
  return async (email, password) => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return { ok: false };
    const s = data.session;
    return {
      ok: true,
      userId: data.user.id,
      session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at },
    };
  };
}
