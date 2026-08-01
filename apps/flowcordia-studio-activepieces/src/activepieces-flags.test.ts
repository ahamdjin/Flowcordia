import { describe, expect, it } from "vitest";

import { api } from "./activepieces-api";
import { FLOWCORDIA_ACTIVEPIECES_FLAGS } from "./activepieces-flags";

describe("Activepieces feature flag backend data", () => {
  it("serves the flag map through the endpoint used by Activepieces' upstream flagsHooks", async () => {
    await expect(api.get("/v1/flags")).resolves.toBe(FLOWCORDIA_ACTIVEPIECES_FLAGS);
    expect(FLOWCORDIA_ACTIVEPIECES_FLAGS.FLOW_RUN_TIME_SECONDS).toBe(600);
    expect(FLOWCORDIA_ACTIVEPIECES_FLAGS.ALLOW_NPM_PACKAGES_IN_CODE_STEP).toBe(true);
  });

  it("keeps server capabilities Flowcordia does not provide disabled", () => {
    expect(FLOWCORDIA_ACTIVEPIECES_FLAGS.TELEMETRY_ENABLED).toBe(false);
    expect(FLOWCORDIA_ACTIVEPIECES_FLAGS.CLOUD_AUTH_ENABLED).toBe(false);
    expect(FLOWCORDIA_ACTIVEPIECES_FLAGS.PRIVATE_PIECES_ENABLED).toBe(false);
  });
});
