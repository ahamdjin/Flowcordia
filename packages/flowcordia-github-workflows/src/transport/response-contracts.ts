import { z } from "@flowcordia/foundation";

import { GitHubTransportError } from "./errors.js";

const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN);
const positiveIntegerSchema = z.number().int().safe().positive();
const userIdSchema = z
  .union([z.string().min(1), positiveIntegerSchema])
  .transform((value) => String(value));

const branchResponseSchema = z
  .object({ object: z.object({ sha: objectIdSchema }).passthrough() })
  .passthrough();

const pullRequestResponseSchema = z
  .object({
    number: positiveIntegerSchema,
    node_id: z.string().min(1),
    html_url: z.string(),
    state: z.enum(["open", "closed"]),
    draft: z.boolean(),
    merged: z.unknown().optional(),
    merged_at: z.unknown().optional(),
    merge_commit_sha: objectIdSchema.nullish(),
    mergeable: z.unknown().optional(),
    mergeable_state: z.unknown().optional(),
    body: z.string().nullable(),
    head: z.object({ ref: z.string(), sha: objectIdSchema }).passthrough(),
    base: z.object({ ref: z.string() }).passthrough(),
    user: z.object({ id: userIdSchema }).passthrough(),
  })
  .passthrough();

const checkResponseSchema = z
  .object({
    id: positiveIntegerSchema,
    name: z.string().min(1),
    head_sha: objectIdSchema,
    status: z.string(),
    conclusion: z.string().nullable(),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
  })
  .passthrough();

const statusResponseSchema = z
  .object({
    id: positiveIntegerSchema,
    context: z.string().min(1),
    sha: objectIdSchema,
    state: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

const reviewResponseSchema = z
  .object({
    id: positiveIntegerSchema,
    user: z.object({ id: userIdSchema }).passthrough(),
    state: z.string(),
    commit_id: objectIdSchema.nullable(),
    submitted_at: z.string().nullable(),
  })
  .passthrough();

const mergeResponseSchema = z
  .object({ merged: z.boolean(), sha: z.unknown().optional() })
  .passthrough();

function invalidResponse(message: string, mutationMayHaveSucceeded = false): GitHubTransportError {
  return new GitHubTransportError(message, {
    code: "invalid_response",
    mutationMayHaveSucceeded,
  });
}

function parseResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
  mutationMayHaveSucceeded = false
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidResponse(message, mutationMayHaveSucceeded);
  return parsed.data;
}

export function parseGitHubBranchResponse(
  value: unknown,
  message: string,
  mutationMayHaveSucceeded = false
) {
  return parseResponse(branchResponseSchema, value, message, mutationMayHaveSucceeded);
}

export function parseGitHubPullRequestResponse(
  value: unknown,
  message: string,
  mutationMayHaveSucceeded = false
) {
  return parseResponse(pullRequestResponseSchema, value, message, mutationMayHaveSucceeded);
}

export function parseGitHubCheckResponse(value: unknown, message: string) {
  return parseResponse(checkResponseSchema, value, message);
}

export function parseGitHubCommitStatusResponse(value: unknown, message: string) {
  return parseResponse(statusResponseSchema, value, message);
}

export function parseGitHubReviewResponse(value: unknown, message: string) {
  return parseResponse(reviewResponseSchema, value, message);
}

export function parseGitHubMergeResponse(
  value: unknown,
  message: string,
  mutationMayHaveSucceeded = true
) {
  return parseResponse(mergeResponseSchema, value, message, mutationMayHaveSucceeded);
}

export function parseGitHubGraphqlAcknowledgement(
  value: unknown,
  message: string,
  mutationMayHaveSucceeded = true
) {
  return parseResponse(
    z.record(z.string(), z.unknown()),
    value,
    message,
    mutationMayHaveSucceeded
  );
}

export function parseGitHubObjectId(value: unknown): string | null {
  const parsed = objectIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
