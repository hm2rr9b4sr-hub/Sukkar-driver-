"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDriverAuth } from "@/lib/DriverAuthContext";

export default function DriverLoginPage() {
  const router = useRouter();
  const { signIn } = useDriverAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn({ phone, password });
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pl-12 rounded-2xl border text-base"
                style={{ borderColor: "var(--border)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
                style={{ color: "var(--muted)" }}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
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
            {submitting ? "جارٍ الدخول..." : "دخول"}
          </button>
        </form>

        <p className="text-xs text-center mt-4" style={{ color: "var(--muted)" }}>
          الحسابات تُنشأ من فريق سُكّر فقط —{" "}
          <a
            href={`https://wa.me/${(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
            style={{ color: "var(--gold)" }}
          >
            تواصل مع الدعم
          </a>
          {" "}إن لم يكن لديك حساب.
        </p>
        <p className="text-center mt-2">
          <Link href="/privacy" className="text-xs underline" style={{ color: "var(--muted)" }}>
            سياسة الخصوصية
          </Link>
        </p>
      </div>
    </div>
  );
}
