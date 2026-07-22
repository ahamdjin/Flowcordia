import { prisma } from "~/db.server";
import type { WorkflowStudioGraph } from "../studio/presentation";
import { flowcordiaCredentialTypeForNode } from "./binding";
import {
  credentialEnvironmentName,
  type FlowcordiaCredentialBindingProjection,
  type FlowcordiaCredentialType,
  type FlowcordiaCredentialWorkspaceProjection,
} from "./contract";

interface WorkflowCredentialReference {
  reference: string;
  credentialType: FlowcordiaCredentialType | "conflict";
}

function workflowCredentialReferences(graph: WorkflowStudioGraph): WorkflowCredentialReference[] {
  const typesByReference = new Map<string, Set<FlowcordiaCredentialType>>();
  for (const node of graph.nodes) {
    const credentialType = flowcordiaCredentialTypeForNode(node);
    if (!credentialType) continue;
    for (const reference of node.credentialReferences) {
      const types = typesByReference.get(reference) ?? new Set<FlowcordiaCredentialType>();
      types.add(credentialType);
      typesByReference.set(reference, types);
    }
  }
  return Array.from(typesByReference, ([reference, types]) => ({
    reference,
    credentialType: types.size === 1 ? Array.from(types)[0]! : ("conflict" as const),
  })).sort((left, right) => left.reference.localeCompare(right.reference));
}

function projectedEnvironmentName(reference: WorkflowCredentialReference): string {
  return reference.credentialType === "conflict"
    ? ""
    : credentialEnvironmentName(reference.reference, reference.credentialType);
}

export async function resolveFlowcordiaCredentialEnvironment(input: {
  projectId: string;
  environmentSlug: string;
}) {
  return prisma.runtimeEnvironment.findFirst({
    where: {
      projectId: input.projectId,
      slug: input.environmentSlug,
    },
    select: {
      id: true,
      slug: true,
      type: true,
    },
  });
}

export async function queryFlowcordiaCredentialWorkspace(input: {
  projectId: string;
  environmentSlug: string;
  graph: WorkflowStudioGraph | null;
  canRead: boolean;
}): Promise<FlowcordiaCredentialWorkspaceProjection> {
  const environment = await resolveFlowcordiaCredentialEnvironment(input);
  if (!environment) {
    return { environment: null, bindings: [] };
  }

  const references = input.graph ? workflowCredentialReferences(input.graph) : [];
  if (references.length === 0) {
    return {
      environment: { slug: environment.slug, type: environment.type },
      bindings: [],
    };
  }
  if (!input.canRead) {
    return {
      environment: { slug: environment.slug, type: environment.type },
      bindings: references.map((reference) => ({
        reference: reference.reference,
        credentialType: reference.credentialType,
        environmentName: projectedEnvironmentName(reference),
        state: reference.credentialType === "conflict" ? "TYPE_CONFLICT" : "UNAVAILABLE",
        version: null,
      })),
    };
  }

  const environmentNames = references
    .map(projectedEnvironmentName)
    .filter((environmentName) => environmentName.length > 0);
  const variables = await prisma.environmentVariable.findMany({
    where: {
      projectId: input.projectId,
      key: { in: environmentNames },
    },
    select: {
      key: true,
      values: {
        where: { environmentId: environment.id },
        select: { isSecret: true, version: true },
        take: 1,
      },
    },
  });
  const values = new Map(
    variables.map((variable) => [variable.key, variable.values[0] ?? null] as const)
  );
  const bindings: FlowcordiaCredentialBindingProjection[] = references.map((reference) => {
    const environmentName = projectedEnvironmentName(reference);
    const value = environmentName ? values.get(environmentName) : null;
    return {
      reference: reference.reference,
      credentialType: reference.credentialType,
      environmentName,
      state:
        reference.credentialType === "conflict"
          ? "TYPE_CONFLICT"
          : value
            ? value.isSecret
              ? "READY"
              : "NOT_SECRET"
            : "MISSING",
      version: value?.version ?? null,
    };
  });

  return {
    environment: { slug: environment.slug, type: environment.type },
    bindings,
  };
}
