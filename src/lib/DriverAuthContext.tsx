"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchMyDriverProfile, UIDriverProfile } from "@/lib/data";

// Driver Onboarding — Account First, Approval Before Work: الدخول والتسجيل
// كلاهما الآن عبر OTP (هاتف + رمز عبر SMS) لا بريد/كلمة مرور يعرفها
// المندوب إطلاقاً. الآلية الفعلية: خادم /api/auth/otp/* (service-role)
// يتحقق من الكود بنفسه (طبقة otp_codes مخصَّصة — migration 0059)، ثم يُصدر
// hashed_token عبر auth.admin.generateLink(type:'magiclink')، والعميل هنا
// يستهلكه عبر verifyOtp(type:'magiclink') لإصدار جلسة حقيقية محلياً — بلا
// أي بريد فعلي يُرسَل، هذه فقط آلية GoTrue الداخلية لإصدار جلسة بلا كلمة مرور.
//
// كلمة المرور بالحساب (يولّدها الخادم عشوائياً وقت الإنشاء فقط) لا يراها
// المندوب أبداً ولا تُستخدَم لأي دخول لاحق — كل دخول يمر بنفس تدفق OTP.

interface DriverAuthCtx {
  driver: UIDriverProfile | null;
  loading: boolean;
  requestOtp: (phone: string, purpose: "driver_signup" | "driver_login") => Promise<{ error: string | null }>;
  verifySignupOtp: (args: {
    phone: string; code: string; fullName: string; regionId: string; vehicleType?: string; plateNumber?: string;
  }) => Promise<{ error: string | null }>;
  verifyLoginOtp: (phone: string, code: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshDriver: () => Promise<void>;
}

const DriverAuthContext = createContext<DriverAuthCtx>({
  driver: null,
  loading: true,
  requestOtp: async () => ({ error: "not-ready" }),
  verifySignupOtp: async () => ({ error: "not-ready" }),
  verifyLoginOtp: async () => ({ error: "not-ready" }),
  logout: async () => {},
  refreshDriver: async () => {},
});

export function DriverAuthProvider({ children }: { children: ReactNode }) {
  const [driver, setDriver] = useState<UIDriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadDriver = useCallback(async (_authUser: User) => {
    const profile = await fetchMyDriverProfile();
    setDriver(profile);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await loadDriver(session.user);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        await loadDriver(session.user).catch(() => {});
      } else if (event === "SIGNED_OUT" || !session?.user) {
        setDriver(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase, loadDriver]);

  async function requestOtp(phone: string, purpose: "driver_signup" | "driver_login") {
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const messages: Record<string, string> = {
        "account-already-exists": "يوجد حساب مسجَّل بهذا الرقم بالفعل — جرّب تسجيل الدخول",
        "no-account-found": "لا يوجد حساب بهذا الرقم — سجّل حساباً جديداً أولاً",
        "too-many-requests": "انتظر دقيقة قبل طلب رمز جديد",
        "invalid-phone": "رقم الهاتف غير صحيح",
      };
      return { error: messages[body.error] ?? (body.error ?? "تعذّر إرسال الرمز") };
    }
    return { error: null };
  }

  // بعد نجاح verify (توقيع/دخول)، يستهلك hashed_token فوراً لإصدار جلسة حقيقية.
  // ⚠️ ملاحظة مُكتشَفة فعلياً باختبار حي: hashed_token من generateLink يجب أن
  // يُمرَّر عبر معامل token_hash تحديداً، لا token — token في verifyOtp محجوز
  // لأكواد OTP الحرفية (مثل sms)، بينما token_hash خاص بروابط/tokens المُصدَرة
  // مسبقاً كهذا. تمريره كـtoken يفشل بخطأ otp_expired رغم صحة كل شيء آخر.
  async function consumeSessionToken(_email: string, token: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
    if (error) return { error: "تعذّر إتمام تسجيل الدخول — حاول مجدداً" };
    const profile = await fetchMyDriverProfile();
    setDriver(profile);
    return { error: null };
  }

  async function verifySignupOtp(args: {
    phone: string; code: string; fullName: string; regionId: string; vehicleType?: string; plateNumber?: string;
  }) {
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...args, purpose: "driver_signup" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const messages: Record<string, string> = {
        "invalid-code": "الرمز غير صحيح",
        "otp-expired": "انتهت صلاحية الرمز — اطلب رمزاً جديداً",
        "otp-not-requested": "لم يُطلَب رمز لهذا الرقم — ابدأ من جديد",
        "too-many-attempts": "محاولات كثيرة خاطئة — اطلب رمزاً جديداً",
        "account-already-exists": "يوجد حساب مسجَّل بهذا الرقم بالفعل",
      };
      return { error: messages[body.error] ?? (body.error ?? "تعذّر إتمام التسجيل") };
    }
    return consumeSessionToken(body.email, body.token);
  }

  async function verifyLoginOtp(phone: string, code: string) {
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, purpose: "driver_login" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const messages: Record<string, string> = {
        "invalid-code": "الرمز غير صحيح",
        "otp-expired": "انتهت صلاحية الرمز — اطلب رمزاً جديداً",
        "otp-not-requested": "لم يُطلَب رمز لهذا الرقم — ابدأ من جديد",
        "too-many-attempts": "محاولات كثيرة خاطئة — اطلب رمزاً جديداً",
        "no-account-found": "لا يوجد حساب بهذا الرقم",
      };
      return { error: messages[body.error] ?? (body.error ?? "تعذّر تسجيل الدخول") };
    }
    return consumeSessionToken(body.email, body.token);
  }

  async function logout() {
    await supabase.auth.signOut();
    setDriver(null);
  }

  async function refreshDriver() {
    const profile = await fetchMyDriverProfile();
    setDriver(profile);
  }

  return (
    <DriverAuthContext.Provider value={{ driver, loading, requestOtp, verifySignupOtp, verifyLoginOtp, logout, refreshDriver }}>
      {children}
    </DriverAuthContext.Provider>
  );
}

export const useDriverAuth = () => useContext(DriverAuthContext);
