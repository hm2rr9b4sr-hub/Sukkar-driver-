// عرض المركبة ونوع الرحلة بتطبيق المندوب (Migration 0078 بمشروع سُكّر الرئيسي) — نسخة صغيرة مستقلة (مستودع منفصل).
export type VehicleCategory = "meter" | "car";
export type TripType = "one_way" | "round_trip";

export const vehicleLabel = (v: VehicleCategory) => (v === "car" ? "سيارة/باص" : "متر");
export const tripLabel = (t: TripType) => (t === "round_trip" ? "ذهاب وعودة" : "ذهاب فقط");
export const vehicleIcon = (v: VehicleCategory) => (v === "car" ? "🚐" : "🏍️");

// أجرة المندوب للرحلة: trip_fee المعتمد (0078) أو رسم التوصيل للصفوف القديمة.
export function driverTripEarning(d: { tripFee: number | null; deliveryFeeSnapshot: number }): number {
  return d.tripFee ?? d.deliveryFeeSnapshot ?? 0;
}
