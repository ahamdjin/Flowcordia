import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../app/db.server";
import { DeliverFlowcordiaApprovalNotificationService } from "../app/features/flowcordia/workflows/approval/notification.server";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is malformed.`);
  }
  return value as Record<string, unknown>;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label} is malformed.`);
  }
  return value;
}

async function main() {
  const bootstrapPath = resolve(argument("--bootstrap"));
  const modePath = resolve(argument("--mode-file"));
  const deliveriesPath = resolve(argument("--deliveries-file"));
  const output = resolve(argument("--output"));
  const bootstrap = object(JSON.parse(await readFile(bootstrapPath, "utf8")), "Bootstrap");
  const organizationId = identity(bootstrap.organizationId, "Organization identity");
  const projectId = identity(bootstrap.projectId, "Project identity");
  const environmentId = identity(bootstrap.environmentId, "Environment identity");
  const campaign = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date();
  const timeoutAt = new Date(now.getTime() + 30 * 60_000);

  const channel = await prisma.projectAlertChannel.create({
    data: {
      friendlyId: `alert_beta_failure_${campaign}`,
      deduplicationKey: `beta-failure-${campaign}`,
      userProvidedDeduplicationKey: true,
      enabled: true,
      type: "EMAIL",
      name: "Flowcordia Beta failure SMTP",
      properties: { email: "flowcordia-beta-failure@localhost.invalid" },
      alertTypes: ["TASK_RUN", "DEPLOYMENT_FAILURE"],
      environmentTypes: ["PRODUCTION"],
      projectId,
    },
  });

  async function waitpoint(suffix: string) {
    return prisma.waitpoint.create({
      data: {
        friendlyId: `waitpoint_beta_failure_${suffix}_${campaign}`,
        type: "MANUAL",
        status: "PENDING",
        idempotencyKey: `beta-failure-${suffix}-${campaign}`,
        userProvidedIdempotencyKey: false,
        completedAfter: timeoutAt,
        projectId,
        environmentId,
        tags: ["flowcordia-approval"],
      },
    });
  }

  const providerWaitpoint = await waitpoint("provider");
  const providerDelivery = await prisma.flowcordiaApprovalNotificationDelivery.create({
    data: {
      organizationId,
      projectId,
      runtimeEnvironmentId: environmentId,
      waitpointId: providerWaitpoint.id,
      waitpointFriendlyId: providerWaitpoint.friendlyId,
      workflowId: "beta-failure-workflow",
      runFriendlyId: `run_beta_provider_${campaign}`,
      nodeId: "approval-provider-outage",
      prompt: "Approve the Beta failure provider recovery?",
      instruction: "Controlled acceptance fixture.",
      reminderAt: now,
      escalationAt: null,
      timeoutAt,
      stage: "REMINDER",
      channelId: channel.id,
      channelType: "EMAIL",
      status: "PENDING",
      availableAt: now,
    },
  });

  await writeFile(modePath, "reject\n", { mode: 0o600 });
  const service = new DeliverFlowcordiaApprovalNotificationService();
  await service.call(providerDelivery.id, now);
  const afterOutage = await prisma.flowcordiaApprovalNotificationDelivery.findUniqueOrThrow({
    where: { id: providerDelivery.id },
  });
  if (
    afterOutage.status !== "PENDING" ||
    afterOutage.attempts !== 1 ||
    afterOutage.failureCode !== "PROVIDER_REJECTED"
  ) {
    throw new Error("The provider outage did not enter bounded retry state.");
  }

  await writeFile(modePath, "accept\n", { mode: 0o600 });
  const recoveryNow = new Date(now.getTime() + 31_000);
  await service.call(providerDelivery.id, recoveryNow);
  const afterRecovery = await prisma.flowcordiaApprovalNotificationDelivery.findUniqueOrThrow({
    where: { id: providerDelivery.id },
  });
  if (afterRecovery.status !== "SENT" || afterRecovery.attempts !== 2) {
    throw new Error("The provider delivery did not recover on bounded redrive.");
  }

  const workerWaitpoint = await waitpoint("worker");
  const workerDelivery = await prisma.flowcordiaApprovalNotificationDelivery.create({
    data: {
      organizationId,
      projectId,
      runtimeEnvironmentId: environmentId,
      waitpointId: workerWaitpoint.id,
      waitpointFriendlyId: workerWaitpoint.friendlyId,
      workflowId: "beta-failure-workflow",
      runFriendlyId: `run_beta_worker_${campaign}`,
      nodeId: "approval-worker-loss",
      prompt: "Approve the Beta failure worker recovery?",
      instruction: "Controlled acceptance fixture.",
      reminderAt: now,
      escalationAt: null,
      timeoutAt,
      stage: "REMINDER",
      channelId: channel.id,
      channelType: "EMAIL",
      status: "DELIVERING",
      availableAt: new Date(now.getTime() - 60_000),
      attempts: 1,
      leaseToken: `lost-worker-${campaign}`,
      leaseExpiresAt: new Date(now.getTime() - 1_000),
    },
  });
  await service.call(workerDelivery.id, recoveryNow);
  const afterWorkerRecovery =
    await prisma.flowcordiaApprovalNotificationDelivery.findUniqueOrThrow({
      where: { id: workerDelivery.id },
    });
  if (afterWorkerRecovery.status !== "SENT" || afterWorkerRecovery.attempts !== 2) {
    throw new Error("Expired delivery ownership was not reclaimed after worker loss.");
  }

  const deliveryLines = (await readFile(deliveriesPath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  if (deliveryLines.length !== 2) {
    throw new Error("The controlled SMTP fixture did not accept exactly two recovered deliveries.");
  }

  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: "0.1",
        workerLoss: {
          deliveryId: workerDelivery.id,
          lostLeaseAttempt: 1,
          reclaimedAttempt: afterWorkerRecovery.attempts,
          terminalStatus: afterWorkerRecovery.status,
        },
        providerOutage: {
          deliveryId: providerDelivery.id,
          firstStatus: afterOutage.status,
          firstFailureCode: afterOutage.failureCode,
          recoveryStatus: afterRecovery.status,
          attempts: afterRecovery.attempts,
          stableDeliveryId: afterRecovery.id === providerDelivery.id,
        },
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
  await chmod(output, 0o600);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Beta delivery failure fixture failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
