import { DEFAULT_OTP_LIMITS, type OtpLimits } from "./limits";

export class OtpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpConfigError";
  }
}

export interface OtpSettings {
  pepper: string;
  limits: OtpLimits;
}

export const MIN_PEPPER_LENGTH = 32;

// أي قيمة بيئة غير صالحة تفشل صراحةً (fail closed) بدل الرجوع بصمت لقيمة افتراضية:
// حد مضبوط بخطأ مطبعي هو بالضبط ما يعيد ثغرة استنزاف الرصيد دون أن يلاحظ أحد.
function intFromEnv(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new OtpConfigError(`otp-config-invalid:${name}`);
  const n = Number(raw);
  if (n < min || n > max) throw new OtpConfigError(`otp-config-invalid:${name}`);
  return n;
}

export function loadOtpSettings(env: Record<string, string | undefined>, defaults: OtpLimits = DEFAULT_OTP_LIMITS): OtpSettings {
  const pepper = env.OTP_PEPPER ?? "";
  if (pepper.length < MIN_PEPPER_LENGTH) throw new OtpConfigError("otp-config-invalid:OTP_PEPPER");
  const d = defaults;
  return {
    pepper,
    limits: {
      ttlSeconds: intFromEnv(env, "OTP_TTL_SECONDS", d.ttlSeconds, 60, 900),
      cooldownSeconds: intFromEnv(env, "OTP_COOLDOWN_SECONDS", d.cooldownSeconds, 10, 3600),
      phoneHourly: intFromEnv(env, "OTP_PHONE_HOURLY", d.phoneHourly, 1, 100),
      phoneDaily: intFromEnv(env, "OTP_PHONE_DAILY", d.phoneDaily, 1, 500),
      ipHourly: intFromEnv(env, "OTP_IP_HOURLY", d.ipHourly, 1, 1000),
      globalDaily: intFromEnv(env, "OTP_GLOBAL_DAILY", d.globalDaily, 1, 100000),
      ticketTtlSeconds: intFromEnv(env, "OTP_TICKET_TTL_SECONDS", d.ticketTtlSeconds, 60, 3600),
      windowSeconds: intFromEnv(env, "OTP_WINDOW_SECONDS", d.windowSeconds, 60, 86400),
      windowMaxAttempts: intFromEnv(env, "OTP_WINDOW_MAX_ATTEMPTS", d.windowMaxAttempts, 3, 100),
      degradedWindowSeconds: intFromEnv(env, "OTP_DEGRADED_WINDOW_SECONDS", d.degradedWindowSeconds, 60, 3600),
      degradedThreshold: intFromEnv(env, "OTP_DEGRADED_THRESHOLD", d.degradedThreshold, 1, 10),
    },
  };
}
