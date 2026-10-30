import { hashIp } from "./crypto";
import { DEFAULT_LOGIN_THROTTLE, type LoginThrottleLimits } from "./limits";
import { OtpStoreError } from "./service";
import type { OtpDb } from "./types";

export type ThrottleBegin =
  | { status: "allowed" }
  | { status: "locked"; retryAfterSeconds: number; internal: { reason: string } };

export function throttleSubject(kind: string, phone: string): string {
  return `${kind}:${phone}`;
}

// حجز محاولة دخول **قبل** فحص كلمة المرور (0081): الحجز ذرّي بالقاعدة فلا يتجاوز طلبٌ متوازٍ
// السقف. النجاح يمسح محاولات المفتاح (clear)؛ كل ما عدا ذلك يبقى محسوباً كفشل.
export class LoginThrottle {
  constructor(private readonly deps: { db: OtpDb; pepper: string; limits?: LoginThrottleLimits }) {}

  async begin(input: { subject: string; ip?: string | null }): Promise<ThrottleBegin> {
    const l = this.deps.limits ?? DEFAULT_LOGIN_THROTTLE;
    const { data, error } = await this.deps.db.rpc("login_throttle_begin", {
      p_subject: input.subject,
      p_ip_hash: input.ip ? hashIp(this.deps.pepper, input.ip) : null,
      p_short_window_seconds: l.shortWindowSeconds,
      p_short_max: l.shortMax,
      p_long_window_seconds: l.longWindowSeconds,
      p_long_max: l.longMax,
      p_ip_window_seconds: l.ipWindowSeconds,
      p_ip_max: l.ipMax,
    });
    if (error) throw new OtpStoreError(`login_throttle_begin: ${error.message}`);
    const r = data as { status?: string; reason?: string; retry_after?: number } | null;
    if (r?.status === "allowed") return { status: "allowed" };
    if (r?.status === "locked") {
      return { status: "locked", retryAfterSeconds: Number(r.retry_after) || 60, internal: { reason: String(r.reason ?? "unknown") } };
    }
    throw new OtpStoreError("login_throttle_begin: unexpected-result");
  }

  async clear(subject: string): Promise<void> {
    const { error } = await this.deps.db.rpc("login_throttle_clear", { p_subject: subject });
    if (error) throw new OtpStoreError(`login_throttle_clear: ${error.message}`);
  }
}
