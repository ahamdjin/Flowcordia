-- The request-serving webapp may run with the proposal worker disabled while a
-- dedicated deployment owns the worker. Persist only liveness and non-secret
-- timing budgets so operations readiness can observe the real worker process.
CREATE TABLE "FlowcordiaOperationsWorkerHeartbeat" (
    "workerName" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "healthyUntil" TIMESTAMP(3) NOT NULL,
    "pollIntervalMs" INTEGER NOT NULL,
    "reconciliationRefreshMs" INTEGER NOT NULL,
    "reconciliationStaleMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaOperationsWorkerHeartbeat_pkey" PRIMARY KEY ("workerName")
);

CREATE INDEX "FlowcordiaOperationsWorkerHeartbeat_healthyUntil_idx"
ON "FlowcordiaOperationsWorkerHeartbeat"("healthyUntil");
