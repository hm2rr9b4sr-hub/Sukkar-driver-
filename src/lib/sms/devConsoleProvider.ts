import "server-only";
import type { SmsProvider, SmsSendResult } from "./types";

// ⚠️ مزوّد اختبار محلي فقط — ليس محاكاة دائمة، وليس بديلاً حقيقياً عن SMS.
// يكتب الكود بسجلات الخادم (Vercel Logs / console محلياً) بدل إرسال أي شيء
// فعلياً. الهدف الوحيد: تمكين اختبار تدفق OTP الكامل (طلب → تحقق → إنشاء
// حساب → موافقة أدمن) الآن، بينما D7 لا يزال غير مربوط، بلا أي وهم أن رسالة
// حقيقية وصلت لهاتف أحد. يُستبدَل بـD7SmsProvider بمجرد توفر بيانات D7
// الحقيقية — سطر واحد فقط بـindex.ts أدناه، لا شيء آخر بالتطبيق يحتاج تعديلاً.
export class DevConsoleSmsProvider implements SmsProvider {
  async sendSms(toPhoneDigits: string, message: string): Promise<SmsSendResult> {
    // eslint-disable-next-line no-console
    console.log(`[DEV-ONLY — NOT A REAL SMS] to +${toPhoneDigits}: ${message}`);
    return { ok: true };
  }
}
