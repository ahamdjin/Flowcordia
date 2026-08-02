import { beforeEach, describe, expect, it, vi } from "vitest";

const interactionMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  list: vi.fn(),
  start: vi.fn(),
}));

vi.mock("./activepieces-interaction.server", () => ({
  cancelStudioV2ActivepiecesTriggerSimulation: interactionMocks.cancel,
  listStudioV2ActivepiecesTriggerSimulations: interactionMocks.list,
  startStudioV2ActivepiecesTriggerSimulation: interactionMocks.start,
}));

vi.mock("./workspace-service.server", () => ({
  loadOrCreateStudioV2Workspace: vi.fn(async () => ({ document: {} })),
  prepareStudioV2WorkspaceForSave: vi.fn(() => ({
    nodes: [{ id: "trigger", kind: "trigger" }],
  })),
}));

vi.mock("@flowcordia/workflow", () => ({
  parseFlowcordiaActivepiecesPieceConfiguration: vi.fn(() => ({
    success: true,
    configuration: {
      stepType: "trigger",
      settings: {
        pieceName: "@activepieces/piece-example",
        pieceVersion: "~1.2.3",
        triggerName: "new_item",
        input: { folder: "inbox" },
      },
    },
  })),
}));

import { handleStudioV2ActivepiecesTriggerTesting } from "./activepieces-trigger-testing.server";

const context = {
  organizationId: "organization_123",
  projectId: "project_123",
  environmentId: "environment_123",
  actorId: "user_123",
  canWrite: true,
} as const;

function simulationCommand(method: "POST" | "DELETE") {
  return {
    intent: "activepieces_api" as const,
    method,
    path: "/v1/test-trigger",
    body:
      method === "POST"
        ? {
            flowId: "flow_123",
            flowVersionId: "version_123",
            testStrategy: "SIMULATION",
          }
        : { flowId: "flow_123" },
  };
}

describe("Studio V2 Activepieces trigger testing", () => {
  beforeEach(() => {
    interactionMocks.cancel.mockReset();
    interactionMocks.list.mockReset();
    interactionMocks.start.mockReset();
    interactionMocks.cancel.mockResolvedValue(true);
    interactionMocks.list.mockResolvedValue([]);
    interactionMocks.start.mockResolvedValue({ status: "ARMED" });
  });

  it("starts exact Activepieces simulation when no simulation source exists", async () => {
    await expect(
      handleStudioV2ActivepiecesTriggerTesting({
        ...context,
        command: simulationCommand("POST"),
      })
    ).resolves.toEqual({ handled: true, data: null });

    expect(interactionMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_123",
        environmentId: "environment_123",
        actorId: "user_123",
        flowId: "flow_123",
        pieceName: "@activepieces/piece-example",
        pieceVersion: "~1.2.3",
        interaction: {
          pieceName: "@activepieces/piece-example",
          triggerName: "new_item",
          input: { folder: "inbox" },
        },
      })
    );
    expect(interactionMocks.cancel).not.toHaveBeenCalled();
  });

  it("mirrors Activepieces simulation toggle by canceling an active source", async () => {
    interactionMocks.list.mockResolvedValue([
      {
        status: "ARMED",
        waitTokenUrl: "https://trigger.test/wait",
      },
    ]);

    await expect(
      handleStudioV2ActivepiecesTriggerTesting({
        ...context,
        command: simulationCommand("POST"),
      })
    ).resolves.toEqual({ handled: true, data: null });

    expect(interactionMocks.cancel).toHaveBeenCalledWith({
      environmentId: "environment_123",
      flowId: "flow_123",
    });
    expect(interactionMocks.start).not.toHaveBeenCalled();
  });

  it("maps Activepieces DELETE test-trigger to Trigger.dev-backed cancellation", async () => {
    await expect(
      handleStudioV2ActivepiecesTriggerTesting({
        ...context,
        command: simulationCommand("DELETE"),
      })
    ).resolves.toEqual({ handled: true, data: null });

    expect(interactionMocks.cancel).toHaveBeenCalledWith({
      environmentId: "environment_123",
      flowId: "flow_123",
    });
  });

  it("does not intercept Activepieces TEST_FUNCTION requests", async () => {
    await expect(
      handleStudioV2ActivepiecesTriggerTesting({
        ...context,
        command: {
          intent: "activepieces_api",
          method: "POST",
          path: "/v1/test-trigger",
          body: {
            flowId: "flow_123",
            flowVersionId: "version_123",
            testStrategy: "TEST_FUNCTION",
          },
        },
      })
    ).resolves.toEqual({ handled: false });

    expect(interactionMocks.start).not.toHaveBeenCalled();
    expect(interactionMocks.cancel).not.toHaveBeenCalled();
  });
});
