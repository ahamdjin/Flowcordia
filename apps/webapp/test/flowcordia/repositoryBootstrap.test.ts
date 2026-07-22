import { isValidProposalId } from "@flowcordia/github-proposals";
import { compileWorkflowToTriggerTask } from "@flowcordia/runtime";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";

const mocks = vi.hoisted(() => ({
  catalogDiscover: vi.fn(),
  createProposal: vi.fn(),
  createProposalCommandService: vi.fn(),
  createWorkflowIndexGitHubGateway: vi.fn(),
  preparePreview: vi.fn(),
  readGeneratedArtifact: vi.fn(),
  readWorkflow: vi.fn(),
}));

vi.mock("../../app/features/flowcordia/workflows/index/github.server", () => ({
  createWorkflowIndexGitHubGateway: mocks.createWorkflowIndexGitHubGateway,
}));

vi.mock("../../app/features/flowcordia/workflows/preview/environment.server", () => ({
  prepareFlowcordiaPreviewEnvironment: mocks.preparePreview,
}));

vi.mock("../../app/features/flowcordia/proposals/service.server", () => ({
  createProposalCommandService: mocks.createProposalCommandService,
}));

import {
  buildFlowcordiaBootstrapCommand,
  FLOWCORDIA_BOOTSTRAP_CONFIRMATION,
} from "../../app/features/flowcordia/workflows/bootstrap/command-contract";
import {
  createFlowcordiaStarterWorkflow,
  FLOWCORDIA_STARTER_TEMPLATES,
} from "../../app/features/flowcordia/workflows/bootstrap/contract";
import { FlowcordiaBootstrapError } from "../../app/features/flowcordia/workflows/bootstrap/errors";
import { canBootstrapFlowcordiaRepository } from "../../app/features/flowcordia/workflows/bootstrap/eligibility";
import { flowcordiaBootstrapProposalId } from "../../app/features/flowcordia/workflows/bootstrap/proposal-identity.server";
import { bootstrapFlowcordiaRepository } from "../../app/features/flowcordia/workflows/bootstrap/service.server";

const baseCommitSha = "a".repeat(40);
const headSha = "b".repeat(40);
const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  githubAppInstallationId: "github-installation-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
} satisfies WorkflowIndexScope;

const command = {
  scope,
  templateId: "manual" as const,
  workflowId: "starter_workflow",
  name: "Starter workflow",
  description: "First governed workflow",
  actorId: "user-1",
  creatorReviewerId: "reviewer-1",
};

const expectedOperations = {
  manual: ["trigger.manual", "output.return"],
  api_transform: ["trigger.api", "data.map", "output.return"],
  scheduled_delay: ["trigger.schedule", "control.wait", "output.return"],
} as const;

function missing(operation: "read" | "read_artifact") {
  return {
    success: false as const,
    error: {
      code: "not_found" as const,
      operation,
      message: "Not found.",
      retryable: false,
      repository: scope.repository,
    },
  };
}

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.createWorkflowIndexGitHubGateway.mockResolvedValue({
    catalog: { discover: mocks.catalogDiscover },
    workflowStore: {
      read: mocks.readWorkflow,
      readGeneratedArtifact: mocks.readGeneratedArtifact,
    },
  });
  mocks.catalogDiscover.mockResolvedValue({
    success: true,
    value: {
      repository: scope.repository,
      requestedRevision: scope.repository.branch,
      commitSha: baseCommitSha,
      workflowRoot: ".flowcordia/workflows",
      entries: [],
    },
  });
  mocks.readWorkflow.mockResolvedValue(missing("read"));
  mocks.readGeneratedArtifact.mockResolvedValue(missing("read_artifact"));
  mocks.preparePreview.mockResolvedValue({
    state: "READY",
    branchName: "flowcordia/proposals/starter_workflow/bootstrap-starter",
    alreadyExisted: false,
  });
  mocks.createProposalCommandService.mockResolvedValue({ create: mocks.createProposal });
  mocks.createProposal.mockImplementation(async ({ proposalId }: { proposalId: string }) => ({
    success: true,
    value: {
      proposal: {
        proposalId,
        state: "DRAFT",
        headSha,
        pullRequestNumber: 45,
      },
    },
  }));
});

describe("Flowcordia repository bootstrap", () => {
  it.each(FLOWCORDIA_STARTER_TEMPLATES)(
    "creates a validated, compilable $id starter workflow",
    (template) => {
      const workflow = createFlowcordiaStarterWorkflow({
        templateId: template.id,
        workflowId: template.defaultWorkflowId,
        name: template.defaultName,
        description: template.defaultDescription,
      });
      expect(workflow.nodes.map((node) => node.operation)).toEqual(expectedOperations[template.id]);
      expect(workflow.labels).toContain("starter");
      const compiled = compileWorkflowToTriggerTask(workflow);
      expect(compiled.success).toBe(true);
      if (compiled.success) {
        expect(compiled.artifact.taskId).toBe(`flowcordia-${template.defaultWorkflowId}`);
        expect(compiled.artifact.source).toContain("executeFlowcordiaWorkflow");
      }
    }
  );

  it("keeps the manual template deterministic", () => {
    const workflow = createFlowcordiaStarterWorkflow({
      templateId: "manual",
      workflowId: command.workflowId,
      name: command.name,
      description: command.description,
    });
    expect(workflow.edges).toEqual([
      { id: "manual_trigger_to_output", source: "manual_trigger", target: "output" },
    ]);
  });

  it("builds a bounded proposal identity from the exact base and workflow content", () => {
    const workflow = createFlowcordiaStarterWorkflow({
      templateId: "manual",
      workflowId: `w${"a".repeat(127)}`,
      name: "Starter workflow",
      description: "First version",
    });
    const proposalId = flowcordiaBootstrapProposalId({ workflow, baseCommitSha });
    expect(proposalId.length).toBeLessThanOrEqual(80);
    expect(isValidProposalId(proposalId)).toBe(true);
    expect(flowcordiaBootstrapProposalId({ workflow, baseCommitSha })).toBe(proposalId);
    expect(
      flowcordiaBootstrapProposalId({
        workflow: { ...workflow, description: "Changed version" },
        baseCommitSha,
      })
    ).not.toBe(proposalId);
    expect(flowcordiaBootstrapProposalId({ workflow, baseCommitSha: "c".repeat(40) })).not.toBe(
      proposalId
    );
  });

  it("checks the immutable base, both target paths, and compiler before creating a proposal", async () => {
    const result = await bootstrapFlowcordiaRepository(command);
    const proposalInput = mocks.createProposal.mock.calls[0]![0];
    expect(mocks.catalogDiscover).toHaveBeenCalledWith({ scope });
    expect(mocks.readWorkflow).toHaveBeenCalledWith({
      scope,
      workflowId: command.workflowId,
      revision: baseCommitSha,
    });
    expect(mocks.readGeneratedArtifact).toHaveBeenCalledWith({
      scope,
      workflowId: command.workflowId,
      revision: baseCommitSha,
    });
    expect(proposalInput).toMatchObject({
      scope,
      workflow: result.workflow,
      expectedBaseCommitSha: baseCommitSha,
      expectedBaseBlobSha: null,
      actorId: command.actorId,
      creatorReviewerId: command.creatorReviewerId,
    });
    expect(proposalInput.proposalId).toBe(
      flowcordiaBootstrapProposalId({ workflow: result.workflow, baseCommitSha })
    );
    expect(proposalInput.correlationId).toMatch(/^bootstrap:[0-9a-f-]{36}$/);
    expect(mocks.preparePreview).toHaveBeenCalledWith({
      scope,
      workflowId: command.workflowId,
      proposalId: proposalInput.proposalId,
    });
    expect(result.generatedPath).toBe("trigger/flowcordia/starter_workflow.ts");
  });

  it("makes no proposal or preview mutation when any workflow is already indexed", async () => {
    mocks.catalogDiscover.mockResolvedValueOnce({
      success: true,
      value: {
        commitSha: baseCommitSha,
        entries: [{ workflowId: "existing", path: ".flowcordia/workflows/existing.json" }],
      },
    });
    await expect(bootstrapFlowcordiaRepository(command)).rejects.toMatchObject({
      code: "repository_not_empty",
      status: 409,
      retryable: false,
    } satisfies Partial<FlowcordiaBootstrapError>);
    expect(mocks.readWorkflow).not.toHaveBeenCalled();
    expect(mocks.preparePreview).not.toHaveBeenCalled();
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it.each(["workflow", "generated task"] as const)(
    "refuses to overwrite an existing %s path",
    async (target) => {
      const existing = {
        success: true,
        value: { source: { commitSha: baseCommitSha }, workflow: {} },
      };
      if (target === "workflow") mocks.readWorkflow.mockResolvedValueOnce(existing);
      else mocks.readGeneratedArtifact.mockResolvedValueOnce(existing);
      await expect(bootstrapFlowcordiaRepository(command)).rejects.toMatchObject({
        code: "workflow_conflict",
        status: 409,
        retryable: false,
      } satisfies Partial<FlowcordiaBootstrapError>);
      expect(mocks.preparePreview).not.toHaveBeenCalled();
      expect(mocks.createProposal).not.toHaveBeenCalled();
    }
  );

  it("builds one explicit proposal-only browser command", () => {
    expect(
      buildFlowcordiaBootstrapCommand({
        templateId: command.templateId,
        workflowId: command.workflowId,
        name: command.name,
        description: command.description,
      })
    ).toEqual({
      operation: "bootstrap",
      confirmation: FLOWCORDIA_BOOTSTRAP_CONFIRMATION,
      templateId: command.templateId,
      workflowId: command.workflowId,
      name: command.name,
      description: command.description,
    });
  });

  it("offers bootstrap only for a settled, exact zero-workflow production index", () => {
    const ready = {
      workflowCount: 0,
      syncState: "IDLE" as const,
      indexedEntryCount: 0,
      observedCommitSha: baseCommitSha,
      stale: false,
      loadError: false,
    };
    expect(canBootstrapFlowcordiaRepository(ready)).toBe(true);
    expect(canBootstrapFlowcordiaRepository({ ...ready, workflowCount: 1 })).toBe(false);
    expect(canBootstrapFlowcordiaRepository({ ...ready, indexedEntryCount: 1 })).toBe(false);
    expect(canBootstrapFlowcordiaRepository({ ...ready, syncState: "RUNNING" })).toBe(false);
    expect(canBootstrapFlowcordiaRepository({ ...ready, observedCommitSha: null })).toBe(false);
    expect(canBootstrapFlowcordiaRepository({ ...ready, stale: true })).toBe(false);
    expect(canBootstrapFlowcordiaRepository({ ...ready, loadError: true })).toBe(false);
  });

  it("keeps repository identity and mutation authority out of the browser contract", () => {
    const commandContract = source(
      "../../app/features/flowcordia/workflows/bootstrap/command-contract.ts"
    );
    const route = source(
      "../../app/routes/resources.orgs.$organizationSlug.projects.$projectParam.flowcordia.repository-bootstrap/route.ts"
    );
    const panel = source(
      "../../app/features/flowcordia/workflows/bootstrap/WorkflowRepositoryBootstrapPanel.tsx"
    );
    const studio = source("../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx");
    expect(commandContract).not.toContain("repositoryId");
    expect(commandContract).not.toContain("installationId");
    expect(commandContract).not.toContain("baseCommitSha");
    expect(route).toContain('authorization: { action: "write", resource: { type: "github" } }');
    expect(route).toContain("resolveFlowcordiaProjectContext");
    expect(panel).not.toContain("repositoryId");
    expect(panel).not.toContain("installationId");
    expect(panel).toContain("flowcordia-bootstrap-acknowledgement");
    expect(panel).toContain("data-testid={`flowcordia-bootstrap-template-${template.id}`}");
    expect(FLOWCORDIA_STARTER_TEMPLATES.map((template) => template.id)).toContain("api_transform");
    expect(panel).toContain("Review proposal");
    expect(studio).toContain("canBootstrapRepository");
    expect(studio).toContain("canBootstrapFlowcordiaRepository");
    expect(studio).toContain("<WorkflowRepositoryBootstrapPanel");
  });
});
