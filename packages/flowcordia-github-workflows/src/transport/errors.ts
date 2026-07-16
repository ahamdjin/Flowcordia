export type GitHubTransportErrorCode =
  | "http_error"
  | "network_error"
  | "rate_limited"
  | "invalid_response";

export interface GitHubTransportErrorOptions {
  code: GitHubTransportErrorCode;
  status?: number;
  requestId?: string;
  retryAfterMs?: number;
  mutationMayHaveSucceeded?: boolean;
}

export class GitHubTransportError extends Error {
  readonly code: GitHubTransportErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
  readonly mutationMayHaveSucceeded: boolean;

  constructor(message: string, options: GitHubTransportErrorOptions) {
    super(message);
    this.name = "GitHubTransportError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
    this.mutationMayHaveSucceeded = options.mutationMayHaveSucceeded ?? false;
  }
}
