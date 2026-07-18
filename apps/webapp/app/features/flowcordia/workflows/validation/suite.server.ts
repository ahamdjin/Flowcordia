import {
  FLOWCORDIA_FUNCTION_VALIDATION_SCHEMA_VERSION,
  flowcordiaFunctionValidationSuiteDigest,
  validateFlowcordiaFunctionValidationSuite,
  type FlowcordiaFunctionValidationCase,
  type FlowcordiaFunctionValidationSuite,
} from "@flowcordia/runtime";
import {
  resolveWorkflowFunctionFixture,
  type JsonObject,
  type WorkflowNode,
} from "@flowcordia/workflow";
import { flowcordiaProposalStore } from "../../proposals/prisma.server";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import type { WorkflowIndexScope } from "../index/types";

export type FlowcordiaFunctionValidationSuiteErrorCode =
  | "proposal_conflict"
  | "workflow_unavailable"
  | "catalog_unavailable"
  | "function_mismatch"
  | "fixtures_required"
  | "suite_invalid";

export class FlowcordiaFunctionValidationSuiteError extends Error {
  constructor(
    readonly code: FlowcordiaFunctionValidationSuiteErrorCode,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaFunctionValidationSuiteError";
  }
}

export type FlowcordiaFunctionValidationPlan =
  | {
      required: false;
      workflowId: string;
      proposalId: string;
      headSha: string;
    }
  | {
      required: true;
      workflowId: string;
      proposalId: string;
      headSha: string;
      functionCount: number;
      caseCount: number;
      suite: FlowcordiaFunctionValidationSuite;
    };

function typedFunctionId(node: WorkflowNode): string | null {
  return node.operation === "code.task" && typeof node.configuration.functionId === "string"
    ? node.configuration.functionId
    : null;
}

function copyObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export async function buildFlowcordiaFunctionValidationPlan(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  expectedHeadSha: string;
}): Promise<FlowcordiaFunctionValidationPlan> {
  const proposals = await flowcordiaProposalStore.listProposals({
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    repositoryId: input.scope.repositoryId,
    limit: 100,
  });
  const proposal = proposals.find(
    (candidate) =>
      candidate.workflowId === input.workflowId &&
      candidate.headSha === input.expectedHeadSha &&
      !["MERGED", "CLOSED", "FAILED"].includes(candidate.state)
  );
  if (!proposal?.headSha) {
    throw new FlowcordiaFunctionValidationSuiteError(
      "proposal_conflict",
      "The proposal head changed. Refresh before validating repository functions.",
      false
    );
  }

  const { workflowStore, functionCatalog } = await createWorkflowIndexGitHubGateway(input.scope);
  const workflowRead = await workflowStore.read({
    scope: input.scope,
    workflowId: input.workflowId,
    revision: proposal.headSha,
  });
  if (!workflowRead.success || workflowRead.value.source.commitSha !== proposal.headSha) {
    throw new FlowcordiaFunctionValidationSuiteError(
      "workflow_unavailable",
      "The exact proposal workflow could not be proven for function validation.",
      workflowRead.success ? false : workflowRead.error.retryable
    );
  }

  const typedNodes = workflowRead.value.workflow.nodes.filter(
    (node) => typedFunctionId(node) !== null
  );
  if (typedNodes.length === 0) {
    return {
      required: false,
      workflowId: input.workflowId,
      proposalId: proposal.proposalId,
      headSha: proposal.headSha,
    };
  }

  const catalogRead = await functionCatalog.read({
    scope: input.scope,
    revision: proposal.headSha,
  });
  if (!catalogRead.success || catalogRead.value.source.commitSha !== proposal.headSha) {
    throw new FlowcordiaFunctionValidationSuiteError(
      "catalog_unavailable",
      "The exact proposal function catalog could not be proven for validation.",
      catalogRead.success ? false : catalogRead.error.retryable
    );
  }

  const nodesByFunction = new Map<string, WorkflowNode>();
  for (const node of typedNodes) {
    const functionId = typedFunctionId(node)!;
    const existing = nodesByFunction.get(functionId);
    if (
      existing &&
      JSON.stringify({
        codeReference: existing.codeReference,
        inputSchema: existing.inputSchema,
        outputSchema: existing.outputSchema,
      }) !==
        JSON.stringify({
          codeReference: node.codeReference,
          inputSchema: node.inputSchema,
          outputSchema: node.outputSchema,
        })
    ) {
      throw new FlowcordiaFunctionValidationSuiteError(
        "function_mismatch",
        `Typed function "${functionId}" has conflicting workflow identities at this proposal head.`,
        false
      );
    }
    if (!existing) nodesByFunction.set(functionId, node);
  }

  const cases: FlowcordiaFunctionValidationCase[] = [];
  for (const [functionId, node] of [...nodesByFunction].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const definition = catalogRead.value.catalog.functions.find(
      (candidate) => candidate.id === functionId
    );
    if (!definition) {
      throw new FlowcordiaFunctionValidationSuiteError(
        "function_mismatch",
        `Typed function "${functionId}" is missing from the exact proposal catalog.`,
        false
      );
    }
    if (!definition.fixtures || definition.fixtures.length === 0) {
      throw new FlowcordiaFunctionValidationSuiteError(
        "fixtures_required",
        `Typed function "${functionId}" must define at least one repository fixture before promotion.`,
        false
      );
    }
    for (const fixture of [...definition.fixtures].sort((left, right) =>
      left.id.localeCompare(right.id)
    )) {
      const resolved = resolveWorkflowFunctionFixture({
        catalog: catalogRead.value.catalog,
        node,
        fixtureId: fixture.id,
        payload: fixture.input,
      });
      if (!resolved.success) {
        throw new FlowcordiaFunctionValidationSuiteError(
          "function_mismatch",
          resolved.message,
          false
        );
      }
      cases.push({
        functionId,
        fixtureId: fixture.id,
        input: copyObject(fixture.input),
        expectedOutput: copyObject(resolved.mockOutput),
      });
    }
  }

  const suiteContent = {
    schemaVersion: FLOWCORDIA_FUNCTION_VALIDATION_SCHEMA_VERSION,
    workflowId: input.workflowId,
    proposalId: proposal.proposalId,
    headSha: proposal.headSha,
    cases,
  };
  const suite: FlowcordiaFunctionValidationSuite = {
    ...suiteContent,
    suiteDigest: flowcordiaFunctionValidationSuiteDigest(suiteContent),
  };
  const issues = validateFlowcordiaFunctionValidationSuite(suite);
  if (issues.length > 0) {
    throw new FlowcordiaFunctionValidationSuiteError(
      "suite_invalid",
      issues[0] ?? "The repository function validation suite is invalid.",
      false
    );
  }
  return {
    required: true,
    workflowId: input.workflowId,
    proposalId: proposal.proposalId,
    headSha: proposal.headSha,
    functionCount: nodesByFunction.size,
    caseCount: cases.length,
    suite,
  };
}
