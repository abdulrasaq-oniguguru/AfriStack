import { createHmac, randomUUID } from "node:crypto";

const gatewayUrl = (process.env["AFRICA_GATEWAY_URL"] ?? "http://localhost:4010").replace(
  /\/$/,
  ""
);
const apiKey = process.env["AFRICA_GATEWAY_API_KEY"] ?? "afd_test_local_development_key_change_me";
const reference = `QUICKSTART-${randomUUID()}`;
const idempotencyKey = `quickstart-${randomUUID()}`;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${gatewayUrl}${path}`, init);
  if (!response.ok)
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${await response.text()}`);
  return response;
}

async function main(): Promise<void> {
  await request("/health");
  console.log("✓ Gateway healthy");

  const paymentResponse = await request("/v1/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      provider: "mock",
      amountMinor: "500000",
      currency: "NGN",
      customer: { email: "quickstart@example.com" },
      reference
    })
  });
  const payment = (await paymentResponse.json()) as { reference: string; status: string };
  console.log(`✓ Mock payment created (${payment.status})`);

  const verified = (await (
    await request(`/v1/payments/${encodeURIComponent(payment.reference)}`, {
      headers: { "x-api-key": apiKey }
    })
  ).json()) as { status: string };
  console.log(`✓ Payment verified (${verified.status})`);

  const raw = JSON.stringify({
    reference: payment.reference,
    status: "succeeded",
    eventId: idempotencyKey
  });
  const signature = createHmac("sha256", "africa-dev-local-mock").update(raw).digest("hex");
  const headers = { "content-type": "application/json", "x-africa-mock-signature": signature };
  const accepted = (await (
    await request("/v1/webhooks/mock", { method: "POST", headers, body: raw })
  ).json()) as { type: string; duplicate: boolean };
  if (accepted.type !== "payment.succeeded")
    throw new Error(
      `Expected canonical payment.succeeded event, received '${accepted.type ?? "unknown"}'`
    );
  console.log("✓ Webhook accepted");
  console.log(`✓ Canonical event: ${accepted.type}`);

  const duplicate = (await (
    await request("/v1/webhooks/mock", { method: "POST", headers, body: raw })
  ).json()) as { duplicate: boolean };
  if (!duplicate.duplicate) throw new Error("Expected duplicate webhook to be ignored");
  console.log("✓ Duplicate webhook ignored");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Quickstart failed");
  process.exitCode = 1;
});
