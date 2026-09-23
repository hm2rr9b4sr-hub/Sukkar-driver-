import "server-only";

// طبقة تجريد مزوّد SMS — نقطة الربط الوحيدة المطلوبة لاحقاً مع D7 Networks
// (أو أي مزوّد آخر). أي كود يحتاج إرسال SMS يستدعي هذا الواجهة فقط، لا يعرف
// شيئاً عن المزوّد الفعلي خلفها — تبديل المزوّد لاحقاً يعني كتابة ملف واحد
// جديد ينفّذ هذه الواجهة (مثل d7Provider.ts)، بلا لمس أي كود آخر بالتطبيق
// (مسار OTP request/verify، الواجهة، إلخ).
export interface SmsSendResult {
  ok: boolean;
  error?: string;
}

export interface SmsProvider {
  sendSms(toPhoneDigits: string, message: string): Promise<SmsSendResult>;
}
