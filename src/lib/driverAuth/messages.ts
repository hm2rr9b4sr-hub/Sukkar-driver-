// رسائل الواجهة (آمنة للمتصفح) لرموز أخطاء مسارات /api/auth/driver/*. موحَّدة عمداً: لا رسالة تفرّق بين
// رقم مسجَّل وغير مسجَّل ولا بين "حساب غير مفعَّل" و"كلمة مرور خاطئة".
const PASSWORD_ISSUES: Record<string, string> = {
  too_short: "كلمة المرور قصيرة — 8 أحرف على الأقل",
  too_long: "كلمة المرور طويلة جداً",
  common: "كلمة مرور شائعة وسهلة التخمين — اختر غيرها",
  sequential: "تجنّب الأرقام أو الأحرف المتسلسلة",
  repeated: "تجنّب تكرار نفس الحرف",
  contains_phone: "لا تستخدم رقم هاتفك ضمن كلمة المرور",
};

function wait(seconds?: number) {
  if (!seconds) return "";
  const m = Math.ceil(seconds / 60);
  return m <= 1 ? " (بعد دقيقة)" : m < 120 ? ` (بعد ${m} دقيقة)` : " (لاحقاً)";
}

export function driverAuthErrorMessage(error: string | undefined, extra: { issue?: string; retryAfter?: number } = {}): string {
  switch (error) {
    case "invalid-phone": return "رقم الهاتف غير صحيح — 9 أرقام تبدأ بـ7";
    case "invalid-credentials": return "رقم الهاتف أو كلمة المرور غير صحيحة. إن كانت هذه أول مرة فاضغط «تفعيل الحساب / تسجيل جديد»";
    case "too-many-attempts": return `محاولات كثيرة — انتظر قليلاً قبل المحاولة مجدداً${wait(extra.retryAfter)}`;
    case "too-many-requests": return `طلبات كثيرة — انتظر قليلاً قبل طلب رمز جديد${wait(extra.retryAfter)}`;
    case "service-unavailable": return "الخدمة غير متاحة مؤقتاً — حاول لاحقاً أو تواصل مع الدعم";
    case "invalid-code": return "الرمز غير صحيح أو منتهي — اطلب رمزاً جديداً";
    case "weak-password": return PASSWORD_ISSUES[extra.issue ?? ""] ?? "كلمة المرور غير مقبولة";
    case "invalid-session": return "انتهت صلاحية التحقق — ابدأ من جديد بطلب رمز جديد";
    case "invalid-request": return "تأكد من تعبئة الحقول المطلوبة";
    case "network": return "تعذّر الاتصال بالسيرفر — تحقّق من الإنترنت وحاول مجدداً";
    default: return "حدث خطأ غير متوقع — حاول مجدداً";
  }
}
