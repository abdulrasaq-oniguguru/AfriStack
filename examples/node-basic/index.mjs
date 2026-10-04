import { createHmac } from "node:crypto";

const gatewayUrl = process.env.AFRISTACK_GATEWAY_URL ?? "http://localhost:4010";
const apiKey = process.env.AFRISTACK_API_KEY ?? "afd_test_local_development_key_change_me";
const reference = `NODE-EXAMPLE-${Date.now()}`;

const request = async (path, options = {}) => {
  const response = await fetch(`${gatewayUrl}${path}`, {
    ...options,
    headers: { "x-api-key": apiKey, ...(options.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
};

const payment = await request("/v1/payments", {
  method: "POST",
  headers: { "content-type": "application/json", "idempotency-key": `create-${reference}` },
  body: JSON.stringify({
    amountMinor: "500000",
    currency: "NGN",
    customer: { email: "customer@example.com" },
    reference
  })
});
console.log("Created:", payment.status);

const verified = await request(`/v1/payments/${encodeURIComponent(reference)}`);
console.log("Verified:", verified.status);

const rawWebhook = JSON.stringify({ reference, status: "succeeded", eventId: `${reference}-paid` });
const signature = createHmac("sha256", "africa-dev-local-mock").update(rawWebhook).digest("hex");
await fetch(`${gatewayUrl}/v1/webhooks/mock`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-africa-mock-signature": signature },
  body: rawWebhook
});

const events = await request("/v1/events");
console.log("Latest canonical event:", events.data[0]?.type);
