"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";
import { fetchRegionsForSignup, UIRegionOption } from "@/lib/data";

// التسجيل الذاتي (Driver Onboarding: Account First, Approval Before Work) —
// الحساب يُنشأ فوراً بحالة "pending"، يدخل المندوب ويتصفح، لكن لا يُرشَّح
// لأي عرض توصيل حتى يوافق الأدمن (راجع migration 0058 وقسم Fleet بلوحة
// الأدمن). لا كلمة مرور يراها المندوب إطلاقاً — رمز عبر SMS فقط، بكل مرة.
export default function DriverJoinPage() {
  const router = useRouter();
  const { requestOtp, verifySignupOtp } = useDriverAuth();
  const [step, setStep] = useState<"phone" | "details">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [regions, setRegions] = useState<UIRegionOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchRegionsForSignup().then(setRegions);
  }, []);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await requestOtp(phone, "driver_signup");
    setSubmitting(false);
    if (error) { setError(error); return; }
    setStep("details");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !regionId || !code.trim()) return;
    setError(null);
    setSubmitting(true);
    const { error } = await verifySignupOtp({
      phone, code: code.trim(), fullName: fullName.trim(), regionId,
      vehicleType: vehicleType.trim() || undefined, plateNumber: plateNumber.trim() || undefined,
    });
    setSubmitting(false);
    if (error) { setError(error); return; }
    router.replace("/");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-sm rounded-3xl p-6 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-center mb-6">
          <span className="text-4xl">🛵</span>
          <h1 className="text-xl font-black mt-2" style={{ color: "var(--gold)" }}>تسجيل مندوب جديد</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Sukkar Driver</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">رقم الهاتف</label>
              <input
                type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="7XXXXXXXX" className="w-full px-4 py-3 rounded-2xl border text-base"
                style={{ borderColor: "var(--border)" }} dir="ltr"
              />
            </div>
            {error && <div className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">{error}</div>}
            <button type="submit" disabled={submitting} className="w-full py-3.5 rounded-2xl font-bold text-white text-base disabled:opacity-60" style={{ background: "var(--gold)" }}>
              {submitting ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
              أُرسل رمز تحقق إلى <span dir="ltr">{phone}</span>
            </p>
            <div>
              <label className="block text-sm font-semibold mb-1.5">رمز التحقق</label>
              <input
                type="text" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="000000" className="w-full px-4 py-3 rounded-2xl border text-base text-center tracking-[0.5em]"
                style={{ borderColor: "var(--border)" }} dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">الاسم الكامل</label>
              <input
                required value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border text-base" style={{ borderColor: "var(--border)" }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">المنطقة</label>
              <select
                required value={regionId} onChange={(e) => setRegionId(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border text-base bg-transparent" style={{ borderColor: "var(--border)" }}
              >
                <option value="">اختر منطقتك</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">نوع المركبة (اختياري)</label>
              <input
                value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border text-base" style={{ borderColor: "var(--border)" }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">رقم اللوحة (اختياري)</label>
              <input
                value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} dir="ltr"
                className="w-full px-4 py-3 rounded-2xl border text-base" style={{ borderColor: "var(--border)" }}
              />
            </div>

            {error && <div className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">{error}</div>}

            <button
              type="submit" disabled={submitting || !fullName.trim() || !regionId || !code.trim()}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-base disabled:opacity-60"
              style={{ background: "var(--gold)" }}
            >
              {submitting ? "جارِ الإنشاء..." : "إنشاء الحساب"}
            </button>
          </form>
        )}

        <p className="text-xs text-center mt-4" style={{ color: "var(--muted)" }}>
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-semibold underline" style={{ color: "var(--gold)" }}>سجّل دخولك</Link>
        </p>
      </div>
    </div>
  );
}
