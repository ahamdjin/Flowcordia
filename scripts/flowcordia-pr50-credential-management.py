from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
replace_once(
    route,
    '''import {
  FlowcordiaProposalConfigurationError,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
''',
    '''import {
  FlowcordiaProposalConfigurationError,
  requireFlowcordiaProjectContext,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
''',
)
replace_once(
    route,
    'import { WorkflowProductionProofPanel } from "~/features/flowcordia/workflows/production/WorkflowProductionProofPanel";\n',
    '''import {
  queryFlowcordiaCredentialWorkspace,
  resolveFlowcordiaCredentialEnvironment,
} from "~/features/flowcordia/workflows/credentials/query.server";
import { WorkflowProductionProofPanel } from "~/features/flowcordia/workflows/production/WorkflowProductionProofPanel";
''',
)
replace_once(
    route,
    '''      const workspace = await queryWorkflowStudio({
        context,
        selectedWorkflowId: searchParams.workflow,
      });
      const canTriggerPreview = workspace.selectedWorkflowId
''',
    '''      const workspace = await queryWorkflowStudio({
        context,
        selectedWorkflowId: searchParams.workflow,
      });
      const { projectId } = requireFlowcordiaProjectContext(context);
      const credentialEnvironment = await resolveFlowcordiaCredentialEnvironment({
        projectId,
        environmentSlug: params.envParam,
      });
      const canReadCredentials = credentialEnvironment
        ? ability.can("read", {
            type: "envvars",
            envType: credentialEnvironment.type,
          })
        : false;
      const canManageCredentials = credentialEnvironment
        ? ability.can("write", {
            type: "envvars",
            envType: credentialEnvironment.type,
          })
        : false;
      const credentialWorkspace = await queryFlowcordiaCredentialWorkspace({
        projectId,
        environmentSlug: params.envParam,
        graph: workspace.graph,
        canRead: canReadCredentials,
      });
      const canTriggerPreview = workspace.selectedWorkflowId
''',
)
replace_once(
    route,
    '''        ...workspace,
        canWrite,
        canTriggerPreview,
''',
    '''        ...workspace,
        credentialWorkspace,
        canManageCredentials,
        canWrite,
        canTriggerPreview,
''',
)
replace_once(
    route,
    '''          functionCatalog: null,
          loadError: null,
          stale: false,
          canWrite,
''',
    '''          functionCatalog: null,
          credentialWorkspace: { environment: null, bindings: [] },
          canManageCredentials: false,
          loadError: null,
          stale: false,
          canWrite,
''',
)
replace_once(
    route,
    '''  const operationsCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/operations-health`;
''',
    '''  const operationsCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/operations-health`;
  const credentialCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/env/${environment.slug}/flowcordia/workflow-credentials`;
''',
)
replace_once(
    route,
    '''                  draftCommandPath={draftCommandPath}
                  canWrite={data.canWrite}
''',
    '''                  draftCommandPath={draftCommandPath}
                  credentialWorkspace={data.credentialWorkspace}
                  credentialCommandPath={credentialCommandPath}
                  canManageCredentials={data.canManageCredentials}
                  canWrite={data.canWrite}
''',
)

studio = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx"
replace_once(
    studio,
    'import { canBootstrapFlowcordiaRepository } from "../bootstrap/eligibility";\n',
    'import { canBootstrapFlowcordiaRepository } from "../bootstrap/eligibility";\nimport { WorkflowStudioCredentialManager } from "../credentials/WorkflowStudioCredentialManager";\nimport type { FlowcordiaCredentialWorkspaceProjection } from "../credentials/contract";\n',
)
replace_once(
    studio,
    '''  busy,
  onCommand,
}: {
  graph: WorkflowStudioGraph;
  node: WorkflowStudioNode | null;
  editable: boolean;
  busy: boolean;
  onCommand: (command: WorkflowEditCommand) => void;
}) {
''',
    '''  busy,
  workflowId,
  credentialWorkspace,
  credentialCommandPath,
  canManageCredentials,
  onCommand,
}: {
  graph: WorkflowStudioGraph;
  node: WorkflowStudioNode | null;
  editable: boolean;
  busy: boolean;
  workflowId: string | null;
  credentialWorkspace: FlowcordiaCredentialWorkspaceProjection;
  credentialCommandPath: string;
  canManageCredentials: boolean;
  onCommand: (command: WorkflowEditCommand) => void;
}) {
''',
)
replace_once(
    studio,
    '''      )}

      <div className="mt-5 space-y-4">
''',
    '''      )}

      {workflowId && node.operation === "action.http" && node.ownership === "visual" && (
        <div className="mt-4">
          <WorkflowStudioCredentialManager
            workflowId={workflowId}
            node={node}
            bindings={credentialWorkspace.bindings}
            commandPath={credentialCommandPath}
            canManage={canManageCredentials}
          />
        </div>
      )}

      <div className="mt-5 space-y-4">
''',
)
replace_once(
    studio,
    '''  draftCommandPath,
  canWrite,
}: {
''',
    '''  draftCommandPath,
  credentialWorkspace,
  credentialCommandPath,
  canManageCredentials,
  canWrite,
}: {
''',
)
replace_once(
    studio,
    '''  draftCommandPath: string;
  canWrite: boolean;
}) {
''',
    '''  draftCommandPath: string;
  credentialWorkspace: FlowcordiaCredentialWorkspaceProjection;
  credentialCommandPath: string;
  canManageCredentials: boolean;
  canWrite: boolean;
}) {
''',
)
replace_once(
    studio,
    '''                      editable={editable}
                      busy={draftBusy}
                      onCommand={submitEdit}
''',
    '''                      editable={editable}
                      busy={draftBusy}
                      workflowId={selectedWorkflowId}
                      credentialWorkspace={credentialWorkspace}
                      credentialCommandPath={credentialCommandPath}
                      canManageCredentials={canManageCredentials}
                      onCommand={submitEdit}
''',
)

manager = "apps/webapp/app/features/flowcordia/workflows/credentials/WorkflowStudioCredentialManager.tsx"
replace_once(
    manager,
    '''    case "MISSING":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
  }
''',
    '''    case "MISSING":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
    case "UNAVAILABLE":
      return "border-grid-bright bg-background-dimmed text-text-dimmed";
  }
''',
)
replace_once(
    manager,
    '''    case "MISSING":
      return "Missing";
  }
''',
    '''    case "MISSING":
      return "Missing";
    case "UNAVAILABLE":
      return "Status unavailable";
  }
''',
)

capability = "flowcordia/product/capability-matrix.md"
replace_once(
    capability,
    '| Environment variables and secrets | Credential references and environment bindings | Inherited storage |\n',
    '| Environment variables and secrets | Credential references and environment bindings | Existing encrypted project-environment storage, status-only Studio projection, separate env-tier read/write authorization, and write-only HTTP credential rotation delivered; external vault providers remain planned |\n',
)

roadmap = "flowcordia/product/roadmap.md"
replace_once(
    roadmap,
    '- Add custom typed functions as visual nodes. — delivered for exact-commit manifests, removable reviewed workflow references, compile-time export contracts, runtime schema enforcement, and a generated reference-repository fixture\n',
    '- Add custom typed functions as visual nodes. — delivered for exact-commit manifests, removable reviewed workflow references, compile-time export contracts, runtime schema enforcement, and a generated reference-repository fixture\n- Add project-environment credential readiness and write-only rotation. — delivered for reviewed HTTP references using inherited encrypted environment storage, status-only reads, separate env-tier read/write authorization, and bounded header contracts\n',
)

test = "apps/webapp/test/flowcordia/workflowCredentialManagement.test.ts"
replace_once(
    test,
    '''    expect(query).toContain("select: { isSecret: true, version: true }");
''',
    '''    expect(query).toContain("select: { isSecret: true, version: true }");
    expect(query).toContain("if (!input.canRead)");
    expect(query).toContain('state: "UNAVAILABLE"');
''',
)
replace_once(
    test,
    '''  it("never hydrates stored values into the Studio manager", () => {
''',
    '''  it("integrates status and write paths through server-owned route identity", () => {
    const route = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );
    expect(route).toContain("queryFlowcordiaCredentialWorkspace");
    expect(route).toContain("resolveFlowcordiaCredentialEnvironment");
    expect(route).toContain("canReadCredentials");
    expect(route).toContain("canManageCredentials");
    expect(route).toContain("credentialCommandPath");

    const resource = source(
      "../../app/routes/resources.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflow-credentials/route.ts"
    );
    expect(resource).toContain('ability.can("write", { type: "envvars"');

    const studio = source(
      "../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx"
    );
    expect(studio).toContain("WorkflowStudioCredentialManager");
    expect(studio).toContain("credentialWorkspace.bindings");
    expect(studio).toContain("canManageCredentials");
  });

  it("never hydrates stored values into the Studio manager", () => {
''',
)
