import { WORKFLOW_STUDIO_TEMPLATE_IDS } from "@flowcordia/workflow";
import { z } from "zod";

export const WorkflowStudioTemplateIdCommand = z.enum(WORKFLOW_STUDIO_TEMPLATE_IDS);

const RetryPolicyCommand = z
  .object({
    maxAttempts: z.number().int().min(1).max(10).optional(),
    minTimeoutMs: z.number().int().min(0).max(86_400_000).optional(),
    maxTimeoutMs: z.number().int().min(0).max(86_400_000).optional(),
    factor: z.number().finite().min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (retry) =>
      retry.minTimeoutMs === undefined ||
      retry.maxTimeoutMs === undefined ||
      retry.maxTimeoutMs >= retry.minTimeoutMs,
    { message: "Maximum retry delay must not be smaller than minimum retry delay." }
  );

export const WorkflowRuntimePolicyCommand = z
  .object({
    queue: z
      .string()
      .regex(/^[A-Za-z0-9_\/-]{1,128}$/)
      .optional(),
    machine: z
      .enum(["micro", "small-1x", "small-2x", "medium-1x", "medium-2x", "large-1x", "large-2x"])
      .optional(),
    maxDurationSeconds: z.number().int().min(5).max(2_147_483_646).optional(),
    retry: RetryPolicyCommand.optional(),
  })
  .strict();
