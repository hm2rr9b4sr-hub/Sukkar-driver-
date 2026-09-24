"use client";
import { useEffect } from "react";

// نسخة من src/components/CapacitorBackButton.tsx بمشروع سُكّر الرئيسي
// (كان زر الرجوع بأندرويد يُبتلَع بتطبيق المندوب أيضاً). P0-4.2 — بمعمارية Capacitor Remote URL، Capacitor.App لا تُسجَّل أي معالج
// افتراضي لزر الرجوع الفيزيائي بأندرويد من تلقاء نفسها: بلا مستمع صريح هنا،
// أي ضغطة رجوع بصفحة ليس لها history سابق بنفس الـWebView (الصفحة الجذر
// عادة) "تُبتلع" بصمت — لا رجوع، لا تصغير، لا خروج، لا شيء يحدث إطلاقاً
// (موثَّق رسمياً بمشاكل Capacitor/Ionic المعروفة). هذا المكوّن يُصلح ذلك:
// إن كان بالإمكان الرجوع بتاريخ المتصفح داخل الصفحة يرجع، وإلا يُغلق
// التطبيق (سلوك أندرويد القياسي المتوقَّع عند الرجوع من الشاشة الجذر).
//
// لا تأثير إطلاقاً على تجربة الويب العادية (المتصفح/الموقع المباشر) —
// Capacitor.isNativePlatform() ترجع false هناك فيُصبح هذا المكوّن no-op
// تماماً. يُستورَد ديناميكياً بلا SSR لأن حزمة @capacitor/core تعتمد على
// window غير المتوفر وقت التصيير بالخادم.
export default function CapacitorBackButton() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });
      cleanup = () => handle.remove();
    })();

    return () => cleanup?.();
  }, []);

  return null;
}
