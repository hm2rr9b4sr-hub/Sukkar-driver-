import { createClient } from "@/lib/supabase/client";

// مصدر الحقيقة لكل استعلامات البيانات بتطبيق Sukkar Driver — طبقة مستقلة
// عن lib/data.ts لموقع سُكّر الرئيسي (كانت مصدر هذا الملف قبل فصل تطبيق
// المندوب لمشروع Vercel/دومين خاص به). تحتوي فقط الدوال/الأنواع التي
// يحتاجها المندوب — بلا أي منطق متجر/عميل/أدمن.

export type DeliveryStatus = "assigned" | "accepted" | "picked_up" | "on_the_way" | "delivered";
export type DriverStatus = "offline" | "available" | "busy";
export type DeliveryExceptionType = "customer_unavailable" | "customer_refused" | "delivery_problem" | "driver_issue";

export interface UIDelivery {
  id: string;
  orderId: string;
  orderNumber: string;
  regionId: string;
  driverId: string | null;
  driverName: string | null;
  status: DeliveryStatus;
  offerAttempt: number;
  offerExpiresAt: string | null;
  remainingAmountSnapshot: number;
  deliveryFeeSnapshot: number;
  cashExpected: number;
  cashHandedToSukkarAt: string | null;
  cashConfirmedBySukkarAt: string | null;
  cashRejectedAt: string | null;
  cashRejectionReason: string | null;
  createdAt: string;
}

export interface UIDriverProfile {
  id: string;
  fullName: string;
  phone: string;
  status: DriverStatus;
  regionId: string;
  isActive: boolean;
}

export async function fetchMyDriverProfile(): Promise<UIDriverProfile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("drivers").select("id, full_name, phone, status, region_id, is_active").eq("id", user.id).single();
  if (error || !data) return null;
  return { id: data.id, fullName: data.full_name, phone: data.phone, status: data.status as DriverStatus, regionId: data.region_id, isActive: data.is_active };
}

export async function driverSetStatus(status: "offline" | "available"): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("driver_set_status", { p_status: status });
  return { error: error?.message ?? null };
}

export async function driverUpdateLocation(lat: number, lng: number): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("driver_update_location", { p_lat: lat, p_lng: lng });
  return { error: error?.message ?? null };
}

export interface UIDriverDeliveryDetail extends UIDelivery {
  storeName: string; storeLat: number | null; storeLng: number | null; storeAddress: string | null;
  customerPhone: string; customerLat: number | null; customerLng: number | null; deliveryAddress: string | null;
}

export async function fetchMyDeliveries(): Promise<UIDriverDeliveryDetail[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("deliveries")
    .select(`
      id, order_id, region_id, driver_id, status, offer_attempt, offer_expires_at,
      remaining_amount_snapshot, delivery_fee_snapshot, cash_expected,
      cash_handed_to_sukkar_at, cash_confirmed_by_sukkar_at, cash_rejected_at, cash_rejection_reason, created_at,
      orders(order_number, customer_phone, customer_lat, customer_lng, delivery_address, stores(name_ar, lat, lng))
    `)
    .eq("driver_id", user.id)
    .in("status", ["assigned", "accepted", "picked_up", "on_the_way"])
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((d) => ({
    id: d.id, orderId: d.order_id, orderNumber: d.orders?.order_number ?? "", regionId: d.region_id,
    driverId: d.driver_id, driverName: null, status: d.status, offerAttempt: d.offer_attempt,
    offerExpiresAt: d.offer_expires_at, remainingAmountSnapshot: d.remaining_amount_snapshot,
    deliveryFeeSnapshot: d.delivery_fee_snapshot, cashExpected: d.cash_expected,
    cashHandedToSukkarAt: d.cash_handed_to_sukkar_at, cashConfirmedBySukkarAt: d.cash_confirmed_by_sukkar_at,
    cashRejectedAt: d.cash_rejected_at, cashRejectionReason: d.cash_rejection_reason,
    createdAt: d.created_at,
    storeName: d.orders?.stores?.name_ar ?? "", storeLat: d.orders?.stores?.lat ?? null, storeLng: d.orders?.stores?.lng ?? null,
    storeAddress: null, customerPhone: d.orders?.customer_phone ?? "", customerLat: d.orders?.customer_lat ?? null,
    customerLng: d.orders?.customer_lng ?? null, deliveryAddress: d.orders?.delivery_address ?? null,
  }));
}

export async function fetchMyDeliveryHistory(): Promise<UIDelivery[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("deliveries")
    .select("id, order_id, region_id, driver_id, status, offer_attempt, offer_expires_at, remaining_amount_snapshot, delivery_fee_snapshot, cash_expected, cash_handed_to_sukkar_at, cash_confirmed_by_sukkar_at, cash_rejected_at, cash_rejection_reason, created_at, orders(order_number)")
    .eq("driver_id", user.id)
    .eq("status", "delivered")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((d) => ({
    id: d.id, orderId: d.order_id, orderNumber: d.orders?.order_number ?? "", regionId: d.region_id,
    driverId: d.driver_id, driverName: null, status: d.status, offerAttempt: d.offer_attempt,
    offerExpiresAt: d.offer_expires_at, remainingAmountSnapshot: d.remaining_amount_snapshot,
    deliveryFeeSnapshot: d.delivery_fee_snapshot, cashExpected: d.cash_expected,
    cashHandedToSukkarAt: d.cash_handed_to_sukkar_at, cashConfirmedBySukkarAt: d.cash_confirmed_by_sukkar_at,
    cashRejectedAt: d.cash_rejected_at, cashRejectionReason: d.cash_rejection_reason,
    createdAt: d.created_at,
  }));
}

export async function driverRespondToOffer(deliveryId: string, accept: boolean): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("driver_respond_to_offer", { p_delivery_id: deliveryId, p_accept: accept });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok: boolean; error?: string };
  return { ok: result.ok, error: result.error ?? null };
}

export async function driverMarkPickedUp(deliveryId: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("driver_mark_picked_up", { p_delivery_id: deliveryId });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok: boolean; error?: string };
  return { ok: result.ok, error: result.error ?? null };
}

export async function driverMarkOnTheWay(deliveryId: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("driver_mark_on_the_way", { p_delivery_id: deliveryId });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok: boolean; error?: string };
  return { ok: result.ok, error: result.error ?? null };
}

// p_cashCollected يجب أن يكون true صراحة — نفس الشرط الصارم المفروض بمستوى RPC.
export async function driverMarkDelivered(deliveryId: string, cashCollected: true): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("driver_mark_delivered", { p_delivery_id: deliveryId, p_cash_collected: cashCollected });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok: boolean; error?: string };
  return { ok: result.ok, error: result.error ?? null };
}

export async function driverReportCashHandoff(deliveryId: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("driver_report_cash_handoff", { p_delivery_id: deliveryId });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok: boolean; error?: string };
  return { ok: result.ok, error: result.error ?? null };
}

export async function driverReportException(
  deliveryId: string, exceptionType: DeliveryExceptionType, description?: string, photoUrl?: string
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("driver_report_exception", {
    p_delivery_id: deliveryId, p_exception_type: exceptionType, p_description: description ?? null, p_photo_url: photoUrl ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok: boolean; error?: string };
  return { ok: result.ok, error: result.error ?? null };
}

export async function uploadDeliveryExceptionPhoto(deliveryId: string, file: File): Promise<{ path: string | null; error: string | null }> {
  const supabase = createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
  const path = `${deliveryId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("delivery-exception-photos").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export interface UIDriverNotification {
  id: string; deliveryId: string | null; type: string; message: string; isRead: boolean; createdAt: string;
}

export async function fetchDriverNotifications(): Promise<UIDriverNotification[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("driver_notifications")
    .select("id, delivery_id, type, message, is_read, created_at")
    .eq("driver_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((n) => ({ id: n.id, deliveryId: n.delivery_id, type: n.type, message: n.message, isRead: n.is_read, createdAt: n.created_at }));
}
