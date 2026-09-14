import { createClient } from "@supabase/supabase-js";
import type { Delivery, NotificationStore, Queue } from "./order-notifications.ts";

export function createNotificationStore(url: string, key: string, fetchImpl: typeof fetch = fetch): NotificationStore {
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });
  return {
    async claim() {
      const { data, error } = await admin.rpc("ampm_claim_order_notifications", { p_limit: 1 });
      if (error || !Array.isArray(data)) throw new Error("queue_claim_failed");
      return data.map((row: { claimed_order_id: string }) => row.claimed_order_id);
    },
    async queue(orderId) {
      const { data, error } = await admin.from("ampm_order_notifications")
        .select("order_snapshot,attempts").eq("order_id", orderId).single<Queue>();
      if (error || !data) throw new Error("queue_lookup_failed");
      return data;
    },
    async deliveries(orderId) {
      const { data, error } = await admin.from("ampm_order_notification_deliveries")
        .select("recipient,status,attempts,provider_message_id,first_attempt_at,email_payload")
        .eq("order_id", orderId);
      if (error || !data) throw new Error("delivery_lookup_failed");
      return data as Delivery[];
    },
    async initialize(orderId, payloads) {
      const { error } = await admin.from("ampm_order_notification_deliveries").upsert(
        payloads.map((payload) => ({ order_id: orderId, recipient: payload.to[0], email_payload: payload })),
        { onConflict: "order_id,recipient", ignoreDuplicates: true },
      );
      if (error) throw new Error("delivery_initialization_failed");
    },
    async updateDelivery(orderId, recipient, values) {
      const { error } = await admin.from("ampm_order_notification_deliveries").update(values)
        .eq("order_id", orderId).eq("recipient", recipient).select("recipient").single();
      if (error) throw new Error("delivery_update_failed");
    },
    async updateQueue(orderId, values) {
      const { error } = await admin.from("ampm_order_notifications").update(values)
        .eq("order_id", orderId).select("order_id").single();
      if (error) throw new Error("queue_update_failed");
    },
  };
}
