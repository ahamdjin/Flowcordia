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

  organizationId        String
  projectId             String
  runtimeEnvironmentId  String
  waitpointId           String
  waitpointFriendlyId   String
  workflowId            String
  runFriendlyId         String
  nodeId                 String
  prompt                 String
  instruction            String
  reminderAt             DateTime?
  escalationAt           DateTime?
  timeoutAt              DateTime

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

print("approval notification delivery integration applied")
