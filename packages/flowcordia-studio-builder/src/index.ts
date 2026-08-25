import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Prisma, PrismaClient } from "@trigger.dev/database";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { extract } from "tar";
import {
  dockerAuthConfig,
  environmentSlug,
  parseStudioBuildMetadata,
  safeConfigPath,
  type StudioBuildMetadata,
} from "./model.js";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const numberFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const config = {
  apiUrl: required("TRIGGER_API_URL"),
  buildApiUrl: process.env.FLOWCORDIA_STUDIO_BUILD_API_URL || required("TRIGGER_API_URL"),
  buildAddHost: process.env.FLOWCORDIA_STUDIO_BUILD_ADD_HOST?.trim(),
  artifactBucket: required("ARTIFACTS_OBJECT_STORE_BUCKET"),
  artifactEndpoint: required("ARTIFACTS_OBJECT_STORE_BASE_URL"),
  artifactRegion: process.env.ARTIFACTS_OBJECT_STORE_REGION || "us-east-1",
  artifactAccessKey: required("ARTIFACTS_OBJECT_STORE_ACCESS_KEY_ID"),
  artifactSecretKey: required("ARTIFACTS_OBJECT_STORE_SECRET_ACCESS_KEY"),
  builderName: process.env.FLOWCORDIA_STUDIO_BUILD_BUILDER || "default",
  builderNetwork: required("FLOWCORDIA_STUDIO_BUILD_NETWORK"),
  cliPath:
    process.env.FLOWCORDIA_STUDIO_BUILD_CLI_PATH ||
    "/triggerdotdev/packages/cli-v3/dist/esm/index.js",
  dockerRegistry: required("DEPLOY_REGISTRY_HOST"),
  dockerUsername: required("DEPLOY_REGISTRY_USERNAME"),
  dockerPassword: required("DEPLOY_REGISTRY_PASSWORD"),
  healthPort: numberFromEnv("FLOWCORDIA_STUDIO_BUILD_HEALTH_PORT", 8090),
  pollIntervalMs: numberFromEnv("FLOWCORDIA_STUDIO_BUILD_POLL_INTERVAL_MS", 2_000),
  claimTimeoutMs: numberFromEnv("FLOWCORDIA_STUDIO_BUILD_CLAIM_TIMEOUT_MS", 30 * 60_000),
  workRoot: process.env.FLOWCORDIA_STUDIO_BUILD_WORK_ROOT || "/var/lib/flowcordia/studio-builder",
};

const prisma = new PrismaClient();
const objectStore = new S3Client({
  credentials: {
    accessKeyId: config.artifactAccessKey,
    secretAccessKey: config.artifactSecretKey,
  },
  endpoint: config.artifactEndpoint,
  forcePathStyle: true,
  region: config.artifactRegion,
});

let stopping = false;
let activeDeploymentId: string | undefined;
let lastCompletedAt: string | undefined;
let lastError: string | undefined;

type Candidate = Prisma.WorkerDeploymentGetPayload<{
  include: {
    environment: {
      include: {
        project: true;
      };
    };
  };
}>;

function log(message: string, details?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      component: "flowcordia-studio-builder",
      message,
      ...details,
    })
  );
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/tr_(?:pat|oat)_[A-Za-z0-9_-]+/g, "[redacted-token]").slice(0, 2_000);
}

async function run(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolvePromise();
      reject(new Error(`${command} exited with ${code ?? signal ?? "unknown status"}`));
    });
  });
}

async function ensureBuildxBuilder() {
  try {
    await run("docker", ["buildx", "inspect", config.builderName]);
    return;
  } catch {
    log("creating Docker buildx builder", {
      builder: config.builderName,
      network: config.builderNetwork,
    });
  }

  try {
    await run("docker", [
      "buildx",
      "create",
      "--name",
      config.builderName,
      "--driver",
      "docker-container",
      `--driver-opt=network=${config.builderNetwork}`,
    ]);
  } catch (error) {
    await run("docker", ["buildx", "inspect", config.builderName]).catch(() => {
      throw error;
    });
  }
}

function canClaim(candidate: Candidate, metadata: StudioBuildMetadata): boolean {
  if (!metadata.buildId) return true;
  if (!metadata.buildId.startsWith("flowcordia-local-")) return false;
  return candidate.updatedAt.getTime() < Date.now() - config.claimTimeoutMs;
}

async function environmentApiKey(input: {
  candidate: Candidate;
  environment: "dev" | "staging" | "prod";
  accessToken: string;
}): Promise<string> {
  const url = new URL(
    `/api/v1/projects/${input.candidate.environment.project.externalRef}/${input.environment}`,
    config.apiUrl
  );
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve Studio build environment (HTTP ${response.status})`);
  }

  const body = (await response.json()) as { apiKey?: unknown };
  if (typeof body.apiKey !== "string" || body.apiKey.length === 0) {
    throw new Error("Studio build environment did not return an API key");
  }
  return body.apiKey;
}

async function progressDeployment(candidate: Candidate, apiKey: string): Promise<void> {
  const url = new URL(`/api/v1/deployments/${candidate.friendlyId}/progress`, config.buildApiUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`Failed to progress Studio deployment (HTTP ${response.status})`);
  }
}

async function claimNextDeployment(): Promise<
  { candidate: Candidate; metadata: StudioBuildMetadata; claimId: string } | undefined
> {
  const candidates = await prisma.workerDeployment.findMany({
    where: { status: { in: ["PENDING", "INSTALLING"] }, triggeredVia: "dashboard" },
    include: { environment: { include: { project: true } } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  for (const candidate of candidates) {
    const metadata = parseStudioBuildMetadata(candidate.buildServerMetadata);
    if (!metadata || !canClaim(candidate, metadata)) continue;
    if (!environmentSlug(candidate.environment.type)) continue;

    const claimId = `flowcordia-local-${Date.now()}-${randomUUID()}`;
    const result = await prisma.workerDeployment.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        updatedAt: candidate.updatedAt,
      },
      data: {
        buildServerMetadata: { ...metadata, buildId: claimId } as Prisma.InputJsonValue,
      },
    });

    if (result.count === 1) return { candidate, metadata, claimId };
  }

  return;
}

async function downloadArtifact(artifactKey: string, archivePath: string) {
  const response = await objectStore.send(
    new GetObjectCommand({ Bucket: config.artifactBucket, Key: artifactKey })
  );
  if (!response.Body) throw new Error("Studio deployment artifact is empty");

  const bytes = await response.Body.transformToByteArray();
  if (bytes.byteLength === 0) throw new Error("Studio deployment artifact is empty");
  if (bytes.byteLength > 100 * 1024 * 1024) {
    throw new Error("Studio deployment artifact exceeds the 100 MB limit");
  }
  await writeFile(archivePath, bytes);
}

async function installWorkspaceDependencies(workspace: string) {
  const storeDirectory = join(config.workRoot, ".pnpm-store");
  await run(
    "pnpm",
    [
      "install",
      "--no-frozen-lockfile",
      "--ignore-scripts",
      "--prefer-offline",
      "--store-dir",
      storeDirectory,
    ],
    {
      cwd: workspace,
      env: { ...process.env, CI: "1" },
    }
  );
}

async function createBuildToken(candidate: Candidate) {
  const token = `tr_oat_${randomBytes(20).toString("hex")}`;
  const created = await prisma.organizationAccessToken.create({
    data: {
      name: `flowcordia-studio-build:${candidate.friendlyId}`,
      type: "SYSTEM",
      organizationId: candidate.environment.project.organizationId,
      hashedToken: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    },
  });
  return { id: created.id, token };
}

async function markFailed(deploymentId: string, error: unknown) {
  const message = errorMessage(error);
  await prisma.workerDeployment.updateMany({
    where: {
      id: deploymentId,
      status: { in: ["PENDING", "INSTALLING", "BUILDING", "DEPLOYING"] },
    },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      errorData: { name: "StudioBuildError", message },
    },
  });
  lastError = message;
}

async function buildDeployment(input: {
  candidate: Candidate;
  metadata: StudioBuildMetadata;
  claimId: string;
}) {
  const { candidate, metadata, claimId } = input;
  const environment = environmentSlug(candidate.environment.type);
  if (!environment)
    throw new Error(`Unsupported Studio build environment: ${candidate.environment.type}`);

  const buildRoot = join(config.workRoot, claimId);
  const workspace = join(buildRoot, "workspace");
  const archivePath = join(buildRoot, "context.tar.gz");
  const dockerConfigDirectory = join(buildRoot, "docker");
  let buildToken: { id: string; token: string } | undefined;

  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(dockerConfigDirectory, { recursive: true });
    await downloadArtifact(metadata.artifactKey, archivePath);
    await extract({
      cwd: workspace,
      file: archivePath,
      gzip: true,
      strict: true,
      preservePaths: false,
    });
    buildToken = await createBuildToken(candidate);
    const apiKey = await environmentApiKey({
      candidate,
      environment,
      accessToken: buildToken.token,
    });
    if (candidate.status === "PENDING") {
      await progressDeployment(candidate, apiKey);
    }
    await installWorkspaceDependencies(workspace);
    await progressDeployment(candidate, apiKey);

    const configFile = safeConfigPath(workspace, metadata.configFilePath);
    await writeFile(
      join(dockerConfigDirectory, "config.json"),
      JSON.stringify(
        dockerAuthConfig(config.dockerRegistry, config.dockerUsername, config.dockerPassword)
      ),
      { mode: 0o600 }
    );

    const args = [
      config.cliPath,
      "deploy",
      ".",
      "--env",
      environment,
      "--config",
      configFile,
      "--local-build",
      "--push",
      "--builder",
      config.builderName,
      "--skip-update-check",
      "--plain",
      ...(metadata.skipPromotion ? ["--skip-promotion"] : []),
    ];

    log("building Studio deployment", {
      deploymentId: candidate.friendlyId,
      environment,
      projectRef: candidate.environment.project.externalRef,
    });
    await run(process.execPath, args, {
      cwd: workspace,
      env: {
        ...process.env,
        CI: "1",
        DOCKER_CONFIG: dockerConfigDirectory,
        TRIGGER_ACCESS_TOKEN: buildToken.token,
        TRIGGER_API_URL: config.apiUrl,
        TRIGGER_BUILD_API_URL_OVERRIDE: config.buildApiUrl,
        TRIGGER_DOCKER_BUILD_ADD_HOST: config.buildAddHost,
        TRIGGER_DOCKER_SKIP_LOGIN: "1",
        TRIGGER_EXISTING_DEPLOYMENT_ID: candidate.friendlyId,
        TRIGGER_LOCAL_BUILD_LABEL_DISABLED: "1",
        TRIGGER_TELEMETRY_DISABLED: "1",
      },
    });

    lastCompletedAt = new Date().toISOString();
    lastError = undefined;
    log("Studio deployment built", { deploymentId: candidate.friendlyId });
  } finally {
    if (buildToken) {
      await prisma.organizationAccessToken.deleteMany({ where: { id: buildToken.id } });
    }
    await rm(buildRoot, { recursive: true, force: true });
  }
}

async function processNextDeployment(): Promise<boolean> {
  const claim = await claimNextDeployment();
  if (!claim) return false;

  activeDeploymentId = claim.candidate.friendlyId;
  try {
    await buildDeployment(claim);
  } catch (error) {
    log("Studio deployment build failed", {
      deploymentId: claim.candidate.friendlyId,
      error: errorMessage(error),
    });
    await markFailed(claim.candidate.id, error);
  } finally {
    activeDeploymentId = undefined;
  }
  return true;
}

async function waitForApi() {
  const healthUrl = new URL("/healthcheck", config.apiUrl);
  while (!stopping) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {
      // The web process may still be applying migrations or compiling in development.
    }
    await delay(config.pollIntervalMs);
  }
}

const healthServer = createServer((request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ ok: true, activeDeploymentId, lastCompletedAt, lastError }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    healthServer.close();
  });
}

async function main() {
  await mkdir(config.workRoot, { recursive: true });
  await ensureBuildxBuilder();
  healthServer.listen(config.healthPort, "0.0.0.0");
  log("Studio build dispatcher started", {
    builder: config.builderName,
    healthPort: config.healthPort,
  });
  await waitForApi();

  while (!stopping) {
    try {
      const processed = await processNextDeployment();
      if (!processed) await delay(config.pollIntervalMs);
    } catch (error) {
      lastError = errorMessage(error);
      log("Studio build dispatcher poll failed", { error: lastError });
      await delay(config.pollIntervalMs);
    }
  }
}

main()
  .catch((error) => {
    stopping = true;
    healthServer.close();
    log("Studio build dispatcher stopped unexpectedly", { error: errorMessage(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
