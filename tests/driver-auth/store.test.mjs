// اختبار الغراء الحقيقي supabaseStore.ts بعميل admin وهمي يسجّل كل نداء: يتحقق من الاستعلامات
// المرسلة فعلاً (بما فيها أن approval_status لا يُكتب أبداً) دون أي اتصال بـSupabase.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lib } from "./helpers.mjs";

const { supabaseDriverStore } = await lib("driverAuth/supabaseStore.ts");

function fakeAdmin({ drivers = [], users = {}, rpc = { data: true }, insertError = null, createError = null, updateError = null } = {}) {
  const log = { like: [], inserts: [], created: [], updated: [], deleted: [], rpc: [] };
  return {
    log,
    from: (table) => ({
      select: () => ({ like: async (col, pat) => { log.like.push([table, col, pat]); return { data: drivers, error: null }; } }),
      insert: async (row) => { log.inserts.push([table, row]); return { error: insertError }; },
    }),
    rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: rpc.data, error: rpc.error ?? null }; },
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: users[id] ?? null }, error: users[id] ? null : { message: "nf" } }),
        createUser: async (input) => { log.created.push(input); return createError ? { data: null, error: createError } : { data: { user: { id: "new-1" } }, error: null }; },
        updateUserById: async (id, attrs) => { log.updated.push([id, attrs]); return { error: updateError }; },
        deleteUser: async (id) => { log.deleted.push(id); return { error: null }; },
      },
    },
  };
}

const user = (over = {}) => ({ id: "d1", email: "771234567-driver@sukkar.app", app_metadata: {}, banned_until: null, ...over });

describe("supabaseDriverStore.findDriverByLocalPhone", () => {
  it("يطابق آخر 9 أرقام بأي صيغة تخزين، ويقرأ البريد وعلامة التفعيل من auth", async () => {
    const admin = fakeAdmin({
      drivers: [{ id: "d1", phone: "+967 771234567" }],
      users: { d1: user({ app_metadata: { driver_password_set_at: "2026-10-30T00:00:00Z" } }) },
    });
    const r = await supabaseDriverStore(admin).findDriverByLocalPhone("771234567");
    assert.deepEqual(r, { id: "d1", email: "771234567-driver@sukkar.app", activated: true });
    assert.deepEqual(admin.log.like[0], ["drivers", "phone", "%771234567"]);
  });

  it("غير مفعَّل بلا العلامة (حساب بكلمة مرور عشوائية قديمة)", async () => {
    const admin = fakeAdmin({ drivers: [{ id: "d1", phone: "771234567" }], users: { d1: user() } });
    assert.equal((await supabaseDriverStore(admin).findDriverByLocalPhone("771234567")).activated, false);
  });

  it("لا تُقرأ العلامة من user_metadata (يستطيع المستخدم تعديلها) — app_metadata فقط", async () => {
    const admin = fakeAdmin({ drivers: [{ id: "d1", phone: "771234567" }], users: { d1: { ...user(), user_metadata: { driver_password_set_at: "x" } } } });
    assert.equal((await supabaseDriverStore(admin).findDriverByLocalPhone("771234567")).activated, false);
  });

  it("لا تطابق/ملتبس/محظور/محذوف ⇒ null", async () => {
    const none = fakeAdmin({ drivers: [] });
    assert.equal(await supabaseDriverStore(none).findDriverByLocalPhone("771234567"), null);
    const twin = fakeAdmin({ drivers: [{ id: "d1", phone: "771234567" }, { id: "d2", phone: "0771234567" }], users: { d1: user(), d2: user({ id: "d2" }) } });
    assert.equal(await supabaseDriverStore(twin).findDriverByLocalPhone("771234567"), null);
    // حزام ثانٍ: لو أرجع الاستعلام صفاً لا ينتهي بالأرقام التسعة (سلوك غير متوقع) يُهمَل
    const falseHit = fakeAdmin({ drivers: [{ id: "d1", phone: "771234568" }], users: { d1: user() } });
    assert.equal(await supabaseDriverStore(falseHit).findDriverByLocalPhone("771234567"), null);
    const banned = fakeAdmin({ drivers: [{ id: "d1", phone: "771234567" }], users: { d1: user({ banned_until: "2999-01-01T00:00:00Z" }) } });
    assert.equal(await supabaseDriverStore(banned).findDriverByLocalPhone("771234567"), null);
    const noUser = fakeAdmin({ drivers: [{ id: "d1", phone: "771234567" }], users: {} });
    assert.equal(await supabaseDriverStore(noUser).findDriverByLocalPhone("771234567"), null);
  });
});

describe("supabaseDriverStore.activateDriver / isPhoneAvailable", () => {
  it("يضبط كلمة المرور وعلامة التفعيل بنداء واحد ولا يمسّ حقل الموافقة", async () => {
    const admin = fakeAdmin();
    assert.deepEqual(await supabaseDriverStore(admin).activateDriver("d1", "Sukkar@2026!"), { ok: true });
    const [id, attrs] = admin.log.updated[0];
    assert.equal(id, "d1");
    assert.deepEqual(Object.keys(attrs).sort(), ["app_metadata", "password"]);
    assert.deepEqual(Object.keys(attrs.app_metadata), ["driver_password_set_at"]);
    assert.equal(fakeAdmin({ updateError: { message: "weak" } }) && (await supabaseDriverStore(fakeAdmin({ updateError: { message: "weak" } })).activateDriver("d1", "x")).ok, false);
  });

  it("phone_available: false ⇒ مسجَّل، وخطأ القاعدة يُرمى", async () => {
    assert.equal(await supabaseDriverStore(fakeAdmin({ rpc: { data: false } })).isPhoneAvailable("771234567"), false);
    assert.equal(await supabaseDriverStore(fakeAdmin({ rpc: { data: true } })).isPhoneAvailable("771234567"), true);
    await assert.rejects(supabaseDriverStore(fakeAdmin({ rpc: { data: null, error: { message: "x" } } })).isPhoneAvailable("771234567"), /phone-available-failed/);
  });
});

describe("supabaseDriverStore.createDriver", () => {
  const input = { local: "771234567", password: "Sukkar@2026!", fullName: "أحمد", regionId: "r1", vehicleType: "دراجة", plateNumber: "1" };

  it("ينشئ مستخدم auth ثم صف drivers، بلا approval_status مطلقاً", async () => {
    const admin = fakeAdmin();
    assert.deepEqual(await supabaseDriverStore(admin).createDriver(input), { ok: true });
    const created = admin.log.created[0];
    assert.equal(created.email, "771234567-driver@sukkar.app");
    assert.equal(created.email_confirm, true);
    assert.equal(created.user_metadata.role, "driver");
    assert.ok(created.app_metadata.driver_password_set_at);
    const [table, row] = admin.log.inserts[0];
    assert.equal(table, "drivers");
    assert.equal(row.id, "new-1");
    assert.equal("approval_status" in row, false);
    assert.equal(JSON.stringify(admin.log).includes("approval_status"), false);
  });

  it("فشل إدراج الصف ⇒ يُحذف مستخدم auth الجديد (لا حساب يتيم)", async () => {
    const admin = fakeAdmin({ insertError: { code: "XX000", message: "boom" } });
    assert.deepEqual(await supabaseDriverStore(admin).createDriver(input), { ok: false, code: "failed" });
    assert.deepEqual(admin.log.deleted, ["new-1"]);
  });

  it("تعارض الرقم والمنطقة والبريد المكرر تُصنَّف", async () => {
    const dup = fakeAdmin({ insertError: { code: "23505", message: "phone-already-registered" } });
    assert.deepEqual(await supabaseDriverStore(dup).createDriver(input), { ok: false, code: "phone-taken" });
    assert.deepEqual(dup.log.deleted, ["new-1"]);
    const region = fakeAdmin({ insertError: { code: "23503", message: "fk" } });
    assert.deepEqual(await supabaseDriverStore(region).createDriver(input), { ok: false, code: "region-invalid" });
    const exists = fakeAdmin({ createError: { message: "A user with this email address has already been registered" } });
    assert.deepEqual(await supabaseDriverStore(exists).createDriver(input), { ok: false, code: "phone-taken" });
    assert.equal(exists.log.inserts.length, 0);
    const other = fakeAdmin({ createError: { message: "network" } });
    assert.deepEqual(await supabaseDriverStore(other).createDriver(input), { ok: false, code: "failed" });
  });
});
