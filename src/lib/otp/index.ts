import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOtpChannel } from "./channel";
import { loadOtpSettings } from "./config";
import { OtpService } from "./service";
import type { OtpDb } from "./types";

export * from "./types";
export * from "./limits";
export * from "./config";
export * from "./channel";
export * from "./service";
export * from "./password";
export * from "./loginThrottle";
export { hashIp } from "./crypto";
export { clientIpFromHeaders } from "./clientIp";
export { toOtpPhone } from "./phone";

// نقطة الاستخدام الوحيدة بمسارات API (سيرفر فقط — `server-only` أعلاه). الـclient يجب أن يكون
// service_role: دوال otp_* ممنوحة له وحده (0080). الاختبارات تستورد الوحدات مباشرة لا هذا الملف.
export function otpDbFromSupabase(client: SupabaseClient): OtpDb {
  return { rpc: (fn, args) => client.rpc(fn as never, args as never) as unknown as ReturnType<OtpDb["rpc"]> };
}

export function createOtpServiceFromEnv(
  client: SupabaseClient,
  env: Record<string, string | undefined> = process.env,
  options: { suppressedPadMs?: number } = {}
): OtpService {
  return new OtpService({ db: otpDbFromSupabase(client), channel: createOtpChannel(env), settings: loadOtpSettings(env), ...options });
}
