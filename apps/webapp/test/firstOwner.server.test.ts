import { describe, expect, it } from "vitest";
import { constantTimeTokenMatches } from "../app/features/flowcordia/setup/firstOwner.server";

describe("first-owner setup token verification", () => {
  it("accepts an exact token", () => {
    const token = "a-secure-flowcordia-setup-token-1234567890";
    expect(constantTimeTokenMatches(token, token)).toBe(true);
  });

  it("rejects a different token with the same length", () => {
    expect(
      constantTimeTokenMatches(
        "a-secure-flowcordia-setup-token-1234567890",
        "a-secure-flowcordia-setup-token-0987654321"
      )
    ).toBe(false);
  });

  it("rejects a different token length without throwing", () => {
    expect(
      constantTimeTokenMatches(
        "short",
        "a-secure-flowcordia-setup-token-1234567890"
      )
    ).toBe(false);
  });
});
