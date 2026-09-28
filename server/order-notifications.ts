export type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export type Delivery = {
  recipient: string;
  status: "pending" | "sending" | "accepted" | "failed" | "uncertain";
  attempts: number;
  provider_message_id: string | null;
  first_attempt_at: string | null;
  email_payload: EmailPayload;
};

export type Queue = { order_snapshot: unknown; attempts: number };
export type NotificationStore = {
  claim: () => Promise<string[]>;
  queue: (orderId: string) => Promise<Queue>;
  deliveries: (orderId: string) => Promise<Delivery[]>;
  initialize: (orderId: string, payloads: EmailPayload[]) => Promise<void>;
  updateDelivery: (orderId: string, recipient: string, values: Record<string, unknown>) => Promise<void>;
  updateQueue: (orderId: string, values: Record<string, unknown>) => Promise<void>;
};

type Dependencies = {
  env: (name: string) => string | undefined;
  createStore: (url: string, serviceKey: string) => NotificationStore;
  fetch: typeof fetch;
  now?: () => number;
};

type Order = {
  id: string;
  contact: string;
  address: string;
  delivery_preference?: string | null;
  lat: number | null;
  lng: number | null;
  items: { name: string; price: number; qty: number }[];
  total: number;
  payment_method: string | null;
  status: string;
  created_at: string;
};

const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const retryWindowMs = 23 * 60 * 60 * 1000;
const maximumAttempts = 12;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function recipientsFrom(value: string | undefined) {
  const recipients = (value ?? "").split(",").map((item) => item.trim().toLowerCase());
  if (recipients.length > 5 || recipients.some((item) => item.length > 254 || !emailPattern.test(item))) {
    return null;
  }
  return [...new Set(recipients)];
}

function validSender(value: string | undefined): value is string {
  if (!value || /[\r\n]/.test(value)) return false;
  const match = value.match(/^[^<>\r\n]{1,100}<([^<>]+)>$/);
  return emailPattern.test(match ? match[1] : value);
}

async function secretsMatch(expected: string, presented: string | null) {
  if (!presented) return false;
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(presented)),
  ]);
  const left = new Uint8Array(leftDigest);
  const right = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function idempotencyKey(orderId: string, recipient: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(recipient));
  const key = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `ampm-order-${orderId}-${key}`;
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validOrder(value: unknown, orderId: string): value is Order {
  if (!object(value) || value.id !== orderId || !boundedText(value.contact, 500) ||
    !boundedText(value.address, 5000) || !boundedText(value.created_at, 100) ||
    (value.delivery_preference != null && !boundedText(value.delivery_preference, 500)) ||
    !Number.isFinite(Date.parse(value.created_at)) || !boundedText(value.status, 100) ||
    (value.payment_method !== null && !boundedText(value.payment_method, 100)) ||
    typeof value.total !== "number" || !Number.isFinite(value.total) || value.total <= 0 ||
    !Array.isArray(value.items) || value.items.length === 0 || value.items.length > 200) return false;
  return value.items.every((item) => object(item) && boundedText(item.name, 500) &&
    typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 &&
    typeof item.qty === "number" && Number.isSafeInteger(item.qty) && item.qty > 0);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function money(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ₮`;
}

export function emailPayload(order: Order, sender: string, recipient: string): EmailPayload {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ulaanbaatar", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(order.created_at));
  const payment = order.payment_method === "qpay" ? "QPay" :
    order.payment_method === "transfer" ? "Банкны шилжүүлэг" : order.payment_method ?? "Тодорхойгүй";
  const rows = [
    ["Захиалгын дугаар", order.id],
    ["Бүртгэгдсэн цаг (Улаанбаатар)", date],
    ["Утас / имэйл", order.contact],
    ["Хүргэлтийн хаяг", order.address],
    ["Хүргүүлэх хүссэн өдөр / цаг", order.delivery_preference || "Заагаагүй — утсаар тохиролцоно"],
    ["Төлбөрийн сонголт", payment],
    ["Захиалгын төлөв", order.status === "new" ? "Шинэ захиалга" : order.status],
  ];
  const hasCoordinates = typeof order.lat === "number" && Number.isFinite(order.lat) &&
    Math.abs(order.lat) <= 90 && typeof order.lng === "number" && Number.isFinite(order.lng) && Math.abs(order.lng) <= 180;
  const mapUrl = hasCoordinates ? `https://www.google.com/maps/search/?api=1&query=${order.lat},${order.lng}` : null;
  const note = "Захиалга бүртгэгдсэн. Энэ мэдэгдэл нь төлбөр төлөгдсөнийг батлахгүй. Хүргүүлэх өдөр, цаг нь хэрэглэгчийн хүсэлт бөгөөд хүргэлтийн ажилтан холбогдож баталгаажуулна.";
  const text = [
    "AM/PM - Шинэ захиалга", ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(mapUrl ? [`Газрын зураг: ${mapUrl}`] : []), "",
    ...order.items.map((item) => `${item.name} | ${item.qty} x ${money(item.price)} = ${money(item.qty * item.price)}`),
    `Нийт дүн: ${money(order.total)}`, "", note, "Админ: https://ampm.mn/#admin",
  ].join("\n");
  const html = `<!doctype html><html lang="mn"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#18221c">
<div style="max-width:680px;margin:0 auto;padding:24px 16px"><div style="padding:24px;background:#fff;border:1px solid #dfe5e1;border-radius:8px">
<p style="margin:0 0 8px;font-weight:bold;color:#137b45">AM/PM</p><h1 style="font-size:24px;margin:0 0 20px">Шинэ захиалга ирлээ</h1>
<table style="width:100%;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:8px 4px;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 4px;border-bottom:1px solid #eee;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("")}</table>
${mapUrl ? `<p><a href="${escapeHtml(mapUrl)}">Хүргэлтийн байршлыг харах</a></p>` : ""}
<h2 style="font-size:18px;margin-top:24px">Захиалсан бүтээгдэхүүн</h2><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th style="padding:8px 4px">Бүтээгдэхүүн</th><th style="padding:8px 4px">Тоо</th><th style="padding:8px 4px">Нэгж үнэ</th><th style="padding:8px 4px">Дүн</th></tr></thead><tbody>
${order.items.map((item) => `<tr><td style="padding:8px 4px;border-top:1px solid #eee;overflow-wrap:anywhere">${escapeHtml(item.name)}</td><td style="padding:8px 4px;border-top:1px solid #eee">${item.qty}</td><td style="padding:8px 4px;border-top:1px solid #eee">${money(item.price)}</td><td style="padding:8px 4px;border-top:1px solid #eee">${money(item.price * item.qty)}</td></tr>`).join("")}</tbody></table>
<p style="text-align:right;font-size:20px;font-weight:bold">Нийт дүн: ${money(order.total)}</p><p style="font-size:13px;color:#555">${note}</p><p><a href="https://ampm.mn/#admin" style="color:#137b45">Админ хэсэг</a></p>
</div></div></body></html>`;
  return { from: sender, to: [recipient], subject: `AM/PM шинэ захиалга #${order.id.slice(0, 8)}`, html, text };
}

type Outcome = { ok: boolean; permanent?: boolean };

export function createOrderNotificationHandler(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const timestamp = () => new Date(now()).toISOString();

  async function failQueue(store: NotificationStore, orderId: string, attempts: number, reason: string, permanent = false) {
    const terminal = permanent || attempts >= maximumAttempts;
    await store.updateQueue(orderId, {
      status: "failed", last_error: reason,
      next_attempt_at: terminal ? null : new Date(now() + Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000).toISOString(),
      updated_at: timestamp(),
    });
  }

  async function send(store: NotificationStore, orderId: string, delivery: Delivery, apiKey: string): Promise<Outcome> {
    if (delivery.status === "accepted") return { ok: true };
    if (delivery.status === "uncertain") return { ok: false, permanent: true };
    const firstAttempt = delivery.first_attempt_at ? Date.parse(delivery.first_attempt_at) : null;
    if ((delivery.attempts > 0 && (firstAttempt === null || !Number.isFinite(firstAttempt))) ||
      (firstAttempt !== null && now() - firstAttempt >= retryWindowMs)) {
      await store.updateDelivery(orderId, delivery.recipient, {
        status: "uncertain", last_error: "idempotency_window_elapsed_manual_review_required", updated_at: timestamp(),
      });
      return { ok: false, permanent: true };
    }
    const payload = delivery.email_payload;
    if (!payload || !validSender(payload.from) || payload.to?.length !== 1 ||
      payload.to[0] !== delivery.recipient || !emailPattern.test(delivery.recipient) ||
      !boundedText(payload.subject, 500) || !boundedText(payload.html, 500_000) || !boundedText(payload.text, 500_000)) {
      await store.updateDelivery(orderId, delivery.recipient, {
        status: "uncertain", last_error: "invalid_saved_email_payload", updated_at: timestamp(),
      });
      return { ok: false, permanent: true };
    }
    await store.updateDelivery(orderId, delivery.recipient, {
      status: "sending", attempts: delivery.attempts + 1,
      first_attempt_at: delivery.first_attempt_at ?? timestamp(), last_error: null, updated_at: timestamp(),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    let result: unknown;
    try {
      response = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": await idempotencyKey(orderId, delivery.recipient) },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      result = await response.json().catch(() => null);
    } catch {
      await store.updateDelivery(orderId, delivery.recipient, {
        status: "failed", last_error: "provider_network_error", updated_at: timestamp(),
      });
      return { ok: false };
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      await store.updateDelivery(orderId, delivery.recipient, {
        status: "failed", last_error: `provider_http_${response.status}`, updated_at: timestamp(),
      });
      return { ok: false };
    }
    if (!object(result) || !boundedText(result.id, 200)) {
      await store.updateDelivery(orderId, delivery.recipient, {
        status: "uncertain", last_error: "provider_success_without_message_id", updated_at: timestamp(),
      });
      return { ok: false, permanent: true };
    }
    await store.updateDelivery(orderId, delivery.recipient, {
      status: "accepted", provider_message_id: result.id, accepted_at: timestamp(), last_error: null, updated_at: timestamp(),
    });
    return { ok: true };
  }

  async function processOrder(store: NotificationStore, orderId: string, apiKey: string, sender: string, recipients: string[]): Promise<Outcome> {
    const queue = await store.queue(orderId);
    let deliveries = await store.deliveries(orderId);
    if (deliveries.length === 0) {
      if (!validOrder(queue.order_snapshot, orderId)) {
        await failQueue(store, orderId, queue.attempts, "invalid_order_snapshot", true);
        return { ok: false, permanent: true };
      }
      // Store the exact email and recipient set once, before any provider call.
      const order = queue.order_snapshot;
      await store.initialize(orderId, recipients.map((recipient) => emailPayload(order, sender, recipient)));
      deliveries = await store.deliveries(orderId);
      if (deliveries.length !== recipients.length) throw new Error("delivery_rows_incomplete");
    }
    const results = await Promise.allSettled(deliveries.map((delivery) => send(store, orderId, delivery, apiKey)));
    const failures = results.map((result): Outcome => result.status === "fulfilled" ? result.value : { ok: false })
      .filter((result) => !result.ok);
    if (failures.length > 0) {
      const permanent = failures.every((result) => result.permanent) || queue.attempts >= maximumAttempts;
      await failQueue(store, orderId, queue.attempts, permanent ? "delivery_requires_manual_review" : "recipient_delivery_failed", permanent);
      return { ok: false, permanent };
    }
    await store.updateQueue(orderId, {
      status: "sent", last_error: null, next_attempt_at: null,
      provider_accepted_at: timestamp(), sent_at: timestamp(), updated_at: timestamp(),
    });
    return { ok: true };
  }

  return async (req: Request): Promise<Response> => {
    if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
    const cronSecret = deps.env("CRON_SECRET");
    if (!cronSecret) return json(503, { error: "cron_not_configured" });
    if (!await secretsMatch(`Bearer ${cronSecret}`, req.headers.get("Authorization"))) return json(401, { error: "unauthorized" });
    if (deps.env("AMPM_EMAIL_ENABLED") !== "true") {
      return json(200, { ok: true, paused: true, claimed: 0, accepted: 0, failed: 0 });
    }
    const url = deps.env("SUPABASE_URL");
    const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json(503, { error: "server_configuration_error" });
    const apiKey = deps.env("RESEND_API_KEY");
    const sender = deps.env("AMPM_NOTIFICATION_FROM");
    const recipients = recipientsFrom(deps.env("AMPM_NOTIFICATION_TO"));
    if (!apiKey || !validSender(sender) || !recipients) return json(503, { error: "email_provider_not_configured" });
    let store: NotificationStore;
    let claimed: string[];
    try {
      store = deps.createStore(url, serviceKey);
      claimed = await store.claim();
    } catch {
      return json(500, { error: "queue_claim_failed" });
    }
    let accepted = 0;
    let failed = 0;
    let retryScheduled = false;
    for (const orderId of claimed) {
      try {
        const outcome = await processOrder(store, orderId, apiKey, sender, recipients);
        if (outcome.ok) accepted += 1;
        else { failed += 1; retryScheduled ||= !outcome.permanent; }
      } catch {
        failed += 1;
        try {
          const queue = await store.queue(orderId);
          await failQueue(store, orderId, queue.attempts, "notification_processing_failed");
          retryScheduled ||= queue.attempts < maximumAttempts;
        } catch {
          // The database claim expires after five minutes if audit persistence fails.
          retryScheduled = true;
        }
      }
    }
    return json(failed ? 502 : 200, { ok: failed === 0, claimed: claimed.length, accepted, failed, retry_scheduled: retryScheduled });
  };
}
