import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JsonObject } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "../../app/features/flowcordia/workflows/studio/node-configuration";

function build(operation: string, configuration: JsonObject) {
  return buildWorkflowStudioNodeConfiguration(
    createWorkflowStudioNodeConfigurationDraft(operation, configuration)
  );
}

describe("Flowcordia structured node configuration", () => {
  it("keeps pass-through operations exact and blocks unknown fields", () => {
    expect(build("trigger.manual", {})).toEqual({ success: true, configuration: {} });
    expect(createWorkflowStudioNodeConfigurationDraft("trigger.api", { unexpected: true })).toEqual(
      {
        kind: "blocked",
        message: "API trigger configuration contains an unsupported field.",
      }
    );
  });

  it("normalizes a valid schedule and rejects invalid cron or timezone values", () => {
    expect(build("trigger.schedule", { cron: " 0 9 * * 1-5 ", timezone: " UTC " })).toEqual({
      success: true,
      configuration: { cron: "0 9 * * 1-5", timezone: "UTC" },
    });
    expect(build("trigger.schedule", { cron: "0 0 9 * * *", timezone: "UTC" })).toEqual({
      success: false,
      message: "Use a bounded five-field cron expression.",
    });
    expect(build("trigger.schedule", { cron: "0 9 * * 1-5", timezone: "Not/AZone" })).toEqual({
      success: false,
      message: "Use a valid IANA timezone such as UTC or Asia/Karachi.",
    });
  });

  it("normalizes webhook methods and requires an absolute bounded path", () => {
    expect(build("trigger.webhook", { method: "post", path: " /orders " })).toEqual({
      success: true,
      configuration: { method: "POST", path: "/orders" },
    });
    expect(build("trigger.webhook", { method: "POST", path: "orders" })).toEqual({
      success: false,
      message: "Webhook paths must start with / and stay under 512 characters.",
    });
  });

  it("hydrates legacy HTTP nodes into the complete bounded runtime contract", () => {
    expect(
      build("action.http", { method: "post", url: " https://api.example.com/orders " })
    ).toEqual({
      success: true,
      configuration: {
        method: "POST",
        url: "https://api.example.com/orders",
        bodyMode: "input",
        responseMode: "auto",
        timeoutSeconds: 30,
        maxResponseBytes: 1_048_576,
      },
    });
    expect(build("action.http", { method: "GET", url: "http://example.com" })).toEqual({
      success: false,
      message: "HTTP requests require an HTTPS URL without credentials or a fragment.",
    });
    expect(build("action.http", { method: "GET", url: "https://user:pass@example.com" })).toEqual({
      success: false,
      message: "HTTP requests require an HTTPS URL without credentials or a fragment.",
    });
    expect(
      build("action.http", { method: "GET", url: `https://example.com/${"x".repeat(2_100)}` })
    ).toEqual({
      success: false,
      message: "HTTP requests require an HTTPS URL under 2,048 characters.",
    });
  });

  it("rejects secret-shaped fields without exposing a raw JSON editor", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudioNodeConfigurationEditor.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );
    expect(source).not.toContain("JSON.stringify(node.editableConfiguration");
    expect(source).not.toContain("callbackUrl");
  });
});
