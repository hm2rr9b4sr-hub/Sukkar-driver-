import { isIP } from "net";

// عنوان العميل لحد الإرسال لكل IP. على Vercel، x-vercel-forwarded-for وx-real-ip
// يضعهما Vercel نفسه ولا يمكن للعميل انتحالهما؛ x-forwarded-for آخر خيار (خارج Vercel
// قد يكون منتحَلاً — وحد الـIP ثانوي أصلاً: الحماية الأساسية بحد كل رقم).
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string | null {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return null;
}
