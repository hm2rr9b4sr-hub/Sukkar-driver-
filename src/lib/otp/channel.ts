import { OtpConfigError } from "./config";
import type { OtpChannel, OtpMessage, OtpSendResult } from "./types";

// ── المزوّد الوهمي: يحفظ الرسائل بالذاكرة فقط (للاختبارات والتطوير المحلي). ──
// لا يطبع الرمز بأي سجل — الكود القديم (DevConsoleSmsProvider) كان يطبع الرمز
// بسجل الخادم، وعند غياب D7_API_TOKEN بالإنتاج كانت رموز الدخول تُكتب بسجلات Vercel.
export class MockOtpChannel implements OtpChannel {
  readonly name = "mock";
  readonly outbox: OtpMessage[] = [];
  failWith: string | null = null;

  async send(message: OtpMessage): Promise<OtpSendResult> {
    if (this.failWith) return { ok: false, error: this.failWith };
    this.outbox.push({ ...message });
    return { ok: true };
  }

  lastCodeFor(phone: string): string | undefined {
    return [...this.outbox].reverse().find((m) => m.phone === phone)?.code;
  }
}

// ── واتساب Cloud API — قالب Authentication معتمد من Meta. ──
// ⚠️ غير مُتحقَّق مقابل Meta الحقيقي (لا حساب/قالب جاهز بعد): بنية الحمولة مأخوذة
// من توثيق قوالب المصادقة (مكوّن body بالرمز + زر نسخ الرمز sub_type=url بنفس
// الرمز). تُراجَع بأول إرسال تجريبي عند جاهزية القالب. الاختبارات تغطي منطق
// الاستدعاء بـfetch وهمي فقط ولا ترسل شيئاً حقيقياً.
// نص حر (sendWhatsAppText) لا يصلح للـOTP: لا يصل خارج نافذة 24 ساعة.
export interface WhatsAppChannelConfig {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  templateName: string;
  languageCode: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class WhatsAppAuthTemplateChannel implements OtpChannel {
  readonly name = "whatsapp";
  constructor(private readonly cfg: WhatsAppChannelConfig) {}

  async send(message: OtpMessage): Promise<OtpSendResult> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 10000);
    try {
      const res = await doFetch(`https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: message.phone,
          type: "template",
          template: {
            name: this.cfg.templateName,
            language: { code: this.cfg.languageCode },
            components: [
              { type: "body", parameters: [{ type: "text", text: message.code }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: message.code }] },
            ],
          },
        }),
      });
      if (!res.ok) {
        // نُرجع رمز الخطأ فقط — لا جسم الاستجابة ولا أي شيء قد يحوي الرقم أو الرمز.
        const code = await res.json().then((b: { error?: { code?: number } }) => b?.error?.code).catch(() => undefined);
        return { ok: false, error: `whatsapp-http-${res.status}${code ? `-${code}` : ""}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "whatsapp-timeout" : "whatsapp-network-error" };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── D7 Networks SMS — قناة المندوب. ──
// نفس تفاصيل d7Provider.ts المُختبَرة فعلياً سابقاً: data_coding=unicode إلزامي للعربي،
// والرسالة ≤70 حرفاً (unicode متعدد الأجزاء فشل تسليمه على الشبكات اليمنية)، والجسم يحمل
// status ("accepted"/"rejected") حتى مع HTTP 200. تكلفة الرسالة 0.19$ — لذلك لا تُرسَل
// إلا لتفعيل أول (لا لكل دخول). تسجيل Sender ID لدى D7/المشغّلين شرط خارجي (سبأفون).
export function buildD7OtpText(code: string, ttlMinutes: number): string {
  const minutes = ttlMinutes === 1 ? "دقيقة" : ttlMinutes === 2 ? "دقيقتان" : ttlMinutes <= 10 ? `${ttlMinutes} دقائق` : `${ttlMinutes} دقيقة`;
  return `سُكّر: رمز التحقق ${code}. صالح ${minutes}، لا تشاركه مع أحد.`;
}

export interface D7ChannelConfig {
  token: string;
  sender: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class D7SmsChannel implements OtpChannel {
  readonly name = "d7";
  constructor(private readonly cfg: D7ChannelConfig) {}

  async send(message: OtpMessage): Promise<OtpSendResult> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 10000);
    try {
      const res = await doFetch(this.cfg.endpoint ?? "https://api.d7networks.com/messages/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${this.cfg.token}` },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [{
            originator: this.cfg.sender,
            recipients: [`+${message.phone}`],
            content: buildD7OtpText(message.code, message.ttlMinutes),
            msg_type: "text",
            data_coding: "unicode",
          }],
        }),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        // 401 توكن، 402 رصيد، 422 مرسل/محتوى — نُرجع الكود فقط (بلا جسم قد يحوي الرقم).
        let code: string | undefined;
        try {
          const detail = JSON.parse(text)?.detail;
          code = (Array.isArray(detail) ? detail[0] : detail)?.code;
        } catch { /* جسم غير JSON */ }
        return { ok: false, error: `d7-http-${res.status}${code ? `-${String(code).slice(0, 40)}` : ""}` };
      }
      let status: unknown;
      try { status = JSON.parse(text)?.status; } catch { return { ok: false, error: "d7-invalid-response" }; }
      return status === "accepted" ? { ok: true } : { ok: false, error: `d7-rejected-${String(status ?? "missing").slice(0, 20)}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "d7-timeout" : "d7-network-error" };
    } finally {
      clearTimeout(timer);
    }
  }
}

// اختيار القناة من البيئة. fail-closed: لا قناة افتراضية، والوهمي ممنوع بالإنتاج
// مهما كانت قيمة المتغير (لا سقوط صامت لقناة تطبع الرموز كما كان بالكود القديم).
export function createOtpChannel(env: Record<string, string | undefined>, deps: { fetchImpl?: typeof fetch } = {}): OtpChannel {
  const kind = (env.OTP_CHANNEL ?? "").trim().toLowerCase();
  if (kind === "mock") {
    if (env.NODE_ENV === "production") throw new OtpConfigError("otp-channel-mock-forbidden-in-production");
    return new MockOtpChannel();
  }
  if (kind === "whatsapp") {
    const token = env.WHATSAPP_CLOUD_API_TOKEN;
    const phoneNumberId = env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
    const apiVersion = env.WHATSAPP_CLOUD_API_VERSION; // بلا افتراضي: إصدار Graph المطلوب يُحدَّد صراحةً
    const templateName = env.WHATSAPP_OTP_TEMPLATE_NAME;
    if (!token || !phoneNumberId || !apiVersion || !templateName) throw new OtpConfigError("otp-channel-whatsapp-not-configured");
    return new WhatsAppAuthTemplateChannel({
      token, phoneNumberId, apiVersion, templateName,
      languageCode: env.WHATSAPP_OTP_TEMPLATE_LANG || "ar",
      fetchImpl: deps.fetchImpl,
    });
  }
  if (kind === "d7") {
    const token = env.D7_API_TOKEN;
    if (!token) throw new OtpConfigError("otp-channel-d7-not-configured");
    return new D7SmsChannel({ token, sender: env.D7_SENDER_ID || "SUKKAR", fetchImpl: deps.fetchImpl });
  }
  throw new OtpConfigError("otp-channel-not-configured");
}
