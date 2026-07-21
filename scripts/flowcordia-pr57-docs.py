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
    '    "flowcordia:db:restore-rehearsal": "tsx scripts/flowcordia-database-restore-rehearsal.ts",\n',
    '    "flowcordia:db:restore-rehearsal": "tsx scripts/flowcordia-database-restore-rehearsal.ts",\n    "flowcordia:upgrade:preflight": "tsx scripts/flowcordia-upgrade-preflight.ts",\n',
)

replace_once(
    "flowcordia/README.md",
    "- [`runbooks/database-backup-restore.md`](runbooks/database-backup-restore.md) — versioned PostgreSQL archive and isolated restore rehearsal.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
    "- [`runbooks/database-backup-restore.md`](runbooks/database-backup-restore.md) — versioned PostgreSQL archive and isolated restore rehearsal.\n- [`runbooks/controlled-upgrades.md`](runbooks/controlled-upgrades.md) — checksum-bound application and schema upgrade decision plus rollout order.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
)

replace_once(
    "flowcordia/connections/README.md",
    "| Database restore rehearsal | Disposable PostgreSQL administration endpoint | Restore an exact archive into a random temporary database, verify migration parity, destroy it, and emit bounded evidence | Isolated create/restore/verify/drop lifecycle implemented; a configured operator run remains mandatory |\n",
    "| Database restore rehearsal | Disposable PostgreSQL administration endpoint | Restore an exact archive into a random temporary database, verify migration parity, destroy it, and emit bounded evidence | Isolated create/restore/verify/drop lifecycle implemented; a configured operator run remains mandatory |\n| Controlled upgrade preflight | Candidate release configuration, live Prisma migration history, candidate migration files, and recovery evidence | Classify an application-only or append-only schema transition and emit one deterministic worker/web/migration sequence before mutation | Read-only schema `0.1` CLI with exact checksum-prefix, evidence-age, acknowledgement, and redaction checks implemented |\n",
)

replace_once(
    "flowcordia/product/capability-matrix.md",
    "| Database recovery proof | Versioned custom archive and disposable restore rehearsal | Exact application/migration binding, PostgreSQL major compatibility, no-overwrite atomic artifacts, archive inventory/digests, isolated restore, migration parity, cleanup, and redacted READY evidence delivered; PITR and cross-region DR remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration, live-dependency, and logical database recovery gates plus install/upgrade ordering delivered; broader provider health, automated upgrades, HA, PITR, and DR remain planned |\n",
    "| Database recovery proof | Versioned custom archive and disposable restore rehearsal | Exact application/migration binding, PostgreSQL major compatibility, no-overwrite atomic artifacts, archive inventory/digests, isolated restore, migration parity, cleanup, and redacted READY evidence delivered; PITR and cross-region DR remain separate |\n| Controlled upgrade preflight | Exact current/candidate revisions, live/candidate Prisma checksum history, recovery evidence, and operator acknowledgements | Application-only and append-only-migration classification, no-rewrite prefix enforcement, bounded evidence age, worker-first rollout order, and restore-recovery boundary delivered; automated mutation and backward-compatibility proof remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration, live-dependency, database recovery, and controlled-upgrade gates plus install ordering delivered; broader provider health, automated mutation, HA, PITR, and DR remain planned |\n",
)

replace_once(
    "flowcordia/product/roadmap.md",
    "- Versioned PostgreSQL custom backup plus isolated create/restore/verify/drop rehearsal with redacted evidence. — delivered; configured operator execution, PITR, off-site replication, and cross-region DR remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
    "- Versioned PostgreSQL custom backup plus isolated create/restore/verify/drop rehearsal with redacted evidence. — delivered; configured operator execution, PITR, off-site replication, and cross-region DR remain\n- Read-only controlled upgrade decision for exact application revisions, checksum-bound Prisma history, recovery evidence, acknowledgements, and worker-first rollout. — delivered; automated mutation and explicit cross-version database compatibility remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
)

replace_once(
    "flowcordia/product/release-readiness.md",
    "| Logical database recovery | Implemented as an operator harness | Exact custom archive, versioned manifest, isolated restore, migration parity, cleanup, and redacted READY evidence; a configured restore rehearsal remains required per release |\n| Installation and operations | Partial | Controlled migrations, broader provider health, PITR, off-site recovery, upgrades, alerts, and connected release evidence remain required |\n",
    "| Logical database recovery | Implemented as an operator harness | Exact custom archive, versioned manifest, isolated restore, migration parity, cleanup, and redacted READY evidence; a configured restore rehearsal remains required per release |\n| Controlled upgrade decision | Implemented as a read-only preflight | Exact current/candidate revisions, checksum-bound migration prefix, fresh recovery evidence for schema changes, operator acknowledgements, and deterministic rollout phases |\n| Installation and operations | Partial | Executed controlled migrations, broader provider health, PITR, off-site recovery, automated upgrades, alerts, and connected release evidence remain required |\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- no matching PostgreSQL backup manifest and successful isolated restore rehearsal exist for the exact release artifact;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
    "- no matching PostgreSQL backup manifest and successful isolated restore rehearsal exist for the exact release artifact;\n- the controlled upgrade preflight is blocked or unavailable for the exact current/candidate transition;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- Database recovery evidence proves one exact custom archive can be restored into and removed from a disposable compatible PostgreSQL database with exact migration parity. It does not prove PITR, object storage, encryption-key recovery, RPO/RTO, or cross-region disaster recovery.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
    "- Database recovery evidence proves one exact custom archive can be restored into and removed from a disposable compatible PostgreSQL database with exact migration parity. It does not prove PITR, object storage, encryption-key recovery, RPO/RTO, or cross-region disaster recovery.\n- Controlled upgrade preflight proves one observed live migration history is an exact checksum-bound prefix of the candidate and that required evidence and acknowledgements exist. It does not mutate the installation, prove supplied current application identity, or prove backward database compatibility.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
)

replace_once(
    "flowcordia/runbooks/installation-preflight.md",
    "1. Record the current application commit, image versions, database migration state, and worker deployment identity.\n2. Run the current release preflight and resolve existing blocked configuration before changing code.\n3. Build the candidate web and worker images from one exact new commit.\n4. Run the candidate `web`, `worker`, and `release` preflights without printing environment values.\n5. Create a versioned PostgreSQL backup and require a successful isolated restore rehearsal for the exact current release database.\n6. Review migration compatibility and the release notes for the exact version transition.\n7. Apply migrations using one controlled migration job.\n8. Upgrade the dedicated proposal worker and require a `READY` worker live dependency preflight before upgrading request-serving web replicas.\n9. Run web and release live dependency preflight against the exact candidate application and migration set.\n10. Run repository readiness, operations readiness, private-beta author acceptance, connected preview, promotion, production, and rollback evidence as required by the maturity gate.\n11. Accept the upgrade only after the exact final application head has preserved evidence.\n",
    "1. Record the current application commit, image versions, database migration state, and worker deployment identity.\n2. Run the current release preflight and resolve existing blocked configuration before changing code.\n3. Build the candidate web and worker images from one exact new commit.\n4. Run the candidate `web`, `worker`, and `release` configuration preflights without printing environment values.\n5. For a migration-bearing candidate, create a versioned PostgreSQL backup and require a successful isolated restore rehearsal for the exact current release database.\n6. Run the checksum-bound controlled upgrade preflight described in [`controlled-upgrades.md`](controlled-upgrades.md) and require `READY`.\n7. Follow the emitted application-only or maintenance-window sequence without changing the order.\n8. Apply migrations, when present, using one controlled migration job only.\n9. Upgrade the dedicated proposal worker and require a `READY` worker live dependency plus operations-readiness result before upgrading request-serving web replicas.\n10. Run web and release live dependency preflight against the exact candidate application and migration set.\n11. Run repository readiness, operations readiness, private-beta author acceptance, connected preview, promotion, production, and rollback evidence as required by the maturity gate.\n12. Accept the upgrade only after the exact final application head has preserved evidence.\n",
)
