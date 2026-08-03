import type {
  FlowcordiaActivepiecesTriggerPayload,
  FlowcordiaActivepiecesWebhookResponse,
} from "./activepieces.js";

export type FlowcordiaActivepiecesWebhookHandshakeStrategy =
  | "NONE"
  | "HEADER_PRESENT"
  | "QUERY_PRESENT"
  | "BODY_PARAM_PRESENT"
  | "HEAD_REQUEST";

export interface FlowcordiaActivepiecesWebhookHandshakeConfiguration {
  strategy: FlowcordiaActivepiecesWebhookHandshakeStrategy;
  paramName?: string;
}

export type FlowcordiaActivepiecesSimulationWakePayload =
  | { kind: "CANCEL" }
  | {
      kind: "CALLBACK";
      requestId: string;
      payload: FlowcordiaActivepiecesTriggerPayload;
    };

export type FlowcordiaActivepiecesSimulationCallbackResult =
  | {
      requestId: string;
      kind: "HANDSHAKE";
      response: FlowcordiaActivepiecesWebhookResponse;
    }
  | {
      requestId: string;
      kind: "EVENT_ACCEPTED";
    };

/**
 * Mirrors Activepieces CE webhookHandshake.isHandshakeRequest exactly.
 * Request conversion is responsible for normalizing header names before this check.
 */
export function isFlowcordiaActivepiecesHandshakeRequest(input: {
  payload: FlowcordiaActivepiecesTriggerPayload;
  handshakeConfiguration: FlowcordiaActivepiecesWebhookHandshakeConfiguration | null | undefined;
}): boolean {
  const { payload, handshakeConfiguration } = input;
  if (!handshakeConfiguration?.strategy) return false;

  const { strategy, paramName } = handshakeConfiguration;
  switch (strategy) {
    case "HEADER_PRESENT":
      return paramName !== undefined && paramName.toLowerCase() in payload.headers;
    case "QUERY_PRESENT":
      return paramName !== undefined && paramName in payload.queryParams;
    case "BODY_PARAM_PRESENT":
      return (
        paramName !== undefined &&
        typeof payload.body === "object" &&
        payload.body !== null &&
        paramName in payload.body
      );
    case "HEAD_REQUEST":
      return payload.method?.toUpperCase() === "HEAD";
    case "NONE":
    default:
      return false;
  }
}
