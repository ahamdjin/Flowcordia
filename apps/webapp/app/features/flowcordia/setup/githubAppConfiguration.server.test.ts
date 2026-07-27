import { describe, expect, it, vi } from "vitest";
import {
  configureFlowcordiaGitHubApp,
  FlowcordiaGitHubAppConfigurationInputSchema,
  resolveFlowcordiaGitHubAppConfiguration,
} from "./githubAppConfiguration.server";

const PRIVATE_KEY = [
  "-----BEGIN PRIVATE KEY-----",
  "a".repeat(300),
  "-----END PRIVATE KEY-----",
].join("\n");

const validInput = {
  appId: "12345",
  slug: "flowcordia-test",
  privateKey: PRIVATE_KEY,
  webhookSecret: "a-secure-webhook-secret",
};

describe("Flowcordia GitHub App configuration", () => {
  it("validates and normalizes the write-only setup fields", () => {
    const parsed = FlowcordiaGitHubAppConfigurationInputSchema.parse(validInput);
    expect(parsed).toMatchObject({ appId: 12345, slug: "flowcordia-test" });
  });

  it("prefers server environment configuration over encrypted setup", () => {
    const resolved = resolveFlowcordiaGitHubAppConfiguration({
      environment: {
        GITHUB_APP_ENABLED: "1",
        GITHUB_APP_ID: "987",
        GITHUB_APP_SLUG: "environment-app",
        GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY,
        GITHUB_APP_WEBHOOK_SECRET: "environment-webhook-secret",
      },
      stored: {
        version: "1",
        appId: 123,
        slug: "stored-app",
        privateKey: PRIVATE_KEY,
        webhookSecret: "stored-webhook-secret",
      },
    });

    expect(resolved).toMatchObject({ appId: 987, slug: "environment-app", source: "environment" });
  });

  it("verifies identity before persisting and never returns credentials", async () => {
    const persist = vi.fn();
    const result = await configureFlowcordiaGitHubApp(validInput, {
      environment: { GITHUB_APP_ENABLED: "0" },
      verifyIdentity: async () => ({ appId: 12345, slug: "flowcordia-test" }),
      persist,
    });

    expect(result).toEqual({
      success: true,
      status: {
        configured: true,
        appId: 12345,
        slug: "flowcordia-test",
        source: "encrypted_setup",
      },
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_KEY);
    expect(JSON.stringify(result)).not.toContain("a-secure-webhook-secret");
  });

  it("does not persist a mismatched GitHub App identity", async () => {
    const persist = vi.fn();
    const result = await configureFlowcordiaGitHubApp(validInput, {
      environment: { GITHUB_APP_ENABLED: "0" },
      verifyIdentity: async () => ({ appId: 12345, slug: "another-app" }),
      persist,
    });

    expect(result).toEqual({
      success: false,
      message: "GitHub authenticated a different App ID or slug.",
    });
    expect(persist).not.toHaveBeenCalled();
  });
});
