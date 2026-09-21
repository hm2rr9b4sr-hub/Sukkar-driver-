"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";
import { fetchMyDeliveryHistory, UIDelivery } from "@/lib/data";

// شاشة أرباح المندوب — لا تعرض ولا تجلب إطلاقاً عمولة سُكّر أو مستحقات
// متاجر أخرى. الدوال المتاحة لجانب المندوب في lib/data.ts أصلاً لا تمنح
// وصولاً لهذه الأرقام (RLS)، فالحدّ هنا بنيوي لا مجرد اختيار عرض.
export default function DriverEarningsPage() {
  const router = useRouter();
  const { driver, loading: authLoading } = useDriverAuth();
  const [history, setHistory] = useState<UIDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !driver) router.replace("/login");
  }, [authLoading, driver, router]);

  useEffect(() => {
    if (!driver) return;
    fetchMyDeliveryHistory().then((list) => {
      setHistory(list);
      setLoading(false);
    });
  }, [driver]);

  if (authLoading || loading) {
    return <p className="text-center py-10" style={{ color: "var(--muted)" }}>جارٍ التحميل...</p>;
  }

  const totalEarnings = history.reduce((sum, d) => sum + (d.deliveryFeeSnapshot ?? 0), 0);
  const pendingConfirmation = history
    .filter((d) => !d.cashConfirmedBySukkarAt)
    .reduce((sum, d) => sum + (d.remainingAmountSnapshot ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>إجمالي أرباح التوصيل</p>
        <p className="text-2xl font-black" style={{ color: "var(--gold)" }}>{totalEarnings.toFixed(2)} ريال</p>
      </div>

      <div className="rounded-2xl p-4 border" style={{ background: "#FEF3C7", borderColor: "var(--gold)" }}>
        <p className="text-sm font-semibold">المبلغ المستحق لسُكّر (غير مؤكَّد بعد)</p>
        <p className="text-2xl font-black" style={{ color: "var(--gold)" }}>{pendingConfirmation.toFixed(2)} ريال</p>
      </div>

      <div>
        <h2 className="font-bold mb-2 px-1">سجل التوصيلات</h2>
        {history.length === 0 ? (
          <div className="rounded-2xl p-6 text-center border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <p style={{ color: "var(--muted)" }}>لا توجد توصيلات سابقة</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((d) => (
              <div key={d.id} className="rounded-2xl p-3 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">#{d.orderNumber}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(d.createdAt).toLocaleDateString("ar-YE")}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
                    {d.deliveryFeeSnapshot} ريال
                  </span>
                  <span className="text-xs font-semibold">
                    {d.cashConfirmedBySukkarAt
                      ? "✓ مؤكَّد"
                      : d.cashRejectedAt
                      ? "❌ غير مكتملة"
                      : d.cashHandedToSukkarAt
                      ? "بانتظار التأكيد"
                      : "بانتظار التحويل لسُكّر"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
