import { clientIpFromHeaders } from "../otp/clientIp";
import { OtpConfigError } from "../otp/config";
import type { DriverLogin } from "./login";
import type { DriverOnboarding } from "./onboarding";

// طبقة HTTP الرفيعة لمسارات المندوب. مبدآن:
//  1) لا يخرج للمتصفح أي حقل internal ولا رسالة خطأ خام — أخطاء الخادم تُسجَّل باسم الصنف فقط
//     (الجسم قد يحوي رقماً أو رمزاً) وتُرجَع كـ"server-error" موحَّد.
//  2) الاستجابات العامة لا تكشف تسجيل الرقم: طلب الرمز يرجع ok لأي رقم صالح، والتحقق يرجع
//     invalid-code لكل الرفض، والدخول يرجع invalid-credentials لكل الفشل.
export interface DriverAuthDeps {
  onboarding: DriverOnboarding;
  login: DriverLogin;
}

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...NO_STORE, ...extra } });

async function body(req: Request): Promise<Record<string, unknown> | null> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function createDriverAuthHandlers(getDeps: () => DriverAuthDeps) {
  const guarded = (name: string, fn: (deps: DriverAuthDeps, b: Record<string, unknown>, req: Request) => Promise<Response>) =>
    async (req: Request): Promise<Response> => {
      try {
        const b = await body(req);
        if (!b) return json({ error: "invalid-request" }, 400);
        return await fn(getDeps(), b, req);
      } catch (e) {
        console.error(`[driver-auth:${name}]`, e instanceof Error ? e.name : "unknown");
        return e instanceof OtpConfigError ? json({ error: "service-unavailable" }, 503) : json({ error: "server-error" }, 500);
      }
    };

  return {
    otpRequest: guarded("otp-request", async ({ onboarding }, b, req) => {
      const r = await onboarding.requestOtp({ phone: str(b.phone), ip: clientIpFromHeaders(req.headers) });
      if (r.status === "invalid_phone") return json({ error: "invalid-phone" }, 400);
      if (r.status === "unavailable") return json({ error: "service-unavailable" }, 503);
      if (r.status === "rate_limited") {
        return json({ error: "too-many-requests", ...(r.retryAfterSeconds ? { retryAfter: r.retryAfterSeconds } : {}) }, 429);
      }
      if (!r.internal.delivered && !r.internal.suppressed) console.error("[driver-auth:otp-request] send-failed", r.internal.error ?? "unknown");
      return json({ ok: true });
    }),

    otpVerify: guarded("otp-verify", async ({ onboarding }, b) => {
      const r = await onboarding.verifyOtp({ phone: str(b.phone), code: str(b.code) });
      return r.status === "verified" ? json({ ok: true, ticket: r.ticket, mode: r.mode }) : json({ error: "invalid-code" }, 400);
    }),

    complete: guarded("complete", async ({ onboarding }, b) => {
      const r = await onboarding.complete({
        phone: str(b.phone), ticket: str(b.ticket), password: str(b.password),
        fullName: str(b.fullName), regionId: str(b.regionId), vehicleType: str(b.vehicleType), plateNumber: str(b.plateNumber),
      });
      switch (r.status) {
        case "ok": return json({ ok: true, mode: r.mode });
        case "weak_password": return json({ error: "weak-password", issue: r.issue }, 400);
        case "invalid_request": return json({ error: "invalid-request" }, 400);
        case "invalid_session": return json({ error: "invalid-session" }, 400);
        case "conflict": return json({ error: "invalid-session" }, 400); // لا يُكشف أن الرقم صار مسجَّلاً
        default: return json({ error: "server-error" }, 500);
      }
    }),

    login: guarded("login", async ({ login }, b, req) => {
      const r = await login.login({ phone: str(b.phone), password: str(b.password), ip: clientIpFromHeaders(req.headers) });
      if (r.status === "ok") return json({ ok: true, session: { access_token: r.session.access_token, refresh_token: r.session.refresh_token } });
      if (r.status === "locked") return json({ error: "too-many-attempts", retryAfter: r.retryAfterSeconds }, 429, { "Retry-After": String(r.retryAfterSeconds) });
      return json({ error: "invalid-credentials" }, 401);
    }),
  };
}
