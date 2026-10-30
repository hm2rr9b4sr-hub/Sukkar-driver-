import { beforeEach, after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.mjs";

const LOCAL = "771234567";
const PASS = "Sukkar@2026!";
let ctx;
before(async () => { ctx = await setup(); });
beforeEach(async () => { await ctx.reset(); });
after(async () => { await ctx.db.close(); });

const attempts = async () => (await ctx.db.query("select count(*)::int as n from public.auth_login_attempts")).rows[0].n;
const login = (o = {}) => ctx.login.login({ phone: LOCAL, password: PASS, ...o });

describe("الدخول بكلمة المرور", () => {
  it("نجاح: جلسة المندوب نفسه ولا رسالة OTP إطلاقاً، ويُمسح عدّاد الفشل", async () => {
    const id = ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    const r = await login();
    assert.deepEqual(r, { status: "ok", session: { access_token: `at-${id}`, refresh_token: `rt-${id}` } });
    assert.equal(await attempts(), 0);
    assert.equal(ctx.channel.outbox.length, 0);
  });

  it("صيغ الرقم المقبولة كلها تدخل لنفس الحساب", async () => {
    const id = ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    for (const phone of [LOCAL, `0${LOCAL}`, `967${LOCAL}`, `+967 ${LOCAL}`, `00967${LOCAL}`]) {
      assert.equal((await login({ phone })).session.access_token, `at-${id}`, phone);
    }
  });

  it("الفشل بكل صوره متطابق: كلمة خاطئة، رقم مجهول، حساب غير مفعَّل، رقم غير صالح، حساب محظور", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    ctx.world.addDriver({ local: "731234567", activated: false });
    ctx.world.addDriver({ local: "741234567", activated: true, password: PASS, banned: true });
    const outcomes = [
      await login({ password: "wrong-pass-1" }),
      await login({ phone: "751234567" }),
      await login({ phone: "731234567", password: "internal-random-secret-xyz" }), // حتى لو عُرفت كلمته العشوائية
      await login({ phone: "123" }),
      await login({ phone: "741234567" }),
      await login({ password: "" }),
    ];
    for (const o of outcomes) assert.deepEqual(o, { status: "invalid_credentials" });
  });

  it("زمن الفشل ثابت تقريباً (900ms كحد أدنى) لتضييق قناة التوقيت", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    await login({ phone: "751234567" });          // مجهول: لا استدعاء GoTrue
    ctx.world.flags.signInDelayMs = 600;
    await login({ password: "wrong-pass-1" });    // معروف: GoTrue أخذ 600ms
    assert.deepEqual(ctx.sleeps, [900, 300]);
  });

  it("الدخول لا يتجاوز بوابة الموافقة: المعلّق والمرفوض يدخلان (التصفح) ولا يتغير شيء بحالتهم", async () => {
    const p = ctx.world.addDriver({ local: LOCAL, approval: "pending", activated: true, password: PASS });
    const r = ctx.world.addDriver({ local: "731234567", approval: "rejected", activated: true, password: PASS });
    assert.equal((await login()).status, "ok");
    assert.equal((await login({ phone: "731234567" })).status, "ok");
    assert.deepEqual([ctx.world.drivers.get(p).approval_status, ctx.world.drivers.get(r).approval_status], ["pending", "rejected"]);
  });
});

describe("حدود المحاولات", () => {
  it("5 فشل ثم القفل: السادسة تُرفض حتى بكلمة المرور الصحيحة، دون استدعاء GoTrue", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    for (let i = 0; i < 5; i++) assert.equal((await login({ password: `wrong-pass-${i}` })).status, "invalid_credentials");
    const calls = ctx.world.calls.signIn.length;
    const locked = await login();
    assert.equal(locked.status, "locked");
    assert.ok(locked.retryAfterSeconds > 0 && locked.retryAfterSeconds <= 900);
    assert.equal(ctx.world.calls.signIn.length, calls);
    assert.equal(await attempts(), 5);
  });

  it("القفل ينطبق على الرقم المجهول بالقدر نفسه (لا كشف لتسجيله)", async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push((await login({ phone: "751234567", password: `wrong-pass-${i}` })).status);
    assert.deepEqual(results, [...Array(5).fill("invalid_credentials"), "locked", "locked"]);
  });

  it("النجاح يمسح العدّاد: 4 فشل ثم نجاح ثم 5 محاولات جديدة مسموحة", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    for (let i = 0; i < 4; i++) await login({ password: `wrong-pass-${i}` });
    assert.equal((await login()).status, "ok");
    for (let i = 0; i < 5; i++) assert.equal((await login({ password: `wrong-pass-${i}` })).status, "invalid_credentials");
    assert.equal((await login()).status, "locked");
  });

  it("تزامن: 12 محاولة خاطئة متوازية ⇒ 5 فقط تصل إلى فحص كلمة المرور", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => login({ password: `wrong-pass-${i}` })));
    assert.equal(ctx.world.calls.signIn.length, 5);
    assert.equal(results.filter((r) => r.status === "locked").length, 7);
    assert.equal((await login()).status, "locked"); // الصحيحة مقفولة أيضاً
  });

  it("قفل مندوب لا يمنع غيره", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    ctx.world.addDriver({ local: "731234567", activated: true, password: PASS });
    for (let i = 0; i < 6; i++) await login({ password: `wrong-pass-${i}` });
    assert.equal((await login({ phone: "731234567" })).status, "ok");
  });

  it("حد الـIP يشمل أرقاماً مختلفة", async () => {
    const tight = await setup({ loginLimits: { ipMax: 2 } });
    try {
      for (const p of ["771111111", "772222222"]) await tight.login.login({ phone: p, password: "wrong-pass-1", ip: "203.0.113.9" });
      const third = await tight.login.login({ phone: "773333333", password: "wrong-pass-1", ip: "203.0.113.9" });
      assert.equal(third.status, "locked");
      assert.equal((await tight.login.login({ phone: "773333333", password: "wrong-pass-1", ip: "203.0.113.10" })).status, "invalid_credentials");
    } finally { await tight.db.close(); }
  });
});

describe("الجلسات والصلاحيات", () => {
  it("رقم عميل/متجر لا يدخل من هنا (لا صف مندوب)", async () => {
    ctx.world.others.add(LOCAL);
    assert.deepEqual(await login(), { status: "invalid_credentials" });
    assert.equal(ctx.world.calls.signIn.length, 0);
  });

  it("جلسة لمستخدم مختلف عن صف المندوب تُرفض", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    const l = new (ctx.login.constructor)({
      store: ctx.world.store, throttle: ctx.throttle, sleep: async () => {},
      signIn: async () => ({ ok: true, userId: "someone-else", session: { access_token: "x", refresh_token: "y" } }),
    });
    assert.deepEqual(await l.login({ phone: LOCAL, password: PASS }), { status: "invalid_credentials" });
  });

  it("رد الدخول يحوي التوكنات فقط: لا بريد ولا معرّف ولا حالة موافقة", async () => {
    ctx.world.addDriver({ local: LOCAL, approval: "pending", activated: true, password: PASS });
    const res = await ctx.handlers.login(new Request("http://x", { method: "POST", body: JSON.stringify({ phone: LOCAL, password: PASS }) }));
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["ok", "session"]);
    assert.deepEqual(Object.keys(body.session).sort(), ["access_token", "refresh_token"]);
    assert.equal(/sukkar\.app|approval|pending|drv-/.test(JSON.stringify(body).replace(/at-drv-\d+|rt-drv-\d+/g, "")), false);
  });
});
