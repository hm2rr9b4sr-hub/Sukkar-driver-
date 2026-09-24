"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";
import { deleteMyAccount } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";

// صفحة حساب المندوب — حالياً تحتوي فقط طلب حذف الحساب (P0-6.1.1). لا صفحة
// إعدادات/حساب كانت موجودة أصلاً بالتطبيق، فهذه صفحة جديدة صغيرة بدل
// توسيع صفحة قائمة — لا تغيير على أي شاشة تشغيلية حالية (الرئيسية/
// التوصيلات/الأرباح).
export default function AccountPage() {
  const router = useRouter();
  const { driver, loading } = useDriverAuth();
  const [confirmText, setConfirmText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const confirmWord = "حذف";
  const canDelete = confirmText.trim() === confirmWord;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError("");
    const { error: err } = await deleteMyAccount();
    if (err) {
      setDeleting(false);
      setError("تعذّر حذف الحساب — حاول مجدداً أو تواصل مع الدعم");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <p className="text-center py-10" style={{ color: "var(--muted)" }}>جارٍ التحميل...</p>;
  }
  if (!driver) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>الاسم</p>
        <p className="font-bold">{driver.fullName}</p>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>رقم الهاتف</p>
        <p className="font-bold" dir="ltr">{driver.phone}</p>
      </div>

      <div className="rounded-2xl p-4 border-2 space-y-3" style={{ borderColor: "#DC2626" }}>
        <h2 className="font-bold text-red-600">⚠️ حذف الحساب</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          سيُلغى وصولك لهذا الحساب نهائياً، وتُحذف بياناتك الشخصية (الاسم، رقم الهاتف، آخر موقع معروف).
          سجل توصيلاتك السابقة يبقى محفوظاً لأغراض محاسبية (تسويات نقدية مع المتاجر) بلا أي بيانات تُعرِّف بك.
        </p>

        {!expanded ? (
          <button onClick={() => setExpanded(true)} className="text-sm font-semibold text-red-600">
            حذف حسابي نهائياً
          </button>
        ) : (
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-semibold">اكتب "{confirmWord}" للتأكيد</p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border text-sm"
              style={{ borderColor: "var(--border)" }}
            />
            {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={!canDelete || deleting}
                className="text-sm font-bold text-white flex-1 py-2.5 rounded-2xl disabled:opacity-40"
                style={{ background: "#DC2626" }}
              >
                {deleting ? "جارِ الحذف..." : "حذف نهائي"}
              </button>
              <button
                onClick={() => { setExpanded(false); setConfirmText(""); setError(""); }}
                className="text-sm font-semibold px-4 py-2.5 rounded-2xl border"
                style={{ borderColor: "var(--border)" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </div>

      {/* بعد تسجيل الدخول لم يكن هناك أي رابط لسياسة الخصوصية داخل التطبيق
          (كان على /login فقط) — مطلوب ظاهراً داخل التطبيق بمراجعة المتاجر. */}
      <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
        <Link href="/privacy" className="underline">سياسة الخصوصية</Link>
        {" · "}
        <Link href="/account-deletion" className="underline">طريقة حذف الحساب</Link>
      </p>
    </div>
  );
}
