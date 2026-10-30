// حدود OTP الافتراضية — تُمرَّر كلها للدالة SQL (otp_issue/otp_verify) فتُفرَض
// ذرّياً بالقاعدة، والتطبيق لا يعدّ شيئاً بنفسه.
//
// الأرقام مبنية على حجم سُكّر الفعلي (عشرات الحسابات): الحد لكل رقم هو الحماية
// الأساسية (يحمي الرقم المستهدف ويحمي الرصيد)، وحد الـIP متساهل عمداً (20/ساعة)
// لأن شبكات الجوال اليمنية تُشارك عنوان IP بين كثيرين (CGNAT) — هدفه كبح
// السكربتات لا تقييد المستخدمين. السقف العام اليومي صمام أمان للرصيد كله.
export interface OtpLimits {
  ttlSeconds: number;         // صلاحية الرمز
  cooldownSeconds: number;    // أقل فاصل بين طلبين لنفس (رقم، غرض)
  phoneHourly: number;        // رموز/ساعة لكل رقم (كل الأغراض)
  phoneDaily: number;         // رموز/24 ساعة لكل رقم
  ipHourly: number;           // رموز/ساعة لكل IP (مُجزَّأ)
  globalDaily: number;        // رموز/24 ساعة عبر المنصة كلها
  ticketTtlSeconds: number;   // صلاحية تذكرة ما بعد التحقق
  windowSeconds: number;      // نافذة سقف الفشل التراكمي
  windowMaxAttempts: number;  // أقصى محاولات فاشلة تراكمية بالنافذة لكل (رقم، غرض)
  degradedWindowSeconds: number; // نافذة اكتشاف عطل القناة (آخر إرسالات فاشلة)
  degradedThreshold: number;     // عدد الإرسالات الفاشلة المتتالية الذي يعلن العطل
}

export const DEFAULT_OTP_LIMITS: OtpLimits = {
  ttlSeconds: 300,
  cooldownSeconds: 60,
  phoneHourly: 3,
  phoneDaily: 6,
  ipHourly: 20,
  globalDaily: 200,
  ticketTtlSeconds: 600,
  windowSeconds: 1800,
  windowMaxAttempts: 10,
  degradedWindowSeconds: 900,
  degradedThreshold: 2,
};

// حدود الدخول بكلمة المرور (0081): الحماية الأساسية 5 محاولات/15د و20/يوم لكل حساب —
// تحصر التخمين المستهدف بـ20 محاولة يومياً، وتكفي لمن ينسى كلمته مرتين أو ثلاثاً.
export interface LoginThrottleLimits {
  shortWindowSeconds: number;
  shortMax: number;
  longWindowSeconds: number;
  longMax: number;
  ipWindowSeconds: number;
  ipMax: number;
}

export const DEFAULT_LOGIN_THROTTLE: LoginThrottleLimits = {
  shortWindowSeconds: 900,
  shortMax: 5,
  longWindowSeconds: 86400,
  longMax: 20,
  ipWindowSeconds: 3600,
  ipMax: 30,
};
