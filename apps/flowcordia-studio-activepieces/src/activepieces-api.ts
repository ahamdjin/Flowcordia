import { HttpStatusCode, isAxiosError } from "axios";
import { FLOWCORDIA_ACTIVEPIECES_FLAGS } from "./activepieces-flags";

export const isRunningCloudInDevMode = false;
export const API_BASE_URL = typeof window === "undefined" ? "" : window.location.origin;
export const API_URL = `${API_BASE_URL}/api`;

type Query = Record<string, unknown> | undefined;
type BackendMethod = "GET" | "POST" | "PATCH" | "DELETE";

type BackendResponse<T> =
  | { ok: true; intent: "activepieces_api"; data: T }
  | { ok: false; code: string; message: string };

let backendActionUrl: string | null = null;

export function configureActivepiecesApiBackend(actionUrl: string) {
  backendActionUrl = actionUrl;
}

function localResponse(url: string): unknown | undefined {
  if (url === "/v1/flags") return FLOWCORDIA_ACTIVEPIECES_FLAGS;
  return undefined;
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

async function backendRequest<TResponse>(
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
  if (!response.ok || !result.ok) {
    const failure = result.ok
      ? {
          code: "activepieces_backend_error",
          message: "Flowcordia rejected the Activepieces API request.",
        }
      : result;
    throw new FlowcordiaActivepiecesApiError(response.status, failure.code, failure.message);
  }
  return result.data;
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
    return backendRequest<TResponse>("GET", url);
  },
  async get<TResponse>(url: string, query?: Query, _config?: unknown): Promise<TResponse> {
    const local = localResponse(url);
    if (local !== undefined) return local as TResponse;
    return backendRequest<TResponse>("GET", url, query);
  },
  async delete<TResponse>(
    url: string,
    query?: Record<string, string>,
    body?: unknown
  ): Promise<TResponse> {
    return backendRequest<TResponse>("DELETE", url, query, body);
  },
  async post<TResponse, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    params?: TParams,
    _headers?: Record<string, string>
  ): Promise<TResponse> {
    return backendRequest<TResponse>(
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
    return backendRequest<TResponse>(
      "PATCH",
      url,
      params && typeof params === "object" ? (params as Query) : undefined,
      body
    );
  },
  httpStatus: HttpStatusCode,
};
