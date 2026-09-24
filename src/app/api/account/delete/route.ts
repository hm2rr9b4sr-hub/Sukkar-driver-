import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// طلب/بدء حذف حساب المندوب (P0-6.1.1). راجعت مسار الإنشاء الفعلي
// (POST /api/admin/drivers بمشروع سُكّر الرئيسي) وقيود السكيما الحقيقية
// قبل كتابة أي كود — هذا ليس افتراضاً:
//
// drivers.id → auth.users(id) على delete cascade (migration 0046)، لكن
// deliveries.driver_id → drivers(id) **بلا** أي cascade (migration 0048) —
// أي مندوب له توصيلة واحدة فقط سيفشل حذف حسابه فعلياً بخطأ foreign key
// violation لو استُدعيت auth.admin.deleteUser() مباشرة. سجلات
// driver_notifications فقط هي من تحمل cascade (طبيعي، إشعارات تُستهلَك
// ولا قيمة مرجعية/محاسبية لها).
//
// لذلك: نفس نمط "الحذف المنطقي" المُطبَّق على حساب العميل بمشروع سُكّر
// الرئيسي بالضبط — لا سياسة retention مخترَعة هنا، هذا الأثر الوحيد الممكن
// فعلياً بلا كسر سلامة سجلات Fleet/التسويات المالية التاريخية المرتبطة
// بالمندوب. صف drivers نفسه يبقى قائماً (بلا اسم/هاتف حقيقيين، غير نشط،
// بلا آخر موقع معروف)، وسجل التوصيلات/الأحداث المرتبطة به يبقى كاملاً
// كما هو.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(token);
  if (callerError || !caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // تأكيد أن التوكن فعلاً لحساب مندوب حقيقي بجدول drivers (لا حساب من
  // النظام الرئيسي بالخطأ) — نفس تحقق الدور المطبَّق بمسار العميل.
  const { data: driver } = await supabase.from("drivers").select("id").eq("id", caller.id).single();
  if (!driver) return NextResponse.json({ error: "driver-account-only" }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // phone/full_name عمودان NOT NULL بسكيما drivers (0046) — لا يمكن
  // تعيينهما null، فقط قيمة نصية محايدة لا تُعرِّف بالمندوب.
  const { error: driverUpdateError } = await supabase
    .from("drivers")
    .update({
      full_name: "مندوب محذوف",
      phone: "",
      vehicle_type: null,
      plate_number: null,
      photo_url: null,
      current_lat: null,
      current_lng: null,
      location_updated_at: null,
      is_active: false,
      status: "offline",
      updated_at: new Date().toISOString(),
    })
    .eq("id", caller.id);
  if (driverUpdateError) {
    return NextResponse.json({ error: `driver-update-failed: ${driverUpdateError.message}` }, { status: 500 });
  }

  // الحذف منطقي (لا cascade من auth.users) — فك ربط أجهزة Push يدوياً حتى
  // لا يصل أي إشعار لحساب محذوف (migration 0062 بمستودع sukkar).
  await supabase.from("push_devices").delete().eq("user_id", caller.id);

  const banRes = await fetch(`${url}/auth/v1/admin/users/${caller.id}`, {
    method: "PUT",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ban_duration: "876000h" }),
  });
  if (!banRes.ok) {
    const err = await banRes.text();
    return NextResponse.json({ error: `ban-failed: ${err.slice(0, 200)}` }, { status: 500 });
  }

  await fetch(`${url}/auth/v1/admin/users/${caller.id}/logout?scope=global`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
