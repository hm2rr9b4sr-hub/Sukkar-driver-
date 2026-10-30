import { generateCode, generateTicket, hashCode, hashIp, hashTicket, normalizeCodeInput, unguessableCodeHash } from "./crypto";
import type { OtpSettings } from "./config";
import { toOtpPhone } from "./phone";
import type { OtpChannel, OtpDb, OtpPurpose } from "./types";

export class OtpStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpStoreError";
  }
}

// ⚠️ حقل internal للسجلات الداخلية فقط — مسارات API يجب ألا تُعيده للمتصفح:
// الاستجابة العامة موحَّدة بين الرقم المؤهل وغير المؤهل (لا كشف لتسجيل الرقم).
export type RequestOutcome =
  | { status: "invalid_phone" }
  | { status: "unavailable" } // قناة الإرسال معطّلة (otp_channel_degraded) — موحَّد لكل الأرقام
  | { status: "rate_limited"; retryAfterSeconds?: number; internal: { reason: string } }
  | { status: "accepted"; internal: { suppressed: boolean; delivered: boolean; error?: string } };

export type VerifyOutcome =
  | { status: "verified"; ticket: string }
  | { status: "rejected"; internal: { reason: string } };

export interface OtpRequestInput {
  phone: string;
  purpose: OtpPurpose;
  ip?: string | null;
  // هل الرقم مؤهل للغرض (مثلاً: غير مسجَّل للتسجيل، مندوب غير مفعَّل للتفعيل)؟ غير المؤهل
  // لا يُرسَل له شيء (لا تكلفة)، لكنه يستهلك نفس الحدود ويرجع نفس الاستجابة العامة.
  eligible?: () => boolean | Promise<boolean>;
}

function record(value: unknown, fn: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new OtpStoreError(`${fn}: unexpected-result`);
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OtpService {
  // suppressedPadMs: تأخير يُضاف للرقم غير المؤهل (لا إرسال عنده) ليقارب زمن الاستجابة للمؤهل
  // (الإرسال يستغرق نحو ثانية) — يضيّق قناة التوقيت الجانبية التي تكشف تسجيل الرقم.
  constructor(private readonly deps: { db: OtpDb; channel: OtpChannel; settings: OtpSettings; suppressedPadMs?: number; sleep?: (ms: number) => Promise<void> }) {}

  private async call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.deps.db.rpc(fn, args);
    if (error) throw new OtpStoreError(`${fn}: ${error.message}`);
    return data;
  }

  async request(input: OtpRequestInput): Promise<RequestOutcome> {
    const { pepper, limits } = this.deps.settings;
    const phone = toOtpPhone(input.phone);
    if (!phone) return { status: "invalid_phone" };

    // عطل القناة يُفحَص قبل أي إصدار/أهلية: الرد موحَّد لكل الأرقام فلا يكشف شيئاً.
    const degraded = await this.call("otp_channel_degraded", {
      p_window_seconds: limits.degradedWindowSeconds,
      p_threshold: limits.degradedThreshold,
    });
    if (degraded === true) return { status: "unavailable" };

    const eligible = input.eligible ? await input.eligible() : true;
    const code = generateCode();

    const issued = record(
      await this.call("otp_issue", {
        p_phone: phone,
        p_purpose: input.purpose,
        p_code_hash: eligible ? hashCode(pepper, phone, input.purpose, code) : unguessableCodeHash(pepper, phone, input.purpose),
        p_ip_hash: input.ip ? hashIp(pepper, input.ip) : null,
        p_channel: this.deps.channel.name,
        p_suppressed: !eligible,
        p_ttl_seconds: limits.ttlSeconds,
        p_cooldown_seconds: limits.cooldownSeconds,
        p_phone_hourly: limits.phoneHourly,
        p_phone_daily: limits.phoneDaily,
        p_ip_hourly: limits.ipHourly,
        p_global_daily: limits.globalDaily,
      }),
      "otp_issue"
    );

    if (issued.status === "rate_limited") {
      const reason = String(issued.reason ?? "unknown");
      // مهلة إعادة الطلب تُكشَف لحالة التهدئة فقط (واجهة العدّاد) — حدود الساعة/اليوم/IP/العام لا.
      return {
        status: "rate_limited",
        ...(reason === "cooldown" && typeof issued.retry_after === "number" ? { retryAfterSeconds: issued.retry_after } : {}),
        internal: { reason },
      };
    }
    if (issued.status !== "issued" || typeof issued.challenge_id !== "string") throw new OtpStoreError("otp_issue: unexpected-status");

    if (!eligible) {
      if (this.deps.suppressedPadMs) await (this.deps.sleep ?? realSleep)(this.deps.suppressedPadMs);
      return { status: "accepted", internal: { suppressed: true, delivered: false } };
    }

    // فشل الإرسال لا يُكشَف للمتصفح (وإلا صار فرق "نجح/فشل" يفرّق المؤهل عن غير المؤهل أثناء
    // عطل القناة) — يُعلَّم الصف failed (يُبطل الرمز) ويُرجَع error داخلياً للسجل/المراقبة فقط.
    let sent: { ok: boolean; error?: string };
    try {
      sent = await this.deps.channel.send({ phone, code, purpose: input.purpose, ttlMinutes: Math.round(limits.ttlSeconds / 60) });
    } catch {
      sent = { ok: false, error: "channel-exception" };
    }
    await this.call("otp_mark_sent", { p_challenge_id: issued.challenge_id, p_ok: sent.ok });
    return { status: "accepted", internal: { suppressed: false, delivered: sent.ok, ...(sent.error ? { error: sent.error } : {}) } };
  }

  async verify(input: { phone: string; purpose: OtpPurpose; code: string }): Promise<VerifyOutcome> {
    const { pepper, limits } = this.deps.settings;
    const phone = toOtpPhone(input.phone);
    const code = normalizeCodeInput(String(input.code ?? ""));
    if (!phone || !/^\d{6}$/.test(code)) return { status: "rejected", internal: { reason: "malformed" } };

    const ticket = generateTicket();
    const res = record(
      await this.call("otp_verify", {
        p_phone: phone,
        p_purpose: input.purpose,
        p_code_hash: hashCode(pepper, phone, input.purpose, code),
        p_ticket_hash: hashTicket(pepper, phone, input.purpose, ticket),
        p_ticket_ttl_seconds: limits.ticketTtlSeconds,
        p_window_seconds: limits.windowSeconds,
        p_window_max_attempts: limits.windowMaxAttempts,
      }),
      "otp_verify"
    );
    if (res.status === "verified") return { status: "verified", ticket };
    return { status: "rejected", internal: { reason: String(res.reason ?? "unknown") } };
  }

  // يستهلك التذكرة مرة واحدة — يُستدعى مباشرة قبل الخطوة التي لا رجعة فيها (إنشاء
  // الحساب/تعيين كلمة المرور). true = أول وآخر استخدام لهذه التذكرة.
  async redeemTicket(input: { phone: string; purpose: OtpPurpose; ticket: string }): Promise<boolean> {
    const { pepper } = this.deps.settings;
    const phone = toOtpPhone(input.phone);
    if (!phone || !/^[0-9a-f]{64}$/.test(String(input.ticket ?? ""))) return false;
    const ok = await this.call("otp_redeem_ticket", {
      p_phone: phone,
      p_purpose: input.purpose,
      p_ticket_hash: hashTicket(pepper, phone, input.purpose, input.ticket),
    });
    return ok === true;
  }
}
