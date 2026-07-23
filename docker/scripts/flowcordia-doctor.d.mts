export type FlowcordiaDoctorProfile = "web" | "operations" | "release";
export type FlowcordiaDoctorCheckState = "READY" | "BLOCKED" | "UNAVAILABLE" | "SKIPPED";

export interface FlowcordiaDoctorRelease {
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  upstreamCommitSha: string;
  image: { digest: string };
  manifestSha256: string;
  migrations: { count: number; sha256: string };
}

export interface FlowcordiaDoctorObservations {
  database: "READY" | "UNAVAILABLE";
  migrations: "READY" | "UNAVAILABLE";
  redis: "READY" | "UNAVAILABLE";
  clickhouse: "READY" | "UNAVAILABLE";
  electric: "READY" | "UNAVAILABLE";
  objectStore: "READY" | "UNAVAILABLE";
  email: "READY" | "UNAVAILABLE";
  githubApp: "READY" | "UNAVAILABLE";
  workerHeartbeat: "READY" | "UNAVAILABLE";
  publicOrigin: "READY" | "UNAVAILABLE";
  publicOriginReachability: "READY" | "UNAVAILABLE" | "SKIPPED";
  webHealth: "READY" | "UNAVAILABLE" | "SKIPPED";
  operationsLocalHealth: "READY" | "UNAVAILABLE" | "SKIPPED";
}

export interface FlowcordiaDoctorEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-self-host-diagnostics";
  state: "READY" | "BLOCKED" | "UNAVAILABLE";
  profile: FlowcordiaDoctorProfile;
  release: {
    releaseId: string;
    version: string;
    applicationCommitSha: string;
    upstreamCommitSha: string;
    imageDigest: string;
    manifestSha256: string;
  };
  checkedAt: string;
  checks: Array<{ key: string; state: FlowcordiaDoctorCheckState; message: string }>;
  evidenceSha256: string;
}

export const FLOWCORDIA_DOCTOR_SCHEMA_VERSION: "0.1";
export const FLOWCORDIA_DOCTOR_PROFILES: readonly FlowcordiaDoctorProfile[];

export function presentFlowcordiaDoctor(input: {
  profile: FlowcordiaDoctorProfile;
  release: FlowcordiaDoctorRelease;
  checkedAt: Date;
  releaseIdentityReady: boolean;
  configurationReady: boolean;
  observations: FlowcordiaDoctorObservations;
}): FlowcordiaDoctorEvidence;

export function runFlowcordiaDoctor(input: {
  environment: Record<string, string | undefined>;
  profile: FlowcordiaDoctorProfile;
  checkedAt?: Date;
  observe?: (
    environment: Record<string, string | undefined>,
    release: FlowcordiaDoctorRelease,
    profile: FlowcordiaDoctorProfile
  ) => Promise<FlowcordiaDoctorObservations>;
}): Promise<FlowcordiaDoctorEvidence>;

export function writeFlowcordiaDoctorEvidence(
  path: string,
  evidence: FlowcordiaDoctorEvidence
): Promise<void>;
