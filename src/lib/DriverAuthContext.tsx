"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchMyDriverProfile, UIDriverProfile } from "@/lib/data";

// نفس اصطلاح البريد الاصطناعي بجانب موقع سُكّر الرئيسي (phoneToEmail بلاحقة
// "-driver" ثابتة) — يجب أن يبقى مطابقاً حرفياً لما ينشئه
// POST /api/admin/drivers على مشروع سُكّر (${digits}-driver@sukkar.app)،
// رغم أن هذا تطبيق مستقل تماماً الآن (مشروع/دومين منفصل، نفس Supabase فقط).
function phoneToDriverEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${digits}-driver@sukkar.app`;
}

interface DriverSignInArgs {
  phone: string;
  password: string;
}

interface DriverAuthCtx {
  driver: UIDriverProfile | null;
  loading: boolean;
  signIn: (args: DriverSignInArgs) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshDriver: () => Promise<void>;
}

const DriverAuthContext = createContext<DriverAuthCtx>({
  driver: null,
  loading: true,
  signIn: async () => ({ error: "not-ready" }),
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

  async function signIn({ phone, password }: DriverSignInArgs) {
    const email = phoneToDriverEmail(phone);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "رقم الهاتف أو كلمة المرور غير صحيحة" };
    if (!data.user) return { error: "فشل تسجيل الدخول" };

    const profile = await fetchMyDriverProfile();
    if (!profile) {
      await supabase.auth.signOut();
      setDriver(null);
      return { error: "هذا الحساب ليس حساب مندوب" };
    }
    if (!profile.isActive) {
      await supabase.auth.signOut();
      setDriver(null);
      return { error: "حساب المندوب معطَّل حالياً — تواصل مع الدعم" };
    }

    setDriver(profile);
    return { error: null };
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
    <DriverAuthContext.Provider value={{ driver, loading, signIn, logout, refreshDriver }}>
      {children}
    </DriverAuthContext.Provider>
  );
}

export const useDriverAuth = () => useContext(DriverAuthContext);
