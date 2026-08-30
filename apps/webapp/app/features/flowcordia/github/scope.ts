import { isValidProposalId } from "@flowcordia/github-proposals";
import { isValidWorkflowId } from "@flowcordia/github-workflows";

interface FlowcordiaRepositoryScope {
  tenantId: string;
  projectId: string;
  installationId: number;
  repository: {
    owner: string;
    name: string;
    branch: string;
  };
}

function sameRepositoryIdentity(
  expected: FlowcordiaRepositoryScope,
  actual: FlowcordiaRepositoryScope
): boolean {
  return (
    expected.tenantId === actual.tenantId &&
    expected.projectId === actual.projectId &&
    expected.installationId === actual.installationId &&
    expected.repository.owner === actual.repository.owner &&
    expected.repository.name === actual.repository.name
  );
}

export function sameFlowcordiaRepositoryScope(
  expected: FlowcordiaRepositoryScope,
  actual: FlowcordiaRepositoryScope
): boolean {
  return (
    sameRepositoryIdentity(expected, actual) &&
    expected.repository.branch === actual.repository.branch
  );
}

export function sameFlowcordiaProposalRepositoryScope(
  expected: FlowcordiaRepositoryScope,
  actual: FlowcordiaRepositoryScope
): boolean {
  if (!sameRepositoryIdentity(expected, actual)) return false;
  if (expected.repository.branch === actual.repository.branch) return true;

  const prefix = "flowcordia/proposals/";
  if (!actual.repository.branch.startsWith(prefix)) return false;
  const segments = actual.repository.branch.slice(prefix.length).split("/");
  return (
    segments.length === 2 &&
    isValidWorkflowId(segments[0] ?? "") &&
    isValidProposalId(segments[1] ?? "")
  );
}
