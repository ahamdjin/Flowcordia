from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:160]!r}")
    file.write_text(content.replace(old, new, 1))


replace_once(
    "apps/webapp/app/features/flowcordia/operations/installation-preflight.ts",
    'const PRIVATE_KEY_LABELS = ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY"] as const;\n',
    'const PRIVATE_KEY_LABELS = ["PRIVATE KEY", "RSA PRIVATE KEY"] as const;\n',
)

replace_once(
    "flowcordia/README.md",
    "- [`runbooks/installation-preflight.md`](runbooks/installation-preflight.md) — secret-safe web, worker, and release configuration gate plus install/upgrade order.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
    "- [`runbooks/installation-preflight.md`](runbooks/installation-preflight.md) — secret-safe web, worker, and release configuration gate plus install/upgrade order.\n- [`runbooks/live-dependency-preflight.md`](runbooks/live-dependency-preflight.md) — bounded PostgreSQL, migration, GitHub App, and worker-heartbeat proof.\n- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.\n",
)

replace_once(
    "flowcordia/connections/README.md",
    "| Operator installation preflight | Environment configuration | Validate web, worker, and release configuration shape before migrations or connected checks without serializing values | Deterministic read-only CLI and schema `0.1` projection implemented; provider reachability remains separate |\n",
    "| Operator installation preflight | Environment configuration | Validate web, worker, and release configuration shape before migrations or connected checks without serializing values | Deterministic read-only CLI and schema `0.1` projection implemented; provider reachability remains separate |\n| Operator live dependency preflight | PostgreSQL writer, repository migrations, GitHub App identity, and durable worker heartbeat | Prove core control-plane dependencies are reachable and compatible before authenticated product checks without preserving provider data | Non-destructive schema `0.1` CLI implemented; repository and project-scoped readiness remain separate |\n",
)

replace_once(
    "flowcordia/product/capability-matrix.md",
    "| Installation preflight | Secret-safe web, worker, and release profiles | Pinned runtime, database URL shape, exact application revision, GitHub App shape, web secrets, origins, rollout safety, worker delivery, and bounded timing relationships delivered; provider reachability remains separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration gate and install/upgrade ordering delivered; live health, backup restore, migration compatibility, automated upgrades, HA, and DR remain planned |\n",
    "| Installation preflight | Secret-safe web, worker, and release profiles | Pinned runtime, database URL shape, exact application revision, GitHub App shape, web secrets, origins, rollout safety, worker delivery, and bounded timing relationships delivered; provider reachability remains separate |\n| Live dependency preflight | PostgreSQL writer, exact migration history, GitHub App identity, and durable worker heartbeat | Bounded read-only web, worker, and release checks with fixed redacted states delivered; repository scope, object storage, email, backups, and full runtime health remain separate |\n| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Deterministic configuration and core live-dependency gates plus install/upgrade ordering delivered; backup restore, broader provider health, automated upgrades, HA, and DR remain planned |\n",
)

replace_once(
    "flowcordia/product/roadmap.md",
    "- Deterministic web, worker, and release configuration preflight with secret-safe output and install/upgrade ordering. — delivered; live dependency checks, backup restore proof, migration compatibility, and automated upgrade orchestration remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
    "- Deterministic web, worker, and release configuration preflight with secret-safe output and install/upgrade ordering. — delivered\n- Non-destructive live dependency preflight for the PostgreSQL writer, exact migration set, GitHub App identity, and durable proposal-worker heartbeat. — delivered; repository scope, object storage, email, backup restore, broader runtime health, and automated upgrades remain\n- Guided installation, health checks, upgrades, backup, and recovery.\n",
)

replace_once(
    "flowcordia/product/release-readiness.md",
    "The remaining release risk is not primarily missing backend contracts. It is connected acceptance, operator experience, live dependency verification, backup and recovery proof, upgrade compatibility, and production operations.\n",
    "The remaining release risk is not primarily missing backend contracts. It is connected acceptance, operator experience, backup and recovery proof, upgrade compatibility, broader provider/runtime health, and production operations.\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "| Installation configuration | Implemented as a deterministic preflight | Web, worker, and release profiles block unsafe configuration without exposing values |\n| Installation and operations | Partial | Live dependency health, controlled migrations, backup restore, recovery, upgrade, alert, and connected release evidence |\n",
    "| Installation configuration | Implemented as a deterministic preflight | Web, worker, and release profiles block unsafe configuration without exposing values |\n| Core live dependency health | Implemented as a non-destructive preflight | PostgreSQL writer, exact repository migration set, GitHub App authentication, and required worker heartbeat produce bounded READY/BLOCKED/UNAVAILABLE evidence |\n| Installation and operations | Partial | Controlled migrations, backup restore, broader provider health, recovery, upgrades, alerts, and connected release evidence remain required |\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- the installation preflight is blocked for the selected web, worker, or release profile;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
    "- the installation preflight is blocked for the selected web, worker, or release profile;\n- the live dependency preflight is blocked or unavailable for the selected profile;\n- the connected preview deployment is skipped or cannot be tied to the exact proposal head;\n",
)
replace_once(
    "flowcordia/product/release-readiness.md",
    "- The installation preflight proves only deterministic configuration shape and safe rollout defaults. It never proves network reachability, provider credentials, migration state, or runtime health.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
    "- The installation preflight proves only deterministic configuration shape and safe rollout defaults. It never proves network reachability, provider credentials, migration state, or runtime health.\n- The live dependency preflight proves point-in-time PostgreSQL reachability, exact migration compatibility, GitHub App authentication, and required worker heartbeat without exposing provider data. It does not prove repository permissions, project backlog health, backups, or end-to-end execution.\n- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.\n",
)

replace_once(
    "flowcordia/runbooks/installation-preflight.md",
    "It does not connect to PostgreSQL, GitHub, Trigger.dev, object storage, email, or the event endpoint. A passing preflight is necessary but never sufficient for production acceptance.\n",
    "It does not connect to PostgreSQL, GitHub, Trigger.dev, object storage, email, or the event endpoint. A passing preflight is necessary but never sufficient for production acceptance. After configuration passes and migrations/services are prepared, continue with [`live-dependency-preflight.md`](live-dependency-preflight.md).\n",
)
replace_once(
    "flowcordia/runbooks/installation-preflight.md",
    "9. Deploy the dedicated worker and confirm its durable heartbeat becomes active.\n10. Deploy the web application and keep global Studio access disabled during internal rollout.\n11. Run the authenticated repository-readiness and operations-readiness checks.\n12. Complete the connected release acceptance sequence and assemble the exact-lineage evidence manifest.\n",
    "9. Deploy the dedicated worker and run live dependency preflight with profile `worker` until its durable heartbeat is `READY`.\n10. Deploy the web application and keep global Studio access disabled during internal rollout.\n11. Run live dependency preflight with profiles `web` and `release` against the exact release environment.\n12. Run the authenticated repository-readiness and operations-readiness checks.\n13. Complete the connected release acceptance sequence and assemble the exact-lineage evidence manifest.\n",
)
replace_once(
    "flowcordia/runbooks/installation-preflight.md",
    "8. Upgrade the dedicated proposal worker, confirm heartbeat and queue health, then upgrade request-serving web replicas.\n9. Run repository readiness, operations readiness, private-beta author acceptance, connected preview, promotion, production, and rollback evidence as required by the maturity gate.\n10. Accept the upgrade only after the exact final application head has preserved evidence.\n",
    "8. Upgrade the dedicated proposal worker and require a `READY` worker live dependency preflight before upgrading request-serving web replicas.\n9. Run web and release live dependency preflight against the exact candidate application and migration set.\n10. Run repository readiness, operations readiness, private-beta author acceptance, connected preview, promotion, production, and rollback evidence as required by the maturity gate.\n11. Accept the upgrade only after the exact final application head has preserved evidence.\n",
)
