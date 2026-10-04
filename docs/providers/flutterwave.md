# Flutterwave provider

Verified against official documentation: 2026-10-04.

- Signup: <https://app.flutterwave.com/register>
- Standard payments: <https://developer.flutterwave.com/docs/flutterwave-standard-1>
- Verification: <https://developer.flutterwave.com/reference/verify-transaction-with-tx_ref>
- Refunds: <https://developer.flutterwave.com/docs/refunds>
- Current webhook signature: <https://developer.flutterwave.com/v4.0.0/docs/webhooks>
- Required environment variables: `FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET`
- Implemented: hosted payment, verify by reference or provider ID, refund, current HMAC webhook verification, current and legacy payload normalization.

Flutterwave Standard receives decimal major-unit strings. The current webhook signature section specifies base64 HMAC-SHA256 in `flutterwave-signature`. The same official page contains older framework examples using direct secret comparison; this adapter deliberately follows the explicit current algorithm and does not accept the weaker legacy comparison. Critical webhook facts must still be re-queried before fulfillment.
