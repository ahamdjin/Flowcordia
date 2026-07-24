import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const FLOWCORDIA_LAUNCH_CAMPAIGN_SCHEMA_VERSION = "0.1";
export const FLOWCORDIA_LAUNCH_CAMPAIGN_WORKFLOW =
  ".github/workflows/flowcordia-launch-campaign-readiness.yml";
export const FLOWCORDIA_LAUNCH_CAMPAIGN_CONFIRMATION = "CHECK_FLOWCORDIA_LAUNCH_CAMPAIGN_READINESS";

export const FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES = [
  "publication",
  "lifecycle",
  "provider",
  "alert",
  "connected",
  "promotion",
  "production",
  "webhook",
  "rollback",
  "dossier",
];

export const FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS = {
  publication: "flowcordia-self-host-release",
  lifecycle: "flowcordia-self-host-lifecycle",
  provider: "flowcordia-provider-readiness",
  alert: "flowcordia-alert-readiness",
  connected: "flowcordia-acceptance",
  promotion: "flowcordia-promotion-acceptance",
  production: "flowcordia-production-acceptance",
  webhook: "flowcordia-webhook-acceptance",
  rollback: "flowcordia-rollback-acceptance",
  dossier: "flowcordia-release-evidence",
};

const SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const REPOSITORY = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9][a-z0-9._-]{0,99}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const GITHUB_APP_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const FORBIDDEN_EVIDENCE_KEY =
  /payload|cookie|originUrl|token|secret|password|authorization|header|storageState|privateKey|recipient|emailAddress|databaseUrl|providerResponse|providerBody|rawError|stack|pathValue/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
}

export function flowcordiaLaunchCampaignSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function timestamp(value, label) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical timestamp.`);
  }
  return value;
}

function repeatedPlaceholder(value) {
  return new Set(value).size === 1;
}

function validApplicationSha(value) {
  return typeof value === "string" && SHA.test(value) && !repeatedPlaceholder(value);
}

function fixedCheck(key, ready, readyMessage, blockedMessage) {
  return {
    key,
    state: ready ? "READY" : "BLOCKED",
    message: ready ? readyMessage : blockedMessage,
  };
}

function boundedString(value, minimum = 1, maximum = 4096) {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    !value.includes("\0")
  );
}

function boundedSecret(value, minimum = 32, maximum = 16384) {
  return boundedString(value, minimum, maximum);
}

function positiveIntegerString(value, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum;
}

function safeHttpsUrl(value) {
  if (!boundedString(value, 8, 2048)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function httpServiceUrl(value, allowCredentials = false) {
  if (!boundedString(value, 8, 8192)) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname.length > 0 &&
      url.hash === "" &&
      (allowCredentials || (url.username === "" && url.password === ""))
    );
  } catch {
    return false;
  }
}

function registryHost(value) {
  if (!boundedString(value, 1, 512) || value.includes("://")) return false;
  try {
    const url = new URL(`https://${value}`);
    return (
      url.hostname.length > 0 &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function integerSetting(value, fallback, minimum, maximum) {
  if (value === undefined || value === "") return fallback;
  if (!positiveIntegerString(value, minimum, maximum)) return null;
  return Number(value);
}

function postgresUrl(value) {
  if (!boundedString(value, 12, 8192)) return false;
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function redisHost(value) {
  if (!boundedString(value, 1, 253)) return false;
  return HOST.test(value) || value === "localhost" || /^\[[0-9a-fA-F:]+\]$/.test(value);
}

function parseBoundedObject(value, maximumBytes = 32 * 1024) {
  if (!boundedString(value, 2, maximumBytes)) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseStorageState(value) {
  if (!boundedString(value, 4, 256 * 1024)) return null;
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length < 2 || bytes.length > 192 * 1024) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !Array.isArray(parsed.cookies) ||
      !Array.isArray(parsed.origins) ||
      parsed.cookies.length + parsed.origins.length < 1
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function privateKeyPem(value) {
  if (!boundedString(value, 128, 32 * 1024)) return false;
  return (
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(value) &&
    /-----END (?:RSA )?PRIVATE KEY-----/.test(value)
  );
}

function pairedOptionalCredentials(user, password) {
  const hasUser = boundedString(user, 1, 512);
  const hasPassword = boundedSecret(password, 8, 4096);
  return (!user && !password) || (hasUser && hasPassword);
}

function emailProviderReady(environment, prefix = "") {
  const transport = environment[`${prefix}EMAIL_TRANSPORT`];
  const sender = environment[`${prefix}FROM_EMAIL`];
  const reply = environment[`${prefix}REPLY_TO_EMAIL`];
  if (!EMAIL.test(sender ?? "") || !EMAIL.test(reply ?? "")) return false;
  if (transport === "resend") {
    return boundedSecret(environment[`${prefix}RESEND_API_KEY`], 16, 4096);
  }
  if (transport === "smtp") {
    return (
      boundedString(environment[`${prefix}SMTP_HOST`], 1, 512) &&
      positiveIntegerString(environment[`${prefix}SMTP_PORT`], 1, 65535) &&
      pairedOptionalCredentials(
        environment[`${prefix}SMTP_USER`],
        environment[`${prefix}SMTP_PASSWORD`]
      )
    );
  }
  if (transport === "aws-ses") {
    return (
      boundedString(environment.AWS_REGION, 3, 64) &&
      boundedString(environment.AWS_ACCESS_KEY_ID, 12, 256) &&
      boundedSecret(environment.AWS_SECRET_ACCESS_KEY, 16, 4096)
    );
  }
  return false;
}

function alertEmailProviderReady(environment) {
  const transport = environment.ALERT_EMAIL_TRANSPORT;
  if (!transport) return true;
  if (
    !EMAIL.test(environment.ALERT_FROM_EMAIL ?? "") ||
    !EMAIL.test(environment.ALERT_REPLY_TO_EMAIL ?? "")
  ) {
    return false;
  }
  if (transport === "resend") {
    return boundedSecret(environment.ALERT_RESEND_API_KEY, 16, 4096);
  }
  if (transport === "smtp") {
    return (
      boundedString(environment.ALERT_SMTP_HOST, 1, 512) &&
      positiveIntegerString(environment.ALERT_SMTP_PORT, 1, 65535) &&
      pairedOptionalCredentials(environment.ALERT_SMTP_USER, environment.ALERT_SMTP_PASSWORD)
    );
  }
  return false;
}

function objectStoreReady(environment) {
  const protocol = environment.OBJECT_STORE_DEFAULT_PROTOCOL;
  if (protocol && protocol !== "s3") return false;
  const prefix = protocol === "s3" ? "OBJECT_STORE_S3_" : "OBJECT_STORE_";
  const base = environment[`${prefix}BASE_URL`];
  const bucket = environment[`${prefix}BUCKET`];
  const access = environment[`${prefix}ACCESS_KEY_ID`];
  const secret = environment[`${prefix}SECRET_ACCESS_KEY`];
  const staticCredentials = boundedString(access, 3, 512) && boundedSecret(secret, 8, 4096);
  const awsCredentialChain =
    boundedString(environment.AWS_ACCESS_KEY_ID, 12, 256) &&
    boundedSecret(environment.AWS_SECRET_ACCESS_KEY, 16, 4096);
  return (
    httpServiceUrl(base) &&
    boundedString(bucket, 3, 255) &&
    Boolean(staticCredentials || awsCredentialChain)
  );
}

function alertWorkerConfiguration(environment) {
  const host = environment.ALERTS_WORKER_REDIS_HOST;
  const port = integerSetting(environment.ALERTS_WORKER_REDIS_PORT, 6379, 1, 65535);
  const tlsDisabled = environment.ALERTS_WORKER_REDIS_TLS_DISABLED || "false";
  const workers = integerSetting(environment.ALERTS_WORKER_CONCURRENCY_WORKERS, 1, 1, 64);
  const tasksPerWorker = integerSetting(
    environment.ALERTS_WORKER_CONCURRENCY_TASKS_PER_WORKER,
    10,
    1,
    100
  );
  const concurrencyLimit = integerSetting(environment.ALERTS_WORKER_CONCURRENCY_LIMIT, 10, 1, 1000);
  const pollInterval = integerSetting(environment.ALERTS_WORKER_POLL_INTERVAL, 1000, 50, 60000);
  const shutdownTimeout = integerSetting(
    environment.ALERTS_WORKER_SHUTDOWN_TIMEOUT_MS,
    60000,
    5000,
    300000
  );
  const redisReady =
    environment.ALERTS_WORKER_ENABLED === "true" &&
    redisHost(host) &&
    port !== null &&
    ["true", "false"].includes(tlsDisabled);
  const limitsReady =
    workers !== null &&
    tasksPerWorker !== null &&
    concurrencyLimit !== null &&
    concurrencyLimit >= Math.min(workers * tasksPerWorker, 1000) &&
    pollInterval !== null &&
    shutdownTimeout !== null &&
    shutdownTimeout > pollInterval;
  return { redisReady, limitsReady };
}

function proposalWorkerReady(environment) {
  const enabled = String(environment.FLOWCORDIA_PROPOSAL_WORKER_ENABLED ?? "").toLowerCase();
  if (!["1", "true"].includes(enabled)) return false;
  const numeric = [
    "FLOWCORDIA_PROPOSAL_WORKER_POLL_INTERVAL_MS",
    "FLOWCORDIA_PROPOSAL_WORKER_SHUTDOWN_GRACE_MS",
    "FLOWCORDIA_PROPOSAL_EVENT_TIMEOUT_MS",
    "FLOWCORDIA_PROPOSAL_OUTBOX_BATCH_SIZE",
    "FLOWCORDIA_PROPOSAL_OUTBOX_LEASE_MS",
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_BATCH_SIZE",
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_LEASE_MS",
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_STALE_MS",
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_REFRESH_MS",
    "FLOWCORDIA_PROPOSAL_GITHUB_TIMEOUT_MS",
  ];
  return (
    safeHttpsUrl(environment.FLOWCORDIA_PROPOSAL_EVENT_URL) &&
    boundedSecret(environment.FLOWCORDIA_PROPOSAL_EVENT_SECRET) &&
    numeric.every((key) => positiveIntegerString(environment[key], 1, 86_400_000))
  );
}

async function safeFile(path, secret) {
  if (!isAbsolute(path) || !boundedString(path, 2, 4096)) return false;
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) return false;
    if (stats.uid !== process.getuid?.()) return false;
    const mode = stats.mode & 0o777;
    if (secret ? (mode & 0o077) !== 0 : (mode & 0o022) !== 0) return false;
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function inside(parent, candidate) {
  const path = relative(resolve(parent), resolve(candidate));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

async function safeDirectory(path, workspace) {
  if (!isAbsolute(path) || !boundedString(path, 2, 4096)) return false;
  if (workspace && inside(workspace, path)) return false;
  try {
    const stats = await lstat(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
    if (stats.uid !== process.getuid?.()) return false;
    await access(path, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathsDistinctAndSeparated(paths) {
  if (paths.some((path) => !isAbsolute(path))) return false;
  const normalized = paths.map((path) => resolve(path));
  if (new Set(normalized).size !== normalized.length) return false;
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      if (
        inside(normalized[left], normalized[right]) ||
        inside(normalized[right], normalized[left])
      ) {
        return false;
      }
    }
  }
  return true;
}

function baseChecks(environment, applicationCommitSha, stage) {
  return [
    fixedCheck(
      "main_revision",
      environment.GITHUB_REF === "refs/heads/main" &&
        environment.GITHUB_SHA === applicationCommitSha,
      "The readiness workflow is running from the exact candidate on main.",
      "The readiness workflow is not running from the exact candidate on main."
    ),
    fixedCheck(
      "protected_environment",
      environment.FLOWCORDIA_CAMPAIGN_ENVIRONMENT_REACHED ===
        FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS[stage],
      "The exact protected environment was reached.",
      "The exact protected environment was not reached."
    ),
    fixedCheck(
      "operator_confirmation",
      environment.FLOWCORDIA_CAMPAIGN_CONFIRMATION === FLOWCORDIA_LAUNCH_CAMPAIGN_CONFIRMATION,
      "The operator confirmed the non-destructive readiness campaign.",
      "The readiness campaign confirmation is invalid."
    ),
  ];
}

async function stageChecks(stage, environment, applicationCommitSha) {
  const checks = baseChecks(environment, applicationCommitSha, stage);
  if (stage === "publication") {
    checks.push(
      fixedCheck(
        "release_identity",
        validApplicationSha(applicationCommitSha),
        "The publication candidate has one exact non-placeholder application revision.",
        "The publication candidate application revision is invalid."
      )
    );
    return checks;
  }

  if (stage === "lifecycle") {
    const currentConfig = environment.FLOWCORDIA_LIFECYCLE_CURRENT_CONFIG_FILE ?? "";
    const currentSecrets = environment.FLOWCORDIA_LIFECYCLE_CURRENT_SECRETS_FILE ?? "";
    const targetConfig = environment.FLOWCORDIA_LIFECYCLE_TARGET_CONFIG_FILE ?? "";
    const targetSecrets = environment.FLOWCORDIA_LIFECYCLE_TARGET_SECRETS_FILE ?? "";
    const work = environment.FLOWCORDIA_LIFECYCLE_WORK_PARENT ?? "";
    const evidence = environment.FLOWCORDIA_LIFECYCLE_EVIDENCE_DIR ?? "";
    checks.push(
      fixedCheck(
        "dedicated_runner",
        process.getuid?.() === 1000,
        "The dedicated release runner is active under UID 1000.",
        "The dedicated release runner is unavailable or uses the wrong UID."
      ),
      fixedCheck(
        "current_config",
        await safeFile(currentConfig, false),
        "The current-release configuration file is safe and readable.",
        "The current-release configuration file is missing or unsafe."
      ),
      fixedCheck(
        "current_secrets",
        await safeFile(currentSecrets, true),
        "The current-release secrets file is owner-only and readable.",
        "The current-release secrets file is missing or unsafe."
      ),
      fixedCheck(
        "target_config",
        await safeFile(targetConfig, false),
        "The target-release configuration file is safe and readable.",
        "The target-release configuration file is missing or unsafe."
      ),
      fixedCheck(
        "target_secrets",
        await safeFile(targetSecrets, true),
        "The target-release secrets file is owner-only and readable.",
        "The target-release secrets file is missing or unsafe."
      ),
      fixedCheck(
        "work_directory",
        await safeDirectory(work, environment.GITHUB_WORKSPACE),
        "The isolated lifecycle work directory is safe and writable.",
        "The isolated lifecycle work directory is missing, unsafe, or not writable."
      ),
      fixedCheck(
        "evidence_directory",
        await safeDirectory(evidence, environment.GITHUB_WORKSPACE),
        "The lifecycle evidence directory is safe and writable.",
        "The lifecycle evidence directory is missing, unsafe, or not writable."
      ),
      fixedCheck(
        "path_isolation",
        pathsDistinctAndSeparated([
          currentConfig,
          currentSecrets,
          targetConfig,
          targetSecrets,
          work,
          evidence,
        ]),
        "Lifecycle configuration, secrets, work, and evidence paths are isolated.",
        "Lifecycle configuration, secrets, work, or evidence paths overlap."
      )
    );
    return checks;
  }

  if (stage === "provider") {
    checks.push(
      fixedCheck(
        "application_identity",
        environment.FLOWCORDIA_APPLICATION_COMMIT_SHA === applicationCommitSha,
        "The provider environment targets the exact candidate application.",
        "The provider environment targets another application revision."
      ),
      fixedCheck(
        "database_configuration",
        postgresUrl(environment.DATABASE_URL) && postgresUrl(environment.DIRECT_URL),
        "The provider environment has bounded PostgreSQL connection configuration.",
        "The provider environment PostgreSQL configuration is missing or invalid."
      ),
      fixedCheck(
        "origin_configuration",
        safeHttpsUrl(environment.APP_ORIGIN) && safeHttpsUrl(environment.LOGIN_ORIGIN),
        "The application and login origins are bounded HTTPS URLs.",
        "The application or login origin is missing or unsafe."
      ),
      fixedCheck(
        "web_secrets",
        ["SESSION_SECRET", "MAGIC_LINK_SECRET", "ENCRYPTION_KEY"].every((key) =>
          boundedSecret(environment[key])
        ),
        "The required web cryptographic material is configured.",
        "Required web cryptographic material is missing or too short."
      ),
      fixedCheck(
        "github_app",
        positiveIntegerString(environment.FLOWCORDIA_GITHUB_APP_ID, 1) &&
          GITHUB_APP_SLUG.test(environment.FLOWCORDIA_GITHUB_APP_SLUG ?? "") &&
          privateKeyPem(environment.GITHUB_APP_PRIVATE_KEY) &&
          boundedSecret(environment.GITHUB_APP_WEBHOOK_SECRET),
        "The GitHub App identity and private credentials have valid bounded shapes.",
        "The GitHub App identity or private credentials are missing or invalid."
      ),
      fixedCheck(
        "proposal_worker",
        proposalWorkerReady(environment),
        "The proposal worker delivery and reconciliation configuration is complete.",
        "The proposal worker delivery or reconciliation configuration is incomplete."
      ),
      fixedCheck(
        "email_provider",
        emailProviderReady(environment),
        "One supported product-email provider is configured.",
        "No supported product-email provider is fully configured."
      ),
      fixedCheck(
        "object_store",
        objectStoreReady(environment),
        "One bounded object-store configuration is complete.",
        "The object-store configuration is incomplete or invalid."
      ),
      fixedCheck(
        "operator_mailbox",
        EMAIL.test(environment.FLOWCORDIA_PROVIDER_TEST_RECIPIENT ?? "") &&
          environment.FLOWCORDIA_PROVIDER_TEST_RECIPIENT.length <= 254,
        "A controlled provider-readiness mailbox is configured.",
        "The controlled provider-readiness mailbox is missing or invalid."
      )
    );
    return checks;
  }

  if (stage === "alert") {
    const worker = alertWorkerConfiguration(environment);
    checks.push(
      fixedCheck(
        "application_identity",
        environment.FLOWCORDIA_APPLICATION_COMMIT_SHA === applicationCommitSha,
        "The alert environment targets the exact candidate application.",
        "The alert environment targets another application revision."
      ),
      fixedCheck(
        "database_configuration",
        postgresUrl(environment.DATABASE_URL) && postgresUrl(environment.DIRECT_URL),
        "The alert environment has bounded PostgreSQL connection configuration.",
        "The alert environment PostgreSQL configuration is missing or invalid."
      ),
      fixedCheck(
        "application_dependencies",
        safeHttpsUrl(environment.APP_ORIGIN) &&
          registryHost(environment.DEPLOY_REGISTRY_HOST) &&
          registryHost(environment.V4_DEPLOY_REGISTRY_HOST) &&
          httpServiceUrl(environment.CLICKHOUSE_URL, true),
        "The alert environment application and deployment dependencies are configured.",
        "The alert environment application or deployment dependencies are incomplete."
      ),
      fixedCheck(
        "worker_redis",
        worker.redisReady,
        "The alerts-worker Redis configuration is complete.",
        "The alerts-worker Redis configuration is incomplete or invalid."
      ),
      fixedCheck(
        "worker_limits",
        worker.limitsReady,
        "The alerts-worker concurrency and timing limits are bounded.",
        "The alerts-worker concurrency or timing limits are missing or invalid."
      ),
      fixedCheck(
        "alert_transport",
        alertEmailProviderReady(environment),
        "Any configured global alert email transport is complete.",
        "The configured global alert email transport is incomplete or unsupported."
      )
    );
    return checks;
  }

  const storageChecks = {
    connected: [
      ["base_url", safeHttpsUrl(environment.FLOWCORDIA_ACCEPTANCE_BASE_URL)],
      [
        "payload_fixture",
        Boolean(parseBoundedObject(environment.FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON)),
      ],
      [
        "operator_session",
        Boolean(parseStorageState(environment.FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_B64)),
      ],
    ],
    promotion: [
      ["base_url", safeHttpsUrl(environment.FLOWCORDIA_ACCEPTANCE_BASE_URL)],
      [
        "operator_session",
        Boolean(parseStorageState(environment.FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_B64)),
      ],
    ],
    production: [
      ["base_url", safeHttpsUrl(environment.FLOWCORDIA_PRODUCTION_ACCEPTANCE_BASE_URL)],
      [
        "payload_fixture",
        Boolean(parseBoundedObject(environment.FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON)),
      ],
      [
        "operator_session",
        Boolean(parseStorageState(environment.FLOWCORDIA_PRODUCTION_ACCEPTANCE_STORAGE_STATE_B64)),
      ],
    ],
    webhook: [
      ["base_url", safeHttpsUrl(environment.FLOWCORDIA_WEBHOOK_ACCEPTANCE_BASE_URL)],
      [
        "payload_fixture",
        Boolean(parseBoundedObject(environment.FLOWCORDIA_WEBHOOK_ACCEPTANCE_PAYLOAD_JSON)),
      ],
      ["hmac_secret", boundedSecret(environment.FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET)],
      [
        "operator_session",
        Boolean(parseStorageState(environment.FLOWCORDIA_WEBHOOK_ACCEPTANCE_STORAGE_STATE_B64)),
      ],
    ],
    rollback: [
      ["base_url", safeHttpsUrl(environment.FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_URL)],
      [
        "operator_session",
        Boolean(parseStorageState(environment.FLOWCORDIA_ROLLBACK_ACCEPTANCE_STORAGE_STATE_B64)),
      ],
    ],
  };

  if (stage in storageChecks) {
    for (const [key, ready] of storageChecks[stage]) {
      const label = key.replaceAll("_", " ");
      checks.push(
        fixedCheck(
          key,
          ready,
          `The ${label} configuration is bounded and valid.`,
          `The ${label} configuration is missing or invalid.`
        )
      );
    }
    return checks;
  }

  if (stage === "dossier") {
    checks.push(
      fixedCheck(
        "github_app_credentials",
        boundedString(environment.FLOWCORDIA_RELEASE_PR_APP_CLIENT_ID, 3, 256) &&
          privateKeyPem(environment.FLOWCORDIA_RELEASE_PR_APP_PRIVATE_KEY),
        "The release-evidence GitHub App credentials have valid bounded shapes.",
        "The release-evidence GitHub App credentials are missing or invalid."
      ),
      fixedCheck(
        "github_app_installation",
        environment.FLOWCORDIA_CAMPAIGN_APP_TOKEN_READY === "success" &&
          environment.FLOWCORDIA_CAMPAIGN_APP_PROBE_READY === "success",
        "The release-evidence GitHub App can authenticate and read this repository.",
        "The release-evidence GitHub App could not authenticate or read this repository."
      )
    );
    return checks;
  }

  throw new Error(`Unsupported readiness stage ${stage}.`);
}

function stageSource(environment, stage, applicationCommitSha) {
  const repository = String(environment.GITHUB_REPOSITORY ?? "").toLowerCase();
  const runId = String(environment.GITHUB_RUN_ID ?? "");
  const runAttempt = Number(environment.GITHUB_RUN_ATTEMPT);
  const sourceCommitSha = String(environment.GITHUB_SHA ?? "");
  if (
    !REPOSITORY.test(repository) ||
    !RUN_ID.test(runId) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    runAttempt > 1000 ||
    environment.GITHUB_REF !== "refs/heads/main" ||
    sourceCommitSha !== applicationCommitSha
  ) {
    throw new Error("Readiness workflow source identity is invalid.");
  }
  return {
    repository,
    workflowPath: FLOWCORDIA_LAUNCH_CAMPAIGN_WORKFLOW,
    runId,
    runAttempt,
    sourceRef: "refs/heads/main",
    sourceCommitSha,
    job: stage,
    environment: FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS[stage],
    runner: stage === "lifecycle" ? "self-hosted" : "github-hosted",
  };
}

function rejectEvidenceSecrets(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectEvidenceSecrets(child, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) {
      throw new Error(`Readiness evidence contains forbidden field ${[...path, key].join(".")}.`);
    }
    rejectEvidenceSecrets(child, [...path, key]);
  }
}

export async function createFlowcordiaLaunchCampaignStageEvidence({
  stage,
  applicationCommitSha,
  environment,
  checkedAt = new Date(),
}) {
  if (!FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES.includes(stage)) {
    throw new Error("Readiness stage is invalid.");
  }
  if (!validApplicationSha(applicationCommitSha) || Number.isNaN(checkedAt.getTime())) {
    throw new Error("Readiness application identity or time is invalid.");
  }
  const checks = await stageChecks(stage, environment, applicationCommitSha);
  const withoutDigest = {
    schemaVersion: FLOWCORDIA_LAUNCH_CAMPAIGN_SCHEMA_VERSION,
    kind: "flowcordia-launch-campaign-stage-readiness",
    state: checks.every((check) => check.state === "READY") ? "READY" : "BLOCKED",
    stage,
    applicationCommitSha,
    checkedAt: checkedAt.toISOString(),
    checks,
    source: stageSource(environment, stage, applicationCommitSha),
  };
  rejectEvidenceSecrets(withoutDigest);
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaLaunchCampaignSha256(withoutDigest),
  };
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} contains unexpected or missing fields.`);
  }
}

export function parseFlowcordiaLaunchCampaignStageEvidence(value) {
  exactKeys(
    value,
    [
      "applicationCommitSha",
      "checkedAt",
      "checks",
      "evidenceSha256",
      "kind",
      "schemaVersion",
      "source",
      "stage",
      "state",
    ],
    "Readiness stage evidence"
  );
  if (
    value.schemaVersion !== FLOWCORDIA_LAUNCH_CAMPAIGN_SCHEMA_VERSION ||
    value.kind !== "flowcordia-launch-campaign-stage-readiness" ||
    !FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES.includes(value.stage) ||
    !["READY", "BLOCKED"].includes(value.state) ||
    !validApplicationSha(value.applicationCommitSha) ||
    !Array.isArray(value.checks) ||
    value.checks.length < 4
  ) {
    throw new Error("Readiness stage evidence is invalid.");
  }
  timestamp(value.checkedAt, "Readiness stage time");
  value.checks.forEach((check, index) => {
    exactKeys(check, ["key", "message", "state"], `Readiness check ${index}`);
    if (
      !/^[a-z][a-z0-9_]{2,63}$/.test(check.key) ||
      !["READY", "BLOCKED"].includes(check.state) ||
      !boundedString(check.message, 3, 240)
    ) {
      throw new Error("Readiness stage contains an invalid check.");
    }
  });
  if ((value.state === "READY") !== value.checks.every((check) => check.state === "READY")) {
    throw new Error("Readiness stage state does not match its checks.");
  }
  exactKeys(
    value.source,
    [
      "environment",
      "job",
      "repository",
      "runAttempt",
      "runId",
      "runner",
      "sourceCommitSha",
      "sourceRef",
      "workflowPath",
    ],
    "Readiness source"
  );
  const source = value.source;
  if (
    !REPOSITORY.test(source.repository) ||
    source.workflowPath !== FLOWCORDIA_LAUNCH_CAMPAIGN_WORKFLOW ||
    !RUN_ID.test(source.runId) ||
    !Number.isSafeInteger(source.runAttempt) ||
    source.runAttempt < 1 ||
    source.runAttempt > 1000 ||
    source.sourceRef !== "refs/heads/main" ||
    source.sourceCommitSha !== value.applicationCommitSha ||
    source.job !== value.stage ||
    source.environment !== FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS[value.stage] ||
    source.runner !== (value.stage === "lifecycle" ? "self-hosted" : "github-hosted")
  ) {
    throw new Error("Readiness stage source identity is invalid.");
  }
  rejectEvidenceSecrets(value);
  const { evidenceSha256, ...withoutDigest } = value;
  if (
    typeof evidenceSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(evidenceSha256) ||
    flowcordiaLaunchCampaignSha256(withoutDigest) !== evidenceSha256
  ) {
    throw new Error("Readiness stage evidence digest is invalid.");
  }
  return value;
}

async function walkJsonFiles(root) {
  const result = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        result.push(path);
      }
    }
  }
  await visit(root);
  return result;
}

export async function assembleFlowcordiaLaunchCampaignEvidence({
  applicationCommitSha,
  evidenceRoot,
  checkedAt = new Date(),
}) {
  if (!validApplicationSha(applicationCommitSha) || Number.isNaN(checkedAt.getTime())) {
    throw new Error("Campaign assembly identity or time is invalid.");
  }
  const paths = await walkJsonFiles(evidenceRoot);
  const parsed = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    if (bytes.byteLength < 2 || bytes.byteLength > 64 * 1024) {
      throw new Error("Readiness stage artifact has an invalid size.");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed.push(parseFlowcordiaLaunchCampaignStageEvidence(JSON.parse(text)));
  }
  if (parsed.length !== FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES.length) {
    throw new Error("Campaign readiness requires exactly ten stage artifacts.");
  }
  const byStage = new Map(parsed.map((entry) => [entry.stage, entry]));
  if (byStage.size !== FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES.length) {
    throw new Error("Campaign readiness contains duplicate stage artifacts.");
  }
  const ordered = FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES.map((stage) => {
    const evidence = byStage.get(stage);
    if (!evidence) throw new Error(`Campaign readiness is missing stage ${stage}.`);
    if (evidence.applicationCommitSha !== applicationCommitSha) {
      throw new Error("Campaign readiness contains mixed application lineage.");
    }
    return evidence;
  });
  const source = ordered[0].source;
  if (
    ordered.some(
      (entry) =>
        entry.source.repository !== source.repository ||
        entry.source.runId !== source.runId ||
        entry.source.runAttempt !== source.runAttempt ||
        entry.source.sourceCommitSha !== source.sourceCommitSha ||
        entry.source.sourceRef !== source.sourceRef ||
        entry.source.workflowPath !== source.workflowPath
    )
  ) {
    throw new Error("Campaign readiness stages do not come from one exact workflow run.");
  }
  const assemblyTime = checkedAt.toISOString();
  const checkedMillis = checkedAt.valueOf();
  if (
    ordered.some((entry) => {
      const stageTime = Date.parse(entry.checkedAt);
      return stageTime > checkedMillis || checkedMillis - stageTime > 4 * 60 * 60 * 1000;
    })
  ) {
    throw new Error("Campaign readiness stage evidence is stale or future-dated.");
  }
  const withoutDigest = {
    schemaVersion: FLOWCORDIA_LAUNCH_CAMPAIGN_SCHEMA_VERSION,
    kind: "flowcordia-launch-campaign-readiness",
    state: ordered.every((entry) => entry.state === "READY") ? "READY" : "BLOCKED",
    applicationCommitSha,
    checkedAt: assemblyTime,
    stages: ordered.map((entry) => ({
      stage: entry.stage,
      state: entry.state,
      environment: entry.source.environment,
      runner: entry.source.runner,
      checkedAt: entry.checkedAt,
      readyChecks: entry.checks.filter((check) => check.state === "READY").length,
      blockedChecks: entry.checks.filter((check) => check.state === "BLOCKED").length,
      evidenceSha256: entry.evidenceSha256,
    })),
    source: {
      repository: source.repository,
      workflowPath: source.workflowPath,
      runId: source.runId,
      runAttempt: source.runAttempt,
      sourceRef: source.sourceRef,
      sourceCommitSha: source.sourceCommitSha,
    },
  };
  rejectEvidenceSecrets(withoutDigest);
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaLaunchCampaignSha256(withoutDigest),
  };
}

async function writeAtomic(path, value) {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await chmod(temporary, 0o600);
  try {
    await link(temporary, output);
  } catch (error) {
    throw new Error("Readiness evidence output could not be committed atomically.", {
      cause: error,
    });
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function parseArgs(args) {
  const [command, ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument?.startsWith("--") || !rest[index + 1]) {
      throw new Error("Campaign readiness arguments are invalid.");
    }
    options[argument.slice(2)] = rest[index + 1];
    index += 1;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "stage") {
    const evidence = await createFlowcordiaLaunchCampaignStageEvidence({
      stage: options.stage,
      applicationCommitSha: options["application-sha"],
      environment: process.env,
      checkedAt: new Date(),
    });
    await writeAtomic(options.output, evidence);
    console.log(`${evidence.stage} campaign readiness: ${evidence.state}`);
    return;
  }
  if (command === "assemble") {
    const evidence = await assembleFlowcordiaLaunchCampaignEvidence({
      applicationCommitSha: options["application-sha"],
      evidenceRoot: resolve(options["evidence-root"]),
      checkedAt: new Date(),
    });
    await writeAtomic(options.output, evidence);
    console.log(`Launch campaign readiness: ${evidence.state}`);
    return;
  }
  throw new Error(
    "Usage: node scripts/flowcordia-launch-campaign-readiness.mjs <stage|assemble> ..."
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Campaign readiness failed safely.");
    process.exitCode = 1;
  });
}
