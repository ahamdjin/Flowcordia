import { describe, expect, it } from "vitest";

import { FLOWCORDIA_ACTIVEPIECES_PIECES, piecesApi } from "./activepieces-pieces-api";

describe("Flowcordia Activepieces piece catalog", () => {
  it("serves the exact piece identities emitted by the workflow bridge", async () => {
    const manual = await piecesApi.get({
      name: "@activepieces/piece-manual-trigger",
      version: "0.0.5",
    });
    const http = await piecesApi.get({
      name: "@activepieces/piece-http",
      version: "0.11.13",
    });

    expect(manual.triggers.manual_trigger.displayName).toBe("Manual Trigger");
    expect(http.actions.send_request.displayName).toBe("Send HTTP request");
  });

  it("does not silently accept unknown or mismatched piece versions", async () => {
    await expect(
      piecesApi.get({ name: "@activepieces/piece-http", version: "0.0.1" })
    ).rejects.toThrow("expected @activepieces/piece-http@0.11.13");
    await expect(piecesApi.get({ name: "@activepieces/piece-unknown" })).rejects.toThrow(
      "does not expose"
    );
    expect(Object.keys(FLOWCORDIA_ACTIVEPIECES_PIECES)).toHaveLength(2);
  });
});
