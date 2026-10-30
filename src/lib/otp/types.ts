// نواة OTP موحَّدة (عميل/متجر/مندوب) — الأنواع المشتركة. لا يستورد شيئاً من
// Next ولا من Supabase عمداً: النواة تُنسَخ حرفياً إلى sukkar-driver، وتُختبَر
// خارج Next بـ tsx.

export const OTP_PURPOSES = ["customer_signup", "store_signup", "driver_activate", "phone_verify"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export function isOtpPurpose(value: unknown): value is OtpPurpose {
  return typeof value === "string" && (OTP_PURPOSES as readonly string[]).includes(value);
}

export interface OtpMessage {
  phone: string; // 9677XXXXXXXX
  code: string;
  purpose: OtpPurpose;
  ttlMinutes: number;
}

export interface OtpSendResult {
  ok: boolean;
  error?: string;
}

// قناة الإرسال (واتساب/وهمي، ولاحقاً D7). لا تعرف شيئاً عن القاعدة أو الحدود.
export interface OtpChannel {
  readonly name: string;
  send(message: OtpMessage): Promise<OtpSendResult>;
}

// أصغر واجهة تحتاجها النواة من القاعدة — Supabase service_role عبر otpDbFromSupabase
// (index.ts)، أو PGlite بالاختبارات.
export interface OtpDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
