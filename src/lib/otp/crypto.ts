import { createHmac, randomBytes, randomInt } from "crypto";
import type { OtpPurpose } from "./types";

// كل التجزئات HMAC-SHA256 بسر OTP_PEPPER مخصَّص (لا مفتاح service_role كما كان
// في 0059-الأصلي) مع فصل نطاقات ("code"/"ticket"/"ip") حتى لا تتصادم قيمتان
// من نوعين مختلفين. الفاصل \0 يمنع غموض الدمج بين الحقول.
function mac(pepper: string, parts: string[]): string {
  return createHmac("sha256", pepper).update(parts.join("\u0000")).digest("hex");
}

// randomInt مصدره CSPRNG (الكود القديم كان Math.random — قابل للتنبؤ نظرياً).
export function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

export function generateTicket(): string {
  return randomBytes(32).toString("hex");
}

export function hashCode(pepper: string, phone: string, purpose: OtpPurpose, code: string): string {
  return mac(pepper, ["code", phone, purpose, code]);
}

export function hashTicket(pepper: string, phone: string, purpose: OtpPurpose, ticket: string): string {
  return mac(pepper, ["ticket", phone, purpose, ticket]);
}

export function hashIp(pepper: string, ip: string): string {
  return mac(pepper, ["ip", ip]);
}

// تجزئة لرمز عشوائي من 32 بايت يُرمى فوراً: تُخزَّن لصفوف "suppressed" فلا يوجد
// رمز يطابقها إطلاقاً (رمز من 6 خانات المرمي كان يمكن تخمينه باحتمال 1e-6/محاولة).
export function unguessableCodeHash(pepper: string, phone: string, purpose: OtpPurpose): string {
  return hashCode(pepper, phone, purpose, randomBytes(32).toString("hex"));
}

// يقبل أرقاماً عربية/فارسية ومسافات (لوحة مفاتيح عربية، لصق من الرسالة).
export function normalizeCodeInput(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, "");
}
