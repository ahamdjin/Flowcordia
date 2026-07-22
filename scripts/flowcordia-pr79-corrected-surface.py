import re
from pathlib import Path


def substitute_once(path: str, pattern: str, replacement: str, label: str) -> None:
    target = Path(path)
    source = target.read_text()
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"expected one {label} anchor, found {count}")
    target.write_text(updated)


substitute_once(
    "apps/webapp/app/features/flowcordia/acceptance/release-candidate-evidence.server.ts",
    r'^  if \(!\(upgrade\.kind === "application_only" \|\| upgrade\.kind === "append_only_migrations"\)\) \{\n    throw new Error\("upgrade\.kind is invalid\."\);\n  \}$',
    '''  const kind = upgrade.kind;
  if (!(kind === "application_only" || kind === "append_only_migrations")) {
    throw new Error("upgrade.kind is invalid.");
  }''',
    "upgrade kind narrowing",
)
substitute_once(
    "apps/webapp/app/features/flowcordia/acceptance/release-candidate-evidence.server.ts",
    r'^    kind: upgrade\.kind,$',
    "    kind,",
    "upgrade kind return",
)
substitute_once(
    "tests/flowcordia-connected/webhook-production.connected.spec.ts",
    r'^\}\): Promise<number> \{$',
    '}): Promise<404> {',
    "revoked request literal return",
)
