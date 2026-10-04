import type { HttpTransport } from "@africa-dev/payments-core";
import { describe, expect, it, vi } from "vitest";
import { TermiiMessagingProvider } from "./index.js";
const response = (body: unknown, status = 200) => ({ status, headers: new Headers(), body });
describe("Termii adapter", () => {
  it("uses the account regional base URL and transactional DND route", async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      response({ code: "ok", message_id_str: "msg-1" })
    );
    const provider = new TermiiMessagingProvider({
      apiKey: "secret",
      baseUrl: "https://region.termii.example",
      transport
    });
    const message = await provider.sendSms({
      recipient: "2347000000000",
      senderId: "Africa",
      message: "OTP",
      idempotencyKey: "idem",
      transactional: true
    });
    expect(transport.mock.calls[0]?.[0].url).toBe("https://region.termii.example/api/sms/send");
    expect(JSON.parse(transport.mock.calls[0]?.[0].body ?? "{}")).toMatchObject({
      api_key: "secret",
      channel: "dnd"
    });
    expect(message.status).toBe("sent");
  });
  it("sends and verifies provider-managed OTPs", async () => {
    const transport: HttpTransport = async (request) =>
      response(
        request.url.endsWith("/send") ? { pin_id: "pin-1", status: "200" } : { verified: "True" }
      );
    const provider = new TermiiMessagingProvider({
      apiKey: "secret",
      baseUrl: "https://termii.example",
      transport
    });
    const otp = await provider.sendOtp({
      recipient: "2347000000000",
      senderId: "Africa",
      message: "Use < 123456 >",
      pinPlaceholder: "< 123456 >"
    });
    expect(otp.providerReference).toBe("pin-1");
    expect(await provider.verifyOtp({ providerReference: "pin-1", pin: "123456" })).toMatchObject({
      verified: true
    });
  });
});
