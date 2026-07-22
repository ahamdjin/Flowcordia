import { randomBytes } from "node:crypto";
import { signFlowcordiaWebhook } from "@flowcordia/runtime";
import {
  FLOWCORDIA_WEBHOOK_DELIVERY_HEADER,
  FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER,
  FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER,
} from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { resolveFlowcordiaProjectContext } from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { EnvironmentVariablesRepository } from "~/v3/environmentVariables/environmentVariablesRepository.server";
import { parseFlowcordiaStoredWebhookSecret } from "../credentials/webhook-secret";
import { activateFlowcordiaProductionWebhook } from "./activation.server";
import { resolveFlowcordiaPublicWebhookIngressBinding } from "./ingress-binding.server";
import { flowcordiaPublicWebhookUrl } from "./ingress-contract.server";
import {
  runFlowcordiaWebhookIncidentDrill,
  type FlowcordiaWebhookIncidentDrillDeliveryObservation,
  type FlowcordiaWebhookIncidentDrillEndpoint,
  type FlowcordiaWebhookIncidentDrillInput,
  type FlowcordiaWebhookIncidentDrillProjection,
} from "./incident-drill";
import { replaceFlowcordiaProductionWebhook } from "./replacement.server";
import { revokeFlowcordiaProductionWebhook } from "./revocation.server";

const environmentVariables = new EnvironmentVariablesRepository();
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const INTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;

export interface RunConfiguredFlowcordiaWebhookIncidentDrillInput
  extends Omit<FlowcordiaWebhookIncidentDrillInput, "applicationCommitSha"> {
  organizationSlug: string;
  projectParam: string;
  actorId: string;
  origin: string;
}

function exactOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Webhook incident drill origin is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new TypeError("Webhook incident drill origin must be a credential-free HTTPS origin.");
  }
  return url.origin;
}

async function readExactSecret(input: {
  projectId: string;
  environmentId: string;
  credentialEnvironmentName: string;
  credentialVersion: string;
}): Promise<string> {
  const values = await environmentVariables.getVariableValuesForKeys(input.projectId, [
    {
      environmentId: input.environmentId,
      key: input.credentialEnvironmentName,
    },
  ]);
  const serialized = values.get(`${input.environmentId}:${input.credentialEnvironmentName}`);
  if (!serialized) throw new Error("webhook_secret_unavailable");

  const credential = await prisma.environmentVariable.findFirst({
    where: {
      projectId: input.projectId,
      key: input.credentialEnvironmentName,
    },
    select: {
      values: {
        where: {
          environmentId: input.environmentId,
          isSecret: true,
        },
        select: { version: true },
        take: 1,
      },
    },
  });
  if (String(credential?.values[0]?.version ?? "") !== input.credentialVersion) {
    throw new Error("webhook_secret_version_changed");
  }
  const parsed = parseFlowcordiaStoredWebhookSecret(serialized);
  if (!parsed.success) throw new Error("webhook_secret_invalid");
  return parsed.secret;
}

async function currentEndpoint(input: {
  publicId: string;
  organizationId: string;
  projectId: string;
  workflowId: string;
  nodeId: string;
}): Promise<{ generation: number }> {
  const endpoint = await prisma.flowcordiaWebhookEndpoint.findFirst({
    where: {
      publicId: input.publicId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      supersededAt: null,
    },
    select: { generation: true },
  });
  if (!endpoint) throw new Error("webhook_current_generation_unavailable");
  return endpoint;
}

async function sendRequest(input: {
  origin: string;
  endpoint: Pick<FlowcordiaWebhookIncidentDrillEndpoint, "publicId" | "method" | "path">;
  deliveryId: string;
  body: string;
  signature: "valid" | "invalid" | "none";
}): Promise<{ status: number }> {
  const headers = new Headers();
  const timestampSeconds = Math.floor(Date.now() / 1000);
  if (input.body.length > 0) headers.set("content-type", "application/json; charset=utf-8");
  if (input.signature !== "none") {
    headers.set(FLOWCORDIA_WEBHOOK_DELIVERY_HEADER, input.deliveryId);
    headers.set(FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER, String(timestampSeconds));
    if (input.signature === "invalid") {
      headers.set(FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER, `v1=${"0".repeat(64)}`);
    } else {
      const resolution = await resolveFlowcordiaPublicWebhookIngressBinding(input.endpoint.publicId);
      if (resolution.status !== "ready") throw new Error("webhook_binding_unavailable");
      const secret = await readExactSecret(resolution.binding);
      headers.set(
        FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER,
        signFlowcordiaWebhook({
          body: input.body,
          timestampSeconds,
          deliveryId: input.deliveryId,
          secret,
        })
      );
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetch(
      flowcordiaPublicWebhookUrl({
        origin: input.origin,
        publicId: input.endpoint.publicId,
        path: input.endpoint.path,
      }),
      {
        method: input.endpoint.method,
        headers,
        body: input.endpoint.method === "GET" ? undefined : input.body,
        redirect: "error",
        signal: controller.signal,
      }
    );
    return { status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function observeDelivery(input: {
  publicId: string;
  deliveryId: string;
}): Promise<FlowcordiaWebhookIncidentDrillDeliveryObservation> {
  const endpoint = await prisma.flowcordiaWebhookEndpoint.findUnique({
    where: { publicId: input.publicId },
    select: { id: true },
  });
  if (!endpoint) return { state: "missing", attempts: 0 };
  const delivery = await prisma.flowcordiaPublicWebhookDelivery.findFirst({
    where: {
      webhookEndpointId: endpoint.id,
      deliveryId: input.deliveryId,
    },
    select: { status: true, attempts: true },
  });
  if (!delivery) return { state: "missing", attempts: 0 };
  return {
    state:
      delivery.status === "TRIGGERED"
        ? "delivered"
        : delivery.status === "FAILED"
          ? "failed"
          : "processing",
    attempts: delivery.attempts,
  };
}

export async function runConfiguredFlowcordiaWebhookIncidentDrill(
  input: RunConfiguredFlowcordiaWebhookIncidentDrillInput
): Promise<FlowcordiaWebhookIncidentDrillProjection> {
  if (!SLUG.test(input.organizationSlug) || !SLUG.test(input.projectParam)) {
    throw new TypeError("Organization or project identifier is invalid.");
  }
  if (!INTERNAL_ID.test(input.actorId)) throw new TypeError("Actor ID is invalid.");
  const applicationCommitSha = process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA ?? "";
  const origin = exactOrigin(input.origin);
  const project = await resolveFlowcordiaProjectContext({
    organizationSlug: input.organizationSlug,
    projectParam: input.projectParam,
  });
  if (!project.projectFound) throw new Error("project_not_found");
  const actor = await prisma.user.findUnique({ where: { id: input.actorId }, select: { id: true } });
  if (!actor) throw new Error("actor_not_found");
  const scope = await resolveWorkflowIndexScope({
    organizationId: project.organizationId,
    projectId: project.projectId,
  });

  const activate = async (
    expectedPublicId?: string
  ): Promise<FlowcordiaWebhookIncidentDrillEndpoint> => {
    const activated = await activateFlowcordiaProductionWebhook({
      scope,
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      expectedProposalId: input.expectedProposalId,
      expectedMergeCommitSha: input.expectedMergeCommitSha,
    });
    if (expectedPublicId && activated.endpointPublicId !== expectedPublicId) {
      throw new Error("webhook_successor_identity_changed");
    }
    const endpoint = await currentEndpoint({
      publicId: activated.endpointPublicId,
      organizationId: project.organizationId,
      projectId: project.projectId,
      workflowId: input.workflowId,
      nodeId: input.nodeId,
    });
    return {
      publicId: activated.endpointPublicId,
      generation: endpoint.generation,
      method: activated.method,
      path: activated.path,
      revision: activated.revision,
      workerVersion: activated.workerVersion,
      mergeCommitSha: activated.mergeCommitSha,
    };
  };

  return runFlowcordiaWebhookIncidentDrill(
    {
      applicationCommitSha,
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      expectedProposalId: input.expectedProposalId,
      expectedMergeCommitSha: input.expectedMergeCommitSha,
      confirmation: input.confirmation,
      deliveryTimeoutMilliseconds: input.deliveryTimeoutMilliseconds,
    },
    {
      now: () => new Date(),
      randomToken: () => randomBytes(12).toString("base64url"),
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      activate,
      send: (request) => sendRequest({ ...request, origin }),
      observe: observeDelivery,
      revoke: async (publicId) => {
        const result = await revokeFlowcordiaProductionWebhook({
          tenantId: project.organizationId,
          projectId: project.projectId,
          workflowId: input.workflowId,
          nodeId: input.nodeId,
          expectedPublicId: publicId,
          actorId: input.actorId,
          reason: "manual_emergency_stop",
        });
        return { changed: result.changed };
      },
      replace: async (publicId) => {
        const result = await replaceFlowcordiaProductionWebhook({
          tenantId: project.organizationId,
          projectId: project.projectId,
          workflowId: input.workflowId,
          nodeId: input.nodeId,
          expectedRevokedPublicId: publicId,
          actorId: input.actorId,
        });
        return {
          publicId: result.endpointPublicId,
          generation: result.generation,
          replacesPublicId: result.replacesPublicId,
        };
      },
    }
  );
}
