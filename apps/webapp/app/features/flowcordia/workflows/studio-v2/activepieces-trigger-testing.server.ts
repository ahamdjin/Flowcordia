import { parseFlowcordiaActivepiecesPieceConfiguration } from "@flowcordia/workflow";
import { StudioV2ActivepiecesApiError } from "./activepieces-api.server";
import {
  listStudioV2ActivepiecesTriggerSimulations,
  startStudioV2ActivepiecesTriggerSimulation,
} from "./activepieces-interaction.server";
import { STUDIO_V2_DEFAULT_WORKSPACE_KEY } from "./workspace-contract";
import type { StudioV2WorkspaceCommand } from "./workspace-http";
import {
  loadOrCreateStudioV2Workspace,
  prepareStudioV2WorkspaceForSave,
} from "./workspace-service.server";

type ActivepiecesApiCommand = Extract<StudioV2WorkspaceCommand, { intent: "activepieces_api" }>;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StudioV2ActivepiecesApiError(
      "invalid_activepieces_request",
      400,
      `Activepieces ${key} must be a non-empty string.`
    );
  }
  return value;
}

function seekPage<T>(data: T[] = []) {
  return { data, next: null, previous: null };
}

async function triggerSettings(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
}) {
  const workspace = await loadOrCreateStudioV2Workspace({
    scope: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      workspaceKey: STUDIO_V2_DEFAULT_WORKSPACE_KEY,
    },
    actorId: input.actorId,
  });
  const workflow = prepareStudioV2WorkspaceForSave(workspace.document);
  const node = workflow.nodes.find((candidate) => candidate.kind === "trigger");
  if (!node) {
    throw new StudioV2ActivepiecesApiError(
      "activepieces_trigger_not_found",
      404,
      "The Studio workflow does not contain a trigger."
    );
  }
  const parsed = parseFlowcordiaActivepiecesPieceConfiguration(node);
  if (!parsed.success || parsed.configuration.stepType !== "trigger") {
    throw new StudioV2ActivepiecesApiError(
      "activepieces_trigger_not_testable",
      400,
      "The current Studio trigger is not an Activepieces piece trigger."
    );
  }
  return parsed.configuration.settings;
}

function sourceName(pieceName: string, pieceVersion: string, triggerName: string): string {
  const exact =
    pieceVersion.startsWith("^") || pieceVersion.startsWith("~")
      ? pieceVersion.slice(1)
      : pieceVersion;
  const [major = "0", minor = "0"] = exact.split(".");
  return `${pieceName}@${major}.${minor}:${triggerName}`;
}

function eventId(runId: string, index: number): string {
  return `fc_ap_evt_${runId.replaceAll(/[^A-Za-z0-9]/g, "").slice(-32)}_${index}`;
}

export async function handleStudioV2ActivepiecesTriggerTesting(input: {
  command: ActivepiecesApiCommand;
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  canWrite: boolean;
}): Promise<{ handled: false } | { handled: true; data: unknown }> {
  const { command } = input;

  if (command.method === "POST" && command.path === "/v1/test-trigger") {
    if (!isRecord(command.body) || command.body.testStrategy !== "SIMULATION") {
      return { handled: false };
    }
    if (!input.canWrite) {
      throw new StudioV2ActivepiecesApiError("forbidden", 403, "This Studio session is read-only.");
    }
    const flowId = requiredString(command.body, "flowId");
    requiredString(command.body, "flowVersionId");
    const settings = await triggerSettings(input);
    if (!settings.triggerName) {
      throw new StudioV2ActivepiecesApiError(
        "activepieces_trigger_not_testable",
        400,
        "The current Activepieces trigger does not have a trigger name."
      );
    }
    await startStudioV2ActivepiecesTriggerSimulation({
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,
      flowId,
      pieceName: settings.pieceName,
      pieceVersion: settings.pieceVersion,
      interaction: {
        pieceName: settings.pieceName,
        triggerName: settings.triggerName,
        input: settings.input,
      },
    });
    return { handled: true, data: null };
  }

  if (command.method === "GET" && command.path === "/v1/trigger-events") {
    const flowId =
      typeof command.query?.flowId === "string" ? command.query.flowId : "flowcordia-studio-v2";
    const simulations = await listStudioV2ActivepiecesTriggerSimulations({
      environmentId: input.environmentId,
      flowId,
    });
    if (simulations.length === 0) return { handled: false };

    const settings = await triggerSettings(input);
    const completed = simulations.filter(
      (simulation) => simulation.status === "COMPLETED" && simulation.result !== undefined
    );
    const data = completed.flatMap((simulation) => {
      const values = Array.isArray(simulation.result) ? simulation.result : [simulation.result];
      return values.map((payload, index) => {
        const id = eventId(simulation.runId, index);
        const timestamp = simulation.updatedAt ?? new Date().toISOString();
        return {
          id,
          projectId: input.projectId,
          flowId,
          sourceName: sourceName(
            settings.pieceName,
            settings.pieceVersion,
            settings.triggerName ?? "trigger"
          ),
          fileId: `flowcordia:${id}`,
          created: timestamp,
          updated: timestamp,
          payload,
        };
      });
    });
    const requestedLimit = Number(command.query?.limit ?? 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(20, Math.floor(requestedLimit)))
      : 10;
    return { handled: true, data: seekPage(data.slice(0, limit)) };
  }

  return { handled: false };
}
