import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_HTTP_DEFAULT_MAX_RESPONSE_BYTES,
  parseFlowcordiaHttpConfiguration,
} from "../src/index.js";

describe("Flowcordia HTTP configuration", () => {
  it("normalizes legacy request configuration into the approved contract", () => {
    expect(
      parseFlowcordiaHttpConfiguration({
        method: " post ",
        url: " https://api.example.com/orders?state=open ",
      })
    ).toEqual({
      success: true,
      issues: [],
      configuration: {
        method: "POST",
        url: "https://api.example.com/orders?state=open",
        bodyMode: "input",
        responseMode: "auto",
        timeoutSeconds: 30,
        maxResponseBytes: FLOWCORDIA_HTTP_DEFAULT_MAX_RESPONSE_BYTES,
      },
    });
  });

  it("enforces body semantics, timeout, response mode, and response bounds", () => {
    const result = parseFlowcordiaHttpConfiguration({
      method: "GET",
      url: "https://api.example.com/orders",
      bodyMode: "input",
      responseMode: "binary",
      timeoutSeconds: 0,
      maxResponseBytes: 5_242_881,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "invalid_body_mode",
      "invalid_response_mode",
      "invalid_timeout",
      "invalid_response_limit",
    ]);
  });

  it("rejects unknown fields and unsafe destinations", () => {
    const result = parseFlowcordiaHttpConfiguration({
      method: "GET",
      url: "https://user:pass@example.com/orders#secret",
      authorization: "browser-controlled",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_field", field: "authorization" }),
        expect.objectContaining({ code: "invalid_url", field: "url" }),
      ])
    );
  });
});
