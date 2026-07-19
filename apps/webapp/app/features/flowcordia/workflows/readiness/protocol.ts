import { Buffer } from "node:buffer";

export const FLOWCORDIA_REPOSITORY_READINESS_COMMAND_MAX_BYTES = 1_024;

export type FlowcordiaRepositoryReadinessCommandResult =
  | { success: true }
  | { success: false; message: string };

export function parseFlowcordiaRepositoryReadinessCommand(
  raw: string
): FlowcordiaRepositoryReadinessCommandResult {
  if (Buffer.byteLength(raw, "utf8") > FLOWCORDIA_REPOSITORY_READINESS_COMMAND_MAX_BYTES) {
    return { success: false, message: "The readiness request is too large." };
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { success: false, message: "The readiness request is invalid." };
    }
    const command = value as Record<string, unknown>;
    if (Object.keys(command).length !== 1 || command.operation !== "check") {
      return { success: false, message: "The readiness request is invalid." };
    }
    return { success: true };
  } catch {
    return { success: false, message: "The readiness request must be valid JSON." };
  }
}
