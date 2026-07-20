from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one {label}, found {count}")
    file.write_text(source.replace(old, new, 1))


panel = "apps/webapp/app/features/flowcordia/workflows/production/WorkflowProductionProofPanel.tsx"
replace_once(
    panel,
    'import { FLOWCORDIA_PRODUCTION_CONFIRMATION } from "./commands.server";\n',
    'import {\n  buildFlowcordiaProductionRunCommand,\n  FLOWCORDIA_PRODUCTION_CONFIRMATION,\n} from "./command-contract";\n',
    "portable production command import",
)
replace_once(
    panel,
    '''    fetcher.submit(
      {
        operation: "run_production",
        confirmation: FLOWCORDIA_PRODUCTION_CONFIRMATION,
        workflowId,
        expectedProposalId: production.proposal.proposalId,
        expectedMergeCommitSha: production.proposal.mergeCommitSha,
        requestId: crypto.randomUUID(),
        payload: parsedPayload.value,
      },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
''',
    '''    fetcher.submit(
      buildFlowcordiaProductionRunCommand({
        workflowId,
        expectedProposalId: production.proposal.proposalId,
        expectedMergeCommitSha: production.proposal.mergeCommitSha,
        requestId: crypto.randomUUID(),
        payload: parsedPayload.value,
      }),
      { method: "POST", action: commandPath, encType: "application/json" }
    );
''',
    "production command builder",
)

query = "apps/webapp/app/features/flowcordia/workflows/studio/query.server.ts"
replace_once(
    query,
    '''import { queryFlowcordiaPreview } from "../preview/query.server";
import {
''',
    '''import { queryFlowcordiaPreview } from "../preview/query.server";
import {
  type FlowcordiaProductionProjection,
  unavailableFlowcordiaProduction,
} from "../production/presentation";
import { queryFlowcordiaProduction } from "../production/query.server";
import {
''',
    "production query imports",
)
replace_once(
    query,
    '''  let preview: FlowcordiaPreviewProjection = unavailableFlowcordiaPreview();
  let validation: FlowcordiaFunctionValidationProjection =
''',
    '''  let preview: FlowcordiaPreviewProjection = unavailableFlowcordiaPreview();
  let production: FlowcordiaProductionProjection = unavailableFlowcordiaProduction();
  let validation: FlowcordiaFunctionValidationProjection =
''',
    "production projection state",
)
replace_once(
    query,
    '''    const [previewResult, validationResult] = await Promise.allSettled([
      queryFlowcordiaPreview({ scope, workflowId: selected.workflowId }),
      queryFlowcordiaFunctionValidation({ scope, workflowId: selected.workflowId }),
    ]);
''',
    '''    const [previewResult, productionResult, validationResult] = await Promise.allSettled([
      queryFlowcordiaPreview({ scope, workflowId: selected.workflowId }),
      queryFlowcordiaProduction({ scope, workflowId: selected.workflowId }),
      queryFlowcordiaFunctionValidation({ scope, workflowId: selected.workflowId }),
    ]);
''',
    "production query execution",
)
replace_once(
    query,
    '''    preview =
      previewResult.status === "fulfilled" ? previewResult.value : unavailableFlowcordiaPreview();
    validation =
''',
    '''    preview =
      previewResult.status === "fulfilled" ? previewResult.value : unavailableFlowcordiaPreview();
    production =
      productionResult.status === "fulfilled"
        ? productionResult.value
        : unavailableFlowcordiaProduction();
    validation =
''',
    "production query result",
)
replace_once(
    query,
    '''    preview,
    validation,
''',
    '''    preview,
    production,
    validation,
''',
    "production loader return",
)

route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
replace_once(
    route,
    '''import { RepositoryReadinessPanel } from "~/features/flowcordia/workflows/readiness/RepositoryReadinessPanel";
import { WorkflowStudio } from "~/features/flowcordia/workflows/studio/WorkflowStudio";
''',
    '''import { WorkflowProductionProofPanel } from "~/features/flowcordia/workflows/production/WorkflowProductionProofPanel";
import { RepositoryReadinessPanel } from "~/features/flowcordia/workflows/readiness/RepositoryReadinessPanel";
import { WorkflowStudio } from "~/features/flowcordia/workflows/studio/WorkflowStudio";
''',
    "production panel import",
)
replace_once(
    route,
    '''      const canTriggerValidation = workspace.selectedWorkflowId
        ? ability.can("trigger", {
            type: "tasks",
            id: `flowcordia-validate-${workspace.selectedWorkflowId}`,
          })
        : false;
      return json({
        ...workspace,
        canWrite,
        canTriggerPreview,
        canTriggerValidation,
''',
    '''      const canTriggerValidation = workspace.selectedWorkflowId
        ? ability.can("trigger", {
            type: "tasks",
            id: `flowcordia-validate-${workspace.selectedWorkflowId}`,
          })
        : false;
      const canTriggerProduction = workspace.selectedWorkflowId
        ? ability.can("trigger", {
            type: "tasks",
            id: `flowcordia-${workspace.selectedWorkflowId}`,
          })
        : false;
      return json({
        ...workspace,
        canWrite,
        canTriggerPreview,
        canTriggerValidation,
        canTriggerProduction,
''',
    "production trigger permission",
)
replace_once(
    route,
    '''          preview: null,
          validation: null,
''',
    '''          preview: null,
          production: null,
          validation: null,
''',
    "production fallback projection",
)
replace_once(
    route,
    '''          canTriggerPreview: false,
          canTriggerValidation: false,
''',
    '''          canTriggerPreview: false,
          canTriggerValidation: false,
          canTriggerProduction: false,
''',
    "production fallback permission",
)
replace_once(
    route,
    '''  const previewCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-preview`;
  const validationCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/function-validation`;
''',
    '''  const previewCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-preview`;
  const productionCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-production`;
  const validationCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/function-validation`;
''',
    "production command route",
)
replace_once(
    route,
    '''            <div className="min-h-0 flex-1">
              <WorkflowStudio
''',
    '''            {data.graph && data.selectedWorkflowId && data.production && (
              <WorkflowProductionProofPanel
                workflowId={data.selectedWorkflowId}
                production={data.production}
                commandPath={productionCommandPath}
                canTrigger={data.canTriggerProduction}
              />
            )}
            <div className="min-h-0 flex-1">
              <WorkflowStudio
''',
    "production panel composition",
)

connections = Path("flowcordia/connections/README.md")
connections_source = connections.read_text()
anchor = "| Studio testing panel | Exact-head live-run command | Start one version-locked preview run from the same schema-driven payload surface | Single browser owner implemented; ready deployment, exact proposal head, and task-trigger permission are required |\n"
row = "| Studio production proof panel | Exact promoted production deployment and TriggerTaskService | Start one explicitly confirmed run locked to the latest deployed production worker and project bounded exact-run evidence | Delivered for the latest merged proposal only; stale proposal, superseded deployment, wrong worker lock, mismatched metadata, and untrusted node evidence fail closed |\n"
if row not in connections_source:
    if anchor not in connections_source:
        raise SystemExit("production connection anchor changed")
    connections_source = connections_source.replace(anchor, anchor + row, 1)
connections.write_text(connections_source)

roadmap = Path("flowcordia/product/roadmap.md")
roadmap_source = roadmap.read_text()
roadmap_anchor = "- Add a protected governed-promotion acceptance harness requiring exact reference-repository identity, explicit destructive confirmation, `SATISFIED` policy evidence, and the existing server-owned promotion command. — delivered; a protected environment run is still required, and production/rollback proof remains separate\n"
roadmap_row = "- Add exact production execution proof for the latest merged proposal, authoritative production deployment, worker-version lock, explicit confirmation, non-sensitive payload, and trusted node evidence. — delivered; connected protected-environment execution remains required, while governed rollback is the next isolated boundary\n"
if roadmap_row not in roadmap_source:
    if roadmap_anchor not in roadmap_source:
        raise SystemExit("production roadmap anchor changed")
    roadmap_source = roadmap_source.replace(roadmap_anchor, roadmap_anchor + roadmap_row, 1)
roadmap.write_text(roadmap_source)

readme = Path("apps/webapp/app/features/flowcordia/workflows/studio/README.md")
readme_source = readme.read_text()
production_section = '''\n## Production execution proof\n\n`WorkflowProductionProofPanel` is a separate destructive surface after structural and preview testing. It resolves the latest merged proposal, requires the latest deployed production worker to use that exact merge commit, rechecks task-trigger RBAC server-side, rejects inline secret-like payloads, requires `RUN_FLOWCORDIA_PRODUCTION_PROOF`, locks the run to the deployment version, and projects only bounded identity/status/node evidence. Inputs are never written to session storage, workflow state, proposal state, or audit payloads.\n'''
if production_section not in readme_source:
    readme_source += production_section
readme.write_text(readme_source)

for path, required in {
    panel: ["./command-contract", "buildFlowcordiaProductionRunCommand", 'data-testid="flowcordia-production-proof"'],
    query: ["queryFlowcordiaProduction", "productionResult", "production,"],
    route: ["WorkflowProductionProofPanel", "productionCommandPath", "canTriggerProduction"],
}.items():
    source = Path(path).read_text()
    for value in required:
        if value not in source:
            raise SystemExit(f"{path}: missing production invariant {value}")
print("PR40 production proof integration transform passed")
