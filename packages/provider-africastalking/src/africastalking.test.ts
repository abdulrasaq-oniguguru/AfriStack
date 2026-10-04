import type { HttpTransport } from "@africa-dev/payments-core";
import { describe, expect, it, vi } from "vitest";
import { AfricasTalkingMessagingProvider } from "./index.js";
describe("Africa's Talking adapter", () => {
  it("uses form encoding, username and apikey authentication", async () => {
    const transport = vi.fn<HttpTransport>(async () => ({
      status: 201,
      headers: new Headers(),
      body: {
        SMSMessageData: {
          Recipients: [{ number: "+2347000000000", status: "Success", messageId: "at-1" }]
        }
      }
    }));
    const provider = new AfricasTalkingMessagingProvider({
      apiKey: "key",
      username: "sandbox",
      transport
    });
    const result = await provider.sendSms({
      recipient: "+2347000000000",
      senderId: "Africa",
      message: "Hello",
      idempotencyKey: "idem"
    });
    const request = transport.mock.calls[0]?.[0];
    expect(request?.url).toBe("https://api.africastalking.com/version1/messaging");
    expect(request?.headers["apikey"]).toBe("key");
    expect(request?.body).toContain("username=sandbox");
    expect(result).toMatchObject({ status: "sent", providerReference: "at-1" });
  });
});
