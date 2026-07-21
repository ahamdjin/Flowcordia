import { flowcordiaCredentialEnvironmentName } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import type { WorkflowStudioGraph } from "../studio/presentation";
import type {
  FlowcordiaCredentialBindingProjection,
  FlowcordiaCredentialWorkspaceProjection,
} from "./contract";

function workflowCredentialReferences(graph: WorkflowStudioGraph): string[] {
  return Array.from(
    new Set(
      graph.nodes
        .filter((node) => node.operation === "action.http")
        .flatMap((node) => node.credentialReferences)
    )
  ).sort();
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
        reference,
        environmentName: flowcordiaCredentialEnvironmentName(reference),
        state: "UNAVAILABLE",
        version: null,
      })),
    };
  }

  const environmentNames = references.map(flowcordiaCredentialEnvironmentName);
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
    const environmentName = flowcordiaCredentialEnvironmentName(reference);
    const value = values.get(environmentName);
    return {
      reference,
      environmentName,
      state: value ? (value.isSecret ? "READY" : "NOT_SECRET") : "MISSING",
      version: value?.version ?? null,
    };
  });

  return {
    environment: { slug: environment.slug, type: environment.type },
    bindings,
  };
}
