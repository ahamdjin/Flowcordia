import { createHash } from "node:crypto";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BOUNDED = /^[A-Za-z0-9._/-]{1,256}$/;
const REQUIRED_SERVICES = [
  "postgres",
  "redis",
  "electric",
  "clickhouse",
  "minio",
  "registry",
  "s2",
  "docker-proxy",
  "web",
  "operations",
  "supervisor",
] as const;

export type FlowcordiaBundledExecutionObservation = {
  schemaVersion: "0.1";
  startedAt: string;
  completedAt: string;
  services: Record<(typeof REQUIRED_SERVICES)[number], "READY">;
  cleanInstall: true;
  doctorReady: true;
  deploymentVersion: string;
  deployedTaskCount: number;
  supervisorWorkloadObserved: true;
  s2StateChanged: true;
  restartReady: true;
  teardown: {
    containersAbsent: true;
    networksAbsent: true;
    volumesAbsent: true;
  };
};

export type FlowcordiaBundledReferenceExecution = {
  schemaVersion: "0.1";
  taskId: "flowcordia-beta-reference";
  friendlyId: string;
  status: "COMPLETED_SUCCESSFULLY";
};

export type FlowcordiaBundledExecutionEvidence = {
  schemaVersion: "0.1";
  kind: "flowcordia-bundled-execution";
  state: "READY";
  repository: string;
  applicationCommitSha: string;
  releaseId: string;
  imageDigest: string;
  workflow: {
    runId: string;
    runAttempt: number;
    sourceSha: string;
  };
  installation: {
    clean: true;
    serviceCount: number;
    doctor: "READY";
    restart: "READY";
  };
  deployment: {
    version: string;
    taskId: "flowcordia-beta-reference";
    taskCount: number;
  };
  execution: {
    friendlyId: string;
    status: "COMPLETED_SUCCESSFULLY";
    supervisorWorkloadObserved: true;
    s2StateChanged: true;
  };
  teardown: {
    containersAbsent: true;
    networksAbsent: true;
    volumesAbsent: true;
  };
  startedAt: string;
  completedAt: string;
  evidenceSha256: string;
};

type ReleaseManifest = {
  releaseId?: unknown;
  applicationCommitSha?: unknown;
  image?: { digest?: unknown };
};

const forbiddenKey = /(authorization|browser|cookie|credential|database|header|password|payload|private|provider|secret|token|url|workerId)/i;

function assertNoForbiddenKeys(value: unknown, path = "evidence input"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw new Error(`${path} contains forbidden field ${key}.`);
    assertNoForbiddenKeys(entry, `${path}.${key}`);
  }
}

function isoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return new Date(value).toISOString();
}

function bounded(value: unknown, label: string): string {
  if (typeof value !== "string" || !BOUNDED.test(value)) {
    throw new Error(`${label} is malformed.`);
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createFlowcordiaBundledExecutionEvidence(input: {
  repository: string;
  runId: string;
  runAttempt: number;
  sourceSha: string;
  manifest: ReleaseManifest;
  observation: FlowcordiaBundledExecutionObservation;
  execution: FlowcordiaBundledReferenceExecution;
}): FlowcordiaBundledExecutionEvidence {
  assertNoForbiddenKeys(input.observation);
  assertNoForbiddenKeys(input.execution);
  const applicationCommitSha = bounded(input.manifest.applicationCommitSha, "Application commit");
  if (!SHA.test(applicationCommitSha) || applicationCommitSha !== input.sourceSha) {
    throw new Error("The bundled execution application commit does not match the workflow source.");
  }
  const imageDigest = bounded(input.manifest.image?.digest, "Image digest");
  if (!SHA256.test(imageDigest)) throw new Error("The bundled execution image digest is malformed.");
  if (input.observation.schemaVersion !== "0.1" || input.execution.schemaVersion !== "0.1") {
    throw new Error("The bundled execution input schema is unsupported.");
  }
  for (const service of REQUIRED_SERVICES) {
    if (input.observation.services[service] !== "READY") {
      throw new Error(`Bundled service ${service} is not READY.`);
    }
  }
  if (
    input.observation.cleanInstall !== true ||
    input.observation.doctorReady !== true ||
    input.observation.supervisorWorkloadObserved !== true ||
    input.observation.s2StateChanged !== true ||
    input.observation.restartReady !== true ||
    input.observation.teardown.containersAbsent !== true ||
    input.observation.teardown.networksAbsent !== true ||
    input.observation.teardown.volumesAbsent !== true
  ) {
    throw new Error("The bundled execution observation is incomplete.");
  }
  if (
    input.execution.taskId !== "flowcordia-beta-reference" ||
    input.execution.status !== "COMPLETED_SUCCESSFULLY"
  ) {
    throw new Error("The bundled reference execution did not complete successfully.");
  }
  if (!Number.isSafeInteger(input.observation.deployedTaskCount) || input.observation.deployedTaskCount < 1) {
    throw new Error("The bundled deployment task count is invalid.");
  }
  if (!Number.isSafeInteger(input.runAttempt) || input.runAttempt < 1 || input.runAttempt > 100) {
    throw new Error("The bundled workflow attempt is invalid.");
  }
  const startedAt = isoDate(input.observation.startedAt, "Started timestamp");
  const completedAt = isoDate(input.observation.completedAt, "Completed timestamp");
  if (Date.parse(completedAt) <= Date.parse(startedAt)) {
    throw new Error("Bundled execution chronology is invalid.");
  }

  const unsigned = {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-bundled-execution" as const,
    state: "READY" as const,
    repository: bounded(input.repository.toLowerCase(), "Repository"),
    applicationCommitSha,
    releaseId: bounded(input.manifest.releaseId, "Release ID"),
    imageDigest,
    workflow: {
      runId: bounded(input.runId, "Workflow run"),
      runAttempt: input.runAttempt,
      sourceSha: applicationCommitSha,
    },
    installation: {
      clean: true as const,
      serviceCount: REQUIRED_SERVICES.length,
      doctor: "READY" as const,
      restart: "READY" as const,
    },
    deployment: {
      version: bounded(input.observation.deploymentVersion, "Deployment version"),
      taskId: input.execution.taskId,
      taskCount: input.observation.deployedTaskCount,
    },
    execution: {
      friendlyId: bounded(input.execution.friendlyId, "Run friendly ID"),
      status: input.execution.status,
      supervisorWorkloadObserved: true as const,
      s2StateChanged: true as const,
    },
    teardown: input.observation.teardown,
    startedAt,
    completedAt,
  };
  const evidenceSha256 = createHash("sha256").update(canonical(unsigned)).digest("hex");
  return { ...unsigned, evidenceSha256 };
}
