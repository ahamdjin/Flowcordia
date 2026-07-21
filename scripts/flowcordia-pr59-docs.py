from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


replace_once(
    "flowcordia/README.md",
    '''- [`runbooks/provider-readiness.md`](runbooks/provider-readiness.md) — live object-store access and explicitly confirmed product-email provider acceptance.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n''',
    '''- [`runbooks/provider-readiness.md`](runbooks/provider-readiness.md) — live object-store access and explicitly confirmed product-email provider acceptance.\n- [`runbooks/alert-readiness.md`](runbooks/alert-readiness.md) — protected alerts-worker Redis, production-channel, backlog, and fixed delivery-adapter canary.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n''',
)

replace_once(
    "flowcordia/product/capability-matrix.md",
    '''| Alerts | Existing email, Slack, and webhook alert channels | Inherited runtime |\n''',
    '''| Alerts | Existing email, Slack, and webhook alert channels plus protected readiness canary | Shared Redis options and delivery adapters, exact project/channel observation, production failure coverage, bounded backlog policy, one confirmed fixed canary, and redacted evidence delivered; queued-worker consumption, inbox visibility, downstream processing, and human escalation remain separate |\n''',
)
replace_once(
    "flowcordia/product/capability-matrix.md",
    '''| Provider readiness preflight | Existing object-store bucket and general product-email provider | Read-only bucket verification, explicit null/console-email rejection, object-first sequencing, one confirmed fixed email submission, fixed redacted states, and existing-client reuse delivered; inbox delivery, durable writes, alert channels, quotas, and retention remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration, live-dependency, database recovery, controlled-upgrade, and core provider-readiness gates plus install ordering delivered; broader provider health, automated mutation, HA, PITR, and DR remain planned |\n''',
    '''| Provider readiness preflight | Existing object-store bucket and general product-email provider | Read-only bucket verification, explicit null/console-email rejection, object-first sequencing, one confirmed fixed email submission, fixed redacted states, and existing-client reuse delivered; inbox delivery, durable writes, quotas, and retention remain separate |\n| Alert readiness canary | Existing alerts worker Redis, project alert channels, and email/Slack/webhook delivery adapters | Exact application/project/channel binding, production task/deployment-failure coverage, bounded pending backlog, one confirmed fixed canary, protected workflow, and redacted evidence delivered; queued-worker consumption, downstream visibility, acknowledgement, escalation, and load behavior remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration, live-dependency, database recovery, controlled-upgrade, provider-readiness, and alert-readiness gates plus install ordering delivered; automated mutation, HA, PITR, and DR remain planned |\n''',
)

replace_once(
    "flowcordia/product/release-readiness.md",
    '''| Core provider readiness | Implemented as a bounded manual preflight | Existing object-store client verifies bucket access without writes; existing general email client submits one fixed explicitly confirmed message; a configured release run remains required |\n| Installation and operations | Partial | Executed controlled migrations, broader provider health, durable object-write proof, inbox/deliverability evidence, PITR, off-site recovery, automated upgrades, alerts, and connected release evidence remain required |\n''',
    '''| Core provider readiness | Implemented as a bounded manual preflight | Existing object-store client verifies bucket access without writes; existing general email client submits one fixed explicitly confirmed message; a configured release run remains required |\n| Alert readiness | Implemented as a protected bounded canary | Existing alerts-worker Redis and one exact production email, Slack, or webhook channel must satisfy failure coverage and backlog policy before accepting one fixed canary; a configured protected run remains required |\n| Installation and operations | Partial | Executed controlled migrations, durable object-write proof, inbox/deliverability evidence, queued alert-worker consumption, human acknowledgement/escalation, PITR, off-site recovery, automated upgrades, and connected release evidence remain required |\n''',
)
replace_once(
    "flowcordia/product/release-readiness.md",
    '''- core provider readiness is blocked or unavailable for the exact release application;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n''',
    '''- core provider readiness is blocked or unavailable for the exact release application;\n- alert readiness is blocked or unavailable for the exact release application and selected production channel;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n''',
)
replace_once(
    "flowcordia/product/release-readiness.md",
    '''- Provider readiness proves point-in-time bucket access and email-provider acceptance through inherited clients. It does not prove durable object writes, inbox delivery, deliverability, alert transport, provider quotas, retention, or disaster recovery.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n''',
    '''- Provider readiness proves point-in-time bucket access and general product-email provider acceptance through inherited clients. It does not prove durable object writes, inbox delivery, quotas, retention, or disaster recovery.\n- Alert readiness proves point-in-time alerts-worker Redis reachability, exact production channel/backlog readiness, and direct acceptance of one fixed canary through the existing alert email, Slack, or webhook adapter. It does not prove queued-worker consumption, inbox or Slack visibility, downstream webhook processing, acknowledgement, escalation, or incident response.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n''',
)

replace_once(
    "flowcordia/product/roadmap.md",
    '''- Existing-client provider readiness for read-only object-store bucket access and one explicitly confirmed general product-email acceptance send. — delivered; inbox delivery, durable object write/read/delete, alert channels, provider quotas, and retention remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n''',
    '''- Existing-client provider readiness for read-only object-store bucket access and one explicitly confirmed general product-email acceptance send. — delivered; inbox delivery, durable object write/read/delete, provider quotas, and retention remain\n- Protected alert readiness for the inherited alerts-worker Redis, one exact production channel, pending-backlog policy, and one explicitly confirmed fixed email/Slack/webhook canary. — delivered; queued-worker consumption, downstream visibility, acknowledgement, escalation, and incident drills remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n''',
)

replace_once(
    "flowcordia/connections/README.md",
    '''| Provider readiness preflight | Existing packet `ObjectStoreClient` and general product `EmailClient` | Verify bucket access without object mutation, then submit one explicitly authorized fixed email only after all read-only gates pass | Schema `0.1` object-first CLI implemented with null-transport rejection, fixed projections, and no provider-value output; a configured run remains mandatory |\n| Operations-readiness command | Durable worker heartbeat, proposal outbox, reconciliation schedules, and proposal aggregates | Produce one authenticated release snapshot for the selected tenant/project/repository without claiming work or exposing operational secrets | Repeatable-read, retry-aware, browser-bounded query implemented |\n''',
    '''| Provider readiness preflight | Existing packet `ObjectStoreClient` and general product `EmailClient` | Verify bucket access without object mutation, then submit one explicitly authorized fixed email only after all read-only gates pass | Schema `0.1` object-first CLI implemented with null-transport rejection, fixed projections, and no provider-value output; a configured run remains mandatory |\n| Alert readiness preflight | Existing alerts-worker Redis, project alert channel, and alert email/Slack/webhook adapters | Prove exact deployed identity, worker queue reachability, production failure coverage, bounded backlog, and one explicitly confirmed fixed canary without serializing delivery targets | Schema `0.1` protected main-only canary implemented; direct adapter acceptance is preserved while queued-worker consumption and human response remain separate |\n| Operations-readiness command | Durable worker heartbeat, proposal outbox, reconciliation schedules, and proposal aggregates | Produce one authenticated release snapshot for the selected tenant/project/repository without claiming work or exposing operational secrets | Repeatable-read, retry-aware, browser-bounded query implemented |\n''',
)
replace_once(
    "flowcordia/connections/README.md",
    '''| Alert delivery | Alert email client | Keep operational alerts separate from product email | Existing; test action deferred |\n| Object storage configuration | Packet/output storage | Store large payloads and outputs outside normal database rows | Existing foundation; live test deferred |\n''',
    '''| Alert delivery | Alert email, Slack, and signed-webhook adapters | Keep operational alert transports separate from product email while reusing the same adapters for one protected canary | Existing delivery service now shares adapters with the protected readiness canary; queued-worker consumption and human response remain separate evidence |\n| Object storage configuration | Packet/output storage | Store large payloads and outputs outside normal database rows | Existing foundation with read-only live bucket verification; durable write/read/delete proof remains separate |\n''',
)
