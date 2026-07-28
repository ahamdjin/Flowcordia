import { describe, expect, it } from "vitest";
import {
  FlowcordiaEmailConfigurationInputSchema,
  toMailTransportOptions,
} from "../app/features/flowcordia/setup/emailConfiguration.server";
import { getFlowcordiaSetupStatuses } from "../app/features/flowcordia/setup/configuration.server";

describe("self-host email configuration", () => {
  it("maps a normalized SMTP configuration into the existing mail transport contract", () => {
    const configuration = FlowcordiaEmailConfigurationInputSchema.parse({
      transport: "smtp",
      fromEmail: "Flowcordia <mail@example.com>",
      replyToEmail: "support@example.com",
      host: "smtp.example.com",
      port: "465",
      secure: true,
      user: "flowcordia",
      password: "secret-password",
    });

    expect(configuration).toMatchObject({
      transport: "smtp",
      port: 465,
      secure: true,
    });
    expect(toMailTransportOptions(configuration)).toEqual({
      type: "smtp",
      config: {
        host: "smtp.example.com",
        port: 465,
        secure: true,
        auth: { user: "flowcordia", pass: "secret-password" },
      },
    });
  });

  it("requires SMTP username and password together", () => {
    const result = FlowcordiaEmailConfigurationInputSchema.safeParse({
      transport: "smtp",
      fromEmail: "mail@example.com",
      replyToEmail: "support@example.com",
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "flowcordia",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toContain(
        "SMTP username and password must be provided together."
      );
    }
  });

  it("maps Resend without changing the mature transport implementation", () => {
    const configuration = FlowcordiaEmailConfigurationInputSchema.parse({
      transport: "resend",
      fromEmail: "mail@example.com",
      replyToEmail: "support@example.com",
      apiKey: "re_1234567890",
    });

    expect(toMailTransportOptions(configuration)).toEqual({
      type: "resend",
      config: { apiKey: "re_1234567890" },
    });
  });

  it("uses the AWS credential provider chain for SES", () => {
    const configuration = FlowcordiaEmailConfigurationInputSchema.parse({
      transport: "aws-ses",
      fromEmail: "mail@example.com",
      replyToEmail: "support@example.com",
    });

    expect(toMailTransportOptions(configuration)).toEqual({ type: "aws-ses" });
  });

  it("projects encrypted email state into the setup checklist", () => {
    const statuses = getFlowcordiaSetupStatuses(
      { APP_ORIGIN: "https://flowcordia.example.com" },
      {
        isSelfHosted: true,
        githubAppConfigured: false,
        generalEmailConfigured: true,
        alertEmailConfigured: true,
      }
    );

    expect(statuses.find((status) => status.id === "general-email")?.status).toBe("present");
    expect(statuses.find((status) => status.id === "alert-email")?.status).toBe("present");
  });
});
