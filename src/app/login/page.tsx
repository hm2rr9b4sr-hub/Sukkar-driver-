"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";

export default function DriverLoginPage() {
  const router = useRouter();
  const { requestOtp, verifyLoginOtp } = useDriverAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await requestOtp(phone, "driver_login");
    setSubmitting(false);
    if (error) { setError(error); return; }
    setStep("code");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await verifyLoginOtp(phone, code);
    setSubmitting(false);
    if (error) { setError(error); return; }
    router.replace("/");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-sm rounded-3xl p-6 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-center mb-6">
          <span className="text-4xl">🛵</span>
          <h1 className="text-xl font-black mt-2" style={{ color: "var(--gold)" }}>تسجيل دخول المندوب</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Sukkar Driver</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">رقم الهاتف</label>
              <input
                type="tel"
                inputMode="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="7XXXXXXXX"
                className="w-full px-4 py-3 rounded-2xl border text-base"
                style={{ borderColor: "var(--border)" }}
                dir="ltr"
              />
            </div>

            {error && (
              <div className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-base disabled:opacity-60"
              style={{ background: "var(--gold)" }}
            >
              {submitting ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
              أُرسل رمز تحقق إلى <span dir="ltr">{phone}</span>
            </p>
            <div>
              <label className="block text-sm font-semibold mb-1.5">رمز التحقق</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                className="w-full px-4 py-3 rounded-2xl border text-base text-center tracking-[0.5em]"
                style={{ borderColor: "var(--border)" }}
                dir="ltr"
              />
            </div>

            {error && (
              <div className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-base disabled:opacity-60"
              style={{ background: "var(--gold)" }}
            >
              {submitting ? "جارِ التحقق..." : "تأكيد الدخول"}
            </button>
            <button type="button" onClick={() => { setStep("phone"); setCode(""); setError(null); }} className="text-xs" style={{ color: "var(--muted)" }}>
              تغيير رقم الهاتف
            </button>
          </form>
        )}

        <p className="text-xs text-center mt-4" style={{ color: "var(--muted)" }}>
          ليس لديك حساب؟{" "}
          <Link href="/join" className="font-semibold underline" style={{ color: "var(--gold)" }}>
            سجّل كمندوب جديد
          </Link>
        </p>
        <p className="text-center mt-2 text-xs" style={{ color: "var(--muted)" }}>
          <a
            href={`https://wa.me/${(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            لم يصلك الرمز؟ تواصل مع الدعم
          </a>
          {" · "}
          <Link href="/privacy" className="underline">سياسة الخصوصية</Link>
        </p>
      </div>
    </div>
  );
}
