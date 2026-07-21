from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


studio = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx"
replace_once(
    studio,
    '''  const canBootstrapRepository = canBootstrapFlowcordiaRepository({
    workflowCount: workflows.length,
    syncState: sync.state,
    indexedEntryCount: sync.entryCount,
    observedCommitSha: sync.observedCommitSha,
    stale,
    loadError: Boolean(loadError),
  });

  return (
''',
    '''  const canBootstrapRepository = canBootstrapFlowcordiaRepository({
    workflowCount: workflows.length,
    syncState: sync.state,
    indexedEntryCount: sync.entryCount,
    observedCommitSha: sync.observedCommitSha,
    stale,
    loadError: Boolean(loadError),
  });
  const releaseCapabilityCounts = {
    httpNodes: graph?.nodes.filter((node) => node.operation === "action.http").length ?? 0,
    mappingNodes: graph?.nodes.filter((node) => node.operation === "data.map").length ?? 0,
    readyCredentialBindings: credentialWorkspace.bindings.filter(
      (binding) => binding.state === "READY"
    ).length,
  };

  return (
''',
)
replace_once(
    studio,
    '''      data-run-proof={preview.latestRun?.proof ?? ""}
      orientation="horizontal"
''',
    '''      data-run-proof={preview.latestRun?.proof ?? ""}
      data-release-http-nodes={releaseCapabilityCounts.httpNodes}
      data-release-mapping-nodes={releaseCapabilityCounts.mappingNodes}
      data-release-ready-credentials={releaseCapabilityCounts.readyCredentialBindings}
      orientation="horizontal"
''',
)

contract = "apps/webapp/app/features/flowcordia/acceptance/contract.ts"
replace_once(contract, '  schemaVersion: "0.1";\n', '  schemaVersion: "0.2";\n')
replace_once(
    contract,
    '''  stage: "configuration" | "navigation" | "readiness" | "structural" | "preview" | "complete";
''',
    '''  stage:
    | "configuration"
    | "navigation"
    | "readiness"
    | "structural"
    | "capability"
    | "preview"
    | "complete";
''',
)
replace_once(
    contract,
    '''  structural?: { status: "PASSED" };
  preview?: {
''',
    '''  structural?: { status: "PASSED" };
  capabilities?: {
    httpNodes: number;
    mappingNodes: number;
    readyCredentialBindings: number;
  };
  preview?: {
''',
)
replace_once(
    contract,
    '''      | "STRUCTURAL_FAILED"
      | "PREVIEW_FAILED";
''',
    '''      | "STRUCTURAL_FAILED"
      | "CAPABILITY_FAILED"
      | "PREVIEW_FAILED";
''',
)
replace_once(
    contract,
    '''    structural: {
      code: "STRUCTURAL_FAILED" as const,
      message: "Structural preview did not produce a passing result.",
    },
    preview: {
''',
    '''    structural: {
      code: "STRUCTURAL_FAILED" as const,
      message: "Structural preview did not produce a passing result.",
    },
    capability: {
      code: "CAPABILITY_FAILED" as const,
      message: "The release workflow does not prove HTTP, mapping, and ready credential coverage.",
    },
    preview: {
''',
)
replace_once(contract, '    schemaVersion: "0.1",\n', '    schemaVersion: "0.2",\n')

spec = "tests/flowcordia-connected/flowcordia.connected.spec.ts"
spec_file = Path(spec)
spec_content = spec_file.read_text().replace('schemaVersion: "0.1"', 'schemaVersion: "0.2"')
spec_file.write_text(spec_content)
replace_once(
    spec,
    '''    stage = "preview";
    if (!config.expectedHeadSha) {
''',
    '''    stage = "capability";
    const capabilities = {
      httpNodes: await integerAttribute(studio, "data-release-http-nodes"),
      mappingNodes: await integerAttribute(studio, "data-release-mapping-nodes"),
      readyCredentialBindings: await integerAttribute(
        studio,
        "data-release-ready-credentials"
      ),
    };
    if (
      capabilities.httpNodes < 1 ||
      capabilities.mappingNodes < 1 ||
      capabilities.readyCredentialBindings < 1
    ) {
      throw new Error("The connected release workflow is missing required product capabilities.");
    }

    stage = "preview";
    if (!config.expectedHeadSha) {
''',
)
replace_once(
    spec,
    '''      readiness,
      preview: {
''',
    '''      readiness,
      capabilities,
      preview: {
''',
)

connected_test = "apps/webapp/test/flowcordia/connectedAcceptanceContract.test.ts"
connected_file = Path(connected_test)
connected_content = connected_file.read_text().replace('schemaVersion: "0.1"', 'schemaVersion: "0.2"')
connected_file.write_text(connected_content)
replace_once(
    connected_test,
    '''      readiness: {
        state: "READY",
''',
    '''      readiness: {
        state: "READY",
''',
)
replace_once(
    connected_test,
    '''      preview: {
        state: "READY",
''',
    '''      capabilities: {
        httpNodes: 1,
        mappingNodes: 1,
        readyCredentialBindings: 1,
      },
      preview: {
        state: "READY",
''',
)
replace_once(
    connected_test,
    '''    expect(studio).toContain("data-run-proof");
''',
    '''    expect(studio).toContain("data-run-proof");
    expect(studio).toContain("data-release-http-nodes");
    expect(studio).toContain("data-release-mapping-nodes");
    expect(studio).toContain("data-release-ready-credentials");
''',
)
replace_once(
    connected_test,
    '''  it("uses stage-owned fixed failure messages instead of serializing thrown errors", () => {
''',
    '''  it("uses a fixed capability failure without serializing workflow data", () => {
    const failure = connectedAcceptanceFailure({
      mode: "preview",
      stage: "capability",
      workflowId: "reference_workflow",
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:01:00.000Z",
    });
    expect(failure.failure).toEqual({
      code: "CAPABILITY_FAILED",
      message: "The release workflow does not prove HTTP, mapping, and ready credential coverage.",
    });
  });

  it("uses stage-owned fixed failure messages instead of serializing thrown errors", () => {
''',
)

manifest = "apps/webapp/app/features/flowcordia/acceptance/release-manifest.server.ts"
replace_once(manifest, '  schemaVersion: "0.1";\n', '  schemaVersion: "0.2";\n')
replace_once(
    manifest,
    '''  preview: {
    deploymentVersion: string;
    runFriendlyId: string;
  };
''',
    '''  capabilities: {
    httpNodes: number;
    mappingNodes: number;
    readyCredentialBindings: number;
  };
  preview: {
    deploymentVersion: string;
    runFriendlyId: string;
  };
''',
)
replace_once(
    manifest,
    '''  applicationCommitSha: string;
}) {
  exact(input.evidence.schemaVersion, "0.1", `${input.label}.schemaVersion`);
''',
    '''  applicationCommitSha: string;
  schemaVersion?: "0.1" | "0.2";
}) {
  exact(
    input.evidence.schemaVersion,
    input.schemaVersion ?? "0.1",
    `${input.label}.schemaVersion`
  );
''',
)
replace_once(
    manifest,
    '''    "readiness",
    "preview",
  ]);
''',
    '''    "readiness",
    "capabilities",
    "preview",
  ]);
''',
)
replace_once(
    manifest,
    '''    workflowId,
    applicationCommitSha,
  });
  const repository = validateReadiness(previewEvidence.readiness, "preview.readiness");
''',
    '''    workflowId,
    applicationCommitSha,
    schemaVersion: "0.2",
  });
  const repository = validateReadiness(previewEvidence.readiness, "preview.readiness");
  const capabilityProof = exactObject(previewEvidence.capabilities, "preview.capabilities", [
    "httpNodes",
    "mappingNodes",
    "readyCredentialBindings",
  ]);
  const capabilities = {
    httpNodes: positiveInteger(capabilityProof.httpNodes, "preview.capabilities.httpNodes"),
    mappingNodes: positiveInteger(capabilityProof.mappingNodes, "preview.capabilities.mappingNodes"),
    readyCredentialBindings: positiveInteger(
      capabilityProof.readyCredentialBindings,
      "preview.capabilities.readyCredentialBindings"
    ),
  };
''',
)
replace_once(
    manifest,
    '''    schemaVersion: "0.1" as const,
    releaseId,
''',
    '''    schemaVersion: "0.2" as const,
    releaseId,
''',
)
replace_once(
    manifest,
    '''    proposal: {
      id: proposalId,
      headSha: proposalHeadSha,
      mergeCommitSha,
    },
    preview: {
''',
    '''    proposal: {
      id: proposalId,
      headSha: proposalHeadSha,
      mergeCommitSha,
    },
    capabilities,
    preview: {
''',
)

fixture = "apps/webapp/test/flowcordia/releaseEvidenceFixture.ts"
replace_once(
    fixture,
    '''    preview: {
      ...common,
      mode: "preview",
''',
    '''    preview: {
      ...common,
      schemaVersion: "0.2",
      mode: "preview",
''',
)
replace_once(
    fixture,
    '''      readiness,
      preview: {
''',
    '''      readiness,
      capabilities: {
        httpNodes: 1,
        mappingNodes: 1,
        readyCredentialBindings: 1,
      },
      preview: {
''',
)

manifest_test = "apps/webapp/test/flowcordia/releaseEvidenceManifest.test.ts"
replace_once(
    manifest_test,
    '''      result: "ACCEPTED",
      applicationCommitSha,
''',
    '''      schemaVersion: "0.2",
      result: "ACCEPTED",
      applicationCommitSha,
''',
)
replace_once(
    manifest_test,
    '''      proposal: {
        id: proposalId,
        headSha: proposalHeadSha,
        mergeCommitSha,
      },
      production: {
''',
    '''      proposal: {
        id: proposalId,
        headSha: proposalHeadSha,
        mergeCommitSha,
      },
      capabilities: {
        httpNodes: 1,
        mappingNodes: 1,
        readyCredentialBindings: 1,
      },
      production: {
''',
)
replace_once(
    manifest_test,
    '''  it("binds application, workflow, repository, proposal head, and merge identity", () => {
''',
    '''  it("requires positive HTTP, mapping, and credential capability proof", () => {
    for (const key of ["httpNodes", "mappingNodes", "readyCredentialBindings"] as const) {
      const incomplete = sources();
      const capabilities = incomplete[0]!.evidence.capabilities as Record<string, unknown>;
      capabilities[key] = 0;
      expect(() => assemble(incomplete)).toThrow(`preview.capabilities.${key}`);
    }
  });

  it("binds application, workflow, repository, proposal head, and merge identity", () => {
''',
)

registry = "flowcordia/testing/release-evidence-registry.md"
replace_once(
    registry,
    '''The registry assembles five protected acceptance artifacts into one exact-lineage release manifest.
''',
    '''The registry assembles five protected acceptance artifacts into one exact-lineage release manifest. The preview artifact must additionally prove the release workflow contains at least one approved HTTP node, one deterministic mapping node, and one ready credential binding before its exact-head run can authorize assembly.
''',
)

runbook = "flowcordia/runbooks/release-acceptance.md"
replace_once(
    runbook,
    '''## Acceptance sequence
''',
    '''## Release reference workflow

The exact preview proposal used for release assembly must contain at least one approved `action.http` node, one `data.map` node, and one credential reference whose selected protected environment status is `READY`. The connected browser records only positive counts; reference names, environment keys, header names, and values remain excluded from evidence.

## Acceptance sequence
''',
)
