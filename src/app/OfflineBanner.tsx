"use client";
import { useEffect, useState } from "react";

// نسخة من src/components/OfflineBanner.tsx بمشروع سُكّر الرئيسي — للمندوب
// أهم: يتحرك بتغطية متقطعة أثناء التوصيل. P0-4.3 — يعالج فقدان الاتصال أثناء استخدام التطبيق فعلياً (السيناريو
// الأكثر واقعية باليمن: تغطية متقطعة، لا انعدام كامل للاتصال منذ اللحظة
// الأولى). Capacitor بمعمارية Remote URL لا يعرض أي رسالة مفهومة تلقائياً
// عند انقطاع الاتصال بمنتصف الاستخدام — فقط طلبات fetch فاشلة صامتة.
//
// فتح التطبيق أول مرة بلا إنترنت إطلاقاً لا يصل لهذا المكوّن أصلاً (الصفحة
// البعيدة لم تُحمَّل) — يغطيه server.errorPath → www/offline.html
// بـcapacitor.config.ts بلا أي كود أصلي.
//
// مقصور على التطبيق الأصلي فقط (Capacitor.isNativePlatform()) — لا يغيّر
// أي شيء بتجربة المتصفح العادية عمداً، تفادياً لأي أثر جانبي غير مطلوب
// على تجربة الويب الحالية العاملة أصلاً.
export default function OfflineBanner() {
  const [isNative, setIsNative] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!mounted || !Capacitor.isNativePlatform()) return;
      setIsNative(true);
      setOffline(!navigator.onLine);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [isNative]);

  if (!isNative || !offline) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-white text-center"
      style={{ background: "#DC2626" }}
      role="alert"
    >
      📡 لا يوجد اتصال بالإنترنت — تحقّق من الشبكة
    </div>
  );
}
