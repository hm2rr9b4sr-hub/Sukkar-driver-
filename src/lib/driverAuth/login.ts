import { throttleSubject, type LoginThrottle } from "../otp/loginThrottle";
import { toOtpPhone } from "../otp/phone";
import type { DriverStore, PasswordSignIn, SessionTokens } from "./types";

export type LoginOutcome =
  | { status: "ok"; session: SessionTokens }
  | { status: "invalid_credentials" }
  | { status: "locked"; retryAfterSeconds: number };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// الدخول اليومي: رقم + كلمة مرور، بلا OTP. الجلسة جلسة Supabase Auth حقيقية (signInWithPassword)
// تصدر من الخادم بعد حجز محاولة بجدول الحدود (0081) — GoTrue وحده لا يقفل حساباً بعينه.
//  - الحجز قبل فحص كلمة المرور ذرّي ⇒ لا يتجاوز طلب متوازٍ السقف.
//  - فشل الدخول لأي سبب (رقم مجهول، حساب غير مفعَّل، كلمة خاطئة، حساب محظور) ⇒ استجابة واحدة
//    وبزمن أدنى ثابت تقريباً (minFailureMs) فلا يكشف الفرقُ بين الحالات تسجيلَ الرقم.
//  - بوابة موافقة الأدمن لا علاقة لها بالدخول: المعلّق يدخل ويتصفح، ولا يعمل (driver_set_status بالقاعدة).
export class DriverLogin {
  constructor(
    private readonly deps: {
      store: DriverStore;
      throttle: LoginThrottle;
      signIn: PasswordSignIn;
      minFailureMs?: number;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    }
  ) {}

  async login(input: { phone: string; password: string; ip?: string | null }): Promise<LoginOutcome> {
    const now = this.deps.now ?? Date.now;
    const sleep = this.deps.sleep ?? realSleep;
    const started = now();
    const fail = async (): Promise<LoginOutcome> => {
      const wait = (this.deps.minFailureMs ?? 900) - (now() - started);
      if (wait > 0) await sleep(wait);
      return { status: "invalid_credentials" };
    };

    const phone = toOtpPhone(input.phone);
    if (!phone || typeof input.password !== "string" || input.password.length < 1 || input.password.length > 200) return fail();

    const gate = await this.deps.throttle.begin({ subject: throttleSubject("driver", phone), ip: input.ip });
    if (gate.status === "locked") return { status: "locked", retryAfterSeconds: gate.retryAfterSeconds };

    const driver = await this.deps.store.findDriverByLocalPhone(phone.slice(3));
    if (!driver || !driver.activated) return fail();

    const result = await this.deps.signIn(driver.email, input.password);
    // userId يجب أن يطابق صف المندوب: لا جلسة لحساب آخر مهما كان البريد المخزَّن.
    if (!result.ok || result.userId !== driver.id) return fail();

    await this.deps.throttle.clear(throttleSubject("driver", phone));
    return { status: "ok", session: result.session };
  }
}
