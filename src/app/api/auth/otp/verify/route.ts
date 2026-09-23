import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function hashCode(phone: string, code: string) {
  return createHash("sha256").update(`${phone}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest("hex");
}

function phoneToDriverEmail(digits: string) {
  return `${digits}-driver@sukkar.app`;
}

// تحقق OTP — عند النجاح:
// - driver_signup: يُنشئ حساب auth.users + صف drivers (approval_status
//   يبقى 'pending' افتراضياً — عمود migration 0058 — الأدمن يوافق لاحقاً).
//   كلمة مرور داخلية عشوائية تُولَّد هنا **فقط لأن GoTrue تتطلب قيمة ما عند
//   createUser بمنهج البريد/كلمة المرور** — لا يراها المندوب، لا تُستخدَم
//   لأي دخول لاحق إطلاقاً (كل دخول لاحق يمر بنفس تدفق OTP هذا من جديد).
// - كلا الحالتين: يُصدر جلسة فعلية بلا كلمة مرور عبر آلية Supabase الموثَّقة
//   لهذا الغرض تحديداً (custom OTP → session): auth.admin.generateLink
//   بنوع magiclink يُنتج hashed_token، والعميل يستهلكه عبر
//   supabase.auth.verifyOtp({email, token, type:'magiclink'}) لإصدار جلسة
//   حقيقية محلياً — بلا أي بريد فعلي يُرسَل (لسنا نستخدم قناة البريد
//   إطلاقاً، فقط آلية إصدار الجلسة الداخلية لـGoTrue).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { phone, code, purpose, fullName, vehicleType, plateNumber, regionId } = body;
  if (!phone || !code || !["driver_signup", "driver_login"].includes(purpose)) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }
  const digits = String(phone).replace(/\D/g, "");
  const supabase = createAdminClient();

  const { data: otpRow } = await supabase
    .from("otp_codes")
    .select("id, code_hash, attempts, max_attempts, expires_at, verified_at")
    .eq("phone", digits)
    .eq("purpose", purpose)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRow) {
    return NextResponse.json({ error: "otp-not-requested" }, { status: 400 });
  }
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "otp-expired" }, { status: 400 });
  }
  if (otpRow.attempts >= otpRow.max_attempts) {
    return NextResponse.json({ error: "too-many-attempts" }, { status: 429 });
  }

  const providedHash = hashCode(digits, String(code));
  if (providedHash !== otpRow.code_hash) {
    await supabase.from("otp_codes").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
    return NextResponse.json({ error: "invalid-code" }, { status: 400 });
  }

  await supabase.from("otp_codes").update({ verified_at: new Date().toISOString() }).eq("id", otpRow.id);

  const email = phoneToDriverEmail(digits);

  if (purpose === "driver_signup") {
    if (!fullName || !regionId) {
      return NextResponse.json({ error: "missing-signup-fields" }, { status: 400 });
    }
    const { data: alreadyExists } = await supabase.from("drivers").select("id").eq("phone", digits).maybeSingle();
    if (alreadyExists) {
      return NextResponse.json({ error: "account-already-exists" }, { status: 409 });
    }

    const internalRandomPassword = createHash("sha256").update(`${digits}:${Date.now()}:${Math.random()}`).digest("hex");
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: internalRandomPassword,
      email_confirm: true,
      user_metadata: { role: "driver", full_name: fullName, phone: digits },
    });
    if (createError || !created?.user) {
      return NextResponse.json({ error: createError?.message ?? "create-user-failed" }, { status: 500 });
    }

    const { error: driverInsertError } = await supabase.from("drivers").insert({
      id: created.user.id,
      region_id: regionId,
      full_name: fullName,
      phone: digits,
      vehicle_type: vehicleType || null,
      plate_number: plateNumber || null,
    });
    if (driverInsertError) {
      return NextResponse.json({ error: `driver-insert-failed: ${driverInsertError.message}` }, { status: 500 });
    }
  } else {
    const { data: existingDriver } = await supabase.from("drivers").select("id").eq("phone", digits).maybeSingle();
    if (!existingDriver) {
      return NextResponse.json({ error: "no-account-found" }, { status: 404 });
    }
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !linkData) {
    return NextResponse.json({ error: linkError?.message ?? "session-issue-failed" }, { status: 500 });
  }

  const hashedToken = (linkData.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (!hashedToken) {
    return NextResponse.json({ error: "session-token-missing" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email, token: hashedToken });
}
