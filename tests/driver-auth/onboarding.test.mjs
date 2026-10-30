import { beforeEach, after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { REGION, full, setup, shiftCreated, verifiedTicket } from "./helpers.mjs";

const LOCAL = "771234567";
const GOOD = "Sukkar@2026!";
let ctx;
before(async () => { ctx = await setup(); });
beforeEach(async () => { await ctx.reset(); });
after(async () => { await ctx.db.close(); });

const complete = (o) => ctx.onboarding.complete({ phone: LOCAL, password: GOOD, ...o });

describe("تفعيل مندوب موجود (activate)", () => {
  it("OTP ← كلمة مرور ← دخول، وتبقى الموافقة كما هي", async () => {
    const id = ctx.world.addDriver({ local: LOCAL, approval: "approved" });
    const { ticket, mode } = await verifiedTicket(ctx, LOCAL);
    assert.equal(mode, "activate");
    assert.deepEqual(await complete({ ticket }), { status: "ok", mode: "activate" });
    assert.equal(ctx.world.auth.get(id).activated, true);
    assert.equal(ctx.world.auth.get(id).password, GOOD);
    assert.equal(ctx.world.drivers.get(id).approval_status, "approved");

    const l = await ctx.login.login({ phone: LOCAL, password: GOOD });
    assert.equal(l.status, "ok");
    assert.equal(l.session.access_token, `at-${id}`);
  });

  for (const approval of ["pending", "rejected"]) {
    it(`مندوب ${approval} يستطيع التفعيل والدخول لكن حالته لا تتغير (لا تجاوز لموافقة الأدمن)`, async () => {
      const id = ctx.world.addDriver({ local: LOCAL, approval });
      const { ticket } = await verifiedTicket(ctx, LOCAL);
      assert.equal((await complete({ ticket })).status, "ok");
      assert.equal((await ctx.login.login({ phone: LOCAL, password: GOOD })).status, "ok");
      assert.equal(ctx.world.drivers.get(id).approval_status, approval);
      // لا نداء كتابة يحمل حقلاً للموافقة أصلاً
      assert.deepEqual(Object.keys(ctx.world.calls.activate[0]), ["id"]);
    });
  }

  it("لا SMS ثانٍ بعد التفعيل: الطلب يُقبَل ظاهرياً دون إرسال (لا تكلفة ولا إعادة تعيين كلمة المرور بـOTP)", async () => {
    ctx.world.addDriver({ local: LOCAL });
    const { ticket } = await verifiedTicket(ctx, LOCAL);
    await complete({ ticket });
    await shiftCreated(ctx.db, 61);
    const again = await ctx.onboarding.requestOtp({ phone: LOCAL });
    assert.equal(again.status, "accepted");
    assert.equal(again.internal.suppressed, true);
    assert.equal(ctx.channel.outbox.length, 1);
  });
});

describe("تسجيل مندوب جديد (signup)", () => {
  const info = { fullName: "  أحمد   محمد ", regionId: REGION, vehicleType: "دراجة", plateNumber: "12345" };

  it("ينشأ بحالة pending ولا يُمرَّر أي حقل موافقة", async () => {
    const { ticket, mode } = await verifiedTicket(ctx, LOCAL);
    assert.equal(mode, "signup");
    assert.deepEqual(await complete({ ticket, ...info }), { status: "ok", mode: "signup" });
    const created = ctx.world.calls.create[0];
    assert.deepEqual(Object.keys(created).sort(), ["fullName", "local", "password", "plateNumber", "regionId", "vehicleType"]);
    assert.equal(created.fullName, "أحمد محمد");
    const row = [...ctx.world.drivers.values()][0];
    assert.equal(row.approval_status, "pending");
    assert.equal((await ctx.login.login({ phone: LOCAL, password: GOOD })).status, "ok");
  });

  it("بيانات ناقصة/خاطئة تُرفض قبل استهلاك التذكرة (لا تُحرق رسالة 0.19$)", async () => {
    const { ticket } = await verifiedTicket(ctx, LOCAL);
    assert.equal((await complete({ ticket, ...info, fullName: "x" })).status, "invalid_request");
    assert.equal((await complete({ ticket, ...info, regionId: "not-a-uuid" })).status, "invalid_request");
    assert.equal((await complete({ ticket, ...info, password: "123" })).status, "weak_password");
    assert.equal((await complete({ ticket, ...info, password: "12345678" })).issue, "common");
    assert.equal((await complete({ ticket, ...info, password: `x${LOCAL}x` })).issue, "contains_phone");
    assert.equal(ctx.world.calls.create.length, 0);
    assert.equal((await complete({ ticket, ...info })).status, "ok"); // نفس التذكرة ما زالت صالحة
  });

  it("فشل الإنشاء بالتخزين ⇒ failed بلا حساب يتيم", async () => {
    const { ticket } = await verifiedTicket(ctx, LOCAL);
    ctx.world.flags.failInsert = true;
    assert.equal((await complete({ ticket, ...info })).status, "failed");
    assert.equal(ctx.world.auth.size, 0);
    assert.equal(ctx.world.drivers.size, 0);
  });

  it("رقم عميل/متجر: لا إرسال ولا تحقق ولا إنشاء (حساب واحد لكل رقم)", async () => {
    ctx.world.others.add(LOCAL);
    const r = await ctx.onboarding.requestOtp({ phone: LOCAL });
    assert.equal(r.status, "accepted");
    assert.equal(r.internal.suppressed, true);
    assert.equal(ctx.channel.outbox.length, 0);
    for (const code of ["123456", "000000", "999999"]) assert.equal((await ctx.onboarding.verifyOtp({ phone: LOCAL, code })).status, "rejected");
  });
});

describe("الرمز والتذكرة: إعادة الاستخدام والربط", () => {
  it("الرمز لا يُستهلك مرتين، والتذكرة لا تُستهلك مرتين", async () => {
    ctx.world.addDriver({ local: LOCAL });
    await ctx.onboarding.requestOtp({ phone: LOCAL });
    const code = ctx.channel.lastCodeFor(full(LOCAL));
    const v = await ctx.onboarding.verifyOtp({ phone: LOCAL, code });
    assert.equal(v.status, "verified");
    assert.equal((await ctx.onboarding.verifyOtp({ phone: LOCAL, code })).status, "rejected");
    assert.equal((await complete({ ticket: v.ticket })).status, "ok");
    assert.equal((await complete({ ticket: v.ticket })).status, "invalid_session");
  });

  it("تذكرة رقم لا تنفع لرقم آخر ولا لتذكرة مختلقة", async () => {
    ctx.world.addDriver({ local: LOCAL });
    ctx.world.addDriver({ local: "731234567" });
    const { ticket } = await verifiedTicket(ctx, LOCAL);
    assert.equal((await ctx.onboarding.complete({ phone: "731234567", password: GOOD, ticket })).status, "invalid_session");
    assert.equal((await complete({ ticket: "a".repeat(64) })).status, "invalid_session");
    assert.equal((await complete({ ticket })).status, "ok");
  });

  it("تذكرة منتهية الصلاحية ترفض", async () => {
    ctx.world.addDriver({ local: LOCAL });
    const { ticket } = await verifiedTicket(ctx, LOCAL);
    await ctx.db.exec("update public.otp_challenges set ticket_expires_at = now() - interval '1 second'");
    assert.equal((await complete({ ticket })).status, "invalid_session");
  });

  it("تخمين الرمز محدود: 5 محاولات ثم القفل حتى للصحيح", async () => {
    ctx.world.addDriver({ local: LOCAL });
    await ctx.onboarding.requestOtp({ phone: LOCAL });
    const right = ctx.channel.lastCodeFor(full(LOCAL));
    const wrong = right === "100000" ? "100001" : "100000";
    for (let i = 0; i < 7; i++) assert.equal((await ctx.onboarding.verifyOtp({ phone: LOCAL, code: wrong })).status, "rejected");
    assert.equal((await ctx.onboarding.verifyOtp({ phone: LOCAL, code: right })).status, "rejected");
  });
});

describe("فشل إرسال D7", () => {
  it("إرسال فاشل: الاستجابة العامة كالنجاح، والرمز لا يعمل، وبعد فشلين يُرفض الجميع بـunavailable", async () => {
    ctx.world.addDriver({ local: LOCAL });
    ctx.channel.failWith = "d7-http-402-INSUFFICIENT_BALANCE";
    const a = await ctx.onboarding.requestOtp({ phone: LOCAL });
    assert.equal(a.status, "accepted");
    assert.equal(a.internal.delivered, false);
    assert.equal((await ctx.onboarding.verifyOtp({ phone: LOCAL, code: "123456" })).status, "rejected");
    await ctx.onboarding.requestOtp({ phone: "731234567" }); // فشل ثانٍ (رقم جديد قابل للتسجيل)
    ctx.world.others.add("751234567"); // رقم عميل
    const eligible = await ctx.onboarding.requestOtp({ phone: "741234567" });
    const ineligible = await ctx.onboarding.requestOtp({ phone: "751234567" });
    assert.deepEqual([eligible.status, ineligible.status], ["unavailable", "unavailable"]);
  });

  it("بعد عودة الخدمة (نجاح إرسال) يعمل التفعيل طبيعياً", async () => {
    ctx.world.addDriver({ local: LOCAL });
    ctx.channel.failWith = "d7-http-402";
    await ctx.onboarding.requestOtp({ phone: LOCAL });
    await ctx.onboarding.requestOtp({ phone: "731234567" });
    assert.equal((await ctx.onboarding.requestOtp({ phone: "741234567" })).status, "unavailable");
    await ctx.db.exec("update public.otp_challenges set created_at = created_at - interval '16 minutes'");
    ctx.channel.failWith = null;
    const { ticket } = await verifiedTicket(ctx, LOCAL);
    assert.equal((await complete({ ticket })).status, "ok");
  });
});

describe("تزامن", () => {
  it("ثمانية complete متوازية بنفس التذكرة ⇒ واحد فقط ينجح وكلمة المرور تُعيَّن مرة", async () => {
    ctx.world.addDriver({ local: LOCAL });
    const { ticket } = await verifiedTicket(ctx, LOCAL);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => complete({ ticket, password: `Sukkar@2026!${i}` })));
    assert.equal(results.filter((r) => r.status === "ok").length, 1);
    assert.equal(results.filter((r) => r.status === "invalid_session").length, 7);
    assert.equal(ctx.world.calls.activate.length, 1);
  });

  it("عشرة تحققات متوازية بالرمز الصحيح ⇒ واحد فقط", async () => {
    ctx.world.addDriver({ local: LOCAL });
    await ctx.onboarding.requestOtp({ phone: LOCAL });
    const code = ctx.channel.lastCodeFor(full(LOCAL));
    const results = await Promise.all(Array.from({ length: 10 }, () => ctx.onboarding.verifyOtp({ phone: LOCAL, code })));
    assert.equal(results.filter((r) => r.status === "verified").length, 1);
  });

  it("طلبا تسجيل متوازيان لرقمين ⇒ كلٌّ يأخذ رمزه ولا تداخل", async () => {
    ctx.world.addDriver({ local: LOCAL });
    ctx.world.addDriver({ local: "731234567" });
    await Promise.all([ctx.onboarding.requestOtp({ phone: LOCAL }), ctx.onboarding.requestOtp({ phone: "731234567" })]);
    assert.equal(ctx.channel.outbox.length, 2);
    const [a, b] = await Promise.all([
      ctx.onboarding.verifyOtp({ phone: LOCAL, code: ctx.channel.lastCodeFor(full(LOCAL)) }),
      ctx.onboarding.verifyOtp({ phone: "731234567", code: ctx.channel.lastCodeFor(full("731234567")) }),
    ]);
    assert.deepEqual([a.status, b.status], ["verified", "verified"]);
  });
});
