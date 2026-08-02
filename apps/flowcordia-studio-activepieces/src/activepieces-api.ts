import type { StepRunResponse } from "@activepieces/shared";
import { HttpStatusCode, isAxiosError } from "axios";
import { FLOWCORDIA_ACTIVEPIECES_FLAGS } from "./activepieces-flags";

export const isRunningCloudInDevMode = false;
export const API_BASE_URL = typeof window === "undefined" ? "" : window.location.origin;
export const API_URL = `${API_BASE_URL}/api`;

const WARMING_RETRY_ATTEMPTS = 90;
const WARMING_RETRY_DELAY_MS = 1000;

type Query = Record<string, unknown> | undefined;
type BackendMethod = "GET" | "POST" | "PATCH" | "DELETE";

type BackendResponse<T> =
  | {
      ok: true;
      intent: "activepieces_api";
      data: T;
      transport?: { stepRunResponse?: unknown };
    }
  | { ok: false; code: string; message: string };

let backendActionUrl: string | null = null;
const completedStepRuns = new Map<string, StepRunResponse>();

export function configureActivepiecesApiBackend(actionUrl: string) {
  backendActionUrl = actionUrl;
}

export function consumeActivepiecesStepRunResponse(runId: string): StepRunResponse | null {
  const result = completedStepRuns.get(runId) ?? null;
  completedStepRuns.delete(runId);
  return result;
}

function localResponse(url: string): unknown | undefined {
  if (url === "/v1/flags") return FLOWCORDIA_ACTIVEPIECES_FLAGS;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStepRunResponse(value: unknown, runId: string): value is StepRunResponse {
  return (
    isRecord(value) &&
    value.runId === runId &&
    typeof value.success === "boolean" &&
    typeof value.standardError === "string" &&
    typeof value.standardOutput === "string"
  );
}

function rememberCompletedStepRun(path: string, data: unknown, transport: unknown): void {
  if (path !== "/v1/sample-data/test-step" || !isRecord(data) || typeof data.id !== "string") {
    return;
  }
  if (!isRecord(transport)) return;
  const stepRun = transport.stepRunResponse;
  if (!isStepRunResponse(stepRun, data.id)) return;
  completedStepRuns.set(data.id, stepRun);
}

class FlowcordiaActivepiecesApiError extends Error {
  readonly isAxiosError = true;
  readonly response: { status: number; data: { code: string; message: string } };

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "FlowcordiaActivepiecesApiError";
    this.response = { status, data: { code, message } };
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function flowcordiaActivepiecesBackendRequest<TResponse>(
  method: BackendMethod,
  path: string,
  query?: Query,
  body?: unknown
): Promise<TResponse> {
  if (!backendActionUrl) {
    throw new FlowcordiaActivepiecesApiError(
      HttpStatusCode.ServiceUnavailable,
      "activepieces_backend_unavailable",
      "The Flowcordia Activepieces backend adapter has not been configured."
    );
  }

  for (let attempt = 0; attempt < WARMING_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetch(backendActionUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "activepieces_api",
        method,
        path,
        query,
        body,
      }),
    });
    const result = (await response.json()) as BackendResponse<TResponse>;
    if (response.ok && result.ok) {
      rememberCompletedStepRun(path, result.data, result.transport);
      return result.data;
    }

    const failure = result.ok
      ? {
          code: "activepieces_backend_error",
          message: "Flowcordia rejected the Activepieces API request.",
        }
      : result;
    if (
      response.status === HttpStatusCode.ServiceUnavailable &&
      failure.code === "activepieces_interaction_warming" &&
      attempt + 1 < WARMING_RETRY_ATTEMPTS
    ) {
      await sleep(WARMING_RETRY_DELAY_MS);
      continue;
    }
    throw new FlowcordiaActivepiecesApiError(response.status, failure.code, failure.message);
  }

  throw new FlowcordiaActivepiecesApiError(
    HttpStatusCode.ServiceUnavailable,
    "activepieces_interaction_unavailable",
    "The exact Activepieces piece runtime did not become ready within the bounded Studio wait."
  );
}

export const api = {
  isApError(error: unknown, errorCode: unknown) {
    if (!error || typeof error !== "object") return false;
    const response = (error as { response?: { data?: { code?: unknown } } }).response;
    return response?.data?.code === errorCode;
  },
  isError(error: unknown) {
    return isAxiosError(error);
  },
  extractServerErrorMessage(error: unknown, fallback: string): string {
    const responseMessage = (error as { response?: { data?: { message?: unknown } } })?.response
      ?.data?.message;
    if (typeof responseMessage === "string" && responseMessage.length > 0) return responseMessage;
    return error instanceof Error && error.message ? error.message : fallback;
  },
  async any<TResponse>(url: string, _config?: unknown): Promise<TResponse> {
    const local = localResponse(url);
    if (local !== undefined) return local as TResponse;
    return flowcordiaActivepiecesBackendRequest<TResponse>("GET", url);
  },
  async get<TResponse>(url: string, query?: Query, _config?: unknown): Promise<TResponse> {
    const local = localResponse(url);
    if (local !== undefined) return local as TResponse;
    return flowcordiaActivepiecesBackendRequest<TResponse>("GET", url, query);
  },
  async delete<TResponse>(
    url: string,
    query?: Record<string, string>,
    body?: unknown
  ): Promise<TResponse> {
    return flowcordiaActivepiecesBackendRequest<TResponse>("DELETE", url, query, body);
  },
  async post<TResponse, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    params?: TParams,
    _headers?: Record<string, string>
  ): Promise<TResponse> {
    return flowcordiaActivepiecesBackendRequest<TResponse>(
      "POST",
      url,
      params && typeof params === "object" ? (params as Query) : undefined,
      body
    );
  },
  async patch<TResponse, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    params?: TParams
  ): Promise<TResponse> {
    return flowcordiaActivepiecesBackendRequest<TResponse>(
      "PATCH",
      url,
      params && typeof params === "object" ? (params as Query) : undefined,
      body
    );
  },
  httpStatus: HttpStatusCode,
};