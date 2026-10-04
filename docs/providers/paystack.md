# Paystack provider

Verified against official documentation: 2026-10-04.

- Signup: <https://paystack.com/signup>
- Transactions: <https://paystack.com/docs/api/transaction/>
- Refunds: <https://paystack.com/docs/api/refund/>
- Webhooks: <https://paystack.com/docs/payments/webhooks/>
- Required environment variable: `PAYSTACK_SECRET_KEY`
- Implemented: initialize, verify by reference, fetch by provider ID, refund, webhook signature and normalization.
- Webhook: hex HMAC-SHA512 in `x-paystack-signature`, calculated over untouched request bytes.

The adapter uses hosted checkout and never accepts card details. Paystack receives integer subunits. Initialization itself does not prove payment success; always verify reference, amount, currency, and status before giving value. Local gateway sandbox verification passed on 2026-10-04: hosted checkout initialization, a completed test card payment, provider-side verification, HMAC-SHA512 webhook verification, normalization, and duplicate-delivery handling. CI still intentionally runs without provider credentials; project-owned sandbox credentials must be configured as protected optional CI secrets before making this an automated release gate.
