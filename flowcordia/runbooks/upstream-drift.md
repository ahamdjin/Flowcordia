# Upstream drift review

Flowcordia remains built inside the inherited Trigger.dev monorepo. Every upstream merge or upgrade must classify changed paths before product review begins.

## Command

```bash
pnpm flowcordia:upstream:report --base upstream/main --head HEAD
```

Use `--json` for machine-readable schema `0.1` output and `--fail-on-core` when inherited-core changes must stop the gate with exit code `2`.

The command executes `git diff --name-status --find-renames --find-copies <base>...<head>` through an argument array, not a shell. References are bounded before Git runs. Rename and copy evidence retains both previous and current paths.

## Ownership classes

- `flowcordia_owned` — product packages, Flowcordia feature code, tests, workflows, scripts, and product documentation.
- `reviewed_adapter` — an explicit inherited file or prefix registered because Flowcordia must connect to the host application, database, alert, environment, or resource-route boundary.
- `inherited_core` — every unregistered Trigger.dev file. These changes require explicit architecture review and must not be normalized as ordinary product work.

The registry is `flowcordia/architecture/upstream-ownership.json`. New adapter entries require a reason in the reviewing pull request and should remain narrower than the owning subsystem.

## Upgrade procedure

1. Fetch the intended upstream reference without changing product branches.
2. Run the JSON report against the exact candidate head.
3. Review every inherited-core path before conflict resolution.
4. Decide whether the change is an upstream adoption, a Flowcordia adapter, or an accidental fork mutation.
5. Add focused compatibility tests for any accepted inherited behavior change.
6. Run the complete repository matrix and connected release acceptance on the final unchanged application head.
7. Preserve the report with the upgrade evidence; do not treat classification as compatibility proof.

## Failure behavior

Invalid arguments, malformed ownership configuration, unsafe paths, oversized changes, and failed Git comparisons stop with exit code `1` and a fixed CLI failure message. Raw remote URLs and Git stderr are not printed by the CLI. An inherited-core finding is not an execution failure; it returns `2` only when the operator explicitly chooses `--fail-on-core`.

## Limits

The classifier does not fetch upstream, resolve merge conflicts, prove semantic compatibility, inspect licenses, identify security changes, or replace the controlled upgrade and connected acceptance gates. It makes ownership drift visible before those reviews.
