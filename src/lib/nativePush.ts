"use client";
import { createClient } from "@/lib/supabase/client";

// Push أصلي لتطبيق المندوب (migration 0062 بمستودع sukkar،
// docs/push_notifications_architecture.md هناك). نسخة من lib/nativePush.ts
// بالمشروع الرئيسي مع app="driver" وقنوات Fleet. كل
// الدوال no-op خارج التطبيق الأصلي — الموقع العادي لا يتأثر إطلاقاً. تُستورَد
// حزم @capacitor ديناميكياً (تعتمد على window، نفس نمط CapacitorBackButton).
const APP = "driver" as const;
const TOKEN_KEY = "sukkar_driver_push_token";

function readStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function storeToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

async function nativePlatform(): Promise<"ios" | "android" | null> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : null;
}

// مستمعو الضغط على الإشعار — يُسجَّلون مرة واحدة عند فتح التطبيق، قبل أي
// تسجيل دخول، حتى يُلتقط ضغط إشعار فتح التطبيق من حالة الإغلاق (Capacitor
// يحتفظ بالحدث حتى يُسجَّل مستمع).
export async function initPushListeners(): Promise<() => void> {
  const platform = await nativePlatform();
  if (!platform) return () => {};
  const { PushNotifications } = await import("@capacitor/push-notifications");

  if (platform === "android") {
    // fleet_offers: عروض التوصيل/الإسناد/الإلغاء — أهمية قصوى (5 = IMPORTANCE_MAX:
    // منبثق heads-up + صوت + اهتزاز) لأن مهلة العرض 60 ثانية فقط.
    await PushNotifications.createChannel({
      id: "fleet_offers", name: "عروض التوصيل", importance: 5, sound: "default", visibility: 1, vibration: true,
    }).catch(() => {});
    await PushNotifications.createChannel({
      id: "general", name: "إشعارات الحساب والتسويات", importance: 3, visibility: 1,
    }).catch(() => {});
  }

  const handles = await Promise.all([
    PushNotifications.addListener("registration", async ({ value }) => {
      storeToken(value);
      await createClient().rpc("register_push_device", { p_app: APP, p_platform: platform, p_token: value });
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const url = (notification.data as { url?: string } | undefined)?.url;
      if (url && url.startsWith("/")) window.location.assign(url);
    }),
  ]);
  return () => handles.forEach((h) => h.remove());
}

// بعد تسجيل الدخول: يطلب الإذن (مرة واحدة — iOS/Android 13+ لا يعيدان
// السؤال بعد الرفض) ثم يسجّل الجهاز؛ حدث "registration" أعلاه يربط التوكن
// بالمستخدم الحالي. يُستدعى بكل فتح للتطبيق بجلسة قائمة — التوكن قد يتغيّر.
export async function registerForPush(): Promise<void> {
  const platform = await nativePlatform();
  if (!platform) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
}

// قبل signOut (الـRPC يحتاج الجلسة): فك ربط الجهاز بالحساب حتى لا تصل
// إشعارات حساب خرج منه. الجهاز نفسه يبقى مسجَّلاً أصلياً للدخول التالي.
export async function unregisterFromPush(): Promise<void> {
  if (!(await nativePlatform())) return;
  const token = readStoredToken();
  if (!token) return;
  await createClient().rpc("unregister_push_device", { p_app: APP, p_token: token });
}
