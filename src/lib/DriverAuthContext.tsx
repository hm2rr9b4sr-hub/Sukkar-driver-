"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchMyDriverProfile, UIDriverProfile } from "@/lib/data";
import { unregisterFromPush } from "@/lib/nativePush";
import { driverAuthErrorMessage } from "@/lib/driverAuth/messages";

// تدفق الدخول (مسارات /api/auth/driver/*): تفعيل/تسجيل أول بـOTP (نواة lib/otp) ثم كلمة مرور، ثم دخول يومي
// بكلمة المرور بلا OTP. مسارات OTP-عند-كل-دخول القديمة (/api/auth/otp/* وجدول otp_codes 0059 وlib/sms) أُزيلت
// من الكود بعد التحقق أن لا مستدعي لها (آخر استخدام بالإنتاج 2026-10-08). جدول otp_codes باقٍ بالقاعدة حتى migration لاحقة.
async function postJson(path: string, payload: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, body: { error: "network" } };
  }
}
const asMsg = (b: Record<string, unknown>) =>
  driverAuthErrorMessage(b.error as string | undefined, { issue: b.issue as string | undefined, retryAfter: b.retryAfter as number | undefined });

export interface OnboardingCompleteArgs {
  phone: string; ticket: string; password: string;
  fullName?: string; regionId?: string; vehicleType?: string; plateNumber?: string;
}

interface DriverAuthCtx {
  driver: UIDriverProfile | null;
  loading: boolean;
  loginWithPassword: (phone: string, password: string) => Promise<{ error: string | null }>;
  onboardingRequest: (phone: string) => Promise<{ error: string | null }>;
  onboardingVerify: (phone: string, code: string) => Promise<{ error: string | null; ticket?: string; mode?: "activate" | "signup" }>;
  onboardingComplete: (args: OnboardingCompleteArgs) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshDriver: () => Promise<void>;
}

const DriverAuthContext = createContext<DriverAuthCtx>({
  driver: null,
  loading: true,
  loginWithPassword: async () => ({ error: "not-ready" }),
  onboardingRequest: async () => ({ error: "not-ready" }),
  onboardingVerify: async () => ({ error: "not-ready" }),
  onboardingComplete: async () => ({ error: "not-ready" }),
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

  // الدخول اليومي: الخادم يتحقق من كلمة المرور ويحجز المحاولة، ويسلّم توكنات جلسة Supabase حقيقية.
  async function loginWithPassword(phone: string, password: string) {
    const { ok, body } = await postJson("/api/auth/driver/login", { phone, password });
    const session = body.session as { access_token?: string; refresh_token?: string } | undefined;
    if (!ok || !session?.access_token || !session.refresh_token) return { error: asMsg(body) };
    const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) return { error: "تعذّر إتمام تسجيل الدخول — حاول مجدداً" };
    setDriver(await fetchMyDriverProfile());
    return { error: null };
  }

  async function onboardingRequest(phone: string) {
    const { ok, body } = await postJson("/api/auth/driver/onboarding/request", { phone });
    return { error: ok ? null : asMsg(body) };
  }

  async function onboardingVerify(phone: string, code: string) {
    const { ok, body } = await postJson("/api/auth/driver/onboarding/verify", { phone, code });
    if (!ok || typeof body.ticket !== "string") return { error: asMsg(body) };
    return { error: null, ticket: body.ticket, mode: body.mode as "activate" | "signup" };
  }

  // يُنشئ الحساب/يعيّن كلمة المرور ثم يدخل مباشرة بنفس الكلمة (مسار الدخول العادي نفسه).
  async function onboardingComplete(args: OnboardingCompleteArgs) {
    const { ok, body } = await postJson("/api/auth/driver/onboarding/complete", args);
    if (!ok) return { error: asMsg(body) };
    return loginWithPassword(args.phone, args.password);
  }

  async function logout() {
    await unregisterFromPush().catch(() => {});
    await supabase.auth.signOut();
    setDriver(null);
  }

  async function refreshDriver() {
    const profile = await fetchMyDriverProfile();
    setDriver(profile);
  }

  return (
    <DriverAuthContext.Provider value={{ driver, loading, loginWithPassword, onboardingRequest, onboardingVerify, onboardingComplete, logout, refreshDriver }}>
      {children}
    </DriverAuthContext.Provider>
  );
}

export const useDriverAuth = () => useContext(DriverAuthContext);
