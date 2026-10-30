import { createDriverAuthHandlers } from "@/lib/driverAuth/handlers";
import { buildDriverAuthDeps } from "@/lib/driverAuth/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// مسار رفيع: المنطق كله بـlib/driverAuth (مختبَر بدون Next). الاعتماديات تُبنى كسولاً لكل طلب.
export const POST = createDriverAuthHandlers(() => buildDriverAuthDeps()).login;
