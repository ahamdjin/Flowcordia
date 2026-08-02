import { describe, expect, it, vi } from "vitest";
import { createFlowcordiaActivepiecesTriggerRuntimeServices } from "./activepieces-trigger-services.js";

describe("Flowcordia Activepieces Trigger.dev waitpoint services", () => {
  it("maps webhook waitpoints through the Flowcordia callback bridge", async () => {
    const forToken = vi.fn(async () => ({
      ok: true,
      output: {
        body: null,
        headers: { accept: "application/json" },
        queryParams: { action: "approve" },
      },
    }));
    const services = createFlowcordiaActivepiecesTriggerRuntimeServices({
      runId: "run_123",
      wait: {
        createToken: vi.fn(async () => ({
          id: "waitpoint_abc123",
          url: "https://flowcordia.test/api/v1/waitpoints/tokens/waitpoint_abc123/callback/hash_123",
        })),
        forToken,
        until: vi.fn(async () => undefined),
      },
    });

    const waitpoint = await services.createWaitpoint?.({ type: "WEBHOOK" });
    expect(waitpoint?.id).toBe("waitpoint_abc123");
    expect(waitpoint?.resumeUrl).toMatch(
      /^https:\/\/flowcordia\.test\/api\/v1\/flowcordia\/activepieces\/callbacks\//
    );

    const approvalUrl = waitpoint?.buildResumeUrl({
      queryParams: { action: "approve", requestId: "req_123" },
      sync: true,
    });
    expect(approvalUrl).toContain("action=approve");
    expect(approvalUrl).toContain("requestId=req_123");
    expect(approvalUrl).toContain("sync=true");

    await expect(services.awaitWaitpoint?.("waitpoint_abc123")).resolves.toEqual({
      body: null,
      headers: { accept: "application/json" },
      queryParams: { action: "approve" },
    });
    expect(forToken).toHaveBeenCalledWith("waitpoint_abc123");
  });

  it("maps delay waitpoints to Trigger.dev wait.until without creating a token", async () => {
    const createToken = vi.fn();
    const until = vi.fn(async () => undefined);
    const services = createFlowcordiaActivepiecesTriggerRuntimeServices({
      runId: "run_delay",
      wait: {
        createToken,
        forToken: vi.fn(),
        until,
      },
    });

    const waitpoint = await services.createWaitpoint?.({
      type: "DELAY",
      resumeDateTime: "2026-08-04T10:00:00.000Z",
    });
    expect(waitpoint?.id).toBe("flowcordia_delay_run_delay_1");
    expect(waitpoint?.resumeUrl).toBe("");

    await expect(services.awaitWaitpoint?.(waitpoint!.id)).resolves.toEqual({});
    expect(createToken).not.toHaveBeenCalled();
    expect(until).toHaveBeenCalledWith(new Date("2026-08-04T10:00:00.000Z"));
  });

  it("rejects arbitrary Trigger.dev callback targets", async () => {
    const services = createFlowcordiaActivepiecesTriggerRuntimeServices({
      runId: "run_bad",
      wait: {
        createToken: vi.fn(async () => ({
          id: "waitpoint_bad",
          url: "https://flowcordia.test/api/v1/tasks/not-a-waitpoint",
        })),
        forToken: vi.fn(),
        until: vi.fn(),
      },
    });

    await expect(services.createWaitpoint?.({ type: "WEBHOOK" })).rejects.toThrow(
      "unexpected waitpoint callback URL"
    );
  });
});
