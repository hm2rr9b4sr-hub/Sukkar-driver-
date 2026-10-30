import { checkPassword, type PasswordIssue } from "../otp/password";
import { toOtpPhone } from "../otp/phone";
import type { OtpService, RequestOutcome } from "../otp/service";
import type { DriverIdentity, DriverStore } from "./types";

// تفعيل المندوب الأول: OTP (إثبات ملكية الرقم) ← تذكرة أحادية الاستخدام ← تعيين كلمة مرور.
// وضعان بنفس الخطوات:
//   activate = مندوب موجود (أنشأه الأدمن أو سجّل بالتدفق القديم) ولم تُعيَّن له كلمة مرور بعد.
//   signup   = رقم غير مسجَّل بأي حساب ⇒ تسجيل مندوب جديد (يُنشأ pending حتى موافقة الأدمن).
// هذا الملف لا يلمس approval_status إطلاقاً: التفعيل/التسجيل لا يمنحان موافقة ولا يتجاوزانها.
export type OnboardingMode = "activate" | "signup";

export type VerifyOnboardingOutcome =
  | { status: "verified"; ticket: string; mode: OnboardingMode }
  | { status: "rejected"; internal: { reason: string } };

export type CompleteOutcome =
  | { status: "ok"; mode: OnboardingMode }
  | { status: "weak_password"; issue: PasswordIssue }
  | { status: "invalid_request" }
  | { status: "invalid_session" }
  | { status: "conflict" }
  | { status: "failed" };

export interface CompleteInput {
  phone: string;
  ticket: string;
  password: string;
  fullName?: string;
  regionId?: string;
  vehicleType?: string;
  plateNumber?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export class DriverOnboarding {
  constructor(private readonly deps: { store: DriverStore; otp: OtpService }) {}

  private async classify(local: string): Promise<{ mode: OnboardingMode | "none"; driver?: DriverIdentity }> {
    const driver = await this.deps.store.findDriverByLocalPhone(local);
    if (driver) return driver.activated ? { mode: "none" } : { mode: "activate", driver };
    return (await this.deps.store.isPhoneAvailable(local)) ? { mode: "signup" } : { mode: "none" };
  }

  // رقم غير مؤهل (مفعَّل مسبقاً، أو لعميل/متجر) ⇒ لا رسالة ولا تكلفة، والاستجابة العامة موحَّدة.
  async requestOtp(input: { phone: string; ip?: string | null }): Promise<RequestOutcome> {
    const normalized = toOtpPhone(input.phone);
    if (!normalized) return { status: "invalid_phone" };
    const local = normalized.slice(3);
    return this.deps.otp.request({
      phone: normalized,
      purpose: "driver_activate",
      ip: input.ip,
      eligible: async () => (await this.classify(local)).mode !== "none",
    });
  }

  async verifyOtp(input: { phone: string; code: string }): Promise<VerifyOnboardingOutcome> {
    const normalized = toOtpPhone(input.phone);
    const v = await this.deps.otp.verify({ phone: input.phone, purpose: "driver_activate", code: input.code });
    if (v.status !== "verified" || !normalized) return { status: "rejected", internal: { reason: v.status === "verified" ? "malformed" : v.internal.reason } };
    // الوضع يُكشَف بعد إثبات الملكية فقط (المستخدم أثبت أنه صاحب الرقم) — ليس تسريباً لتسجيل رقم غيره.
    const c = await this.classify(normalized.slice(3));
    if (c.mode === "none") return { status: "rejected", internal: { reason: "ineligible" } };
    return { status: "verified", ticket: v.ticket, mode: c.mode };
  }

  async complete(input: CompleteInput): Promise<CompleteOutcome> {
    const normalized = toOtpPhone(input.phone);
    if (!normalized || typeof input.password !== "string") return { status: "invalid_request" };
    const local = normalized.slice(3);

    // كل الفحوص القابلة للخطأ قبل استهلاك التذكرة، حتى لا تُحرق التذكرة (ورسالة 0.19$) بخطأ إدخال.
    const issue = checkPassword(input.password, local);
    if (issue) return { status: "weak_password", issue };
    const c = await this.classify(local);
    if (c.mode === "none") return { status: "invalid_session" };

    const signup =
      c.mode === "signup"
        ? {
            fullName: clean(input.fullName, 80),
            regionId: String(input.regionId ?? ""),
            vehicleType: clean(input.vehicleType, 40) || undefined,
            plateNumber: clean(input.plateNumber, 20) || undefined,
          }
        : null;
    if (signup && (signup.fullName.length < 2 || !UUID.test(signup.regionId))) return { status: "invalid_request" };

    const redeemed = await this.deps.otp.redeemTicket({ phone: input.phone, purpose: "driver_activate", ticket: input.ticket });
    if (!redeemed) return { status: "invalid_session" };

    if (c.mode === "activate" && c.driver) {
      const r = await this.deps.store.activateDriver(c.driver.id, input.password);
      return r.ok ? { status: "ok", mode: "activate" } : { status: "failed" };
    }
    const r = await this.deps.store.createDriver({ local, password: input.password, ...(signup as NonNullable<typeof signup>) });
    if (r.ok) return { status: "ok", mode: "signup" };
    return r.code === "phone-taken" ? { status: "conflict" } : r.code === "region-invalid" ? { status: "invalid_request" } : { status: "failed" };
  }
}
