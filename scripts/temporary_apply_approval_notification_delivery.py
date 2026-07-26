from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1))


schema_path = "internal-packages/database/prisma/schema.prisma"
replace_once(
    schema_path,
    '''enum FlowcordiaPublicWebhookDeliveryStatus {
''',
    '''enum FlowcordiaApprovalNotificationStage {
  REMINDER
  ESCALATION
}

enum FlowcordiaApprovalNotificationStatus {
  PENDING
  DELIVERING
  SENT
  FAILED
  CANCELLED
}

/// Durable, payload-free ownership ledger for human approval reminder and escalation delivery.
/// One row owns one waitpoint/stage/channel combination and carries only bounded public approval identity.
model FlowcordiaApprovalNotificationDelivery {
  id String @id @default(cuid())

  organizationId       String
  projectId            String
  runtimeEnvironmentId String
  waitpointId          String
  waitpointFriendlyId  String
  workflowId           String
  runFriendlyId        String
  nodeId                String
  prompt                String
  instruction           String
  reminderAt            DateTime?
  escalationAt          DateTime?
  timeoutAt             DateTime

  stage       FlowcordiaApprovalNotificationStage
  channelId   String
  channelType ProjectAlertChannelType

  status      FlowcordiaApprovalNotificationStatus @default(PENDING)
  availableAt DateTime
  attempts    Int @default(0)

  leaseToken     String?
  leaseExpiresAt DateTime?
  failureCode    String?
  sentAt         DateTime?
  terminalAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([waitpointId, stage, channelId], map: "FlowcordiaApprovalNotificationDelivery_scope_key")
  @@index([status, availableAt], map: "FlowcordiaApprovalNotificationDelivery_due_idx")
  @@index([status, leaseExpiresAt], map: "FlowcordiaApprovalNotificationDelivery_lease_idx")
  @@index([projectId, createdAt(sort: Desc)], map: "FlowcordiaApprovalNotificationDelivery_project_created_idx")
  @@index([waitpointId, createdAt(sort: Desc)], map: "FlowcordiaApprovalNotificationDelivery_waitpoint_idx")
}

enum FlowcordiaPublicWebhookDeliveryStatus {
''',
)

worker_path = "apps/webapp/app/v3/alertsWorker.server.ts"
replace_once(
    worker_path,
    '''import { PerformTaskRunAlertsService } from "./services/alerts/performTaskRunAlerts.server";
''',
    '''import { PerformTaskRunAlertsService } from "./services/alerts/performTaskRunAlerts.server";
import { ProcessFlowcordiaApprovalNotificationsService } from "~/features/flowcordia/workflows/approval/notification.server";
''',
)
replace_once(
    worker_path,
    '''      "v3.evaluateErrorAlerts": {
''',
    '''      "v3.flowcordiaApprovalNotifications": {
        schema: CronSchema,
        cron: "* * * * *",
        jitterInMs: 30_000,
        visibilityTimeoutMs: 60_000 * 5,
        retry: {
          maxAttempts: 3,
        },
        logErrors: true,
      },
      "v3.evaluateErrorAlerts": {
''',
)
replace_once(
    worker_path,
    '''      "v3.performDeploymentAlerts": async ({ payload }) => {
''',
    '''      "v3.flowcordiaApprovalNotifications": async ({ payload }) => {
        const service = new ProcessFlowcordiaApprovalNotificationsService();
        await service.call(new Date(payload.timestamp));
      },
      "v3.performDeploymentAlerts": async ({ payload }) => {
''',
)

notification_path = "apps/webapp/app/features/flowcordia/workflows/approval/notification.server.ts"
replace_once(
    notification_path,
    '''type Delivery = NonNullable<Awaited<ReturnType<typeof loadDelivery>>>;

function messageInput(input: {
''',
    '''type Delivery = NonNullable<Awaited<ReturnType<typeof loadDelivery>>>;

async function loadReconciliationEnvironment(id: string) {
  return prisma.runtimeEnvironment.findUnique({
    where: { id },
    select: { id: true, organizationId: true, type: true, slug: true, archivedAt: true },
  });
}

type ReconciliationEnvironment = Awaited<ReturnType<typeof loadReconciliationEnvironment>>;

async function loadReconciliationChannels(projectId: string, environmentType: string) {
  return prisma.projectAlertChannel.findMany({
    where: {
      projectId,
      enabled: true,
      environmentTypes: { has: environmentType as never },
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
}

type ReconciliationChannels = Awaited<ReturnType<typeof loadReconciliationChannels>>;

async function loadDeliveryContextChannel(delivery: Delivery) {
  return prisma.projectAlertChannel.findFirst({
    where: { id: delivery.channelId, projectId: delivery.projectId },
    include: {
      project: { include: { organization: true } },
      integration: { include: { tokenReference: true } },
    },
  });
}

type DeliveryContextChannel = NonNullable<Awaited<ReturnType<typeof loadDeliveryContextChannel>>>;

function messageInput(input: {
''',
)
replace_once(
    notification_path,
    '''    const environmentCache = new Map<
      string,
      Awaited<ReturnType<typeof prisma.runtimeEnvironment.findUnique>>
    >();
    const channelCache = new Map<
      string,
      Awaited<ReturnType<typeof prisma.projectAlertChannel.findMany>>
    >();
''',
    '''    const environmentCache = new Map<string, ReconciliationEnvironment>();
    const channelCache = new Map<string, ReconciliationChannels>();
''',
)
replace_once(
    notification_path,
    '''        environment = await prisma.runtimeEnvironment.findUnique({
          where: { id: waitpoint.environmentId },
          select: { id: true, organizationId: true, type: true, slug: true, archivedAt: true },
        });
''',
    '''        environment = await loadReconciliationEnvironment(waitpoint.environmentId);
''',
)
replace_once(
    notification_path,
    '''        channels = await prisma.projectAlertChannel.findMany({
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
''',
    '''        channels = await loadReconciliationChannels(waitpoint.projectId, environment.type);
''',
)
replace_once(
    notification_path,
    '''      prisma.projectAlertChannel.findFirst({
        where: { id: delivery.channelId, projectId: delivery.projectId },
        include: {
          project: { include: { organization: true } },
          integration: { include: { tokenReference: true } },
        },
      }),
''',
    '''      loadDeliveryContextChannel(delivery),
''',
)
replace_once(
    notification_path,
    '''    channel: NonNullable<
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
''',
    '''    channel: DeliveryContextChannel;
''',
)
replace_once(
    notification_path,
    '''        await postAlertSlackMessage(integration, {
          channel: properties.data.channelId,
          text,
          client_msg_id: input.delivery.id,
        });
''',
    '''        await postAlertSlackMessage(integration, {
          channel: properties.data.channelId,
          text,
        });
''',
)

print("approval notification delivery integration applied")
