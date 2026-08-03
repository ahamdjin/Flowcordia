import type { JsonValue } from "@flowcordia/workflow";
import type {
  FlowcordiaActivepiecesRuntimeServices,
  FlowcordiaActivepiecesTriggerPayload,
} from "./activepieces.js";

type UnknownRecord = Record<string, unknown>;

export interface FlowcordiaActivepiecesAppEventReply {
  body?: JsonValue;
  headers?: Record<string, string>;
}

export interface FlowcordiaActivepiecesAppEventParseResult {
  reply: FlowcordiaActivepiecesAppEventReply | null;
  event: string | null;
  identifierValue: string | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

function findPiece(module: UnknownRecord, pieceName: string): UnknownRecord {
  const candidates = [module.default, ...Object.values(module)];
  const piece = candidates.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.name === pieceName &&
      (isRecord(candidate.actions) || isRecord(candidate.triggers))
  );
  if (!isRecord(piece)) {
    throw new Error(`Activepieces package ${pieceName} did not export its piece definition.`);
  }
  return piece;
}

export async function executeFlowcordiaActivepiecesAppEventVerify(input: {
  pieceName: string;
  payload: FlowcordiaActivepiecesTriggerPayload;
  appWebhookUrl: string;
  webhookSecret: unknown;
  services: Pick<FlowcordiaActivepiecesRuntimeServices, "loadPiece">;
}): Promise<boolean> {
  const module = await input.services.loadPiece(input.pieceName);
  const piece = findPiece(module, input.pieceName);
  const events = piece.events;
  if (!isRecord(events) || typeof events.verify !== "function") {
    throw new Error(
      `Activepieces piece ${input.pieceName} does not expose app-event verification.`
    );
  }
  const verified = await (
    events.verify as (context: {
      appWebhookUrl: string;
      payload: FlowcordiaActivepiecesTriggerPayload;
      webhookSecret: unknown;
    }) => unknown
  )({
    appWebhookUrl: input.appWebhookUrl,
    payload: input.payload,
    webhookSecret: input.webhookSecret,
  });
  if (typeof verified !== "boolean") {
    throw new Error(
      `Activepieces piece ${input.pieceName} returned an invalid app-event verification result.`
    );
  }
  return verified;
}

export async function executeFlowcordiaActivepiecesAppEventParse(input: {
  pieceName: string;
  payload: FlowcordiaActivepiecesTriggerPayload;
  services: Pick<FlowcordiaActivepiecesRuntimeServices, "loadPiece" | "serverPublicUrl">;
}): Promise<FlowcordiaActivepiecesAppEventParseResult> {
  const module = await input.services.loadPiece(input.pieceName);
  const piece = findPiece(module, input.pieceName);
  const events = piece.events;
  if (!isRecord(events) || typeof events.parseAndReply !== "function") {
    throw new Error(`Activepieces piece ${input.pieceName} does not expose app-event routing.`);
  }

  const parsed = await (
    events.parseAndReply as (context: {
      payload: FlowcordiaActivepiecesTriggerPayload;
      server: { publicUrl: string };
    }) => unknown
  )({
    payload: input.payload,
    server: { publicUrl: input.services.serverPublicUrl ?? "" },
  });
  if (!isRecord(parsed)) {
    throw new Error(`Activepieces piece ${input.pieceName} returned an invalid app-event result.`);
  }

  let reply: FlowcordiaActivepiecesAppEventReply | null = null;
  if (parsed.reply !== undefined && parsed.reply !== null) {
    if (!isRecord(parsed.reply)) {
      throw new Error(`Activepieces piece ${input.pieceName} returned an invalid app-event reply.`);
    }
    let headers: Record<string, string> | undefined;
    if (parsed.reply.headers !== undefined) {
      if (!isRecord(parsed.reply.headers)) {
        throw new Error(
          `Activepieces piece ${input.pieceName} returned invalid app-event headers.`
        );
      }
      const entries = Object.entries(parsed.reply.headers);
      if (entries.some(([, value]) => typeof value !== "string")) {
        throw new Error(
          `Activepieces piece ${input.pieceName} returned invalid app-event headers.`
        );
      }
      headers = Object.fromEntries(entries) as Record<string, string>;
    }
    reply = {
      ...(parsed.reply.body !== undefined ? { body: jsonValue(parsed.reply.body) } : {}),
      ...(headers ? { headers } : {}),
    };
  }

  return {
    reply,
    event: typeof parsed.event === "string" ? parsed.event : null,
    identifierValue: typeof parsed.identifierValue === "string" ? parsed.identifierValue : null,
  };
}
