import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../app/services/passwordHash.server";

describe("administrator password hashing", () => {
  it("verifies the original password and rejects another password", async () => {
    const password = "a long administrator passphrase";
    const encodedHash = await hashPassword(password);

    expect(encodedHash).not.toContain(password);
    await expect(verifyPassword(password, encodedHash)).resolves.toBe(true);
    await expect(verifyPassword("a different administrator passphrase", encodedHash)).resolves.toBe(
      false
    );
  });

  it("uses a unique salt for every password", async () => {
    const password = "another long administrator passphrase";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toEqual(second);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword(password, second)).resolves.toBe(true);
  });

  it("fails closed for malformed stored hashes", async () => {
    await expect(
      verifyPassword("a long administrator passphrase", "not-a-password-hash")
    ).resolves.toBe(false);
  });
});
