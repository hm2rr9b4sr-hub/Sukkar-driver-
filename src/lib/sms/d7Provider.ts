import "server-only";
import type { SmsProvider, SmsSendResult } from "./types";

// نقطة الربط الفعلية مع D7 Networks — غير مُفعَّلة الآن عمداً (لا حساب،
// لا API key فعلي بعد — راجع تقرير التحقق النهائي بهذه الجلسة). الصيغة هنا
// مطابقة حرفياً لتوثيق D7 الرسمي (POST /messages/v1/send، Bearer token) —
// حقيقية وقابلة للتشغيل فوراً بمجرد توفر D7_API_TOKEN وD7_SENDER_ID، لا
// تحتاج أي إعادة كتابة لاحقاً، فقط تزويدها بالمتغيّرين.
//
// ⚠️ لم يُختبَر هذا الملف بإرسال فعلي — لا حساب D7 حالياً. أول استخدام حقيقي
// يجب أن يكون اختباراً يدوياً مباشراً (رقم حقيقي على كل شبكة يمنية) قبل
// الاعتماد عليه بالإنتاج.
const D7_ENDPOINT = "https://api.d7networks.com/messages/v1/send";

export class D7SmsProvider implements SmsProvider {
  async sendSms(toPhoneDigits: string, message: string): Promise<SmsSendResult> {
    const token = process.env.D7_API_TOKEN;
    const sender = process.env.D7_SENDER_ID;
    if (!token) {
      return { ok: false, error: "d7-not-configured: D7_API_TOKEN missing" };
    }

    try {
      const res = await fetch(D7_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [
            {
              originator: sender || "SUKKAR",
              recipients: [`+${toPhoneDigits}`],
              content: message,
              msg_type: "text",
              data_coding: "text",
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `d7-request-failed: ${res.status} ${body.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d7-network-error: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }
}
