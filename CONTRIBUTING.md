# Contributing

Run `corepack pnpm check` before submitting a change. Ordinary tests must not require personal secrets.

## Adding a provider

1. Implement the narrow capability interface; do not add empty methods.
2. Declare metadata, countries, environments, capabilities, official source URL, and verification date.
3. Validate provider responses at runtime.
4. Map requests, responses, statuses, and errors without leaking secrets.
5. Verify webhook signatures over raw bytes with constant-time comparison.
6. Pass shared behavioral tests and add malformed-response, timeout, and signature cases.
7. Add provider documentation including setup, sandbox, unsupported behavior, and limitations.
8. Include sandbox evidence in the pull request when credentials are available.

Never copy provider SDK code without checking its license. Generated files, credentials, and recorded sensitive payloads must not be committed.
