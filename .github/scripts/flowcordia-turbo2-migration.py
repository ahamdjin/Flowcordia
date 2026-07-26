from __future__ import annotations

import json
import re
from pathlib import Path

TURBO_VERSION = "2.10.6"
TURBO_SCHEMA = "https://turbo.build/schema.json"
REMOVED_TURBO_ADVISORIES = {
    "GHSA-3qcw-2rhx-2726",
    "GHSA-hcf7-66rw-9f5r",
}


def update_root_package() -> None:
    path = Path("package.json")
    data = json.loads(path.read_text())
    data["devDependencies"]["turbo"] = TURBO_VERSION
    path.write_text(json.dumps(data, indent=2) + "\n")


def update_turbo_config() -> None:
    path = Path("turbo.json")
    data = json.loads(path.read_text())
    if "pipeline" not in data:
        raise SystemExit("Expected the reviewed Turbo 1 pipeline configuration before migration.")
    if "tasks" in data:
        raise SystemExit("Refusing to overwrite an existing Turbo 2 tasks configuration.")
    data["$schema"] = TURBO_SCHEMA
    data["tasks"] = data.pop("pipeline")
    path.write_text(json.dumps(data, indent=2) + "\n")


def update_osv_exceptions() -> None:
    path = Path("osv-scanner.toml")
    blocks = re.split(r"(?=\[\[IgnoredVulns\]\])", path.read_text())
    kept: list[str] = []
    removed: set[str] = set()
    for block in blocks:
        matched = next(
            (
                advisory
                for advisory in REMOVED_TURBO_ADVISORIES
                if f'id = "{advisory}"' in block
            ),
            None,
        )
        if matched:
            removed.add(matched)
            continue
        kept.append(block)
    if removed != REMOVED_TURBO_ADVISORIES:
        raise SystemExit(f"Did not remove the exact Turbo advisory set: {sorted(removed)}")
    path.write_text("".join(kept).strip() + "\n")


def update_dependency_policy() -> None:
    path = Path(".github/workflows/flowcordia-dependency-remediation-checks.yml")
    text = path.read_text()

    for advisory in sorted(REMOVED_TURBO_ADVISORIES):
        needle = f'              "{advisory}",\n'
        if needle not in text:
            raise SystemExit(f"Missing policy advisory entry: {advisory}")
        text = text.replace(needle, "", 1)

    path_needle = '      - "package.json"\n'
    if text.count(path_needle) != 2:
        raise SystemExit("Expected package.json in both dependency policy path filters.")
    text = text.replace(path_needle, path_needle + '      - "turbo.json"\n')

    turbo_policy = f'''          forbidden_turbo_overrides = [
              selector for selector in overrides if selector == "turbo" or selector.startswith("turbo@")
          ]
          if forbidden_turbo_overrides:
              raise SystemExit(f"Turbo overrides are prohibited; select the reviewed direct version instead: {{forbidden_turbo_overrides}}")
          turbo_version = root.get("devDependencies", {{}}).get("turbo", "")
          if turbo_version != "{TURBO_VERSION}":
              raise SystemExit(f"Turbo must use the reviewed {TURBO_VERSION} release: {{turbo_version}}")

          turbo_config = json.loads(Path("turbo.json").read_text())
          if turbo_config.get("$schema") != "{TURBO_SCHEMA}":
              raise SystemExit("turbo.json must use the Turbo 2 schema.")
          if "pipeline" in turbo_config:
              raise SystemExit("The removed Turbo 1 pipeline key is prohibited.")
          tasks = turbo_config.get("tasks")
          if not isinstance(tasks, dict):
              raise SystemExit("turbo.json must contain a Turbo 2 tasks object.")
          required_tasks = {{"build", "generate", "test", "typecheck", "check-exports"}}
          missing_tasks = sorted(required_tasks - set(tasks))
          if missing_tasks:
              raise SystemExit(f"Turbo 2 task graph is missing required tasks: {{missing_tasks}}")
'''
    pattern = re.compile(
        r"          forbidden_turbo_overrides = \[.*?(?=          forbidden_otel_overrides = \[)",
        re.DOTALL,
    )
    text, substitutions = pattern.subn(turbo_policy + "\n", text, count=1)
    if substitutions != 1:
        raise SystemExit("Could not replace the exact Turbo 1 policy block.")

    compatibility_job = f'''

  turbo2-compatibility:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
    steps:
      - name: Checkout exact revision
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v5.0.0
        with:
          version: 10.33.2

      - name: Setup Node
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 20.20.2
          cache: pnpm

      - name: Install exact Turbo 2 dependency graph
        run: pnpm install --frozen-lockfile

      - name: Validate Turbo 2 version and task graph
        shell: bash
        run: |
          set -euo pipefail
          test "$(pnpm exec turbo --version)" = "{TURBO_VERSION}"
          pnpm exec turbo run build --dry=json > /tmp/flowcordia-turbo2-build-graph.json
          test -s /tmp/flowcordia-turbo2-build-graph.json

      - name: Execute repository generation through Turbo 2
        run: pnpm generate
'''
    if "  turbo2-compatibility:" in text:
        raise SystemExit("Turbo 2 compatibility job already exists.")
    path.write_text(text.rstrip() + compatibility_job + "\n")


def update_documentation() -> None:
    path = Path("flowcordia/security/dependency-remediation.md")
    text = path.read_text()
    replacements = {
        "reduces the exception-aware current-lockfile scan to zero unreviewed findings.": "reduces the exception-aware current-lockfile scan to zero unreviewed findings. The follow-up Turbo 2 migration removes two of the original nine temporary exceptions.",
        "- Turborepo remains on the repository-compatible 1.x configuration line. An automatic audit proposal attempted to force Turbo 2 without migrating `turbo.json`; the full matrix rejected that major jump. Turbo 2 migration is therefore a separate compatibility change rather than a hidden transitive override.": "- Turborepo moves deliberately to `2.10.6` after its 72-hour release-age hold. The root configuration is migrated from the removed `pipeline` key to the Turbo 2 `tasks` schema, and repository generation plus a dry build graph are permanent blocking checks.",
        "| `GHSA-3qcw-2rhx-2726` | Turbo 1 package-manager detection in development and CI tooling | Project-controlled `.yarnrc.yml` is prohibited. Complete the explicit Turbo 2 configuration migration instead of forcing a major through pnpm overrides. | Flowcordia maintainers | 2026-08-31 |\n": "",
        "| `GHSA-hcf7-66rw-9f5r` | Turbo 1 browser-based self-hosted login and SSO | Browser-based Turbo authentication is prohibited; remote-cache credentials must be pre-provisioned while Turbo 2 is validated. | Flowcordia maintainers | 2026-08-31 |\n": "",
        "4. exact dependency-selection assertions, including bans on Turbo and OpenTelemetry core major overrides;\n5. enforced Turbo 1 workarounds: no `.yarnrc.yml`, `turbo login` or `turbo sso` usage;\n6. enforced OpenTelemetry 1.30 workarounds: no raised Node header-size flag and no custom W3C baggage propagator in application source;\n7. database generation/build and Kubernetes provider typechecking against the maintained client;\n8. the repository's normal formatting, lint, TypeScript, build, E2E and unit matrix.": "4. exact dependency-selection assertions, including the reviewed Turbo `2.10.6` direct selection, Turbo 2 schema, and prohibition of transitive Turbo overrides;\n5. enforced OpenTelemetry 1.30 workarounds: no raised Node header-size flag and no custom W3C baggage propagator in application source;\n6. database generation/build and Kubernetes provider typechecking against the maintained client;\n7. repository generation and dry build-graph validation through Turbo 2;\n8. the repository's normal formatting, lint, TypeScript, build, E2E and unit matrix.",
        "The final graph must prove Turbo 1 generation compatibility, OpenTelemetry 1.30 startup compatibility and Kubernetes client 1.4 type compatibility before this record is accepted.": "The final graph must prove Turbo 2 generation and build-graph compatibility, OpenTelemetry 1.30 startup compatibility and Kubernetes client 1.4 type compatibility before this record is accepted.",
        "while incompatible AI SDK, Remix router, Turbo and OpenTelemetry major migrations remain explicit, expiring work instead of being disguised as transitive overrides.": "while incompatible AI SDK, Remix router and OpenTelemetry major migrations remain explicit, expiring work instead of being disguised as transitive overrides.",
        "outside the nine explicit, expiring exceptions": "outside the seven explicit, expiring exceptions",
    }
    for old, new in replacements.items():
        if old not in text:
            raise SystemExit(f"Missing expected remediation documentation text: {old[:80]}")
        text = text.replace(old, new, 1)
    path.write_text(text)


def main() -> None:
    update_root_package()
    update_turbo_config()
    update_osv_exceptions()
    update_dependency_policy()
    update_documentation()


if __name__ == "__main__":
    main()
