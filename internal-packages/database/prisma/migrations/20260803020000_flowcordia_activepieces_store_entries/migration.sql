CREATE TABLE "FlowcordiaActivepiecesStoreEntry" (
    "id" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaActivepiecesStoreEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowcordiaActivepiecesStoreEntry_environment_key_key"
ON "FlowcordiaActivepiecesStoreEntry"("runtimeEnvironmentId", "key");
