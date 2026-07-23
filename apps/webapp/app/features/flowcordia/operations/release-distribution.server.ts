import { resolve } from "node:path";
import {
  createFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";
import { readFlowcordiaTargetMigrationArtifacts } from "./upgrade-preflight.server";

export async function buildFlowcordiaReleaseDistributionManifest(input: {
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  upstreamCommitSha: string;
  createdAt: Date;
  imageReference: string;
  migrationsPath?: string;
}): Promise<FlowcordiaReleaseDistributionManifest> {
  const migrationsPath =
    input.migrationsPath ?? resolve(process.cwd(), "internal-packages/database/prisma/migrations");
  const migrations = await readFlowcordiaTargetMigrationArtifacts(migrationsPath);
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: input.releaseId,
    version: input.version,
    applicationCommitSha: input.applicationCommitSha,
    upstreamCommitSha: input.upstreamCommitSha,
    createdAt: input.createdAt,
    imageReference: input.imageReference,
    migrations,
  });
}
