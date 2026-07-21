from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


backup_cli = "scripts/flowcordia-database-backup.ts"
replace_once(
    backup_cli,
    'import { resolve } from "node:path";\n',
    'import { isAbsolute, relative, resolve } from "node:path";\n',
)
replace_once(
    backup_cli,
    '''function usage(): never {\n''',
    '''function assertOutsideRepository(path: string): void {\n  const repository = resolve(process.cwd());\n  const location = resolve(path);\n  const relativePath = relative(repository, location);\n  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {\n    console.error("Flowcordia recovery artifacts must be stored outside the repository.");\n    process.exit(2);\n  }\n}\n\nfunction usage(): never {\n''',
)
replace_once(
    backup_cli,
    '''  if (!releaseId || !outputDirectory) usage();\n  return { releaseId, outputDirectory, binDirectory, json };\n''',
    '''  if (!releaseId || !outputDirectory) usage();\n  assertOutsideRepository(outputDirectory);\n  return { releaseId, outputDirectory, binDirectory, json };\n''',
)

restore_cli = "scripts/flowcordia-database-restore-rehearsal.ts"
replace_once(
    restore_cli,
    'import { resolve } from "node:path";\n',
    'import { isAbsolute, relative, resolve } from "node:path";\n',
)
replace_once(
    restore_cli,
    '''function usage(): never {\n''',
    '''function assertOutsideRepository(path: string): void {\n  const repository = resolve(process.cwd());\n  const location = resolve(path);\n  const relativePath = relative(repository, location);\n  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {\n    console.error("Flowcordia recovery artifacts must be stored outside the repository.");\n    process.exit(2);\n  }\n}\n\nfunction usage(): never {\n''',
)
replace_once(
    restore_cli,
    '''  if (!archivePath || !manifestPath || !evidencePath) usage();\n  return { archivePath, manifestPath, evidencePath, binDirectory, json };\n''',
    '''  if (!archivePath || !manifestPath || !evidencePath) usage();\n  assertOutsideRepository(archivePath);\n  assertOutsideRepository(manifestPath);\n  assertOutsideRepository(evidencePath);\n  return { archivePath, manifestPath, evidencePath, binDirectory, json };\n''',
)

replace_once(
    "package.json",
    '''    "db:studio": "turbo run db:studio",\n    "db:populate": "turbo run db:populate",\n''',
    '''    "db:studio": "turbo run db:studio",\n    "db:populate": "turbo run db:populate",\n    "flowcordia:preflight:config": "tsx scripts/flowcordia-installation-preflight.ts",\n    "flowcordia:preflight:live": "tsx scripts/flowcordia-live-preflight.ts",\n    "flowcordia:db:backup": "tsx scripts/flowcordia-database-backup.ts",\n    "flowcordia:db:restore-rehearsal": "tsx scripts/flowcordia-database-restore-rehearsal.ts",\n''',
)

replace_once(
    "flowcordia/README.md",
    "- [`runbooks/live-dependency-preflight.md`](runbooks/live-dependency-preflight.md) — bounded PostgreSQL, migration, GitHub App, and worker-heartbeat proof.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
    "- [`runbooks/live-dependency-preflight.md`](runbooks/live-dependency-preflight.md) — bounded PostgreSQL, migration, GitHub App, and worker-heartbeat proof.\n- [`runbooks/database-backup-restore.md`](runbooks/database-backup-restore.md) — versioned PostgreSQL archive and isolated restore rehearsal.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
)

replace_once(
    "flowcordia/connections/README.md",
    "| Operator live dependency preflight | PostgreSQL writer, repository migrations, GitHub App identity, and durable worker heartbeat | Prove core control-plane dependencies are reachable and compatible before authenticated product checks without preserving provider data | Non-destructive schema `0.1` CLI implemented; repository and project-scoped readiness remain separate |\n",
    "| Operator live dependency preflight | PostgreSQL writer, repository migrations, GitHub App identity, and durable worker heartbeat | Prove core control-plane dependencies are reachable and compatible before authenticated product checks without preserving provider data | Non-destructive schema `0.1` CLI implemented; repository and project-scoped readiness remain separate |\n| Database backup command | PostgreSQL writer and encrypted operator storage | Create one no-overwrite custom archive bound to the exact application and migration artifact without exposing credentials or archive data | Versioned manifest, tool compatibility, archive inventory, digest, and atomic publication implemented |\n| Database restore rehearsal | Disposable PostgreSQL administration endpoint | Restore an exact archive into a random temporary database, verify migration parity, destroy it, and emit bounded evidence | Isolated create/restore/verify/drop lifecycle implemented; a configured operator run remains mandatory |\n",
)

replace_once(
    "flowcordia/product/capability-matrix.md",
    "| Live dependency preflight | PostgreSQL writer, exact migration history, GitHub App identity, and durable worker heartbeat | Bounded read-only web, worker, and release checks with fixed redacted states delivered; repository scope, object storage, email, backups, and full runtime health remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration and core live-dependency gates plus install/upgrade ordering delivered; backup restore, broader provider health, automated upgrades, HA, and DR remain planned |\n",
    "| Live dependency preflight | PostgreSQL writer, exact migration history, GitHub App identity, and durable worker heartbeat | Bounded read-only web, worker, and release checks with fixed redacted states delivered; repository scope, object storage, email, backups, and full runtime health remain separate |\n| Database recovery proof | Versioned custom archive and disposable restore rehearsal | Exact application/migration binding, PostgreSQL major compatibility, no-overwrite atomic artifacts, archive inventory/digests, isolated restore, migration parity, cleanup, and redacted READY evidence delivered; PITR and cross-region DR remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration, live-dependency, and logical database recovery gates plus install/upgrade ordering delivered; broader provider health, automated upgrades, HA, PITR, and DR remain planned |\n",
)

replace_once(
    "flowcordia/product/roadmap.md",
    "- Non-destructive live dependency preflight for the PostgreSQL writer, exact migration set, GitHub App identity, and durable proposal-worker heartbeat. — delivered; repository scope, object storage, email, backup restore, broader runtime health, and automated upgrades remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
    "- Non-destructive live dependency preflight for the PostgreSQL writer, exact migration set, GitHub App identity, and durable proposal-worker heartbeat. — delivered; repository scope, object storage, email, broader runtime health, and automated upgrades remain\n- Versioned PostgreSQL custom backup plus isolated create/restore/verify/drop rehearsal with redacted evidence. — delivered; configured operator execution, PITR, off-site replication, and cross-region DR remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
)

replace_once(
    "flowcordia/product/release-readiness.md",
    "| Core live dependency health | Implemented as a non-destructive preflight | PostgreSQL writer, exact repository migration set, GitHub App authentication, and required worker heartbeat produce bounded READY/BLOCKED/UNAVAILABLE evidence |\n| Installation and operations | Partial | Controlled migrations, backup restore, broader provider health, recovery, upgrades, alerts, and connected release evidence remain required |\n",
    "| Core live dependency health | Implemented as a non-destructive preflight | PostgreSQL writer, exact repository migration set, GitHub App authentication, and required worker heartbeat produce bounded READY/BLOCKED/UNAVAILABLE evidence |\n| Logical database recovery | Implemented as an operator harness | Exact custom archive, versioned manifest, isolated restore, migration parity, cleanup, and redacted READY evidence; a configured restore rehearsal remains required per release |\n| Installation and operations | Partial | Controlled migrations, broader provider health, PITR, off-site recovery, upgrades, alerts, and connected release evidence remain required |\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- the live dependency preflight is blocked or unavailable for the selected profile;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
    "- the live dependency preflight is blocked or unavailable for the selected profile;\n- no matching PostgreSQL backup manifest and successful isolated restore rehearsal exist for the exact release artifact;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- The live dependency preflight proves point-in-time PostgreSQL reachability, exact migration compatibility, GitHub App authentication, and required worker heartbeat without exposing provider data. It does not prove repository permissions, project backlog health, backups, or end-to-end execution.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
    "- The live dependency preflight proves point-in-time PostgreSQL reachability, exact migration compatibility, GitHub App authentication, and required worker heartbeat without exposing provider data. It does not prove repository permissions, project backlog health, backups, or end-to-end execution.\n- Database recovery evidence proves one exact custom archive can be restored into and removed from a disposable compatible PostgreSQL database with exact migration parity. It does not prove PITR, object storage, encryption-key recovery, RPO/RTO, or cross-region disaster recovery.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
)

replace_once(
    "flowcordia/runbooks/installation-preflight.md",
    "7. Create and verify a PostgreSQL backup before applying migrations.\n8. Apply repository migrations once through the documented migration owner. Do not let every replica race migration deployment.\n",
    "7. Create a versioned PostgreSQL backup and complete the isolated restore rehearsal described in [`database-backup-restore.md`](database-backup-restore.md) before applying migrations.\n8. Apply repository migrations once through the documented migration owner. Do not let every replica race migration deployment.\n",
)
replace_once(
    "flowcordia/runbooks/installation-preflight.md",
    "5. Take and verify a restorable database backup.\n6. Review migration compatibility and the release notes for the exact version transition.\n",
    "5. Create a versioned PostgreSQL backup and require a successful isolated restore rehearsal for the exact current release database.\n6. Review migration compatibility and the release notes for the exact version transition.\n",
)

replace_once(
    "flowcordia/runbooks/live-dependency-preflight.md",
    "3. Take and verify the required database backup.\n4. Apply migrations through one controlled migration owner.\n",
    "3. Create the required versioned database backup and complete its isolated restore rehearsal.\n4. Apply migrations through one controlled migration owner.\n",
)
