"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";
import { fetchRegionsForSignup, UIRegionOption } from "@/lib/data";

// التفعيل الأول / التسجيل (Account First, Approval Before Work): رقم ← رمز OTP (مرة واحدة فقط) ← كلمة مرور.
// وضعان يحددهما الخادم بعد إثبات ملكية الرقم: activate (مندوب موجود لم يُفعَّل) أو signup (مندوب جديد
// يُنشأ بحالة pending). الموافقة قرار الأدمن وحده — التفعيل لا يمنحها. بعدها الدخول اليومي بكلمة المرور.
export default function DriverJoinPage() {
  const router = useRouter();
  const { onboardingRequest, onboardingVerify, onboardingComplete } = useDriverAuth();
  const [step, setStep] = useState<"phone" | "code" | "details">("phone");
  const [mode, setMode] = useState<"activate" | "signup">("activate");
  const [ticket, setTicket] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [regions, setRegions] = useState<UIRegionOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchRegionsForSignup().then(setRegions); }, []);

  async function run(action: () => Promise<{ error: string | null }>, onOk: () => void) {
    setError(null);
    setSubmitting(true);
    const { error } = await action();
    setSubmitting(false);
    if (error) { setError(error); return; }
    onOk();
  }

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => onboardingRequest(phone), () => { setCode(""); setStep("code"); });
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await onboardingVerify(phone, code);
      if (!r.error && r.ticket && r.mode) { setTicket(r.ticket); setMode(r.mode); }
      return { error: r.error };
    }, () => setStep("details"));
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("كلمتا المرور غير متطابقتين"); return; }
    run(
      () => onboardingComplete({
        phone, ticket, password,
        ...(mode === "signup" ? { fullName: fullName.trim(), regionId, vehicleType: vehicleType.trim(), plateNumber: plateNumber.trim() } : {}),
      }),
      () => router.replace("/")
    );
  };

  const inputCls = "w-full px-4 py-3 rounded-2xl border text-base";
  const btnCls = "w-full py-3.5 rounded-2xl font-bold text-white text-base disabled:opacity-60";
  const errBox = error && <div className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">{error}</div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-sm rounded-3xl p-6 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-center mb-6">
          <span className="text-4xl">🛵</span>
          <h1 className="text-xl font-black mt-2" style={{ color: "var(--gold)" }}>تفعيل الحساب / تسجيل مندوب</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Sukkar Driver</p>
        </div>

        {step === "phone" && (
          <form onSubmit={handleRequest} className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: "var(--muted)" }}>سنرسل رمز تحقق مرة واحدة فقط لإثبات ملكية رقمك، ثم تضع كلمة مرور تدخل بها لاحقاً دون رمز.</p>
            <div>
              <label className="block text-sm font-semibold mb-1.5">رقم الهاتف</label>
              <input type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7XXXXXXXX" className={inputCls} style={{ borderColor: "var(--border)" }} dir="ltr" />
            </div>
            {errBox}
            <button type="submit" disabled={submitting} className={btnCls} style={{ background: "var(--gold)" }}>{submitting ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}</button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <p className="text-sm text-center" style={{ color: "var(--muted)" }}>إن كان الرقم <span dir="ltr">{phone}</span> مؤهلاً للتفعيل فقد أُرسل إليه رمز تحقق.</p>
            <div>
              <label className="block text-sm font-semibold mb-1.5">رمز التحقق</label>
              <input type="text" inputMode="numeric" required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" className={`${inputCls} text-center tracking-[0.5em]`} style={{ borderColor: "var(--border)" }} dir="ltr" />
            </div>
            {errBox}
            <button type="submit" disabled={submitting || !code.trim()} className={btnCls} style={{ background: "var(--gold)" }}>{submitting ? "جارِ التحقق..." : "تحقق"}</button>
            <button type="button" onClick={() => { setStep("phone"); setError(null); }} className="text-xs" style={{ color: "var(--muted)" }}>تغيير الرقم / طلب رمز جديد</button>
          </form>
        )}

        {step === "details" && (
          <form onSubmit={handleComplete} className="flex flex-col gap-3">
            <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
              {mode === "activate" ? "تم التحقق — اختر كلمة مرور لحسابك." : "تم التحقق — أكمل بياناتك واختر كلمة مرور. سيراجع فريق سُكّر طلبك قبل أن تستقبل أي توصيلة."}
            </p>
            {mode === "signup" && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">الاسم الكامل</label>
                  <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} style={{ borderColor: "var(--border)" }} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">المنطقة</label>
                  <select required value={regionId} onChange={(e) => setRegionId(e.target.value)} className={`${inputCls} bg-transparent`} style={{ borderColor: "var(--border)" }}>
                    <option value="">اختر منطقتك</option>
                    {regions.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">نوع المركبة (اختياري)</label>
                  <input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputCls} style={{ borderColor: "var(--border)" }} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">رقم اللوحة (اختياري)</label>
                  <input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} dir="ltr" className={inputCls} style={{ borderColor: "var(--border)" }} />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-semibold mb-1.5">كلمة المرور (8 أحرف فأكثر)</label>
              <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} style={{ borderColor: "var(--border)" }} dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">تأكيد كلمة المرور</label>
              <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} style={{ borderColor: "var(--border)" }} dir="ltr" />
            </div>
            {errBox}
            <button type="submit" disabled={submitting || !password || (mode === "signup" && (!fullName.trim() || !regionId))} className={btnCls} style={{ background: "var(--gold)" }}>
              {submitting ? "جارٍ الحفظ..." : mode === "activate" ? "حفظ وتسجيل الدخول" : "إنشاء الحساب"}
            </button>
          </form>
        )}

        <p className="text-xs text-center mt-4" style={{ color: "var(--muted)" }}>
          لديك كلمة مرور بالفعل؟{" "}
          <Link href="/login" className="font-semibold underline" style={{ color: "var(--gold)" }}>سجّل دخولك</Link>
        </p>
      </div>
    </div>
  );
}
