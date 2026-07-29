import { describe, expect, it } from "vitest";
import { isFirstOwnerClaimOpen } from "../app/features/flowcordia/setup/firstOwner.server";

describe("first-owner claim state", () => {
  it("opens only for an unclaimed self-hosted installation", () => {
    expect(isFirstOwnerClaimOpen({ isSelfHosted: true, claimed: false })).toBe(true);
    expect(isFirstOwnerClaimOpen({ isSelfHosted: true, claimed: true })).toBe(false);
    expect(isFirstOwnerClaimOpen({ isSelfHosted: false, claimed: false })).toBe(false);
    expect(isFirstOwnerClaimOpen({ isSelfHosted: false, claimed: true })).toBe(false);
  });
});
