import { isFlowcordiaActivepiecesPieceNode, type WorkflowDefinition } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { activepiecesConnectionEnvironmentName } from "./activepieces-connections.server";
import { StudioV2ReleaseError } from "./release-contract";
import { studioV2CredentialRequirements } from "./release-credentials";
import type { StudioV2WorkspaceScope } from "./workspace-contract";

export async function assertStudioV2CredentialsReady(input: {
  scope: StudioV2WorkspaceScope;
  workflow: WorkflowDefinition;
}): Promise<void> {
  const required = studioV2CredentialRequirements(input.workflow);
  if (!required.success) {
    throw new StudioV2ReleaseError(
      "credential_unavailable",
      `Credential reference "${required.reference}" cannot be shared by incompatible node types.`
    );
  }
  const activepiecesRequirements = input.workflow.nodes.flatMap((node) =>
    isFlowcordiaActivepiecesPieceNode(node)
      ? (node.credentialReferences ?? []).map((reference) => ({
          reference,
          environmentName: activepiecesConnectionEnvironmentName(reference),
        }))
      : []
  );
  const requirements = [...required.requirements, ...activepiecesRequirements];
  if (requirements.length === 0) return;

  const variables = await prisma.environmentVariable.findMany({
    where: {
      projectId: input.scope.projectId,
      key: { in: requirements.map(({ environmentName }) => environmentName) },
    },
    select: {
      key: true,
      values: {
        where: { environmentId: input.scope.environmentId },
        select: { isSecret: true },
        take: 1,
      },
    },
  });
  const available = new Map(
    variables.map((variable) => [variable.key, variable.values[0]?.isSecret === true] as const)
  );
  const unavailable = requirements.find(
    ({ environmentName }) => available.get(environmentName) !== true
  );
  if (unavailable) {
    throw new StudioV2ReleaseError(
      "credential_unavailable",
      `Credential reference "${unavailable.reference}" must be stored as a secret in this environment before testing or staging.`
    );
  }
}
