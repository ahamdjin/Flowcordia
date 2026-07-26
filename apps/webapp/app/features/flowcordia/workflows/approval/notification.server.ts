import { randomUUID } from "node:crypto";
import { prisma } from "~/db.server";
import { env } from "~/env.server";
import { isIntegrationForService } from "~/models/orgIntegration.server";
import {
  ProjectAlertEmailProperties,
  ProjectAlertSlackProperties,
  ProjectAlertWebhookProperties,
} from "~/models/projectAlert.server";
import { sendAlertPlainTextEmail } from "~/services/email.server";
import { logger } from "~/services/logger.server";
import {
  AlertDeliveryNoRetryError,
  deliverAlertWebhook,
  postAlertSlackMessage,
} from "~/v3/services/alerts/alertDeliveryAdapters.server";
import {
  FLOWCORDIA_APPROVAL_TAG,
  parseFlowcordiaApprovalRunMetadata,
} from "./contract";
import {
  FLOWCORDIA_APPROVAL_NOTIFICATION_BATCH_LIMIT,
  FLOWCORDIA_APPROVAL_NOTIFICATION_LEASE_MS,
  FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS,
  FLOWCORDIA_APPROVAL_NOTIFICATION_SCAN_LIMIT,
  flowcordiaApprovalNotificationFailureState,
  flowcordiaApprovalNotificationStageDue,
  flowcordiaApprovalNotificationSubject,
  flowcordiaApprovalNotificationText,
  isFlowcordiaApprovalNotificationChannelEligible,
  type FlowcordiaApprovalNotificationMessageInput,
  type FlowcordiaApprovalNotificationStage,
} from "./notification";

function validHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function dueAt(
  stage: FlowcordiaApprovalNotificationStage,
  identity: { reminderAt: string | null; escalationAt: string | null }
): Date {
  const value = stage === "REMINDER" ? identity.reminderAt : identity.escalationAt;
  if (value === null) throw new Error(`Missing ${stage.toLowerCase()} timestamp`);
  return new Date(value);
}

async function loadDelivery(id: string) {
  return prisma.flowcordiaApprovalNotificationDelivery.findUnique({ where: { id } });
}

type Delivery = NonNullable<Awaited<ReturnType<typeof loadDelivery>>>;

function messageInput(input: {
  delivery: Delivery;
  projectName: string;
  environmentSlug: string;
  dashboardUrl: string;
}): FlowcordiaApprovalNotificationMessageInput {
  return {
    deliveryId: input.delivery.id,
    stage: input.delivery.stage,
    prompt: input.delivery.prompt,
    instruction: input.delivery.instruction,
    workflowId: input.delivery.workflowId,
    runId: input.delivery.runFriendlyId,
    nodeId: input.delivery.nodeId,
    projectName: input.projectName,
    environmentSlug: input.environmentSlug,
    timeoutAt: input.delivery.timeoutAt.toISOString(),
    dashboardUrl: input.dashboardUrl,
  };
}

export class ReconcileFlowcordiaApprovalNotificationsService {
  async call(now = new Date()): Promise<number> {
    const waitpoints = await prisma.waitpoint.findMany({
      where: {
        type: "MANUAL",
        status: "PENDING",
        tags: { has: FLOWCORDIA_APPROVAL_TAG },
        connectedRuns: { some: { taskIdentifier: { startsWith: "flowcordia-" } } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: FLOWCORDIA_APPROVAL_NOTIFICATION_SCAN_LIMIT,
      select: {
        id: true,
        friendlyId: true,
        projectId: true,
        environmentId: true,
        completedAfter: true,
        connectedRuns: {
          where: { taskIdentifier: { startsWith: "flowcordia-" } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { friendlyId: true, metadata: true },
        },
      },
    });

    const environmentCache = new Map<
      string,
      Awaited<ReturnType<typeof prisma.runtimeEnvironment.findUnique>>
    >();
    const channelCache = new Map<
      string,
      Awaited<ReturnType<typeof prisma.projectAlertChannel.findMany>>
    >();
    let created = 0;

    for (const waitpoint of waitpoints) {
      const run = waitpoint.connectedRuns[0];
      if (!run) continue;
      const identity = parseFlowcordiaApprovalRunMetadata({
        metadata: run.metadata,
        waitpointId: waitpoint.friendlyId,
        runId: run.friendlyId,
      });
      if (!identity) continue;
      const stage = flowcordiaApprovalNotificationStageDue(identity, now);
      if (stage === null) continue;
      if (waitpoint.completedAfter !== null && waitpoint.completedAfter.getTime() <= now.getTime()) {
        continue;
      }

      let environment = environmentCache.get(waitpoint.environmentId);
      if (environment === undefined) {
        environment = await prisma.runtimeEnvironment.findUnique({
          where: { id: waitpoint.environmentId },
          select: { id: true, organizationId: true, type: true, slug: true, archivedAt: true },
        });
        environmentCache.set(waitpoint.environmentId, environment);
      }
      if (!environment || environment.archivedAt !== null) continue;

      const channelKey = `${waitpoint.projectId}:${environment.type}`;
      let channels = channelCache.get(channelKey);
      if (channels === undefined) {
        channels = await prisma.projectAlertChannel.findMany({
          where: {
            projectId: waitpoint.projectId,
            enabled: true,
            environmentTypes: { has: environment.type },
            alertTypes: { hasEvery: ["TASK_RUN", "DEPLOYMENT_FAILURE"] },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            type: true,
            enabled: true,
            environmentTypes: true,
            alertTypes: true,
          },
        });
        channelCache.set(channelKey, channels);
      }
      const eligibleChannels = channels.filter((channel) =>
        isFlowcordiaApprovalNotificationChannelEligible(channel, environment.type)
      );
      if (eligibleChannels.length === 0) continue;

      const result = await prisma.flowcordiaApprovalNotificationDelivery.createMany({
        data: eligibleChannels.map((channel) => ({
          organizationId: environment.organizationId,
          projectId: waitpoint.projectId,
          runtimeEnvironmentId: environment.id,
          waitpointId: waitpoint.id,
          waitpointFriendlyId: identity.waitpointId,
          workflowId: identity.workflowId,
          runFriendlyId: identity.runId,
          nodeId: identity.nodeId,
          prompt: identity.prompt,
          instruction: identity.instruction,
          reminderAt: identity.reminderAt === null ? null : new Date(identity.reminderAt),
          escalationAt: identity.escalationAt === null ? null : new Date(identity.escalationAt),
          timeoutAt: new Date(identity.timeoutAt),
          stage,
          channelId: channel.id,
          channelType: channel.type,
          availableAt: dueAt(stage, identity),
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }

    return created;
  }
}

export class DeliverFlowcordiaApprovalNotificationService {
  async call(deliveryId: string, now = new Date()): Promise<void> {
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + FLOWCORDIA_APPROVAL_NOTIFICATION_LEASE_MS);
    const claimed = await prisma.flowcordiaApprovalNotificationDelivery.updateMany({
      where: {
        id: deliveryId,
        attempts: { lt: FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS },
        OR: [
          { status: "PENDING", availableAt: { lte: now } },
          { status: "DELIVERING", leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: "DELIVERING",
        leaseToken,
        leaseExpiresAt,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return;

    const delivery = await loadDelivery(deliveryId);
    if (!delivery || delivery.leaseToken !== leaseToken) return;

    const [waitpoint, channel, runtimeEnvironment] = await Promise.all([
      prisma.waitpoint.findUnique({
        where: { id: delivery.waitpointId },
        select: { status: true, completedAfter: true },
      }),
      prisma.projectAlertChannel.findFirst({
        where: { id: delivery.channelId, projectId: delivery.projectId },
        include: {
          project: { include: { organization: true } },
          integration: { include: { tokenReference: true } },
        },
      }),
      prisma.runtimeEnvironment.findUnique({
        where: { id: delivery.runtimeEnvironmentId },
        select: { id: true, slug: true, type: true, archivedAt: true },
      }),
    ]);

    if (
      !waitpoint ||
      waitpoint.status !== "PENDING" ||
      (waitpoint.completedAfter !== null && waitpoint.completedAfter.getTime() <= now.getTime()) ||
      delivery.timeoutAt.getTime() <= now.getTime()
    ) {
      await this.#terminal(delivery, leaseToken, "CANCELLED", "WAITPOINT_CLOSED", now);
      return;
    }
    if (
      !channel ||
      !runtimeEnvironment ||
      runtimeEnvironment.archivedAt !== null ||
      channel.type !== delivery.channelType ||
      !isFlowcordiaApprovalNotificationChannelEligible(channel, runtimeEnvironment.type)
    ) {
      await this.#terminal(delivery, leaseToken, "CANCELLED", "CHANNEL_INELIGIBLE", now);
      return;
    }

    const dashboardUrl = `${env.APP_ORIGIN}/projects/v3/${channel.project.externalRef}`;
    const input = messageInput({
      delivery,
      projectName: channel.project.name,
      environmentSlug: runtimeEnvironment.slug,
      dashboardUrl,
    });

    try {
      await this.#dispatch({ delivery, channel, input });
      await prisma.flowcordiaApprovalNotificationDelivery.updateMany({
        where: { id: delivery.id, leaseToken },
        data: {
          status: "SENT",
          sentAt: now,
          terminalAt: now,
          failureCode: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
    } catch (error) {
      const retryable = !(error instanceof AlertDeliveryNoRetryError);
      const failure = flowcordiaApprovalNotificationFailureState({
        attempt: delivery.attempts,
        retryable,
        now,
      });
      logger.warn("[FlowcordiaApprovalNotification] Delivery attempt failed", {
        deliveryId: delivery.id,
        stage: delivery.stage,
        channelType: delivery.channelType,
        attempt: delivery.attempts,
        retryable,
      });
      await prisma.flowcordiaApprovalNotificationDelivery.updateMany({
        where: { id: delivery.id, leaseToken },
        data: {
          status: failure.status,
          availableAt: failure.availableAt,
          terminalAt: failure.status === "FAILED" ? now : null,
          failureCode: failure.failureCode,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
    }
  }

  async #dispatch(input: {
    delivery: Delivery;
    channel: NonNullable<
      Awaited<ReturnType<typeof prisma.projectAlertChannel.findFirst>>
    > & {
      project: {
        id: string;
        externalRef: string;
        slug: string;
        name: string;
        organizationId: string;
        organization: { id: string; slug: string; title: string };
      };
      integration: ({ tokenReference: unknown } & Record<string, unknown>) | null;
    };
    input: FlowcordiaApprovalNotificationMessageInput;
  }): Promise<void> {
    const subject = flowcordiaApprovalNotificationSubject(
      input.delivery.stage,
      input.delivery.prompt
    );
    const text = flowcordiaApprovalNotificationText(input.input);

    switch (input.channel.type) {
      case "EMAIL": {
        const properties = ProjectAlertEmailProperties.safeParse(input.channel.properties);
        if (!properties.success) {
          throw new AlertDeliveryNoRetryError("Approval email channel is invalid");
        }
        await sendAlertPlainTextEmail({ to: properties.data.email, subject, text });
        return;
      }
      case "WEBHOOK": {
        const properties = ProjectAlertWebhookProperties.safeParse(input.channel.properties);
        if (!properties.success || !validHttpsUrl(properties.data.url)) {
          throw new AlertDeliveryNoRetryError("Approval webhook channel is invalid");
        }
        await deliverAlertWebhook(
          {
            id: input.delivery.id,
            created: input.delivery.createdAt,
            webhookVersion: "v1",
            type:
              input.delivery.stage === "ESCALATION"
                ? "flowcordia.approval.escalated"
                : "flowcordia.approval.reminder",
            object: {
              approval: {
                waitpointId: input.delivery.waitpointFriendlyId,
                workflowId: input.delivery.workflowId,
                runId: input.delivery.runFriendlyId,
                nodeId: input.delivery.nodeId,
                stage: input.delivery.stage,
                prompt: input.delivery.prompt,
                instruction: input.delivery.instruction,
                reminderAt: input.delivery.reminderAt,
                escalationAt: input.delivery.escalationAt,
                timeoutAt: input.delivery.timeoutAt,
                dashboardUrl: input.input.dashboardUrl,
              },
              environment: {
                id: input.delivery.runtimeEnvironmentId,
                slug: input.input.environmentSlug,
              },
              project: {
                id: input.channel.project.id,
                ref: input.channel.project.externalRef,
                slug: input.channel.project.slug,
                name: input.channel.project.name,
              },
              organization: {
                id: input.channel.project.organization.id,
                slug: input.channel.project.organization.slug,
                name: input.channel.project.organization.title,
              },
            },
          },
          properties.data
        );
        return;
      }
      case "SLACK": {
        const properties = ProjectAlertSlackProperties.safeParse(input.channel.properties);
        if (!properties.success || !properties.data.channelId.trim()) {
          throw new AlertDeliveryNoRetryError("Approval Slack channel is invalid");
        }
        const configuredIntegration = input.channel.integration;
        const integration =
          configuredIntegration && isIntegrationForService(configuredIntegration, "SLACK")
            ? configuredIntegration
            : await prisma.organizationIntegration.findFirst({
                where: {
                  organizationId: input.delivery.organizationId,
                  service: "SLACK",
                  deletedAt: null,
                },
                orderBy: { createdAt: "desc" },
                include: { tokenReference: true },
              });
        if (!integration || !isIntegrationForService(integration, "SLACK")) {
          throw new AlertDeliveryNoRetryError("Approval Slack integration is unavailable");
        }
        await postAlertSlackMessage(integration, {
          channel: properties.data.channelId,
          text,
          client_msg_id: input.delivery.id,
        });
        return;
      }
    }
  }

  async #terminal(
    delivery: Delivery,
    leaseToken: string,
    status: "FAILED" | "CANCELLED",
    failureCode: "CHANNEL_INELIGIBLE" | "WAITPOINT_CLOSED",
    now: Date
  ): Promise<void> {
    await prisma.flowcordiaApprovalNotificationDelivery.updateMany({
      where: { id: delivery.id, leaseToken },
      data: {
        status,
        failureCode,
        terminalAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
}

export class ProcessFlowcordiaApprovalNotificationsService {
  async call(now = new Date()): Promise<{ created: number; processed: number }> {
    const created = await new ReconcileFlowcordiaApprovalNotificationsService().call(now);
    const candidates = await prisma.flowcordiaApprovalNotificationDelivery.findMany({
      where: {
        attempts: { lt: FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS },
        OR: [
          { status: "PENDING", availableAt: { lte: now } },
          { status: "DELIVERING", leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: FLOWCORDIA_APPROVAL_NOTIFICATION_BATCH_LIMIT,
      select: { id: true },
    });
    const service = new DeliverFlowcordiaApprovalNotificationService();
    for (const candidate of candidates) {
      await service.call(candidate.id, now);
    }
    return { created, processed: candidates.length };
  }
}
