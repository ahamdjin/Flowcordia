import { metadata, task, wait } from "@trigger.dev/sdk/v3";

export const flowcordiaBetaReferenceTask = task({
  id: "flowcordia-beta-reference",
  maxDuration: 300,
  run: async (payload: { nonce: string }) => {
    if (!payload || !/^[a-z0-9-]{8,64}$/.test(payload.nonce)) {
      throw new Error("The Flowcordia beta reference nonce is invalid.");
    }

    metadata.set("flowcordiaBetaReference", {
      schemaVersion: "0.1",
      state: "RUNNING",
      nonceLength: payload.nonce.length,
      updatedAt: new Date().toISOString(),
    });
    await wait.for({ seconds: 2 });
    metadata.set("flowcordiaBetaReference", {
      schemaVersion: "0.1",
      state: "COMPLETED",
      nonceLength: payload.nonce.length,
      updatedAt: new Date().toISOString(),
    });

    return {
      accepted: true,
      nonceLength: payload.nonce.length,
    };
  },
});
