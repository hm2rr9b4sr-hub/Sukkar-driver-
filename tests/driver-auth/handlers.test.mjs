import { beforeEach, after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { full, lib, req, setup, shiftCreated } from "./helpers.mjs";

const LOCAL = "771234567";
const PASS = "Sukkar@2026!";
let ctx;
before(async () => { ctx = await setup(); });
beforeEach(async () => { await ctx.reset(); });
after(async () => { await ctx.db.close(); });

const post = async (name, body, headers) => {
  const res = await ctx.handlers[name](req(body, headers));
  const text = await res.text();
  return { res, text, json: JSON.parse(text) };
};

describe("طلب الرمز (HTTP)", () => {
  it("الاستجابة متطابقة حرفياً لرقم مؤهل وآخر غير مؤهل (لا كشف للتسجيل)", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: false });
    ctx.world.addDriver({ local: "731234567", activated: true, password: PASS });
    ctx.world.others.add("741234567");
    const a = await post("otpRequest", { phone: LOCAL });
    const b = await post("otpRequest", { phone: "731234567" });
    const c = await post("otpRequest", { phone: "741234567" });
    const d = await post("otpRequest", { phone: "751234567" });
    for (const r of [a, b, c, d]) { assert.equal(r.res.status, 200); assert.equal(r.text, '{"ok":true}'); }
    assert.deepEqual(ctx.channel.outbox.map((m) => m.phone).sort(), [full(LOCAL), full("751234567")].sort());
  });

  it("لا يخرج أي حقل داخلي ولا رسالة قناة بأي حالة", async () => {
    ctx.channel.failWith = "d7-http-402-INSUFFICIENT_BALANCE";
    const texts = [];
    texts.push((await post("otpRequest", { phone: LOCAL })).text);
    texts.push((await post("otpRequest", { phone: LOCAL })).text); // تهدئة
    texts.push((await post("otpRequest", { phone: "731234567" })).text);
    texts.push((await post("otpRequest", { phone: "741234567" })).text); // unavailable
    for (const t of texts) assert.equal(/internal|suppressed|delivered|d7|INSUFFICIENT|balance/i.test(t), false, t);
  });

  it("رقم غير صالح 400، تهدئة 429 مع مهلة، عطل القناة 503، وNo-Store دائماً", async () => {
    const bad = await post("otpRequest", { phone: "12" });
    assert.deepEqual([bad.res.status, bad.json.error], [400, "invalid-phone"]);
    await post("otpRequest", { phone: LOCAL });
    const cool = await post("otpRequest", { phone: LOCAL });
    assert.equal(cool.res.status, 429);
    assert.equal(cool.json.error, "too-many-requests");
    assert.ok(cool.json.retryAfter >= 1 && cool.json.retryAfter <= 60);
    assert.equal(cool.res.headers.get("cache-control"), "no-store");
    ctx.channel.failWith = "x";
    await shiftCreated(ctx.db, 61);
    await post("otpRequest", { phone: LOCAL });
    await post("otpRequest", { phone: "731234567" });
    const down = await post("otpRequest", { phone: "741234567" });
    assert.deepEqual([down.res.status, down.json.error], [503, "service-unavailable"]);
  });

  it("جسم غير صالح 400", async () => {
    for (const body of ["not json", "[]", "null", '"x"']) {
      const r = await post("otpRequest", body);
      assert.deepEqual([r.res.status, r.json.error], [400, "invalid-request"], body);
    }
  });

  it("عنوان IP من ترويسة Vercel يُخزَّن مُجزَّأً ويُطبَّق عليه الحد", async () => {
    const tight = await setup({ limits: { ipHourly: 1 } });
    try {
      const h = (ip) => ({ "x-vercel-forwarded-for": ip });
      const call = (phone, ip) => tight.handlers.otpRequest(req({ phone }, h(ip)));
      assert.equal((await call("771111111", "198.51.100.7")).status, 200);
      assert.equal((await call("772222222", "198.51.100.7")).status, 429);
      assert.equal((await call("772222222", "198.51.100.8")).status, 200);
      const stored = (await tight.db.query("select ip_hash from public.otp_challenges")).rows.map((r) => r.ip_hash);
      assert.ok(stored.every((x) => /^[0-9a-f]{64}$/.test(x)));
    } finally { await tight.db.close(); }
  });
});

describe("التحقق والإكمال (HTTP)", () => {
  it("تدفق كامل عبر HTTP ثم دخول", async () => {
    const id = ctx.world.addDriver({ local: LOCAL, approval: "pending" });
    await post("otpRequest", { phone: LOCAL });
    const code = ctx.channel.lastCodeFor(full(LOCAL));
    const bad = await post("otpVerify", { phone: LOCAL, code: code === "123456" ? "654321" : "123456" });
    assert.deepEqual([bad.res.status, bad.json], [400, { error: "invalid-code" }]);
    const ok = await post("otpVerify", { phone: LOCAL, code });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.json.mode, "activate");
    const weak = await post("complete", { phone: LOCAL, ticket: ok.json.ticket, password: "12345678" });
    assert.deepEqual([weak.res.status, weak.json.error, weak.json.issue], [400, "weak-password", "common"]);
    const done = await post("complete", { phone: LOCAL, ticket: ok.json.ticket, password: PASS });
    assert.deepEqual([done.res.status, done.json], [200, { ok: true, mode: "activate" }]);
    const session = await post("login", { phone: LOCAL, password: PASS });
    assert.equal(session.json.session.access_token, `at-${id}`);
    assert.equal(ctx.world.drivers.get(id).approval_status, "pending");
    const reuse = await post("complete", { phone: LOCAL, ticket: ok.json.ticket, password: PASS });
    assert.deepEqual([reuse.res.status, reuse.json.error], [400, "invalid-session"]);
  });

  it("رفض الرمز موحَّد: خاطئ/منتهٍ/مقفول/رقم غير مؤهل كلها invalid-code بنفس الجسم", async () => {
    ctx.world.addDriver({ local: LOCAL });
    ctx.world.others.add("731234567");
    await post("otpRequest", { phone: LOCAL });
    await post("otpRequest", { phone: "731234567" });
    const bodies = new Set();
    for (let i = 0; i < 7; i++) bodies.add((await post("otpVerify", { phone: LOCAL, code: "000001" })).text); // يمر بـmismatch ثم exhausted
    bodies.add((await post("otpVerify", { phone: "731234567", code: "000001" })).text);
    bodies.add((await post("otpVerify", { phone: "751234567", code: "000001" })).text); // لم يُطلب رمز
    assert.deepEqual([...bodies], ['{"error":"invalid-code"}']);
  });

  it("تعارض التسجيل (رقم صار مسجَّلاً) لا يُكشف: invalid-session", async () => {
    const original = ctx.world.store.createDriver;
    ctx.world.store.createDriver = async () => ({ ok: false, code: "phone-taken" });
    try {
      await post("otpRequest", { phone: LOCAL });
      const v = await post("otpVerify", { phone: LOCAL, code: ctx.channel.lastCodeFor(full(LOCAL)) });
      const r = await post("complete", { phone: LOCAL, ticket: v.json.ticket, password: PASS, fullName: "أحمد", regionId: "11111111-2222-3333-4444-555555555555" });
      assert.deepEqual([r.res.status, r.json.error], [400, "invalid-session"]);
    } finally { ctx.world.store.createDriver = original; }
  });
});

describe("الدخول (HTTP) والأخطاء", () => {
  it("401 موحَّد، و429 مع Retry-After", async () => {
    ctx.world.addDriver({ local: LOCAL, activated: true, password: PASS });
    const wrong = await post("login", { phone: LOCAL, password: "wrong-pass-1" });
    const unknown = await post("login", { phone: "751234567", password: "wrong-pass-1" });
    assert.deepEqual([wrong.res.status, wrong.text], [401, '{"error":"invalid-credentials"}']);
    assert.equal(unknown.text, wrong.text);
    for (let i = 0; i < 4; i++) await post("login", { phone: LOCAL, password: `wrong-pass-${i}` });
    const locked = await post("login", { phone: LOCAL, password: PASS });
    assert.equal(locked.res.status, 429);
    assert.equal(locked.json.error, "too-many-attempts");
    assert.equal(locked.res.headers.get("retry-after"), String(locked.json.retryAfter));
  });

  it("خطأ تخزين ⇒ 500 موحَّد، والسجل باسم الصنف فقط (لا رقم/رمز/كلمة مرور)", async () => {
    const logged = [];
    const original = console.error;
    console.error = (...a) => logged.push(a.map(String).join(" "));
    const broken = ctx.world.store.findDriverByLocalPhone;
    ctx.world.store.findDriverByLocalPhone = async () => { throw new Error(`boom ${LOCAL} ${PASS}`); };
    try {
      const r = await post("login", { phone: LOCAL, password: PASS });
      assert.deepEqual([r.res.status, r.text], [500, '{"error":"server-error"}']);
    } finally { console.error = original; ctx.world.store.findDriverByLocalPhone = broken; }
    assert.equal(logged.length, 1);
    assert.equal(logged[0].includes(LOCAL) || logged[0].includes(PASS), false, logged[0]);
  });

  it("خطأ إعداد (OtpConfigError) ⇒ 503", async () => {
    const { createDriverAuthHandlers } = await lib("driverAuth/handlers.ts");
    const { OtpConfigError } = await lib("otp/config.ts");
    const handlers = createDriverAuthHandlers(() => { throw new OtpConfigError("otp-channel-not-configured"); });
    const res = await handlers.otpRequest(req({ phone: LOCAL }));
    assert.deepEqual([res.status, await res.json()], [503, { error: "service-unavailable" }]);
  });
});
