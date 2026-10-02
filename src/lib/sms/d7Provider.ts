import "server-only";
import type { SmsProvider, SmsSendResult } from "./types";

// نقطة الربط مع D7 Networks (POST /messages/v1/send، Bearer token) — مُختبَرة
// بإرسال فعلي. data_coding=unicode إلزامي للعربي (غير ذلك يصل "؟؟؟")، والرسالة
// يجب أن تبقى ≤70 حرفاً: unicode متعدد الأجزاء فشل تسليمه فعلياً على الشبكات.
const D7_ENDPOINT = "https://api.d7networks.com/messages/v1/send";

// توثيق D7: { detail: {code,message} } أو { detail: [{code,message}, ...] } — نأخذ أول code متاح
function extractD7ErrorCode(bodyText: string): string | null {
  try {
    const detail = JSON.parse(bodyText)?.detail;
    const first = Array.isArray(detail) ? detail[0] : detail;
    return first?.code ? `${first.code}${first.message ? `: ${first.message}` : ""}` : null;
  } catch {
    return null;
  }
}

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
              data_coding: "unicode",
            },
          ],
        }),
      });
      const bodyText = await res.text().catch(() => "");
      if (!res.ok) {
        // توثيق D7: 401/402/422 تُرجع { detail: {code,message} } أو { detail: [{code,message}] }
        const parsedCode = extractD7ErrorCode(bodyText);
        return { ok: false, error: `d7-request-failed: ${res.status} ${parsedCode ?? bodyText.slice(0, 200)}` };
      }
      // 200 لا يعني إرسالاً ناجحاً بالضرورة — توثيق D7: الجسم نفسه يحمل
      // status: "accepted" | "rejected" على مستوى الدفعة كاملة (لا حالة لكل
      // مستلم بالاستجابة المتزامنة — تحتاج webhook عبر report_url لاحقاً،
      // خارج نطاق هذا الملف الآن).
      let status: string | undefined;
      try {
        status = JSON.parse(bodyText)?.status;
      } catch {
        // استجابة غير JSON صالحة رغم 200 — نعامله كفشل بدل افتراض نجاح صامت
        return { ok: false, error: `d7-invalid-response: ${bodyText.slice(0, 200)}` };
      }
      if (status !== "accepted") {
        return { ok: false, error: `d7-rejected: status=${status ?? "missing"}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d7-network-error: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }
}
