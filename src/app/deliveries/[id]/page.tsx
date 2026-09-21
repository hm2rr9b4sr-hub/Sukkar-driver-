"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";
import {
  fetchMyDeliveries,
  driverMarkPickedUp,
  driverMarkOnTheWay,
  driverMarkDelivered,
  driverReportCashHandoff,
  driverReportException,
  uploadDeliveryExceptionPhoto,
  UIDriverDeliveryDetail,
  DeliveryExceptionType,
} from "@/lib/data";

const EXCEPTION_OPTIONS: { value: DeliveryExceptionType; label: string }[] = [
  { value: "customer_unavailable", label: "عميل غير متجاوب" },
  { value: "customer_refused", label: "عميل رفض الاستلام" },
  { value: "delivery_problem", label: "مشكلة بالمنتج" },
  { value: "driver_issue", label: "عطل بي كمندوب" },
];

function mapsLink(lat: number | null, lng: number | null, fallbackText: string | null) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (fallbackText) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackText)}`;
  }
  return null;
}

export default function DriverDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { driver, loading: authLoading } = useDriverAuth();
  const [delivery, setDelivery] = useState<UIDriverDeliveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cashConfirmed, setCashConfirmed] = useState(false);

  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionType, setExceptionType] = useState<DeliveryExceptionType>("customer_unavailable");
  const [exceptionDescription, setExceptionDescription] = useState("");
  const [exceptionPhoto, setExceptionPhoto] = useState<File | null>(null);
  const [exceptionSubmitting, setExceptionSubmitting] = useState(false);
  const [exceptionDone, setExceptionDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchMyDeliveries();
    let found = list.find((d) => d.id === params.id) ?? null;
    if (!found) {
      // قد يكون التوصيل "delivered" فعلاً (خارج fetchMyDeliveries التي تعيد
      // النشطة فقط) — نسمح بعرض شاشة التسليم/تصريح النقد من سجل التاريخ.
      const { fetchMyDeliveryHistory } = await import("@/lib/data");
      const history = await fetchMyDeliveryHistory();
      const hFound = history.find((d) => d.id === params.id);
      if (hFound) {
        found = { ...hFound, storeName: "", storeLat: null, storeLng: null, storeAddress: null, customerPhone: "", customerLat: null, customerLng: null, deliveryAddress: null };
      }
    }
    setDelivery(found);
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    if (!authLoading && !driver) router.replace("/login");
  }, [authLoading, driver, router]);

  useEffect(() => {
    if (driver) load();
  }, [driver, load]);

  async function handlePickedUp() {
    if (!delivery) return;
    setBusy(true);
    setActionError(null);
    const { ok, error } = await driverMarkPickedUp(delivery.id);
    setBusy(false);
    if (!ok) {
      if (error === "order-requires-customer-confirmation-approval") {
        setActionError("بانتظار موافقة العميل على صورة تأكيد التصميم — حاول لاحقاً");
      } else {
        setActionError(error ?? "تعذّر تنفيذ العملية");
      }
      return;
    }
    await load();
  }

  async function handleOnTheWay() {
    if (!delivery) return;
    setBusy(true);
    setActionError(null);
    const { ok, error } = await driverMarkOnTheWay(delivery.id);
    setBusy(false);
    if (!ok) { setActionError(error ?? "تعذّر تنفيذ العملية"); return; }
    await load();
  }

  async function handleDelivered() {
    if (!delivery || !cashConfirmed) return;
    setBusy(true);
    setActionError(null);
    const { ok, error } = await driverMarkDelivered(delivery.id, true);
    setBusy(false);
    if (!ok) { setActionError(error ?? "تعذّر تنفيذ العملية"); return; }
    await load();
  }

  async function handleCashHandoff() {
    if (!delivery) return;
    setBusy(true);
    setActionError(null);
    const { ok, error } = await driverReportCashHandoff(delivery.id);
    setBusy(false);
    if (!ok) { setActionError(error ?? "تعذّر تنفيذ العملية"); return; }
    await load();
  }

  async function handleSubmitException() {
    if (!delivery) return;
    setExceptionSubmitting(true);
    setActionError(null);
    let photoPath: string | undefined;
    if (exceptionPhoto) {
      const { path, error } = await uploadDeliveryExceptionPhoto(delivery.id, exceptionPhoto);
      if (error) {
        setExceptionSubmitting(false);
        setActionError("تعذّر رفع الصورة — حاول بلا صورة أو مرة أخرى");
        return;
      }
      photoPath = path ?? undefined;
    }
    const { ok, error } = await driverReportException(delivery.id, exceptionType, exceptionDescription || undefined, photoPath);
    setExceptionSubmitting(false);
    if (!ok) { setActionError(error ?? "تعذّر إرسال البلاغ"); return; }
    setExceptionDone(true);
    setShowExceptionForm(false);
  }

  if (authLoading || loading) {
    return <p className="text-center py-10" style={{ color: "var(--muted)" }}>جارٍ التحميل...</p>;
  }
  if (!delivery) {
    return <p className="text-center py-10" style={{ color: "var(--muted)" }}>لم يتم العثور على هذا التوصيل</p>;
  }

  const storeMapsLink = mapsLink(delivery.storeLat, delivery.storeLng, delivery.storeAddress);
  const customerMapsLink = mapsLink(delivery.customerLat, delivery.customerLng, delivery.deliveryAddress);
  const canReportException = delivery.status === "picked_up" || delivery.status === "on_the_way";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>طلب رقم</p>
        <p className="text-xl font-black" style={{ color: "var(--gold)" }}>#{delivery.orderNumber}</p>
      </div>

      {/* المتجر */}
      <div className="rounded-2xl p-4 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="font-bold mb-1">🏪 {delivery.storeName || "المتجر"}</p>
        {storeMapsLink && (
          <a href={storeMapsLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline" style={{ color: "var(--gold)" }}>
            📍 افتح في الخرائط
          </a>
        )}
      </div>

      {/* العميل */}
      <div className="rounded-2xl p-4 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="font-bold mb-1">👤 العميل</p>
        {delivery.customerPhone && (
          <a href={`tel:${delivery.customerPhone}`} className="text-sm font-semibold underline block mb-1" style={{ color: "var(--gold)" }}>
            📞 {delivery.customerPhone}
          </a>
        )}
        {customerMapsLink && (
          <a href={customerMapsLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline" style={{ color: "var(--gold)" }}>
            📍 افتح في الخرائط
          </a>
        )}
      </div>

      {/* النقد */}
      <div className="rounded-2xl p-4 border" style={{ background: "#FEF3C7", borderColor: "var(--gold)" }}>
        <p className="font-bold mb-1">💵 المتوقع تحصيله من العميل</p>
        <p className="text-2xl font-black" style={{ color: "var(--gold)" }}>{delivery.cashExpected} ريال</p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          (المتبقي على المنتج {delivery.remainingAmountSnapshot} + رسم التوصيل {delivery.deliveryFeeSnapshot})
        </p>
      </div>

      {actionError && (
        <div className="text-sm font-semibold text-red-700 bg-red-50 rounded-xl px-3 py-2 text-center">
          {actionError}
        </div>
      )}

      {/* أزرار الحالة */}
      {delivery.status === "accepted" && (
        <button
          onClick={handlePickedUp}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-60"
          style={{ background: "var(--gold)" }}
        >
          📦 استلمت الطلب من المتجر
        </button>
      )}

      {delivery.status === "picked_up" && (
        <button
          onClick={handleOnTheWay}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-60"
          style={{ background: "var(--gold)" }}
        >
          🚴 انطلقت
        </button>
      )}

      {delivery.status === "on_the_way" && (
        <div className="rounded-2xl p-4 border flex flex-col gap-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={cashConfirmed}
              onChange={(e) => setCashConfirmed(e.target.checked)}
              className="mt-0.5 w-5 h-5"
            />
            <span>استلمت المبلغ كاملاً من العميل ({delivery.cashExpected} ريال)</span>
          </label>
          <button
            onClick={handleDelivered}
            disabled={busy || !cashConfirmed}
            className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-40"
            style={{ background: "#16A34A" }}
          >
            ✅ تم التسليم
          </button>
        </div>
      )}

      {delivery.status === "delivered" && (
        <div className="rounded-2xl p-4 border flex flex-col gap-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          {!delivery.cashHandedToSukkarAt || delivery.cashRejectedAt ? (
            <>
              {delivery.cashRejectedAt && (
                <div className="rounded-xl p-3 bg-red-50 border border-red-200">
                  <p className="font-bold text-red-700 text-sm">❌ الحوالة غير مكتملة</p>
                  {delivery.cashRejectionReason && (
                    <p className="text-sm text-red-600 mt-1">{delivery.cashRejectionReason}</p>
                  )}
                </div>
              )}
              <button
                onClick={handleCashHandoff}
                disabled={busy}
                className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-60"
                style={{ background: "var(--gold)" }}
              >
                💰 {delivery.cashRejectedAt ? "حوّلت المبلغ مجدداً" : "حوّلت المبلغ لسُكّر"}
              </button>
            </>
          ) : !delivery.cashConfirmedBySukkarAt ? (
            <p className="text-center font-semibold" style={{ color: "var(--muted)" }}>بانتظار تأكيد سُكّر</p>
          ) : (
            <p className="text-center font-semibold text-green-700">✓ تم التأكيد</p>
          )}
        </div>
      )}

      {/* الإبلاغ عن مشكلة */}
      {canReportException && !exceptionDone && (
        <div className="rounded-2xl p-4 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          {!showExceptionForm ? (
            <button
              onClick={() => setShowExceptionForm(true)}
              className="w-full py-3 rounded-2xl font-semibold text-red-600 border border-red-200"
            >
              ⚠️ الإبلاغ عن مشكلة
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="font-bold text-sm">نوع المشكلة</p>
              <div className="flex flex-col gap-2">
                {EXCEPTION_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="exceptionType"
                      checked={exceptionType === opt.value}
                      onChange={() => setExceptionType(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <textarea
                value={exceptionDescription}
                onChange={(e) => setExceptionDescription(e.target.value)}
                placeholder="وصف اختياري..."
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ borderColor: "var(--border)" }}
                rows={3}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setExceptionPhoto(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmitException}
                  disabled={exceptionSubmitting}
                  className="flex-1 py-3 rounded-2xl font-bold text-white disabled:opacity-60"
                  style={{ background: "#DC2626" }}
                >
                  {exceptionSubmitting ? "جارٍ الإرسال..." : "إرسال البلاغ"}
                </button>
                <button
                  onClick={() => setShowExceptionForm(false)}
                  className="flex-1 py-3 rounded-2xl font-semibold border"
                  style={{ borderColor: "var(--border)" }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {exceptionDone && (
        <p className="text-center text-sm font-semibold" style={{ color: "var(--muted)" }}>
          تم إرسال البلاغ — سيراجعه فريق سُكّر
        </p>
      )}
    </div>
  );
}
