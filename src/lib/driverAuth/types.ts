// عقد تدفق المندوب الجديد (تفعيل أول بـOTP ثم كلمة مرور، ودخول يومي بكلمة المرور). لا استيراد من
// Next/Supabase هنا: التنفيذ الحقيقي في supabaseStore.ts (سيرفر فقط)، والاختبارات تستخدم بدائل بالذاكرة.

// حساب المندوب كما يراه المسار الخادمي. activated = وُضعت له كلمة مرور من المندوب نفسه (التفعيل) أو
// من الأدمن (أداة الحسابات) — العلامة في auth app_metadata (لا يستطيع المستخدم تعديلها بنفسه،
// بخلاف user_metadata). حسابات ما قبل التدفق الجديد (كلمة مرور عشوائية لا يعرفها أحد) = غير مفعَّلة.
export interface DriverIdentity {
  id: string;
  email: string;
  activated: boolean;
}

export type CreateDriverResult = { ok: true } | { ok: false; code: "phone-taken" | "region-invalid" | "failed" };

export interface DriverStore {
  findDriverByLocalPhone(local: string): Promise<DriverIdentity | null>;
  // true = الرقم غير مسجَّل بأي حساب (عميل/متجر/أدمن/مندوب) — phone_available (0071).
  isPhoneAvailable(local: string): Promise<boolean>;
  activateDriver(id: string, password: string): Promise<{ ok: boolean }>;
  // approval_status لا يُمرَّر هنا إطلاقاً: الصف الجديد يأخذ الافتراضي 'pending' من القاعدة (0058).
  createDriver(input: {
    local: string;
    password: string;
    fullName: string;
    regionId: string;
    vehicleType?: string;
    plateNumber?: string;
  }): Promise<CreateDriverResult>;
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
}

export type PasswordSignIn = (
  email: string,
  password: string
) => Promise<{ ok: true; userId: string; session: SessionTokens } | { ok: false }>;
