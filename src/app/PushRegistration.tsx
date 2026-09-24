"use client";
import { useEffect } from "react";
import { useDriverAuth } from "@/lib/DriverAuthContext";
import { initPushListeners, registerForPush } from "@/lib/nativePush";

// no-op كامل على الويب العادي (راجع lib/nativePush.ts). بالتطبيق الأصلي:
// مستمعو الضغط فوراً، والتسجيل لأي مندوب مسجَّل — بما فيه "بانتظار
// المراجعة"، لأن قرار الأدمن بالقبول/الرفض نفسه يصل كإشعار.
export default function PushRegistration() {
  const { driver } = useDriverAuth();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initPushListeners().then((c) => { cleanup = c; }).catch(() => {});
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    if (driver) registerForPush().catch(() => {});
  }, [driver?.id]);

  return null;
}
