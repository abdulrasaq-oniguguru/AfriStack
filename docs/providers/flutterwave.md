# Flutterwave provider

Verified against official documentation: 2026-10-04.

- Signup: <https://app.flutterwave.com/register>
- Standard payments: <https://developer.flutterwave.com/docs/flutterwave-standard-1>
- Verification: <https://developer.flutterwave.com/reference/verify-transaction-with-tx_ref>
- Refunds: <https://developer.flutterwave.com/docs/refunds>
- Current webhook signature: <https://developer.flutterwave.com/v4.0.0/docs/webhooks>
- Required environment variables: `FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET`
- Implemented: Flutterwave v3 hosted payment, verification by reference or provider ID, refund, v3 webhook verification, and v3 payload normalization.

Flutterwave Standard receives decimal major-unit strings. Hosted checkout requires a `callbackUrl`, sent as `redirect_url`; the adapter refuses placeholder redirects. For v3 webhooks, configure the dashboard secret hash as `FLW_WEBHOOK_SECRET`; Flutterwave sends it in `verif-hash`, which the adapter compares in constant time. v4 `flutterwave-signature` HMAC payloads are intentionally rejected until a complete v4 migration. Critical webhook facts must still be re-queried before fulfillment.
