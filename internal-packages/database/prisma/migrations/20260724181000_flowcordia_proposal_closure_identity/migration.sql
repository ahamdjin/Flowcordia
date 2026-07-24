ALTER TABLE "FlowcordiaWorkflowProposal"
ADD COLUMN "closureSchemaVersion" TEXT,
ADD COLUMN "closureDigest" TEXT,
ADD COLUMN "closureWorkflowIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
