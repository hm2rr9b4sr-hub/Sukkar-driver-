// ملاحظة توافق: Array.from بدل [...string] لأن tsconfig بلا target (ES5) في المشروعين — الفرق اكتُشف باختبار المزامنة.
// سياسة كلمة المرور عند التفعيل. الحماية الأساسية ليست التعقيد بل حدود المحاولات (loginThrottle):
// 20 محاولة/يوم لكل حساب. لذلك لا نفرض تركيبة معقدة (مستخدمو الجوال)، بل نمنع فقط ما يُخمَّن
// بالقوائم الشائعة: قصيرة، شائعة، متسلسلة، مكررة، أو مبنية على رقم هاتف الحساب.
export type PasswordIssue = "too_short" | "too_long" | "common" | "sequential" | "repeated" | "contains_phone";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72; // حد bcrypt لدى GoTrue: ما بعده يُقصّ بصمت

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "11223344", "12341234",
  "password", "password1", "passw0rd", "qwertyui", "qwertyuiop", "iloveyou", "abcd1234", "abc12345",
  "admin123", "sukkar123", "sukkar1234", "12121212", "13131313", "88888888", "99999999", "123123123",
  "٠١٢٣٤٥٦٧٨", "١٢٣٤٥٦٧٨", "١٢٣٤٥٦٧٨٩",
]);

function isSequential(s: string): boolean {
  const codes = Array.from(s).map((c) => c.codePointAt(0) as number);
  if (codes.length < 2) return false;
  const step = codes[1] - codes[0];
  if (Math.abs(step) !== 1) return false;
  return codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
}

export function checkPassword(password: string, phone?: string): PasswordIssue | null {
  if (typeof password !== "string" || Array.from(password).length < MIN_PASSWORD_LENGTH) return "too_short";
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return "too_long";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "common";
  if (new Set(Array.from(lower)).size <= 2) return "repeated";
  if (isSequential(lower)) return "sequential";
  const local = String(phone ?? "").replace(/\D/g, "").slice(-9);
  if (local.length === 9 && password.replace(/\D/g, "").includes(local)) return "contains_phone";
  return null;
}
