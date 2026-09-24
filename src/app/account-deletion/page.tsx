import Link from "next/link";

// صفحة ويب عامة لحذف حساب المندوب — Google Play يشترط رابطاً يعمل بلا تثبيت
// التطبيق (حقل "Delete account URL"). تصف فقط ما يفعله /api/account/delete
// فعلياً (حذف منطقي فوري، راجع route.ts).
const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/\D/g, "");

export default function AccountDeletionPage() {
  const waText = encodeURIComponent("طلب حذف حساب مندوب سُكّر\nرقم الهاتف المسجَّل بالحساب: ");
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-5 text-sm leading-relaxed">
      <h1 className="text-xl font-black" style={{ color: "var(--gold)" }}>حذف حساب مندوب سُكّر</h1>

      <section>
        <h2 className="font-bold mb-1">١. من داخل التطبيق (فوري)</h2>
        <ol className="list-decimal ps-5 space-y-1">
          <li>سجّل الدخول لحسابك.</li>
          <li>اضغط &quot;حسابي&quot; أعلى الشاشة.</li>
          <li>اضغط &quot;حذف حسابي نهائياً&quot;، اكتب كلمة &quot;حذف&quot; للتأكيد، ثم &quot;حذف نهائي&quot;.</li>
        </ol>
        <p className="mt-2"><Link href="/account" className="underline font-semibold">الانتقال إلى &quot;حسابي&quot;</Link></p>
      </section>

      <section>
        <h2 className="font-bold mb-1">٢. بدون التطبيق</h2>
        <p>
          إن لم يعد بإمكانك الدخول، راسل فريق الدعم عبر واتساب من نفس رقم الهاتف المسجَّل بالحساب، وسننفّذ
          الحذف خلال 7 أيام عمل كحد أقصى بعد التحقق من ملكية الرقم.
        </p>
        {SUPPORT_WHATSAPP && (
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 px-4 py-2 rounded-xl font-bold text-white"
            style={{ background: "var(--gold)" }}
          >
            طلب الحذف عبر واتساب
          </a>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-1">٣. ما الذي يُحذف</h2>
        <ul className="list-disc ps-5 space-y-1">
          <li>اسمك ورقم هاتفك ونوع مركبتك ورقم لوحتها وصورتك.</li>
          <li>آخر موقع معروف لك (لا نحتفظ بسجل تحركات أصلاً).</li>
          <li>الدخول للحساب يُلغى نهائياً وتُنهى كل الجلسات فوراً، ويُفك ارتباط جهازك بالإشعارات.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-bold mb-1">٤. ما الذي نحتفظ به ولماذا</h2>
        <p>
          سجل التوصيلات والتسويات النقدية يبقى محفوظاً لأغراض محاسبية (تسويات مع المتاجر وسُكّر) بلا اسمك أو
          رقم هاتفك.
        </p>
      </section>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/privacy" className="underline">سياسة الخصوصية</Link>
      </p>
    </div>
  );
}
