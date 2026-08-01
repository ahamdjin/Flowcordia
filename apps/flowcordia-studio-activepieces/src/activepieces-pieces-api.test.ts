import { describe, expect, it } from "vitest";

import { api } from "./activepieces-api";

describe("Activepieces pieces API backend contract", () => {
  it("serves the piece identities requested by Activepieces' upstream piecesApi", async () => {
    const manual = await api.get<{
      triggers: Record<string, { displayName: string }>;
    }>("/v1/pieces/%40activepieces%2Fpiece-manual-trigger", { version: "0.0.5" });
    const http = await api.get<{
      actions: Record<string, { displayName: string }>;
    }>("/v1/pieces/%40activepieces%2Fpiece-http", { version: "0.11.13" });

    expect(manual.triggers.manual_trigger.displayName).toBe("Manual Trigger");
    expect(http.actions.send_request.displayName).toBe("Send HTTP request");
  });

  it("serves summaries and registry data through the exact upstream endpoint shape", async () => {
    const summaries = await api.get<Array<{ name: string }>>("/v1/pieces");
    const registry = await api.get<Array<{ name: string; version: string }>>(
      "/v1/pieces/registry"
    );

    expect(summaries.map(({ name }) => name)).toEqual([
      "@activepieces/piece-manual-trigger",
      "@activepieces/piece-http",
    ]);
    expect(registry).toEqual([
      { name: "@activepieces/piece-manual-trigger", version: "0.0.5" },
      { name: "@activepieces/piece-http", version: "0.11.13" },
    ]);
  });

  it("does not silently accept unknown or mismatched piece versions", async () => {
    await expect(
      api.get("/v1/pieces/%40activepieces%2Fpiece-http", { version: "0.0.1" })
    ).rejects.toThrow("expected @activepieces/piece-http@0.11.13");
    await expect(api.get("/v1/pieces/%40activepieces%2Fpiece-unknown")).rejects.toThrow(
      "does not have Activepieces piece source"
    );
  });
});
