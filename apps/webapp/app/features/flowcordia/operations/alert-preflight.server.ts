import Redis from "ioredis";
import type { PrismaClientOrTransaction } from "~/db.server";
import {
  isIntegrationForService,
  type OrganizationIntegrationForService,
} from "~/models/orgIntegration.server";
import {
  ProjectAlertEmailProperties,
  ProjectAlertSlackProperties,
  ProjectAlertWebhookProperties,
  type ProjectAlertWebhookProperties as ProjectAlertWebhookPropertiesValue,
} from "~/models/projectAlert.server";
import { sendAlertPlainTextEmail } from "~/services/email.server";
import { alertsWorkerRedisOptions } from "~/v3/alertsWorkerOptions.server";
import {
  deliverAlertWebhook,
  postAlertSlackMessage,
} from "~/v3/services/alerts/alertDeliveryAdapters.server";
import {
  presentFlowcordiaAlertChannelChecks,
  presentFlowcordiaAlertConfiguration,
  type FlowcordiaAlertChannelObservation,
  type FlowcordiaAlertCheck,
  type FlowcordiaAlertConfigurationInput,
  type FlowcordiaAlertPreflightProjection,
} from "./alert-preflight";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FlowcordiaAlertCanaryTarget =
  | { type: "EMAIL"; email: string }
  | { type: "WEBHOOK"; webhook: ProjectAlertWebhookPropertiesValue }
  | {
      type: "SLACK";
      channelId: string;
      integration: OrganizationIntegrationForService<"SLACK">;
    };

export interface FlowcordiaAlertChannelProbe {
  observation: FlowcordiaAlertChannelObservation;
  target?: FlowcordiaAlertCanaryTarget;
}

export interface FlowcordiaAlertPreflightDependencies {
  verifyWorkerRedis(): Promise<void>;
  observeChannel(): Promise<FlowcordiaAlertChannelProbe>;
  deliverCanary(target: FlowcordiaAlertCanaryTarget): Promise<void>;
}

export interface FlowcordiaAlertPreflightInput extends FlowcordiaAlertConfigurationInput {
  dependencies: FlowcordiaAlertPreflightDependencies;
}

function check(
  key: FlowcordiaAlertCheck["key"],
  state: FlowcordiaAlertCheck["state"],
  message: string
): FlowcordiaAlertCheck {
  return { key, state, message };
}

function projection(input: {
  configuration: ReturnType<typeof presentFlowcordiaAlertConfiguration>;
  state: FlowcordiaAlertPreflightProjection["state"];
  phase: FlowcordiaAlertPreflightProjection["phase"];
  channelType?: FlowcordiaAlertPreflightProjection["channelType"];
  pendingCount?: number | null;
  oldestPendingAgeMs?: number | null;
  checks: FlowcordiaAlertCheck[];
  message: string;
}): FlowcordiaAlertPreflightProjection {
  return {
    schemaVersion: "0.1",
    state: input.state,
    phase: input.phase,
    releaseId: input.configuration.releaseId,
    checkedAt: input.configuration.checkedAt,
    applicationCommitSha: input.configuration.applicationCommitSha,
    channelType: input.channelType ?? "unresolved",
    backlog: {
      pendingCount: input.pendingCount ?? null,
      oldestPendingAgeMs: input.oldestPendingAgeMs ?? null,
    },
    checks: input.checks,
    message: input.message,
  };
}

export async function runFlowcordiaAlertPreflight(
  input: FlowcordiaAlertPreflightInput
): Promise<FlowcordiaAlertPreflightProjection> {
  const configuration = presentFlowcordiaAlertConfiguration(input);
  if (configuration.state !== "READY") {
    return projection({
      configuration,
      state: "BLOCKED",
      phase: "configuration",
      checks: [
        ...configuration.checks,
        check(
          "worker_redis",
          "BLOCKED",
          "Alerts-worker Redis was not contacted because configuration is blocked."
        ),
        check(
          "canary_delivery",
          "BLOCKED",
          "No alert delivery adapter was contacted because configuration is blocked."
        ),
      ],
      message: configuration.message,
    });
  }

  try {
    await input.dependencies.verifyWorkerRedis();
  } catch {
    return projection({
      configuration,
      state: "UNAVAILABLE",
      phase: "worker",
      checks: [
        ...configuration.checks,
        check(
          "worker_redis",
          "UNAVAILABLE",
          "The configured alerts-worker Redis endpoint could not be verified safely."
        ),
        check(
          "canary_delivery",
          "BLOCKED",
          "No alert delivery adapter was contacted because alerts-worker Redis verification failed."
        ),
      ],
      message: "Alert readiness is unavailable at the alerts-worker Redis phase.",
    });
  }

  let channel: FlowcordiaAlertChannelProbe;
  try {
    channel = await input.dependencies.observeChannel();
  } catch {
    return projection({
      configuration,
      state: "UNAVAILABLE",
      phase: "channel",
      checks: [
        ...configuration.checks,
        check("worker_redis", "READY", "The alerts-worker Redis endpoint accepted a bounded ping."),
        check(
          "channel_selection",
          "UNAVAILABLE",
          "The selected alert channel could not be observed safely."
        ),
        check(
          "canary_delivery",
          "BLOCKED",
          "No alert delivery adapter was contacted because channel observation failed."
        ),
      ],
      message: "Alert readiness is unavailable at the channel observation phase.",
    });
  }

  const channelChecks = presentFlowcordiaAlertChannelChecks({
    observation: channel.observation,
    maxPendingAlerts: configuration.maxPendingAlerts,
    maxOldestPendingAgeMs: configuration.maxOldestPendingAgeMs,
  });
  const channelReady =
    channelChecks.every((entry) => entry.state === "READY") && channel.target !== undefined;
  if (!channelReady) {
    return projection({
      configuration,
      state: "BLOCKED",
      phase: "channel",
      channelType: channel.observation.type ?? "unresolved",
      pendingCount: channel.observation.pendingCount,
      oldestPendingAgeMs: channel.observation.oldestPendingAgeMs,
      checks: [
        ...configuration.checks,
        check("worker_redis", "READY", "The alerts-worker Redis endpoint accepted a bounded ping."),
        ...channelChecks,
        check(
          "canary_delivery",
          "BLOCKED",
          "No alert delivery adapter was contacted because channel readiness is blocked."
        ),
      ],
      message: "Alert readiness is blocked by the selected production channel or its backlog.",
    });
  }

  try {
    await input.dependencies.deliverCanary(channel.target!);
  } catch {
    return projection({
      configuration,
      state: "UNAVAILABLE",
      phase: "delivery",
      channelType: channel.observation.type ?? "unresolved",
      pendingCount: channel.observation.pendingCount,
      oldestPendingAgeMs: channel.observation.oldestPendingAgeMs,
      checks: [
        ...configuration.checks,
        check("worker_redis", "READY", "The alerts-worker Redis endpoint accepted a bounded ping."),
        ...channelChecks,
        check(
          "canary_delivery",
          "UNAVAILABLE",
          "The selected alert delivery adapter did not accept the fixed canary."
        ),
      ],
      message: "Alert readiness is unavailable at the delivery-adapter phase.",
    });
  }

  return projection({
    configuration,
    state: "READY",
    phase: "complete",
    channelType: channel.observation.type ?? "unresolved",
    pendingCount: channel.observation.pendingCount,
    oldestPendingAgeMs: channel.observation.oldestPendingAgeMs,
    checks: [
      ...configuration.checks,
      check("worker_redis", "READY", "The alerts-worker Redis endpoint accepted a bounded ping."),
      ...channelChecks,
      check(
        "canary_delivery",
        "READY",
        "The selected existing alert delivery adapter accepted one fixed canary."
      ),
    ],
    message:
      "Alert readiness passed for the exact production channel. Worker consumption, inbox placement, and downstream incident response remain separate evidence.",
  });
}

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

export async function observeFlowcordiaAlertChannel(input: {
  database: PrismaClientOrTransaction;
  projectRef: string;
  channelRef: string;
  checkedAt: Date;
}): Promise<FlowcordiaAlertChannelProbe> {
  const channel = await input.database.projectAlertChannel.findFirst({
    where: {
      friendlyId: input.channelRef,
      project: { externalRef: input.projectRef },
    },
    include: {
      project: { select: { id: true, organizationId: true } },
    },
  });
  if (!channel) {
    return {
      observation: {
        found: false,
        enabled: false,
        productionCovered: false,
        failureCoverage: false,
        propertiesReady: false,
        integrationReady: false,
        pendingCount: 0,
        oldestPendingAgeMs: null,
      },
    };
  }

  const [pendingCount, oldestPending] = await Promise.all([
    input.database.projectAlert.count({
      where: { channelId: channel.id, projectId: channel.project.id, status: "PENDING" },
    }),
    input.database.projectAlert.findFirst({
      where: { channelId: channel.id, projectId: channel.project.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  const oldestPendingAgeMs = oldestPending
    ? Math.max(0, input.checkedAt.getTime() - oldestPending.createdAt.getTime())
    : null;

  const baseObservation = {
    found: true,
    enabled: channel.enabled,
    type: channel.type,
    productionCovered: channel.environmentTypes.includes("PRODUCTION"),
    failureCoverage:
      channel.alertTypes.includes("TASK_RUN") && channel.alertTypes.includes("DEPLOYMENT_FAILURE"),
    pendingCount,
    oldestPendingAgeMs,
  };

  switch (channel.type) {
    case "EMAIL": {
      const properties = ProjectAlertEmailProperties.safeParse(channel.properties);
      const propertiesReady =
        properties.success &&
        EMAIL.test(properties.data.email) &&
        properties.data.email.length <= 254;
      return {
        observation: {
          ...baseObservation,
          propertiesReady,
          integrationReady: propertiesReady,
        },
        target: propertiesReady ? { type: "EMAIL", email: properties.data.email } : undefined,
      };
    }
    case "WEBHOOK": {
      const properties = ProjectAlertWebhookProperties.safeParse(channel.properties);
      const propertiesReady =
        properties.success &&
        properties.data.version === "v2" &&
        validHttpsUrl(properties.data.url);
      return {
        observation: {
          ...baseObservation,
          propertiesReady,
          integrationReady: propertiesReady,
        },
        target: propertiesReady ? { type: "WEBHOOK", webhook: properties.data } : undefined,
      };
    }
    case "SLACK": {
      const parsedProperties = ProjectAlertSlackProperties.safeParse(channel.properties);
      const properties = parsedProperties.success ? parsedProperties.data : null;
      const integration = properties
        ? properties.integrationId
          ? await input.database.organizationIntegration.findFirst({
              where: {
                id: properties.integrationId,
                organizationId: channel.project.organizationId,
                deletedAt: null,
              },
              include: { tokenReference: true },
            })
          : await input.database.organizationIntegration.findFirst({
              where: {
                service: "SLACK",
                organizationId: channel.project.organizationId,
                deletedAt: null,
              },
              orderBy: { createdAt: "desc" },
              include: { tokenReference: true },
            })
        : null;
      const integrationReady = Boolean(
        integration && isIntegrationForService(integration, "SLACK")
      );
      const propertiesReady = Boolean(
        properties?.channelId.trim() && properties.channelName.trim()
      );
      return {
        observation: {
          ...baseObservation,
          propertiesReady,
          integrationReady,
        },
        target:
          propertiesReady &&
          properties &&
          integration &&
          isIntegrationForService(integration, "SLACK")
            ? {
                type: "SLACK",
                channelId: properties.channelId,
                integration,
              }
            : undefined,
      };
    }
  }
}

export async function verifyFlowcordiaAlertsWorkerRedis(
  environment: Record<string, string | number | boolean | undefined>
): Promise<void> {
  const client = new Redis({
    ...alertsWorkerRedisOptions(environment),
    lazyConnect: true,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    const response = await client.ping();
    if (response !== "PONG") throw new Error("Unexpected Redis ping response");
  } finally {
    await client.quit().catch(() => client.disconnect());
  }
}

export async function deliverFlowcordiaAlertCanary(input: {
  target: FlowcordiaAlertCanaryTarget;
  releaseId: string;
  applicationCommitSha: string;
  checkedAt: string;
}): Promise<void> {
  switch (input.target.type) {
    case "EMAIL":
      await sendAlertPlainTextEmail({
        to: input.target.email,
        subject: "Flowcordia alert readiness canary",
        text: `Flowcordia alert readiness canary accepted for release ${input.releaseId} at application ${input.applicationCommitSha}.`,
      });
      return;
    case "SLACK":
      await postAlertSlackMessage(input.target.integration, {
        channel: input.target.channelId,
        text: `Flowcordia alert readiness canary for release ${input.releaseId}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:white_check_mark: *Flowcordia alert readiness canary*\nRelease: \`${input.releaseId}\`\nApplication: \`${input.applicationCommitSha}\``,
            },
          },
        ],
      });
      return;
    case "WEBHOOK":
      await deliverAlertWebhook(
        {
          schemaVersion: "0.1",
          type: "flowcordia.alert.readiness",
          result: "CANARY",
          releaseId: input.releaseId,
          applicationCommitSha: input.applicationCommitSha,
          checkedAt: input.checkedAt,
        },
        input.target.webhook
      );
      return;
  }
}
