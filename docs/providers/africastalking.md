# Africa's Talking

Verified against the official Node SDK and SMS documentation on 2026-10-04.

- Signup: [Africa's Talking account portal](https://account.africastalking.com/)
- Required variables: `AFRICASTALKING_API_KEY`, `AFRICASTALKING_USERNAME`; optionally `AFRICASTALKING_BASE_URL`.
- Capability: outbound SMS.
- Unsupported: OTP lifecycle, WhatsApp, inbound messages, and delivery-status webhooks.

The adapter follows the official Node SDK's form-encoded SMS request shape and `apikey` header. Its default endpoint is `https://api.africastalking.com/version1/messaging`. The provider's sandbox username is commonly `sandbox`, but provider/account availability and sender-ID requirements must be confirmed in the account portal before deployment.

The project does not list a country as supported merely because the adapter can send to a phone number there; availability is account and provider dependent and needs verifiable country-specific evidence.
