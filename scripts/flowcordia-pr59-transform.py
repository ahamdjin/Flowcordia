from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


def remove_between(path: str, start: str, end: str) -> None:
    file = Path(path)
    content = file.read_text()
    start_index = content.find(start)
    end_index = content.find(end, start_index + len(start))
    if start_index < 0 or end_index < 0:
        raise SystemExit(f"{path}: method removal anchors missing: {start!r} -> {end!r}")
    file.write_text(content[:start_index] + content[end_index:])


replace_once(
    "apps/webapp/app/services/email.server.ts",
    '''export async function sendPlainTextEmail(options: SendPlainTextOptions) {\n  return client.sendPlainText(options);\n}\n\nexport async function sendEmail(data: DeliverEmail) {\n''',
    '''export async function sendPlainTextEmail(options: SendPlainTextOptions) {\n  return client.sendPlainText(options);\n}\n\nexport async function sendAlertPlainTextEmail(options: SendPlainTextOptions) {\n  return alertsClient.sendPlainText(options);\n}\n\nexport async function sendEmail(data: DeliverEmail) {\n''',
)

replace_once(
    "apps/webapp/app/v3/alertsWorker.server.ts",
    '''import { env } from "~/env.server";\nimport { logger } from "~/services/logger.server";\n''',
    '''import { env } from "~/env.server";\nimport { logger } from "~/services/logger.server";\nimport { alertsWorkerRedisOptions } from "~/v3/alertsWorkerOptions.server";\n''',
)
replace_once(
    "apps/webapp/app/v3/alertsWorker.server.ts",
    '''  const redisOptions = {\n    keyPrefix: "alerts:worker:",\n    host: env.ALERTS_WORKER_REDIS_HOST,\n    port: env.ALERTS_WORKER_REDIS_PORT,\n    username: env.ALERTS_WORKER_REDIS_USERNAME,\n    password: env.ALERTS_WORKER_REDIS_PASSWORD,\n    enableAutoPipelining: true,\n    ...(env.ALERTS_WORKER_REDIS_TLS_DISABLED === "true" ? {} : { tls: {} }),\n  };\n''',
    '''  const redisOptions = alertsWorkerRedisOptions(env);\n''',
)

replace_once(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    '''import {\n  type ChatPostMessageArguments,\n  ErrorCode,\n  type WebAPIHTTPError,\n  type WebAPIPlatformError,\n  type WebAPIRateLimitedError,\n  type WebAPIRequestError,\n} from "@slack/web-api";\n''',
    '''''',
)
replace_once(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    '''import { subtle } from "crypto";\n''',
    '''''',
)
replace_once(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    '''import {\n  isIntegrationForService,\n  type OrganizationIntegrationForService,\n  OrgIntegrationRepository,\n} from "~/models/orgIntegration.server";\n''',
    '''import { isIntegrationForService } from "~/models/orgIntegration.server";\n''',
)
replace_once(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    '''import { decryptSecret } from "~/services/secrets/secretStore.server";\n''',
    '''''',
)
replace_once(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    '''import { CURRENT_API_VERSION } from "~/api/versions";\n''',
    '''import { CURRENT_API_VERSION } from "~/api/versions";\nimport {\n  AlertDeliveryNoRetryError,\n  deliverAlertWebhook,\n  postAlertSlackMessage,\n} from "./alertDeliveryAdapters.server";\n''',
)
replace_once(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    '''class SkipRetryError extends Error {}\n\n''',
    '''''',
)
replace_once(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    '''      if (error instanceof SkipRetryError) {\n''',
    '''      if (error instanceof AlertDeliveryNoRetryError) {\n''',
)

file = Path("apps/webapp/app/v3/services/alerts/deliverAlert.server.ts")
content = file.read_text()
if content.count("this.#deliverWebhook(") < 1 or content.count("this.#postSlackMessage(") < 1:
    raise SystemExit("deliverAlert.server.ts: expected alert adapter call anchors")
content = content.replace("this.#deliverWebhook(", "deliverAlertWebhook(")
content = content.replace("this.#postSlackMessage(", "postAlertSlackMessage(")
file.write_text(content)

remove_between(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    "  async #deliverWebhook<T>(",
    "  async #postSlackMessage(",
)
remove_between(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    "  async #postSlackMessage(",
    "  async #resolveDeploymentMetadata(",
)
remove_between(
    "apps/webapp/app/v3/services/alerts/deliverAlert.server.ts",
    "\nfunction isWebAPIPlatformError(",
    "\nfunction isWebAPIRateLimitedError(",
)
file = Path("apps/webapp/app/v3/services/alerts/deliverAlert.server.ts")
content = file.read_text()
start = content.find("\nfunction isWebAPIRateLimitedError(")
if start < 0:
    raise SystemExit("deliverAlert.server.ts: final Slack helper anchor missing")
file.write_text(content[:start] + "\n")

replace_once(
    "package.json",
    '''    "flowcordia:providers:preflight": "pnpm --filter webapp exec tsx scripts/flowcordia-provider-preflight.ts",\n''',
    '''    "flowcordia:providers:preflight": "pnpm --filter webapp exec tsx scripts/flowcordia-provider-preflight.ts",\n    "flowcordia:alerts:preflight": "pnpm --filter webapp exec tsx scripts/flowcordia-alert-preflight.ts",\n''',
)
