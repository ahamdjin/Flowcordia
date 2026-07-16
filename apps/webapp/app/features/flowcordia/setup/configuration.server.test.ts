import { describe, expect, it } from "vitest";
import { getFlowcordiaSetupStatuses, isGeneralEmailPresent } from "./configuration.server";

function statusMap(source: object = {}, isSelfHosted = false) {
  return Object.fromEntries(
    getFlowcordiaSetupStatuses(source, { isSelfHosted }).map((item) => [item.id, item.status])
  );
}

describe("Flowcordia setup configuration", () => {
  it("reports missing configuration without throwing", () => {
    expect(statusMap()).toMatchObject({
      "github-app": "missing",
      "general-email": "missing",
      "alert-email": "missing",
      "object-storage": "missing",
      "self-host-mode": "not-detected",
      "app-origin": "missing",
    });
  });

  it("supports Resend, SMTP relay, and AWS provider-chain configuration", () => {
    expect(
      isGeneralEmailPresent({
        EMAIL_TRANSPORT: "resend",
        FROM_EMAIL: "team@example.com",
        RESEND_API_KEY: "secret-resend-key",
      })
    ).toBe(true);

    expect(
      isGeneralEmailPresent({
        EMAIL_TRANSPORT: "smtp",
        FROM_EMAIL: "team@example.com",
        SMTP_HOST: "smtp.internal",
        SMTP_PORT: "25",
      })
    ).toBe(true);

    expect(
      isGeneralEmailPresent({
        EMAIL_TRANSPORT: "aws-ses",
        FROM_EMAIL: "team@example.com",
      })
    ).toBe(true);
  });

  it("requires the complete GitHub App and object-storage variable groups", () => {
    const statuses = statusMap(
      {
        GITHUB_APP_ENABLED: "1",
        GITHUB_APP_ID: "1",
        GITHUB_APP_PRIVATE_KEY: "private-key",
        GITHUB_APP_WEBHOOK_SECRET: "webhook-secret",
        GITHUB_APP_SLUG: "flowcordia-test",
        OBJECT_STORE_BASE_URL: "http://minio:9000",
        OBJECT_STORE_BUCKET: "packets",
        OBJECT_STORE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORE_SECRET_ACCESS_KEY: "secret-key",
        APP_ORIGIN: "https://flowcordia.example.com",
      },
      true
    );

    expect(statuses).toMatchObject({
      "github-app": "present",
      "object-storage": "present",
      "self-host-mode": "detected",
      "app-origin": "present",
    });
  });

  it("never copies configuration values into returned status data", () => {
    const secret = "must-not-leave-the-server";
    const result = getFlowcordiaSetupStatuses(
      {
        EMAIL_TRANSPORT: "resend",
        FROM_EMAIL: "team@example.com",
        RESEND_API_KEY: secret,
      },
      { isSelfHosted: true }
    );

    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
