from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    source = target.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"expected one {label} anchor, found {count}")
    target.write_text(source.replace(old, new, 1))


replace_once(
    "apps/webapp/app/features/flowcordia/acceptance/release-candidate-evidence.server.ts",
    '''  if (!(upgrade.kind === "application_only" || upgrade.kind === "append_only_migrations")) {
    throw new Error("upgrade.kind is invalid.");
  }''',
    '''  const kind = upgrade.kind;
  if (!(kind === "application_only" || kind === "append_only_migrations")) {
    throw new Error("upgrade.kind is invalid.");
  }''',
    "upgrade kind narrowing",
)
replace_once(
    "apps/webapp/app/features/flowcordia/acceptance/release-candidate-evidence.server.ts",
    '''    kind: upgrade.kind,''',
    '''    kind,''',
    "upgrade kind return",
)
replace_once(
    "tests/flowcordia-connected/webhook-production.connected.spec.ts",
    ''')}): Promise<number> {''',
    ''')}): Promise<404> {''',
    "revoked request literal return",
)
