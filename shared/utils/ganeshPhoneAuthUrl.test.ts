import { describe, expect, it } from "vitest";

import { ganeshPhoneAuthBridgeUrl } from "./ganeshPhoneAuthUrl";

describe("ganeshPhoneAuthBridgeUrl", () => {
  it("points at the Ganesh build on the share site and encodes both params", () => {
    expect(
      ganeshPhoneAuthBridgeUrl("https://spendly-share.netlify.app/", "+919876543210", "ganeshseva://ganesh-phone-auth")
    ).toBe(
      "https://spendly-share.netlify.app/ganesh/ganesh-phone-auth" +
        "?phone=%2B919876543210&redirect_uri=ganeshseva%3A%2F%2Fganesh-phone-auth"
    );
  });

  it("is empty without an origin", () => {
    expect(ganeshPhoneAuthBridgeUrl("  ", "+919876543210", "x://y")).toBe("");
  });
});
