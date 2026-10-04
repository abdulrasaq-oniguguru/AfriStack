# Termii

Verified against the official documentation on 2026-10-04.

- Signup and account configuration: [Termii developer portal](https://developers.termii.com/)
- Required variables: `TERMII_API_KEY`, `TERMII_BASE_URL`, and a configured sender ID.
- Capabilities: transactional SMS, OTP delivery, OTP verification.
- Unsupported: WhatsApp, inbound messages, and delivery-status webhooks.

Termii's current documentation requires the account-specific base URL shown in the Termii dashboard. The adapter deliberately does not supply a guessed base URL. It uses `/api/sms/send`, `/api/sms/otp/send`, and `/api/sms/otp/verify` relative to `TERMII_BASE_URL`.

No public sandbox guarantee is claimed here. Use a non-production Termii account or provider-approved test configuration for live integration verification. API keys belong only in server-side environment variables.
