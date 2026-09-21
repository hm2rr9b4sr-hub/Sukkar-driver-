"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMyDeliveries,
  driverSetStatus,
  driverUpdateLocation,
  driverRespondToOffer,
  UIDriverDeliveryDetail,
} from "@/lib/data";

const STATUS_LABELS: Record<string, string> = {
  assigned: "بانتظار ردّك",
  accepted: "مقبول — بانتظار الاستلام",
  picked_up: "تم الاستلام",
  on_the_way: "في الطريق",
  delivered: "تم التسليم",
};

const LOCATION_UPDATE_INTERVAL_MS = 25000;

interface IncomingOffer {
  deliveryId: string;
  message: string;
}

export default function DriverHomePage() {
  const router = useRouter();
  const { driver, loading, refreshDriver } = useDriverAuth();
  const [deliveries, setDeliveries] = useState<UIDriverDeliveryDetail[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [offer, setOffer] = useState<IncomingOffer | null>(null);
  const [offerResponding, setOfferResponding] = useState(false);
  const [offerNotice, setOfferNotice] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !driver) router.replace("/login");
  }, [loading, driver, router]);

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    const list = await fetchMyDeliveries();
    setDeliveries(list);
    setDeliveriesLoading(false);
  }, []);

  useEffect(() => {
    if (driver) loadDeliveries();
  }, [driver, loadDeliveries]);

  // ── حلقة تحديث الموقع أثناء "متاح" — تتوقف تلقائياً عند إيقاف العمل أو
  // مغادرة الصفحة. setInterval + getCurrentPosition (بدل watchPosition
  // المستمر) لتفادي استهلاك بطارية أعلى بلا داعٍ. ──
  const stopLocationLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const pushLocationOnce = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        driverUpdateLocation(pos.coords.latitude, pos.coords.longitude);
        setLocationError(null);
      },
      () => setLocationError("تعذّر تحديد موقعك — تأكد من تفعيل صلاحية الموقع"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const startLocationLoop = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("المتصفح لا يدعم تحديد الموقع");
      return;
    }
    pushLocationOnce();
    intervalRef.current = setInterval(pushLocationOnce, LOCATION_UPDATE_INTERVAL_MS);
  }, [pushLocationOnce]);

  useEffect(() => {
    if (driver?.status === "available") startLocationLoop();
    else stopLocationLoop();
    return () => stopLocationLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.status]);

  async function handleToggleWork() {
    if (!driver) return;
    setTogglingStatus(true);
    const next = driver.status === "offline" ? "available" : "offline";
    const { error } = await driverSetStatus(next);
    setTogglingStatus(false);
    if (!error) {
      await refreshDriver();
      if (next === "available") await loadDeliveries();
    }
  }

  // ── Realtime: عروض جديدة + تحديثات مباشرة على توصيلات المندوب ──
  useEffect(() => {
    if (!driver) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`driver-${driver.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "driver_notifications", filter: `driver_id=eq.${driver.id}` },
        (payload) => {
          const row = payload.new as { delivery_id: string | null; type: string; message: string };
          if (row.type === "new_offer" && row.delivery_id) {
            setOffer({ deliveryId: row.delivery_id, message: row.message });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries", filter: `driver_id=eq.${driver.id}` },
        () => {
          loadDeliveries();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [driver, loadDeliveries]);

  async function handleOfferResponse(accept: boolean) {
    if (!offer) return;
    setOfferResponding(true);
    const { ok, error } = await driverRespondToOffer(offer.deliveryId, accept);
    setOfferResponding(false);
    if (!ok && error === "offer-no-longer-available") {
      setOfferNotice("لم يعد هذا العرض متاحاً");
    } else if (!ok) {
      setOfferNotice(error ?? "تعذّر إرسال ردّك، حاول مجدداً");
    }
    setOffer(null);
    await loadDeliveries();
    setTimeout(() => setOfferNotice(null), 4000);
  }

  if (loading || !driver) {
    return <p className="text-center py-10" style={{ color: "var(--muted)" }}>جارٍ التحميل...</p>;
  }

  const isWorking = driver.status !== "offline";

  return (
    <div className="flex flex-col gap-5">
      {/* بانر عرض جديد */}
      {offer && (
        <div className="rounded-3xl p-4 border-2 shadow-md" style={{ background: "#FEF3C7", borderColor: "var(--gold)" }}>
          <p className="font-bold text-sm mb-3">🔔 عرض توصيل جديد</p>
          <p className="text-sm mb-4">{offer.message}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleOfferResponse(true)}
              disabled={offerResponding}
              className="flex-1 py-3 rounded-2xl font-bold text-white disabled:opacity-60"
              style={{ background: "#16A34A" }}
            >
              ✅ قبول
            </button>
            <button
              onClick={() => handleOfferResponse(false)}
              disabled={offerResponding}
              className="flex-1 py-3 rounded-2xl font-bold text-white disabled:opacity-60"
              style={{ background: "#DC2626" }}
            >
              ❌ رفض
            </button>
          </div>
        </div>
      )}

      {offerNotice && (
        <div className="text-center text-sm font-semibold rounded-xl py-2" style={{ background: "var(--card)", color: "var(--muted)" }}>
          {offerNotice}
        </div>
      )}

      {/* حالة العمل */}
      <div className="rounded-3xl p-5 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>الحالة الحالية</p>
            <p className="text-lg font-black" style={{ color: "var(--gold)" }}>
              {driver.status === "available" ? "متاح لاستقبال الطلبات" : driver.status === "busy" ? "مشغول بتوصيل حالي" : "غير متصل"}
            </p>
          </div>
          <span className="text-3xl">{driver.status === "available" ? "🟢" : driver.status === "busy" ? "🟠" : "⚪️"}</span>
        </div>

        {driver.status !== "busy" && (
          <button
            onClick={handleToggleWork}
            disabled={togglingStatus}
            className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-60"
            style={{ background: isWorking ? "#DC2626" : "#16A34A" }}
          >
            {togglingStatus ? "..." : isWorking ? "إنهاء العمل" : "بدء العمل"}
          </button>
        )}
        {driver.status === "busy" && (
          <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
            الحالة "مشغول" تُحدَّد تلقائياً أثناء تنفيذ توصيل — لا يمكن تغييرها يدوياً.
          </p>
        )}

        {locationError && (
          <p className="text-xs text-red-600 mt-3 text-center">{locationError}</p>
        )}
      </div>

      {/* الطلبات الحالية */}
      <div>
        <h2 className="font-bold mb-2 px-1">طلباتي الحالية</h2>
        {deliveriesLoading ? (
          <p className="text-sm px-1" style={{ color: "var(--muted)" }}>جارٍ التحميل...</p>
        ) : deliveries.length === 0 ? (
          <div className="rounded-2xl p-6 text-center border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <p style={{ color: "var(--muted)" }}>لا توجد طلبات حالياً</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {deliveries.map((d) => (
              <Link
                key={d.id}
                href={`/deliveries/${d.id}`}
                className="block rounded-2xl p-4 border"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">#{d.orderNumber}</span>
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
                    style={{ background: "var(--gold)" }}
                  >
                    {STATUS_LABELS[d.status] ?? d.status}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>{d.storeName}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/earnings"
        className="text-center py-3 rounded-2xl font-semibold border"
        style={{ borderColor: "var(--border)", color: "var(--gold)" }}
      >
        💰 أرباحي
      </Link>
    </div>
  );
}
