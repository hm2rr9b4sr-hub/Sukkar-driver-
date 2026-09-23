import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsProvider } from "@/lib/sms";

// طلب كود OTP — نقطة نهاية عامة بلا مصادقة عمداً (لا جلسة موجودة بعد وقت
// التسجيل الذاتي/الدخول). كل حماية هنا server-side: rate limit صريح +
// تحقق مسبق من وجود/عدم وجود حساب حسب الغرض قبل حتى توليد كود.
const OTP_TTL_SECONDS = 5 * 60;
const MIN_SECONDS_BETWEEN_REQUESTS = 60;

function hashCode(phone: string, code: string) {
  // بلا ملح عشوائي منفصل مخزَّن — كافٍ هنا لأن الكود نفسه قصير العمر (٥ دقائق)
  // ومحدود المحاولات (٥)، ونمط hash يطابق فلسفة الكود الحالي بالمشروع (لا
  // تعقيد إضافي غير مبرَّر لخطر التهديد الفعلي هنا).
  return createHash("sha256").update(`${phone}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const { phone, purpose } = await req.json().catch(() => ({}));
  if (!phone || !["driver_signup", "driver_login"].includes(purpose)) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 8) {
    return NextResponse.json({ error: "invalid-phone" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // الغرض يطابق واقع الحساب فعلياً قبل أي إرسال — لا نرسل كوداً لطلب سيفشل
  // أصلاً بخطوة التحقق.
  const { data: existingDriver } = await supabase.from("drivers").select("id").eq("phone", digits).maybeSingle();
  if (purpose === "driver_signup" && existingDriver) {
    return NextResponse.json({ error: "account-already-exists" }, { status: 409 });
  }
  if (purpose === "driver_login" && !existingDriver) {
    return NextResponse.json({ error: "no-account-found" }, { status: 404 });
  }

  // Rate limit: لا طلب جديد لنفس الرقم/الغرض خلال ٦٠ ثانية من آخر طلب.
  const { data: recent } = await supabase
    .from("otp_codes")
    .select("created_at")
    .eq("phone", digits)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < MIN_SECONDS_BETWEEN_REQUESTS * 1000) {
    return NextResponse.json({ error: "too-many-requests" }, { status: 429 });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const { error: insertError } = await supabase.from("otp_codes").insert({
    phone: digits,
    purpose,
    code_hash: hashCode(digits, code),
    expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
  });
  if (insertError) {
    return NextResponse.json({ error: `otp-store-failed: ${insertError.message}` }, { status: 500 });
  }

  const smsResult = await getSmsProvider().sendSms(
    digits,
    `كود التحقق لتطبيق سُكّر Driver: ${code} — صالح لمدة 5 دقائق. لا تشاركه مع أحد.`
  );
  if (!smsResult.ok) {
    return NextResponse.json({ error: smsResult.error ?? "sms-send-failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
