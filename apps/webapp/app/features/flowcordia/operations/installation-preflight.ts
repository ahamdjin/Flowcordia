export const FLOWCORDIA_INSTALLATION_PROFILES = ["web", "worker", "release"] as const;

export type FlowcordiaInstallationProfile = (typeof FLOWCORDIA_INSTALLATION_PROFILES)[number];
export type FlowcordiaInstallationCheckState = "READY" | "BLOCKED";

export interface FlowcordiaInstallationCheck {
  key:
    | "runtime"
    | "database"
    | "application"
    | "github_app"
    | "web_secrets"
    | "origins"
    | "environment"
    | "studio_rollout"
    | "worker"
    | "worker_delivery"
    | "worker_limits";
  state: FlowcordiaInstallationCheckState;
  message: string;
}

export interface FlowcordiaInstallationProjection {
  schemaVersion: "0.1";
  profile: FlowcordiaInstallationProfile;
  state: FlowcordiaInstallationCheckState;
  message: string;
  checkedAt: string;
  checks: FlowcordiaInstallationCheck[];
}

export interface FlowcordiaInstallationPreflightInput {
  environment: Record<string, string | undefined>;
  profile: FlowcordiaInstallationProfile;
  nodeVersion: string;
  checkedAt: Date;
  allowGlobalStudio?: boolean;
}

const APPLICATION_SHA = /^[0-9a-f]{40}$/;
const ENCRYPTION_KEY = /^[0-9a-f]{32}$/i;
const GITHUB_APP_ID = /^[1-9][0-9]{0,19}$/;
const GITHUB_APP_SLUG = /^[a-z0-9][a-z0-9-]{1,99}$/;
const PRIVATE_KEY_LABELS = ["PRIVATE KEY", "RSA PRIVATE KEY"] as const;
const PLACEHOLDER =
  /abcdef1234|change[-_ ]?me|replace[-_ ]?me|example[-_ ]?secret|test[-_ ]?secret/i;

function value(environment: Record<string, string | undefined>, key: string): string {
  return environment[key]?.trim() ?? "";
}

function check(
  key: FlowcordiaInstallationCheck["key"],
  ready: boolean,
  readyMessage: string,
  blockedMessage: string
): FlowcordiaInstallationCheck {
  return {
    key,
    state: ready ? "READY" : "BLOCKED",
    message: ready ? readyMessage : blockedMessage,
  };
}

function validSecret(secret: string, minimumLength = 32): boolean {
  return secret.length >= minimumLength && !PLACEHOLDER.test(secret);
}

function validApplicationSha(input: string): boolean {
  return APPLICATION_SHA.test(input) && !/^([0-9a-f])\1{39}$/.test(input);
}

function validDatabaseUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return (
      ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      Boolean(parsed.hostname) &&
      Boolean(parsed.username) &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

function validOrigin(input: string, release: boolean): boolean {
  try {
    const parsed = new URL(input);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    const protocolAllowed = release
      ? parsed.protocol === "https:"
      : parsed.protocol === "https:" || (parsed.protocol === "http:" && local);
    return (
      protocolAllowed &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

function validHttpsEndpoint(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash;
  } catch {
    return false;
  }
}

function validPrivateKey(input: string): boolean {
  const normalized = input.replace(/\\n/g, "\n").trim();
  if (normalized.length < 128) return false;
  return PRIVATE_KEY_LABELS.some(
    (label) =>
      normalized.startsWith(`-----BEGIN ${label}-----`) &&
      normalized.endsWith(`-----END ${label}-----`)
  );
}

function integerWithin(
  environment: Record<string, string | undefined>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
): number | null {
  const raw = value(environment, key);
  if (!raw) return fallback;
  if (!/^[0-9]+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function environmentCheck(
  input: FlowcordiaInstallationPreflightInput
): FlowcordiaInstallationCheck {
  const appEnvironment = value(input.environment, "APP_ENV");
  const nodeEnvironment = value(input.environment, "NODE_ENV");
  const ready =
    input.profile === "release"
      ? appEnvironment === "production" && nodeEnvironment === "production"
      : ["development", "staging", "production"].includes(appEnvironment) &&
        ["development", "test", "production"].includes(nodeEnvironment);
  return check(
    "environment",
    ready,
    "Application and Node environments match the selected deployment profile.",
    "Application and Node environments do not match the selected deployment profile."
  );
}

function workerLimitCheck(
  environment: Record<string, string | undefined>
): FlowcordiaInstallationCheck {
  const poll = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_WORKER_POLL_INTERVAL_MS",
    5_000,
    1_000,
    60_000
  );
  const shutdown = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_WORKER_SHUTDOWN_GRACE_MS",
    30_000,
    5_000,
    300_000
  );
  const eventTimeout = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_EVENT_TIMEOUT_MS",
    5_000,
    1_000,
    60_000
  );
  const outboxBatch = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_OUTBOX_BATCH_SIZE",
    10,
    1,
    100
  );
  const outboxLease = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_OUTBOX_LEASE_MS",
    60_000,
    10_000,
    900_000
  );
  const reconciliationBatch = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_BATCH_SIZE",
    5,
    1,
    100
  );
  const reconciliationLease = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_LEASE_MS",
    120_000,
    10_000,
    1_800_000
  );
  const reconciliationStale = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_STALE_MS",
    300_000,
    30_000,
    86_400_000
  );
  const reconciliationRefresh = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_RECONCILIATION_REFRESH_MS",
    900_000,
    60_000,
    604_800_000
  );
  const githubTimeout = integerWithin(
    environment,
    "FLOWCORDIA_PROPOSAL_GITHUB_TIMEOUT_MS",
    15_000,
    1_000,
    60_000
  );
  const values = [
    poll,
    shutdown,
    eventTimeout,
    outboxBatch,
    outboxLease,
    reconciliationBatch,
    reconciliationLease,
    reconciliationStale,
    reconciliationRefresh,
    githubTimeout,
  ];
  const ready =
    values.every((entry) => entry !== null) &&
    poll !== null &&
    shutdown !== null &&
    eventTimeout !== null &&
    outboxLease !== null &&
    reconciliationLease !== null &&
    reconciliationStale !== null &&
    reconciliationRefresh !== null &&
    githubTimeout !== null &&
    outboxLease > eventTimeout &&
    outboxLease > poll &&
    reconciliationLease > githubTimeout &&
    shutdown >= eventTimeout &&
    shutdown >= githubTimeout &&
    reconciliationStale >= reconciliationLease &&
    reconciliationRefresh >= reconciliationStale;
  return check(
    "worker_limits",
    ready,
    "Proposal worker timing, batch, timeout, and lease settings are bounded and internally ordered.",
    "Proposal worker timing, batch, timeout, or lease settings are invalid or internally inconsistent."
  );
}

export function presentFlowcordiaInstallationPreflight(
  input: FlowcordiaInstallationPreflightInput
): FlowcordiaInstallationProjection {
  if (!FLOWCORDIA_INSTALLATION_PROFILES.includes(input.profile)) {
    throw new TypeError("Flowcordia installation profile is invalid.");
  }
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Flowcordia installation check time is invalid.");
  }

  const environment = input.environment;
  const release = input.profile === "release";
  const checks: FlowcordiaInstallationCheck[] = [
    check(
      "runtime",
      input.nodeVersion === "20.20.2",
      "Node.js matches the repository-pinned runtime.",
      "Node.js does not match the repository-pinned runtime."
    ),
    check(
      "database",
      validDatabaseUrl(value(environment, "DATABASE_URL")) &&
        validDatabaseUrl(value(environment, "DIRECT_URL")),
      "Primary and direct PostgreSQL connection URLs are structurally valid.",
      "Primary or direct PostgreSQL connection configuration is missing or invalid."
    ),
    check(
      "application",
      validApplicationSha(value(environment, "FLOWCORDIA_APPLICATION_COMMIT_SHA")),
      "The deployed Flowcordia application commit is an exact bounded revision.",
      "The deployed Flowcordia application commit is missing, malformed, or a placeholder."
    ),
    check(
      "github_app",
      value(environment, "GITHUB_APP_ENABLED") === "1" &&
        GITHUB_APP_ID.test(value(environment, "GITHUB_APP_ID")) &&
        validPrivateKey(value(environment, "GITHUB_APP_PRIVATE_KEY")) &&
        validSecret(value(environment, "GITHUB_APP_WEBHOOK_SECRET")) &&
        GITHUB_APP_SLUG.test(value(environment, "GITHUB_APP_SLUG")),
      "GitHub App installation credentials have the required non-sensitive shape.",
      "GitHub App installation configuration is disabled, incomplete, malformed, or placeholder-backed."
    ),
    environmentCheck(input),
  ];

  if (input.profile === "web" || release) {
    checks.push(
      check(
        "web_secrets",
        validSecret(value(environment, "SESSION_SECRET")) &&
          validSecret(value(environment, "MAGIC_LINK_SECRET")) &&
          ENCRYPTION_KEY.test(value(environment, "ENCRYPTION_KEY")) &&
          !/^([0-9a-f])\1{31}$/i.test(value(environment, "ENCRYPTION_KEY")),
        "Session, magic-link, and encryption secrets have production-safe shapes.",
        "Session, magic-link, or encryption secret configuration is missing, malformed, or placeholder-backed."
      ),
      check(
        "origins",
        validOrigin(value(environment, "APP_ORIGIN"), release) &&
          validOrigin(value(environment, "LOGIN_ORIGIN"), release),
        "Application and login origins are bounded and valid for the selected profile.",
        "Application or login origin is invalid or unsafe for the selected profile."
      )
    );

    const studioValue = value(environment, "FLOWCORDIA_STUDIO_ENABLED").toLowerCase();
    const studioDisabled = !studioValue || studioValue === "0" || studioValue === "false";
    const studioExplicitlyAllowed =
      input.allowGlobalStudio === true && (studioValue === "1" || studioValue === "true");
    checks.push(
      check(
        "studio_rollout",
        studioDisabled || studioExplicitlyAllowed,
        studioDisabled
          ? "Global Studio access remains disabled for controlled organization rollout."
          : "Global Studio access was explicitly accepted for this preflight invocation.",
        "Global Studio access is enabled without an explicit preflight override."
      )
    );
  }

  if (input.profile === "worker" || release) {
    checks.push(
      check(
        "worker",
        ["1", "true"].includes(
          value(environment, "FLOWCORDIA_PROPOSAL_WORKER_ENABLED").toLowerCase()
        ),
        "The dedicated proposal operations worker is explicitly enabled.",
        "The dedicated proposal operations worker is not explicitly enabled."
      ),
      check(
        "worker_delivery",
        validHttpsEndpoint(value(environment, "FLOWCORDIA_PROPOSAL_EVENT_URL")) &&
          validSecret(value(environment, "FLOWCORDIA_PROPOSAL_EVENT_SECRET")),
        "The proposal event endpoint and signing secret have safe deployment shapes.",
        "The proposal event endpoint or signing secret is missing, unsafe, malformed, or placeholder-backed."
      ),
      workerLimitCheck(environment)
    );
  }

  const state: FlowcordiaInstallationCheckState = checks.some((entry) => entry.state === "BLOCKED")
    ? "BLOCKED"
    : "READY";
  return {
    schemaVersion: "0.1",
    profile: input.profile,
    state,
    message:
      state === "READY"
        ? "Flowcordia installation configuration is ready for connected dependency checks."
        : "Flowcordia installation configuration is blocked before connected dependency checks.",
    checkedAt: input.checkedAt.toISOString(),
    checks,
  };
}
