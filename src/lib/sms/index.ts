import "server-only";
import type { SmsProvider } from "./types";
import { D7SmsProvider } from "./d7Provider";
import { DevConsoleSmsProvider } from "./devConsoleProvider";

// نقطة اختيار المزوّد الوحيدة بالتطبيق كله — كل كود آخر يستدعي
// getSmsProvider().sendSms(...) فقط، لا يعرف أيهما فعّال.
//
// الحالة الآن: D7_API_TOKEN غير موجود (لا حساب D7 بعد) → DevConsoleSmsProvider
// تلقائياً. بمجرد إضافة D7_API_TOKEN فعلياً لبيئة الإنتاج، يتحوّل تلقائياً
// لـD7SmsProvider الحقيقي بلا أي تعديل كود إضافي — هذا هو "الربط الصغير"
// المقصود.
export function getSmsProvider(): SmsProvider {
  if (process.env.D7_API_TOKEN) {
    return new D7SmsProvider();
  }
  return new DevConsoleSmsProvider();
}
