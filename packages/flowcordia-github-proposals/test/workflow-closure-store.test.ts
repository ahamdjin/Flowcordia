import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import type {
  GitHubFileResult,
  GitHubRepositoryClient,
  GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";
import {
  createFlowcordiaProposalClosureManifest,
  GitHubProposalWorkflowClosureStore,
  resolveFlowcordiaProposalClosure,
  serializeFlowcordiaProposalClosureManifest,
} from "../src/index.js";

const commitSha = "a".repeat(40);
const scope: GitHubWorkflowAccessScope = {
  tenantId: "tenant-1",
  projectId: "project-1",
  installationId: 42,
  repository: {
    owner: "acme",
    name: "automations",
    branch: "flowcordia/root/proposal-12345678",
  },
};
const inputSchema = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
  additionalProperties: false,
} as const;
const outputSchema = {
  type: "object",
  required: ["accepted"],
  properties: { accepted: { type: "boolean" } },
  additionalProperties: false,
} as const;

function workflow(id: string): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id,
    name: id,
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
        outputSchema: inputSchema,
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 200, y: 0 },
        configuration: {},
        inputSchema: outputSchema,
      },
    ],
    edges: [{ id: "trigger-output", source: "trigger", target: "output" }],
  };
}

function manifest() {
  const resolved = resolveFlowcordiaProposalClosure({
    rootWorkflow: workflow("root"),
    descendants: [],
    repositoryFullName: "acme/automations",
  });
  if (!resolved.success) throw new Error(resolved.issues.join(" "));
  return createFlowcordiaProposalClosureManifest({
    proposalId: "proposal-12345678",
    baseCommitSha: commitSha,
    closure: resolved.closure,
    rootBaseBlobSha: "b".repeat(40),
  });
}

function encode(sourceText: string): GitHubFileResult {
  return {
    found: true,
    blobSha: "c".repeat(40),
    size: new TextEncoder().encode(sourceText).length,
    contentBase64: btoa(sourceText),
  };
}

function createHarness(initial: GitHubFileResult = { found: false }) {
  let current = initial;
  const writes: Array<{
    path: string;
    expectedBlobSha: string | null;
    sourceText: string;
  }> = [];
  const client: GitHubRepositoryClient = {
    async resolveRevision() {
      return { commitSha };
    },
    async getFile() {
      return current;
    },
    async putFile(input) {
      const sourceText = atob(input.contentBase64);
      writes.push({
        path: input.path,
        expectedBlobSha: input.expectedBlobSha,
        sourceText,
      });
      current = encode(sourceText);
      return { commitSha: "d".repeat(40), blobSha: "e".repeat(40) };
    },
    async deleteFile() {
      throw new Error("delete is not supported by this test");
    },
  };
  return {
    store: new GitHubProposalWorkflowClosureStore({
      clientResolver: { async resolve() { return client; } },
    }),
    writes,
  };
}

const mutation = { actorId: "actor-1", correlationId: "correlation-1" };

describe("GitHub proposal workflow closure store", () => {
  it("creates one no-overwrite manifest and reads it back", async () => {
    const harness = createHarness();
    const expected = manifest();
    const saved = await harness.store.save({
      scope,
      proposalId: expected.proposalId,
      manifest: expected,
      mutation,
    });

    expect(saved).toMatchObject({ success: true, value: { noChange: false } });
    expect(harness.writes).toEqual([
      {
        path: ".flowcordia/proposals/proposal-12345678.json",
        expectedBlobSha: null,
        sourceText: serializeFlowcordiaProposalClosureManifest(expected),
      },
    ]);
    const read = await harness.store.read({
      scope,
      proposalId: expected.proposalId,
      revision: "d".repeat(40),
    });
    expect(read).toMatchObject({ success: true, value: { manifest: expected } });
  });

  it("treats an identical existing manifest as an idempotent retry", async () => {
    const expected = manifest();
    const harness = createHarness(encode(serializeFlowcordiaProposalClosureManifest(expected)));
    const saved = await harness.store.save({
      scope,
      proposalId: expected.proposalId,
      manifest: expected,
      mutation,
    });

    expect(saved).toMatchObject({ success: true, value: { noChange: true } });
    expect(harness.writes).toEqual([]);
  });

  it("rejects different closure membership after the manifest is locked", async () => {
    const expected = manifest();
    const changed = {
      ...expected,
      closureDigest: "f".repeat(64),
    };
    const harness = createHarness(encode(serializeFlowcordiaProposalClosureManifest(expected)));
    const saved = await harness.store.save({
      scope,
      proposalId: expected.proposalId,
      manifest: changed,
      mutation,
    });

    expect(saved).toMatchObject({
      success: false,
      error: { code: "invalid_input" },
    });
    expect(harness.writes).toEqual([]);
  });

  it("fails closed on a tampered existing manifest", async () => {
    const expected = manifest();
    const tampered = serializeFlowcordiaProposalClosureManifest({
      ...expected,
      closureDigest: "f".repeat(64),
    });
    const harness = createHarness(encode(tampered));
    const saved = await harness.store.save({
      scope,
      proposalId: expected.proposalId,
      manifest: expected,
      mutation,
    });

    expect(saved).toMatchObject({
      success: false,
      error: {
        code: "invalid_document",
        message: "Proposal closure manifest digest is invalid.",
      },
    });
    expect(harness.writes).toEqual([]);
  });
});
