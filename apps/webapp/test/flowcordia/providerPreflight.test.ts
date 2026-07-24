import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectStoreClient } from "../../app/v3/objectStoreClient.server";
import { resolveObjectStoreConfiguration } from "../../app/v3/objectStoreConfig.server";
import {
  FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION,
  presentFlowcordiaProviderConfiguration,
} from "../../app/features/flowcordia/operations/provider-preflight";
import { runFlowcordiaProviderPreflight } from "../../app/features/flowcordia/operations/provider-preflight.server";

const applicationCommitSha = "0123456789abcdef0123456789abcdef01234567";
const checkedAt = new Date("2026-07-22T03:00:00.000Z");

function readyEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    FLOWCORDIA_APPLICATION_COMMIT_SHA: applicationCommitSha,
    EMAIL_TRANSPORT: "smtp",
    FROM_EMAIL: "system@example.com",
    REPLY_TO_EMAIL: "support@example.com",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "flowcordia",
    SMTP_PASSWORD: "smtp-secret-sentinel",
    OBJECT_STORE_BASE_URL: "https://objects.example.com",
    OBJECT_STORE_BUCKET: "packets",
    OBJECT_STORE_ACCESS_KEY_ID: "access-key-sentinel",
    OBJECT_STORE_SECRET_ACCESS_KEY: "object-secret-sentinel",
    ...overrides,
  };
}

function configuration(environment = readyEnvironment()) {
  return presentFlowcordiaProviderConfiguration({
    environment,
    checkedAt,
    emailRecipientProvided: true,
    emailConfirmation: FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Flowcordia provider readiness", () => {
  it("accepts complete SMTP and static object-store configuration without exposing values", () => {
    const result = configuration();
    expect(result.state).toBe("READY");
    expect(result.emailTransport).toBe("smtp");
    expect(result.objectStoreMode).toBe("static_credentials");
    expect(result.checks.every((entry) => entry.state === "READY")).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("smtp.example.com");
    expect(serialized).not.toContain("smtp-secret-sentinel");
    expect(serialized).not.toContain("objects.example.com");
    expect(serialized).not.toContain("object-secret-sentinel");
    expect(serialized).not.toContain("system@example.com");
  });

  it("blocks the null transport and incomplete provider configuration", () => {
    const missingEmail = configuration(
      readyEnvironment({
        EMAIL_TRANSPORT: undefined,
        RESEND_API_KEY: undefined,
      })
    );
    expect(missingEmail.state).toBe("BLOCKED");
    expect(missingEmail.emailTransport).toBe("unconfigured");
    expect(missingEmail.checks.find((entry) => entry.key === "email_configuration")?.state).toBe(
      "BLOCKED"
    );

    const partialSmtp = configuration(readyEnvironment({ SMTP_PASSWORD: undefined }));
    expect(partialSmtp.state).toBe("BLOCKED");

    const partialObjectStore = configuration(
      readyEnvironment({ OBJECT_STORE_SECRET_ACCESS_KEY: undefined })
    );
    expect(partialObjectStore.state).toBe("BLOCKED");
  });

  it("accepts Resend, SES credential-chain, and unauthenticated SMTP shapes", () => {
    expect(
      configuration(
        readyEnvironment({
          EMAIL_TRANSPORT: "resend",
          RESEND_API_KEY: "resend-secret-sentinel",
          SMTP_HOST: undefined,
          SMTP_PORT: undefined,
          SMTP_USER: undefined,
          SMTP_PASSWORD: undefined,
        })
      ).state
    ).toBe("READY");

    const sesIam = configuration(
      readyEnvironment({
        EMAIL_TRANSPORT: "aws-ses",
        SMTP_HOST: undefined,
        SMTP_PORT: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        OBJECT_STORE_ACCESS_KEY_ID: undefined,
        OBJECT_STORE_SECRET_ACCESS_KEY: undefined,
      })
    );
    expect(sesIam.state).toBe("READY");
    expect(sesIam.objectStoreMode).toBe("credential_chain");

    expect(
      configuration(
        readyEnvironment({
          SMTP_USER: undefined,
          SMTP_PASSWORD: undefined,
        })
      ).state
    ).toBe("READY");
  });

  it("blocks malformed endpoints, embedded credentials, invalid identities, and missing confirmation", () => {
    expect(configuration(readyEnvironment({ OBJECT_STORE_BASE_URL: "not-a-url" })).state).toBe(
      "BLOCKED"
    );
    expect(
      configuration(
        readyEnvironment({
          OBJECT_STORE_BASE_URL: "https://user:secret@objects.example.com",
        })
      ).state
    ).toBe("BLOCKED");
    expect(
      configuration(readyEnvironment({ FLOWCORDIA_APPLICATION_COMMIT_SHA: "0".repeat(40) })).state
    ).toBe("BLOCKED");
    expect(
      presentFlowcordiaProviderConfiguration({
        environment: readyEnvironment(),
        checkedAt,
        emailRecipientProvided: false,
        emailConfirmation: undefined,
      }).state
    ).toBe("BLOCKED");
    expect(
      configuration(
        readyEnvironment({
          OBJECT_STORE_DEFAULT_PROTOCOL: "../../unsafe",
        })
      ).state
    ).toBe("BLOCKED");
  });

  it("performs no provider work when configuration is blocked", async () => {
    const verifyObjectStore = vi.fn();
    const sendProviderReadinessEmail = vi.fn();
    const result = await runFlowcordiaProviderPreflight({
      environment: readyEnvironment({ EMAIL_TRANSPORT: undefined }),
      checkedAt,
      emailRecipientProvided: true,
      emailConfirmation: FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION,
      dependencies: { verifyObjectStore, sendProviderReadinessEmail },
    });
    expect(result.state).toBe("BLOCKED");
    expect(result.phase).toBe("configuration");
    expect(verifyObjectStore).not.toHaveBeenCalled();
    expect(sendProviderReadinessEmail).not.toHaveBeenCalled();
  });

  it("does not send email when the read-only object-store probe fails", async () => {
    const verifyObjectStore = vi.fn().mockRejectedValue(new Error("private storage error"));
    const sendProviderReadinessEmail = vi.fn();
    const result = await runFlowcordiaProviderPreflight({
      environment: readyEnvironment(),
      checkedAt,
      emailRecipientProvided: true,
      emailConfirmation: FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION,
      dependencies: { verifyObjectStore, sendProviderReadinessEmail },
    });
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.phase).toBe("object_store");
    expect(verifyObjectStore).toHaveBeenCalledTimes(1);
    expect(sendProviderReadinessEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private storage error");
  });

  it("reports fixed email-provider unavailability after object storage passes", async () => {
    const calls: string[] = [];
    const result = await runFlowcordiaProviderPreflight({
      environment: readyEnvironment(),
      checkedAt,
      emailRecipientProvided: true,
      emailConfirmation: FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION,
      dependencies: {
        verifyObjectStore: async () => {
          calls.push("object_store");
        },
        sendProviderReadinessEmail: async () => {
          calls.push("email");
          throw new Error("private email error");
        },
      },
    });
    expect(calls).toEqual(["object_store", "email"]);
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.phase).toBe("email");
    expect(JSON.stringify(result)).not.toContain("private email error");
  });

  it("returns READY only after bucket verification and provider email acceptance", async () => {
    const calls: string[] = [];
    const result = await runFlowcordiaProviderPreflight({
      environment: readyEnvironment(),
      checkedAt,
      emailRecipientProvided: true,
      emailConfirmation: FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION,
      dependencies: {
        verifyObjectStore: async () => {
          calls.push("object_store");
        },
        sendProviderReadinessEmail: async () => {
          calls.push("email");
        },
      },
    });
    expect(calls).toEqual(["object_store", "email"]);
    expect(result.state).toBe("READY");
    expect(result.phase).toBe("complete");
    expect(result.checks.every((entry) => entry.state === "READY")).toBe(true);
  });

  it("keeps legacy objects on the generic provider while selecting named providers explicitly", () => {
    const environment = {
      OBJECT_STORE_DEFAULT_PROTOCOL: "s3",
      OBJECT_STORE_BASE_URL: "https://legacy.example.com",
      OBJECT_STORE_BUCKET: "legacy-packets",
      OBJECT_STORE_SERVICE: "s3",
      OBJECT_STORE_S3_BASE_URL: "https://current.example.com",
      OBJECT_STORE_S3_BUCKET: "current-packets",
      OBJECT_STORE_S3_SERVICE: "s3",
    };

    expect(resolveObjectStoreConfiguration(environment)).toMatchObject({
      source: "default",
      baseUrl: "https://legacy.example.com",
      bucket: "legacy-packets",
    });
    expect(resolveObjectStoreConfiguration(environment, "s3")).toMatchObject({
      source: "named",
      protocol: "s3",
      baseUrl: "https://current.example.com",
      bucket: "current-packets",
    });
  });

  it("uses the generic S3 provider only as an explicit protocol fallback", () => {
    const environment = {
      OBJECT_STORE_DEFAULT_PROTOCOL: "s3",
      OBJECT_STORE_BASE_URL: "https://objects.example.com",
      OBJECT_STORE_BUCKET: "packets",
      OBJECT_STORE_SERVICE: "s3",
    };

    expect(resolveObjectStoreConfiguration(environment)).toMatchObject({ source: "default" });
    expect(resolveObjectStoreConfiguration(environment, "s3")).toMatchObject({
      source: "default_protocol_fallback",
      protocol: "s3",
    });
    expect(resolveObjectStoreConfiguration(environment, "r2")).toBeUndefined();
  });

  it("uses a signed HEAD request for static object-store bucket verification", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const client = ObjectStoreClient.create({
      baseUrl: "https://objects.example.com",
      bucket: "packets",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
      region: "us-east-1",
      service: "s3",
    });
    await client.verify();
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe("HEAD");
    expect(new URL(request.url).pathname).toBe("/packets");
  });

  it("uses the verified path-style bucket for static object writes and presigns", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const client = ObjectStoreClient.create({
      baseUrl: "https://objects.example.com",
      bucket: "flowcordia-packets",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
      region: "us-east-1",
      service: "s3",
    });
    await client.putObject("packets/project/dev/payload.json", "{}", "application/json");
    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(new URL(request.url).pathname).toBe(
      "/flowcordia-packets/packets/project/dev/payload.json"
    );
    const signed = await client.presign("packets/project/dev/payload.json", "PUT", 60);
    expect(new URL(signed).pathname).toBe(
      "/flowcordia-packets/packets/project/dev/payload.json"
    );
  });

  it("does not append a path bucket when the bucket is already virtual-hosted", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const client = ObjectStoreClient.create({
      baseUrl: "https://packets.objects.example.com",
      bucket: "packets",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
    });
    await client.verify();
    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(new URL(request.url).pathname).toBe("/");
  });

  it("fails static object-store verification without exposing provider response details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret body", { status: 403 })));
    const client = ObjectStoreClient.create({
      baseUrl: "https://objects.example.com",
      bucket: "packets",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
    });
    await expect(client.verify()).rejects.toThrow("verification failed");
  });
});
