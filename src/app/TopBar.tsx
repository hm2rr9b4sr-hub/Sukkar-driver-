"use client";
import Link from "next/link";
import { useDriverAuth } from "@/lib/DriverAuthContext";

function StatusPill() {
  const { driver, loading } = useDriverAuth();
  if (loading) return null;
  if (!driver) return null;

  const label = driver.status === "available" ? "متاح" : driver.status === "busy" ? "مشغول" : "غير متصل";
  // أخضر/أحمر تبقى ألوان حالة وظيفية قياسية (متاح/غير متصل) بلا تغيير —
  // "مشغول" فقط استُبدل بـHoney (لون العلامة الرسمي المخصَّص أصلاً
  // كـ"functional accent") بدل الذهبي القديم.
  const color = driver.status === "available" ? "#16A34A" : driver.status === "busy" ? "#E0A04F" : "#8A6A64";

  return (
    <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: color }}>
      {label}
    </span>
  );
}

export default function TopBar() {
  const { driver, logout } = useDriverAuth();
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 border-b"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">🛵</span>
        <span className="brand-display font-black" style={{ color: "var(--gold)" }}>Sukkar Driver</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill />
        {driver && (
          <Link
            href="/account"
            className="text-xs font-semibold px-3 py-1.5 rounded-full border"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            حسابي
          </Link>
        )}
        {driver && (
          <button
            onClick={() => logout()}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            خروج
          </button>
        )}
      </div>
    </header>
  );
}
