import {
  flowcordiaFunctionValidationSuiteDigest,
  validateFlowcordiaFunctionValidationSuite,
} from "@flowcordia/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listProposals: vi.fn(),
  readWorkflow: vi.fn(),
  readCatalog: vi.fn(),
}));

vi.mock("../../proposals/prisma.server", () => ({
  flowcordiaProposalStore: { listProposals: mocks.listProposals },
}));
vi.mock("../index/github.server", () => ({
  createWorkflowIndexGitHubGateway: vi.fn(async () => ({
    workflowStore: { read: mocks.readWorkflow },
    functionCatalog: { read: mocks.readCatalog },
  })),
}));

import {
  buildFlowcordiaFunctionValidationPlan,
  FlowcordiaFunctionValidationSuiteError,
} from "./suite.server";

const headSha = "a".repeat(40);
const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
  githubAppInstallationId: "installation-row-1",
};
const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["leadId"],
  properties: { leadId: { type: "string", minLength: 1 } },
};
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["qualified"],
  properties: { qualified: { type: "boolean" } },
};
const typedNode = {
  id: "function_qualify",
  kind: "code",
  operation: "code.task",
  position: { x: 0, y: 0 },
  configuration: { functionId: "qualify_lead" },
  inputSchema,
  outputSchema,
  codeReference: { path: "src/functions/qualifyLead.ts", exportName: "qualifyLead" },
};
const proposal = {
  proposalId: "studio-s-validation",
  workflowId: "lead_intake",
  headSha,
  state: "DRAFT",
};

function catalog(
  fixtures: unknown[] = [
    {
      id: "qualified_lead",
      name: "Qualified lead",
      input: { leadId: "lead_123" },
      mockOutput: { qualified: true },
    },
  ]
) {
  return {
    schemaVersion: "0.1",
    functions: [
      {
        id: "qualify_lead",
        name: "Qualify lead",
        codeReference: { path: "src/functions/qualifyLead.ts", exportName: "qualifyLead" },
        inputSchema,
        outputSchema,
        fixtures,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listProposals.mockResolvedValue([proposal]);
  mocks.readWorkflow.mockResolvedValue({
    success: true,
    value: {
      source: { commitSha: headSha },
      workflow: {
        schemaVersion: "0.1",
        id: "lead_intake",
        name: "Lead intake",
        labels: [],
        nodes: [typedNode],
        edges: [],
      },
    },
  });
  mocks.readCatalog.mockResolvedValue({
    success: true,
    value: { source: { commitSha: headSha }, catalog: catalog() },
  });
});

describe("buildFlowcordiaFunctionValidationPlan", () => {
  it("builds a deterministic server-owned suite from the exact proposal head", async () => {
    const plan = await buildFlowcordiaFunctionValidationPlan({
      scope,
      workflowId: "lead_intake",
      expectedHeadSha: headSha,
    });

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.functionCount).toBe(1);
    expect(plan.caseCount).toBe(1);
    expect(plan.suite.cases).toEqual([
      {
        functionId: "qualify_lead",
        fixtureId: "qualified_lead",
        input: { leadId: "lead_123" },
        expectedOutput: { qualified: true },
      },
    ]);
    expect(plan.suite.suiteDigest).toBe(
      flowcordiaFunctionValidationSuiteDigest({
        schemaVersion: "0.1",
        workflowId: "lead_intake",
        proposalId: proposal.proposalId,
        headSha,
        cases: plan.suite.cases,
      })
    );
    expect(validateFlowcordiaFunctionValidationSuite(plan.suite)).toEqual([]);
  });

  it("marks workflows without typed repository functions as not required", async () => {
    mocks.readWorkflow.mockResolvedValue({
      success: true,
      value: {
        source: { commitSha: headSha },
        workflow: {
          schemaVersion: "0.1",
          id: "lead_intake",
          name: "Lead intake",
          labels: [],
          nodes: [],
          edges: [],
        },
      },
    });

    await expect(
      buildFlowcordiaFunctionValidationPlan({
        scope,
        workflowId: "lead_intake",
        expectedHeadSha: headSha,
      })
    ).resolves.toEqual({
      required: false,
      workflowId: "lead_intake",
      proposalId: proposal.proposalId,
      headSha,
    });
  });

  it("blocks missing executable fixtures", async () => {
    mocks.readCatalog.mockResolvedValue({
      success: true,
      value: { source: { commitSha: headSha }, catalog: catalog([]) },
    });

    await expect(
      buildFlowcordiaFunctionValidationPlan({
        scope,
        workflowId: "lead_intake",
        expectedHeadSha: headSha,
      })
    ).rejects.toMatchObject({
      code: "fixtures_required",
      retryable: false,
    } satisfies Partial<FlowcordiaFunctionValidationSuiteError>);
  });

  it("rejects stale proposal and catalog identities", async () => {
    mocks.listProposals.mockResolvedValue([]);
    await expect(
      buildFlowcordiaFunctionValidationPlan({
        scope,
        workflowId: "lead_intake",
        expectedHeadSha: headSha,
      })
    ).rejects.toMatchObject({ code: "proposal_conflict" });

    mocks.listProposals.mockResolvedValue([proposal]);
    mocks.readCatalog.mockResolvedValue({
      success: true,
      value: { source: { commitSha: "b".repeat(40) }, catalog: catalog() },
    });
    await expect(
      buildFlowcordiaFunctionValidationPlan({
        scope,
        workflowId: "lead_intake",
        expectedHeadSha: headSha,
      })
    ).rejects.toMatchObject({ code: "catalog_unavailable" });
  });
});
