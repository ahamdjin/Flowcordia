import { prisma } from "~/db.server";
import {
  FLOWCORDIA_APPROVAL_NOTIFICATION_BATCH_LIMIT,
  FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS,
} from "./notification";
import {
  flowcordiaApprovalNotificationProcessingTime,
  type FlowcordiaApprovalNotificationClock,
} from "./notification-clock";
import {
  DeliverFlowcordiaApprovalNotificationService,
  ReconcileFlowcordiaApprovalNotificationsService,
} from "./notification.server";

export class ProcessFlowcordiaApprovalNotificationsWithLiveClockService {
  async call(
    scheduledAt: Date,
    observedNow: FlowcordiaApprovalNotificationClock = () => new Date()
  ): Promise<{ created: number; processed: number }> {
    let processingTime = flowcordiaApprovalNotificationProcessingTime(
      scheduledAt,
      observedNow()
    );
    const created = await new ReconcileFlowcordiaApprovalNotificationsService().call(processingTime);
    const candidates = await prisma.flowcordiaApprovalNotificationDelivery.findMany({
      where: {
        attempts: { lt: FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS },
        OR: [
          { status: "PENDING", availableAt: { lte: processingTime } },
          { status: "DELIVERING", leaseExpiresAt: { lte: processingTime } },
        ],
      },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: FLOWCORDIA_APPROVAL_NOTIFICATION_BATCH_LIMIT,
      select: { id: true },
    });
    const service = new DeliverFlowcordiaApprovalNotificationService();
    for (const candidate of candidates) {
      processingTime = flowcordiaApprovalNotificationProcessingTime(
        processingTime,
        observedNow()
      );
      await service.call(candidate.id, processingTime);
    }
    return { created, processed: candidates.length };
  }
}
