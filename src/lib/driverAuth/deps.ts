import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOtpChannel, loadOtpSettings, LoginThrottle, OtpService, otpDbFromSupabase } from "@/lib/otp";
import { DriverLogin } from "./login";
import { DriverOnboarding } from "./onboarding";
import { supabaseDriverStore, supabasePasswordSignIn } from "./supabaseStore";
import type { DriverAuthDeps } from "./handlers";

// تجميع الاعتماديات الحقيقية لكل طلب (كسولاً): غياب OTP_PEPPER/OTP_CHANNEL يرمي OtpConfigError
// فيرجع المسار 503 موحَّداً بدل انهيار البناء. القناة بالمندوب = d7 (OTP_CHANNEL=d7 + D7_API_TOKEN).
export function buildDriverAuthDeps(env: Record<string, string | undefined> = process.env): DriverAuthDeps {
  const admin = createAdminClient();
  const db = otpDbFromSupabase(admin);
  const settings = loadOtpSettings(env);
  const store = supabaseDriverStore(admin);
  const otp = new OtpService({ db, channel: createOtpChannel(env), settings, suppressedPadMs: 700 });
  return {
    onboarding: new DriverOnboarding({ store, otp }),
    login: new DriverLogin({ store, throttle: new LoginThrottle({ db, pepper: settings.pepper }), signIn: supabasePasswordSignIn() }),
  };
}
