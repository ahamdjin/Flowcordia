import { describe, expect, it } from "vitest";

import { FLOWCORDIA_ACTIVEPIECES_FLAGS, flagsHooks } from "./activepieces-flags";

describe("Flowcordia Activepieces feature flags", () => {
  it("serves builder flags synchronously without an Activepieces backend", () => {
    expect(flagsHooks.useFlags()).toMatchObject({
      data: FLOWCORDIA_ACTIVEPIECES_FLAGS,
      isLoading: false,
      isPending: false,
      isSuccess: true,
    });
    expect(flagsHooks.useFlag<number>("FLOW_RUN_TIME_SECONDS").data).toBe(600);
    expect(flagsHooks.useFlag<boolean>("ALLOW_NPM_PACKAGES_IN_CODE_STEP").data).toBe(true);
  });

  it("keeps unowned Activepieces capabilities disabled by default", () => {
    expect(flagsHooks.useFlag<boolean>("TELEMETRY_ENABLED").data).toBe(false);
    expect(flagsHooks.useFlag<boolean>("CLOUD_AUTH_ENABLED").data).toBe(false);
    expect(flagsHooks.useFlag<unknown>("UNKNOWN_ACTIVEPIECES_FLAG").data).toBeNull();
  });
});
