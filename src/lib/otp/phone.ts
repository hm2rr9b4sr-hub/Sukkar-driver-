// تطبيع رقم OTP إلى الصيغة الموحَّدة 9677XXXXXXXX. نفس قواعد src/lib/phone.ts
// (يقبل +967 / 00967 / 967 / 0 / محلي) لكنه **صارم**: أي أرقام زائدة عن 9 بعد
// التطبيع ⇒ رقم غير صالح، بدل القص الصامت الذي يطبّقه toLocalPhone — هنا القص
// كان سيرسل رمزاً (وتكلفة) لرقم لم يكتبه المستخدم. النسخة مكتفية ذاتياً لأن
// النواة تُنسَخ إلى sukkar-driver (لا alias @/).
export function toOtpPhone(input: string): string | null {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("00967")) d = d.slice(5);
  else if (d.startsWith("967") && d.length > 9) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return /^7\d{8}$/.test(d) ? `967${d}` : null;
}
