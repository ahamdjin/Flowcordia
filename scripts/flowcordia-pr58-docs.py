from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


replace_once(
    "package.json",
    '    "flowcordia:upgrade:preflight": "tsx scripts/flowcordia-upgrade-preflight.ts",\n',
    '    "flowcordia:upgrade:preflight": "tsx scripts/flowcordia-upgrade-preflight.ts",\n    "flowcordia:providers:preflight": "pnpm --filter webapp exec tsx scripts/flowcordia-provider-preflight.ts",\n',
)

replace_once(
    "flowcordia/README.md",
    "- [`runbooks/controlled-upgrades.md`](runbooks/controlled-upgrades.md) — checksum-bound application and schema upgrade decision plus rollout order.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
    "- [`runbooks/controlled-upgrades.md`](runbooks/controlled-upgrades.md) — checksum-bound application and schema upgrade decision plus rollout order.\n- [`runbooks/provider-readiness.md`](runbooks/provider-readiness.md) — live object-store access and explicitly confirmed product-email provider acceptance.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
)

replace_once(
    "flowcordia/connections/README.md",
    "| Controlled upgrade preflight | Candidate release configuration, live Prisma migration history, candidate migration files, and recovery evidence | Classify an application-only or append-only schema transition and emit one deterministic worker/web/migration sequence before mutation | Read-only schema `0.1` CLI with exact checksum-prefix, evidence-age, acknowledgement, and redaction checks implemented |\n",
    "| Controlled upgrade preflight | Candidate release configuration, live Prisma migration history, candidate migration files, and recovery evidence | Classify an application-only or append-only schema transition and emit one deterministic worker/web/migration sequence before mutation | Read-only schema `0.1` CLI with exact checksum-prefix, evidence-age, acknowledgement, and redaction checks implemented |\n| Provider readiness preflight | Existing packet `ObjectStoreClient` and general product `EmailClient` | Verify bucket access without object mutation, then submit one explicitly authorized fixed email only after all read-only gates pass | Schema `0.1` object-first CLI implemented with null-transport rejection, fixed projections, and no provider-value output; a configured run remains mandatory |\n",
)

replace_once(
    "flowcordia/product/capability-matrix.md",
    "| Controlled upgrade preflight | Exact current/candidate revisions, live/candidate Prisma checksum history, recovery evidence, and operator acknowledgements | Application-only and append-only-migration classification, no-rewrite prefix enforcement, bounded evidence age, worker-first rollout order, and restore-recovery boundary delivered; automated mutation and backward-compatibility proof remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration, live-dependency, database recovery, and controlled-upgrade gates plus install ordering delivered; broader provider health, automated mutation, HA, PITR, and DR remain planned |\n",
    "| Controlled upgrade preflight | Exact current/candidate revisions, live/candidate Prisma checksum history, recovery evidence, and operator acknowledgements | Application-only and append-only-migration classification, no-rewrite prefix enforcement, bounded evidence age, worker-first rollout order, and restore-recovery boundary delivered; automated mutation and backward-compatibility proof remain separate |\n| Provider readiness preflight | Existing object-store bucket and general product-email provider | Read-only bucket verification, explicit null/console-email rejection, object-first sequencing, one confirmed fixed email submission, fixed redacted states, and existing-client reuse delivered; inbox delivery, durable writes, alert channels, quotas, and retention remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration, live-dependency, database recovery, controlled-upgrade, and core provider-readiness gates plus install ordering delivered; broader provider health, automated mutation, HA, PITR, and DR remain planned |\n",
)

replace_once(
    "flowcordia/product/roadmap.md",
    "- Non-destructive live dependency preflight for the PostgreSQL writer, exact migration set, GitHub App identity, and durable proposal-worker heartbeat. — delivered; repository scope, object storage, email, broader runtime health, and automated upgrades remain\n",
    "- Non-destructive live dependency preflight for the PostgreSQL writer, exact migration set, GitHub App identity, and durable proposal-worker heartbeat. — delivered; repository scope and broader runtime health remain\n",
)
replace_once(
    "flowcordia/product/roadmap.md",
    "- Read-only controlled upgrade decision for exact application revisions, checksum-bound Prisma history, recovery evidence, acknowledgements, and worker-first rollout. — delivered; automated mutation and explicit cross-version database compatibility remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
    "- Read-only controlled upgrade decision for exact application revisions, checksum-bound Prisma history, recovery evidence, acknowledgements, and worker-first rollout. — delivered; automated mutation and explicit cross-version database compatibility remain\n- Existing-client provider readiness for read-only object-store bucket access and one explicitly confirmed general product-email acceptance send. — delivered; inbox delivery, durable object write/read/delete, alert channels, provider quotas, and retention remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
)

replace_once(
    "flowcordia/product/release-readiness.md",
    "| Controlled upgrade decision | Implemented as a read-only preflight | Exact current/candidate revisions, checksum-bound migration prefix, fresh recovery evidence for schema changes, operator acknowledgements, and deterministic rollout phases |\n| Installation and operations | Partial | Executed controlled migrations, broader provider health, PITR, off-site recovery, automated upgrades, alerts, and connected release evidence remain required |\n",
    "| Controlled upgrade decision | Implemented as a read-only preflight | Exact current/candidate revisions, checksum-bound migration prefix, fresh recovery evidence for schema changes, operator acknowledgements, and deterministic rollout phases |\n| Core provider readiness | Implemented as a bounded manual preflight | Existing object-store client verifies bucket access without writes; existing general email client submits one fixed explicitly confirmed message; a configured release run remains required |\n| Installation and operations | Partial | Executed controlled migrations, broader provider health, durable object-write proof, inbox/deliverability evidence, PITR, off-site recovery, automated upgrades, alerts, and connected release evidence remain required |\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- the controlled upgrade preflight is blocked or unavailable for the exact current/candidate transition;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
    "- the controlled upgrade preflight is blocked or unavailable for the exact current/candidate transition;\n- core provider readiness is blocked or unavailable for the exact release application;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- Controlled upgrade preflight proves one observed live migration history is an exact checksum-bound prefix of the candidate and that required evidence and acknowledgements exist. It does not mutate the installation, prove supplied current application identity, or prove backward database compatibility.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
    "- Controlled upgrade preflight proves one observed live migration history is an exact checksum-bound prefix of the candidate and that required evidence and acknowledgements exist. It does not mutate the installation, prove supplied current application identity, or prove backward database compatibility.\n- Provider readiness proves point-in-time bucket access and email-provider acceptance through inherited clients. It does not prove durable object writes, inbox delivery, deliverability, alert transport, provider quotas, retention, or disaster recovery.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
)

replace_once(
    "flowcordia/runbooks/installation-preflight.md",
    "11. Run repository readiness, operations readiness, private-beta author acceptance, connected preview, promotion, production, and rollback evidence as required by the maturity gate.\n12. Accept the upgrade only after the exact final application head has preserved evidence.\n",
    "11. Run core provider readiness with a controlled operator mailbox and require `READY`.\n12. Run repository readiness, operations readiness, private-beta author acceptance, connected preview, promotion, production, and rollback evidence as required by the maturity gate.\n13. Accept the upgrade only after the exact final application head has preserved evidence.\n",
)

replace_once(
    "flowcordia/runbooks/controlled-upgrades.md",
    "5. require release live-dependency, repository-readiness, and operations-readiness checks;\n6. complete connected acceptance.\n",
    "5. require release live-dependency, provider-readiness, repository-readiness, and operations-readiness checks;\n6. complete connected acceptance.\n",
)
replace_once(
    "flowcordia/runbooks/controlled-upgrades.md",
    "8. require release live-dependency, repository-readiness, and operations-readiness checks;\n9. complete connected acceptance;\n",
    "8. require release live-dependency, provider-readiness, repository-readiness, and operations-readiness checks;\n9. complete connected acceptance;\n",
)
