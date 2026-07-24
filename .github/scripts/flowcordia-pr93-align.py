from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} match, found {count}")
    return text.replace(old, new)


script = Path("scripts/flowcordia-launch-campaign-readiness.mjs")
text = script.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''function exactBoolean(value) {
  return ["0", "1", "true", "false"].includes(String(value ?? "").toLowerCase());
}

''',
    "",
    "obsolete boolean helper",
)
text = replace_once(
    text,
    '''function postgresUrl(value) {
  if (!boundedString(value, 12, 8192)) return false;
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function redisHost(value) {''',
    '''function httpServiceUrl(value, allowCredentials = false) {
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

function redisHost(value) {''',
    "service URL helpers",
)
text = replace_once(
    text,
    '''      parsed.cookies.length < 1 ||
      parsed.origins.length < 1
''',
    '''      parsed.cookies.length + parsed.origins.length < 1
''',
    "storage-state session boundary",
)
start = text.index('function emailProviderReady(environment, prefix = "") {')
end = text.index('\nfunction proposalWorkerReady(environment) {', start)
replacement = '''function pairedOptionalCredentials(user, password) {
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
  const staticCredentials =
    boundedString(access, 3, 512) && boundedSecret(secret, 8, 4096);
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
  const concurrencyLimit = integerSetting(
    environment.ALERTS_WORKER_CONCURRENCY_LIMIT,
    10,
    1,
    1000
  );
  const pollInterval = integerSetting(
    environment.ALERTS_WORKER_POLL_INTERVAL,
    1000,
    50,
    60000
  );
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
'''
text = text[:start] + replacement + text[end:]
text = replace_once(
    text,
    '''  if (stage === "alert") {
    const workerNumbers = [
      "ALERTS_WORKER_CONCURRENCY_WORKERS",
      "ALERTS_WORKER_CONCURRENCY_TASKS_PER_WORKER",
      "ALERTS_WORKER_CONCURRENCY_LIMIT",
      "ALERTS_WORKER_POLL_INTERVAL",
      "ALERTS_WORKER_SHUTDOWN_TIMEOUT_MS",
    ];
    checks.push(''',
    '''  if (stage === "alert") {
    const worker = alertWorkerConfiguration(environment);
    checks.push(''',
    "alert worker defaults",
)
text = replace_once(
    text,
    '''        safeHttpsUrl(environment.APP_ORIGIN) &&
          safeHttpsUrl(environment.DEPLOY_REGISTRY_HOST) &&
          safeHttpsUrl(environment.V4_DEPLOY_REGISTRY_HOST) &&
          boundedString(environment.CLICKHOUSE_URL, 8, 4096),''',
    '''        safeHttpsUrl(environment.APP_ORIGIN) &&
          registryHost(environment.DEPLOY_REGISTRY_HOST) &&
          registryHost(environment.V4_DEPLOY_REGISTRY_HOST) &&
          httpServiceUrl(environment.CLICKHOUSE_URL, true),''',
    "alert dependency shapes",
)
text = replace_once(
    text,
    '''        redisHost(environment.ALERTS_WORKER_REDIS_HOST) &&
          positiveIntegerString(environment.ALERTS_WORKER_REDIS_PORT, 1, 65535) &&
          exactBoolean(environment.ALERTS_WORKER_REDIS_TLS_DISABLED) &&
          boundedSecret(environment.ALERTS_WORKER_REDIS_PASSWORD, 8, 4096),''',
    "        worker.redisReady,",
    "alert Redis defaults",
)
text = replace_once(
    text,
    '''        workerNumbers.every((key) => positiveIntegerString(environment[key], 1, 86_400_000)),''',
    "        worker.limitsReady,",
    "alert worker limit defaults",
)
text = replace_once(
    text,
    '''        "A supported alert delivery transport is configured.",
        "No supported alert delivery transport is fully configured."''',
    '''        "Any configured global alert email transport is complete.",
        "The configured global alert email transport is incomplete or unsupported."''',
    "optional global alert transport",
)
script.write_text(text, encoding="utf-8")

workflow = Path(".github/workflows/flowcordia-launch-campaign-readiness.yml")
lines = workflow.read_text(encoding="utf-8").splitlines()

def insert_after_once(lines: list[str], needle: str, additions: list[str], label: str) -> list[str]:
    indexes = [index for index, line in enumerate(lines) if line == needle]
    if len(indexes) != 1:
        raise SystemExit(f"Expected one {label} line, found {len(indexes)}")
    index = indexes[0]
    return lines[: index + 1] + additions + lines[index + 1 :]

lines = insert_after_once(
    lines,
    "      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}",
    [
        "      AWS_SESSION_TOKEN: ${{ secrets.AWS_SESSION_TOKEN }}",
        "      OBJECT_STORE_DEFAULT_PROTOCOL: ${{ vars.OBJECT_STORE_DEFAULT_PROTOCOL }}",
    ],
    "provider AWS credential",
)
lines = insert_after_once(
    lines,
    "      CLICKHOUSE_URL: ${{ secrets.CLICKHOUSE_URL }}",
    ['      ALERTS_WORKER_ENABLED: "true"'],
    "alert ClickHouse configuration",
)
lines = insert_after_once(
    lines,
    "      ALERTS_WORKER_REDIS_PORT: ${{ vars.ALERTS_WORKER_REDIS_PORT }}",
    ["      ALERTS_WORKER_REDIS_USERNAME: ${{ secrets.ALERTS_WORKER_REDIS_USERNAME }}"],
    "alert Redis port",
)
alert_region_pair = [
    "      ALERT_SMTP_PASSWORD: ${{ secrets.ALERT_SMTP_PASSWORD }}",
    "      AWS_REGION: ${{ vars.AWS_REGION }}",
]
found = False
for index in range(len(lines) - 1):
    if lines[index : index + 2] == alert_region_pair:
        del lines[index + 1]
        found = True
        break
if not found:
    raise SystemExit("Expected one alert AWS region line")
workflow.write_text("\n".join(lines) + "\n", encoding="utf-8")

test = Path("apps/webapp/test/flowcordia/launchCampaignReadiness.test.ts")
test_text = test.read_text(encoding="utf-8")
marker = '  it("returns bounded BLOCKED evidence for invalid browser configuration", async () => {'
addition = '''  it("accepts host-style registries and official alert-worker defaults", async () => {
    const evidence = await createFlowcordiaLaunchCampaignStageEvidence({
      stage: "alert",
      applicationCommitSha,
      environment: {
        ...baseEnvironment("alert"),
        FLOWCORDIA_APPLICATION_COMMIT_SHA: applicationCommitSha,
        DATABASE_URL: "postgresql://flowcordia:private@db.example.com:5432/flowcordia",
        DIRECT_URL: "postgresql://flowcordia:private@db.example.com:5432/flowcordia",
        APP_ORIGIN: "https://app.example.com",
        DEPLOY_REGISTRY_HOST: "registry.example.com:5000",
        V4_DEPLOY_REGISTRY_HOST: "v4.registry.example.com",
        CLICKHOUSE_URL: "https://default:private@clickhouse.example.com:8443",
        ALERTS_WORKER_ENABLED: "true",
        ALERTS_WORKER_REDIS_HOST: "redis.example.com",
      },
      checkedAt,
    });

    expect(evidence.state).toBe("READY");
    for (const key of [
      "application_dependencies",
      "worker_redis",
      "worker_limits",
      "alert_transport",
    ]) {
      expect(evidence.checks.find((check) => check.key === key)).toMatchObject({ state: "READY" });
    }
  });

  it("accepts cookie-only authenticated Playwright storage state", async () => {
    const cookieOnly = Buffer.from(
      JSON.stringify({
        cookies: [{ name: "session", value: "private-session", domain: "example.com", path: "/" }],
        origins: [],
      })
    ).toString("base64");
    const evidence = await createFlowcordiaLaunchCampaignStageEvidence({
      stage: "promotion",
      applicationCommitSha,
      environment: {
        ...baseEnvironment("promotion"),
        FLOWCORDIA_ACCEPTANCE_BASE_URL: "https://app.example.com",
        FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_B64: cookieOnly,
      },
      checkedAt,
    });

    expect(evidence.state).toBe("READY");
    expect(JSON.stringify(evidence)).not.toContain("private-session");
  });

'''
test_text = replace_once(test_text, marker, addition + marker, "alignment test insertion")
test.write_text(test_text, encoding="utf-8")

runbook = Path("flowcordia/runbooks/launch-campaign-readiness.md")
runbook_text = runbook.read_text(encoding="utf-8")
runbook_text = replace_once(
    runbook_text,
    "| Alert | `flowcordia-alert-readiness` | Exact application, database/deployment dependencies, alerts-worker Redis, bounded worker limits, supported alert transport |",
    "| Alert | `flowcordia-alert-readiness` | Exact application, host-style deployment registries, credential-bearing ClickHouse URL shape, alerts-worker Redis and official defaulted limits, plus any configured global email transport; the selected Slack/webhook/email channel remains database-bound |",
    "alert runbook row",
)
runbook.write_text(runbook_text, encoding="utf-8")
