// اختبارات تدفق المندوب (تفعيل OTP + دخول بكلمة المرور). تُشغَّل من جذر sukkar-driver:
//   PGLITE_MODULE=/abs/.../pglite/dist/index.js \
//   node --conditions=react-server --import file:///abs/sukkar/node_modules/tsx/dist/esm/index.mjs \
//        --test "tests/driver-auth/*.test.mjs"
// --conditions=react-server يسمح باستيراد وحدات `server-only` خارج Next. المشروع لا يحمل tsx/PGlite
// بـpackage.json عمداً؛ نعيد استخدام helpers مشروع sukkar (PGlite + نص 0080/0081 الحرفي) من المسار الشقيق.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SUKKAR = process.env.SUKKAR_REPO ? resolve(process.env.SUKKAR_REPO) : resolve(here, "../../../sukkar");
const base = await import(pathToFileURL(resolve(SUKKAR, "tests/otp/helpers.mjs")).href);
export const { freshDb, pgliteOtpDb, shiftCreated, asRole } = base;

const lib = (p) => import(pathToFileURL(resolve(here, "../../src/lib", p)).href);
const { OtpService } = await lib("otp/service.ts");
const { MockOtpChannel } = await lib("otp/channel.ts");
const { LoginThrottle } = await lib("otp/loginThrottle.ts");
const { DEFAULT_OTP_LIMITS, DEFAULT_LOGIN_THROTTLE } = await lib("otp/limits.ts");
const { DriverOnboarding } = await lib("driverAuth/onboarding.ts");
const { DriverLogin } = await lib("driverAuth/login.ts");
const { createDriverAuthHandlers } = await lib("driverAuth/handlers.ts");
export { lib, MockOtpChannel };

export const PEPPER = "p".repeat(40);
export const REGION = "11111111-2222-3333-4444-555555555555";

// عالم وهمي بالذاكرة: حسابات auth + صفوف drivers + أرقام عملاء/متاجر. يسجّل كل نداء كتابة لنتحقق
// أن approval_status لا يُمرَّر ولا يُغيَّر في أي مسار.
export function fakeWorld() {
  let seq = 0;
  const auth = new Map();
  const drivers = new Map();
  const others = new Set();
  const calls = { activate: [], create: [], signIn: [], deleted: [] };
  const flags = { failInsert: false, signInDelayMs: 0 };

  const addDriver = ({ local, approval = "approved", activated = false, password = "internal-random-secret-xyz", banned = false }) => {
    const id = `drv-${++seq}`;
    auth.set(id, { email: `${local}-driver@sukkar.app`, password, activated, banned });
    drivers.set(id, { phone: local, approval_status: approval });
    return id;
  };

  const store = {
    async findDriverByLocalPhone(local) {
      const found = [...drivers.entries()].filter(([, d]) => d.phone === local);
      if (found.length !== 1) return null;
      const [id] = found[0];
      const a = auth.get(id);
      return !a || a.banned ? null : { id, email: a.email, activated: a.activated };
    },
    async isPhoneAvailable(local) {
      return !others.has(local) && ![...drivers.values()].some((d) => d.phone === local);
    },
    async activateDriver(id, password) {
      calls.activate.push({ id });
      const a = auth.get(id);
      a.password = password;
      a.activated = true;
      return { ok: true };
    },
    async createDriver(input) {
      calls.create.push(input);
      const id = `drv-${++seq}`;
      auth.set(id, { email: `${input.local}-driver@sukkar.app`, password: input.password, activated: true });
      if (flags.failInsert) { auth.delete(id); calls.deleted.push(id); return { ok: false, code: "failed" }; }
      drivers.set(id, { phone: input.local, approval_status: "pending", full_name: input.fullName });
      return { ok: true };
    },
  };

  const signIn = async (email, password) => {
    calls.signIn.push(email);
    const e = [...auth.entries()].find(([, a]) => a.email === email);
    if (!e || e[1].banned || e[1].password !== password) return { ok: false };
    return { ok: true, userId: e[0], session: { access_token: `at-${e[0]}`, refresh_token: `rt-${e[0]}` } };
  };

  return { auth, drivers, others, calls, flags, addDriver, store, signIn };
}

export async function setup(opts = {}) {
  const db = await freshDb({ withThrottle: true });
  const world = fakeWorld();
  const channel = new MockOtpChannel();
  const settings = { pepper: PEPPER, limits: { ...DEFAULT_OTP_LIMITS, ...(opts.limits ?? {}) } };
  const otp = new OtpService({ db: pgliteOtpDb(db), channel, settings });
  const throttle = new LoginThrottle({ db: pgliteOtpDb(db), pepper: PEPPER, limits: { ...DEFAULT_LOGIN_THROTTLE, ...(opts.loginLimits ?? {}) } });
  const onboarding = new DriverOnboarding({ store: world.store, otp });
  const sleeps = [];
  let clock = 1_000_000;
  const signIn = async (e, p) => { clock += world.flags.signInDelayMs; return world.signIn(e, p); };
  const login = new DriverLogin({ store: world.store, throttle, signIn, sleep: async (ms) => { sleeps.push(ms); }, now: () => clock });
  const handlers = createDriverAuthHandlers(() => ({ onboarding, login }));
  const reset = async () => {
    await db.exec("truncate public.otp_challenges; truncate public.auth_login_attempts");
    world.auth.clear(); world.drivers.clear(); world.others.clear();
    world.calls.activate.length = world.calls.create.length = world.calls.signIn.length = world.calls.deleted.length = 0;
    world.flags.failInsert = false; world.flags.signInDelayMs = 0;
    channel.outbox.length = 0; channel.failWith = null; sleeps.length = 0;
  };
  return { db, world, channel, otp, throttle, onboarding, login, handlers, sleeps, reset };
}

export const req = (body, headers = {}) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

export const full = (local) => `967${local}`;

// طلب الرمز ثم التحقق به ← { ticket, mode }
export async function verifiedTicket(ctx, local) {
  const r = await ctx.onboarding.requestOtp({ phone: local });
  if (r.status !== "accepted") throw new Error(`request ${r.status}`);
  const code = ctx.channel.lastCodeFor(full(local));
  if (!code) throw new Error("no code sent");
  const v = await ctx.onboarding.verifyOtp({ phone: local, code });
  if (v.status !== "verified") throw new Error(`verify ${v.status}`);
  return v;
}
