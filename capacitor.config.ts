import type { CapacitorConfig } from "@capacitor/cli";

// معمارية Remote URL — نفس مشروع سُكّر الرئيسي (سبب الالتزام بها موثَّق هناك:
// الموقع يعتمد middleware/جلسات Supabase سيرفر-سايد، Static Export يعطّلها).
// appId مختلف تماماً عن تطبيق العميل (com.sukkar.app) — تطبيقان منفصلان
// بنظر آبل/جوجل، هوية توقيع مستقلة، لا تعارض أبداً بجهاز واحد يحمل الاثنين.
const config: CapacitorConfig = {
  appId: "com.sukkar.driver",
  appName: "Sukkar Driver",
  webDir: "www",
  server: {
    url: "https://sukkar-driver.vercel.app",
    androidScheme: "https",
    cleartext: false,
    // يُعرض بدل صفحة خطأ WebView الافتراضية لو تعذّر تحميل الرابط البعيد
    // (مثلاً فتح التطبيق لأول مرة بلا اتصال) — راجع www/offline.html.
    errorPath: "offline.html",
  },
};

export default config;
