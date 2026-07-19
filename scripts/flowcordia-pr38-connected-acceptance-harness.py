from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one {label}, found {count}")
    file.write_text(source.replace(old, new))


route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
replace_once(
    route,
    '<div className="flex h-full items-center justify-center p-8 text-center">',
    '<div data-testid="flowcordia-studio-route" data-connected="false" className="flex h-full items-center justify-center p-8 text-center">',
    "disconnected route contract",
)
replace_once(
    route,
    '<div className="flex h-full min-h-0 flex-col">',
    '<div data-testid="flowcordia-studio-route" data-connected="true" className="flex h-full min-h-0 flex-col">',
    "connected route contract",
)

readiness = "apps/webapp/app/features/flowcordia/workflows/readiness/RepositoryReadinessPanel.tsx"
replace_once(
    readiness,
    '''  const readiness = fetcher.data?.ok ? fetcher.data.readiness : undefined;
  const checking = fetcher.state !== "idle";
''',
    '''  const readiness = fetcher.data?.ok ? fetcher.data.readiness : undefined;
  const checking = fetcher.state !== "idle";
  const passedCount = readiness?.checks.filter((item) => item.state === "PASSED").length ?? 0;
  const blockedCount = readiness?.checks.filter((item) => item.state === "BLOCKED").length ?? 0;
  const unavailableCount =
    readiness?.checks.filter((item) => item.state === "UNAVAILABLE").length ?? 0;
''',
    "readiness counters",
)
replace_once(
    readiness,
    '<section className="border-b border-grid-bright bg-background-bright px-4 py-3">',
    '''<section
      data-testid="flowcordia-readiness"
      data-state={readiness?.state ?? "NOT_CHECKED"}
      data-passed={passedCount}
      data-blocked={blockedCount}
      data-unavailable={unavailableCount}
      data-repository-owner={readiness?.repository?.owner ?? ""}
      data-repository-name={readiness?.repository?.name ?? ""}
      data-repository-branch={readiness?.repository?.branch ?? ""}
      data-repository-commit={readiness?.repository?.commitSha ?? ""}
      className="border-b border-grid-bright bg-background-bright px-4 py-3"
    >''',
    "readiness root contract",
)
replace_once(
    readiness,
    '''        <Button
          variant="secondary/small"
''',
    '''        <Button
          data-testid="flowcordia-readiness-run"
          variant="secondary/small"
''',
    "readiness command contract",
)
replace_once(
    readiness,
    '''                <div
                  key={item.id}
                  className={cn(
''',
    '''                <div
                  key={item.id}
                  data-testid={`flowcordia-readiness-check-${item.id}`}
                  data-state={item.state}
                  className={cn(
''',
    "readiness check contract",
)
replace_once(
    readiness,
    '''              {readiness.checks.filter((item) => item.state === "PASSED").length} passed ·{" "}
              {readiness.checks.filter((item) => item.state === "BLOCKED").length} blocked ·{" "}
              {readiness.checks.filter((item) => item.state === "UNAVAILABLE").length} unavailable
''',
    '''              {passedCount} passed · {blockedCount} blocked · {unavailableCount} unavailable
''',
    "readiness summary counters",
)

studio = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx"
replace_once(
    studio,
    '''  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full max-h-full">
''',
    '''  return (
    <div
      data-testid="flowcordia-workflow-studio"
      data-workflow-id={selectedWorkflowId ?? ""}
      data-draft-present={draft ? "true" : "false"}
      data-draft-version={draft?.version ?? ""}
      data-preview-state={preview.state}
      data-proposal-head={preview.proposal?.headSha ?? ""}
      data-deployment-version={preview.deployment?.version ?? ""}
      data-run-id={preview.latestRun?.friendlyId ?? ""}
      data-run-status={preview.latestRun?.status ?? ""}
      data-run-proof={preview.latestRun?.proof ?? ""}
      className="h-full max-h-full"
    >
      <ResizablePanelGroup orientation="horizontal" className="h-full max-h-full">
''',
    "Studio acceptance root",
)
replace_once(
    studio,
    '''      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
''',
    '''        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
''',
    "Studio acceptance root closure",
)
replace_once(
    studio,
    '''            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs",
''',
    '''            <div
              data-testid="flowcordia-preview-status"
              data-state={preview.state}
              data-proposal-head={preview.proposal?.headSha ?? ""}
              data-run-status={preview.latestRun?.status ?? ""}
              data-run-proof={preview.latestRun?.proof ?? ""}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs",
''',
    "preview status contract",
)

function_panel = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowFunctionTestPanel.tsx"
replace_once(
    function_panel,
    '<section className="border-b border-grid-bright bg-background-dimmed px-4 py-3">',
    '<section data-testid="flowcordia-testing-panel" data-mode={mode} className="border-b border-grid-bright bg-background-dimmed px-4 py-3">',
    "testing root contract",
)
replace_once(
    function_panel,
    '            onClick={() => setMode("structural")}',
    '            data-testid="flowcordia-testing-mode-structural"\n            onClick={() => setMode("structural")}',
    "structural mode contract",
)
replace_once(
    function_panel,
    '            onClick={() => setMode("live")}',
    '            data-testid="flowcordia-testing-mode-live"\n            onClick={() => setMode("live")}',
    "live mode contract",
)
replace_once(
    function_panel,
    '                    onClick={() => setInputMode("json")}',
    '                    data-testid="flowcordia-testing-input-json"\n                    onClick={() => setInputMode("json")}',
    "JSON input contract",
)
replace_once(
    function_panel,
    '                aria-label="Function test payload JSON"',
    '                aria-label="Function test payload JSON"\n                data-testid="flowcordia-testing-payload"',
    "payload input contract",
)
replace_once(
    function_panel,
    '''            <Button
              variant={mode === "live" ? "primary/small" : "secondary/small"}
''',
    '''            <Button
              data-testid="flowcordia-testing-run"
              variant={mode === "live" ? "primary/small" : "secondary/small"}
''',
    "test command contract",
)
replace_once(
    function_panel,
    '''                <div className="mt-2 flex items-center gap-2">
                  {lastTest.success ? (
''',
    '''                <div
                  data-testid="flowcordia-structural-result"
                  data-status={lastTest.success ? "PASSED" : "FAILED"}
                  className="mt-2 flex items-center gap-2"
                >
                  {lastTest.success ? (
''',
    "structural result contract",
)

testing_panel = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioTestingPanel.tsx"
replace_once(
    testing_panel,
    '''        <div className="border-b border-blue-500/25 bg-blue-500/10 px-4 py-2 text-xs text-blue-200">
          Live preview run''',
    '''        <div
          data-testid="flowcordia-live-run-started"
          className="border-b border-blue-500/25 bg-blue-500/10 px-4 py-2 text-xs text-blue-200"
        >
          Live preview run''',
    "live run acknowledgement contract",
)

contract_test = "apps/webapp/test/flowcordia/connectedAcceptanceContract.test.ts"
replace_once(
    contract_test,
    'import { mkdtemp, readFile, rm } from "node:fs/promises";\n',
    'import { readFileSync } from "node:fs";\nimport { mkdtemp, readFile, rm } from "node:fs/promises";\n',
    "source test filesystem import",
)
replace_once(
    contract_test,
    'import { join } from "node:path";\n',
    'import { join } from "node:path";\nimport { fileURLToPath } from "node:url";\n',
    "source test URL import",
)
source_test = '''
  it("keeps connected acceptance on stable bounded browser and workflow contracts", () => {
    const source = (relativePath: string) =>
      readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    const route = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );
    const readiness = source(
      "../../app/features/flowcordia/workflows/readiness/RepositoryReadinessPanel.tsx"
    );
    const studio = source("../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx");
    const testing = source(
      "../../app/features/flowcordia/workflows/studio/WorkflowFunctionTestPanel.tsx"
    );
    const config = source("../../../../playwright.flowcordia-connected.config.ts");
    const workflow = source("../../../../.github/workflows/flowcordia-connected-acceptance.yml");

    expect(route).toContain('data-testid="flowcordia-studio-route"');
    expect(route).toContain('data-connected="true"');
    expect(route).toContain('data-connected="false"');
    expect(readiness).toContain('data-testid="flowcordia-readiness"');
    expect(readiness).toContain('data-repository-commit');
    expect(studio).toContain('data-testid="flowcordia-workflow-studio"');
    expect(studio).toContain('data-proposal-head');
    expect(studio).toContain('data-run-proof');
    expect(testing).toContain('data-testid="flowcordia-testing-payload"');
    expect(testing).toContain('data-testid="flowcordia-structural-result"');
    expect(config).toContain('trace: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('video: "off"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: flowcordia-acceptance");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("FLOWCORDIA_ACCEPTANCE_EVIDENCE_PATH");
    expect(workflow).not.toContain("path: ${{ env.FLOWCORDIA_ACCEPTANCE_OUTPUT_DIR }}");
  });
'''
replace_once(
    contract_test,
    '\n  it("uses stage-owned fixed failure messages instead of serializing thrown errors", () => {\n',
    source_test + '\n  it("uses stage-owned fixed failure messages instead of serializing thrown errors", () => {\n',
    "connected source ownership test",
)

connections = Path("flowcordia/connections/README.md")
connection_source = connections.read_text()
anchor = "| Repository-readiness command | Connected repository preview setting | Make disabled preview deployments an explicit rollout blocker | Read-only exact-binding check implemented |\n"
row = "| Protected connected-acceptance workflow | Authenticated Studio, readiness command, structural command, and exact-head preview run | Produce sanitized environment-backed evidence that local CI cannot prove | Manual readiness, existing-draft structural, and existing-READY-proposal live modes delivered; promotion, production, and rollback evidence remain mandatory |\n"
if row not in connection_source:
    if anchor not in connection_source:
        raise SystemExit("connected acceptance registry anchor changed")
    connection_source = connection_source.replace(anchor, anchor + row, 1)
if connection_source.count(row) != 1:
    raise SystemExit("connected acceptance registry row is missing or duplicated")
connections.write_text(connection_source)

roadmap = Path("flowcordia/product/roadmap.md")
roadmap_source = roadmap.read_text()
roadmap_anchor = "- Add a manual connected-repository readiness probe covering the exact GitHub App installation, minimum permissions, production head, workflow catalog/index, Trigger.dev generated-task discovery, and preview deployment setting. — delivered\n"
roadmap_row = "- Add a protected manual connected-acceptance harness for readiness, existing-draft structural preview, and existing-READY-proposal exact-head live proof with sanitized evidence only. — delivered; an authenticated environment run is still required to create the record\n"
if roadmap_row not in roadmap_source:
    if roadmap_anchor not in roadmap_source:
        raise SystemExit("connected acceptance roadmap anchor changed")
    roadmap_source = roadmap_source.replace(roadmap_anchor, roadmap_anchor + roadmap_row, 1)
roadmap.write_text(roadmap_source)

rollout = Path("flowcordia/runbooks/preview-deployment-rollout.md")
rollout_source = rollout.read_text()
rollout_section = '''## Connected acceptance automation

The manual **Flowcordia connected acceptance** workflow can collect bounded evidence for readiness, an existing current draft's structural preview, or an existing `READY` proposal's exact-head live run. It uses a protected environment, temporary browser storage state, no screenshots/traces/video, and uploads only schema `0.1` evidence.

The harness does not create or publish drafts, approve or promote proposals, execute production, or roll back production. Complete this runbook manually for those lifecycle stages and retain the separate evidence.

'''
if rollout_section not in rollout_source:
    rollout_source = rollout_source.replace("## Procedure\n", rollout_section + "## Procedure\n", 1)
rollout.write_text(rollout_source)

for path, required_values in {
    route: ['data-testid="flowcordia-studio-route"', 'data-connected="true"'],
    readiness: ['data-testid="flowcordia-readiness"', 'data-repository-commit'],
    studio: ['data-testid="flowcordia-workflow-studio"', 'data-run-proof'],
    function_panel: ['data-testid="flowcordia-testing-payload"', 'data-testid="flowcordia-structural-result"'],
    testing_panel: ['data-testid="flowcordia-live-run-started"'],
}.items():
    value = Path(path).read_text()
    for required_value in required_values:
        if required_value not in value:
            raise SystemExit(f"{path}: missing acceptance invariant {required_value}")
print("PR38 connected acceptance UI and documentation transform passed")
