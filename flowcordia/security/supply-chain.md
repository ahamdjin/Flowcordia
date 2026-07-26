# Supply-chain security

## Purpose

Flowcordia's release image publication already preserves immutable tags, provenance, attestations and an SBOM. These repository controls cover the earlier dependency and source-review boundary so a candidate is not treated as Beta-ready while newly introduced vulnerable dependencies or statically detectable security defects remain unreviewed.

## Maintained open-source controls

Flowcordia uses pinned upstream releases rather than maintaining custom scanners:

- GitHub Dependency Review rejects dependency changes that introduce a known vulnerability of moderate severity or higher;
- Google's OSV-Scanner compares pull-request dependency state with the target branch and runs a complete scheduled and `main` lockfile scan;
- GitHub CodeQL analyzes JavaScript and TypeScript with the `security-extended` query suite;
- Dependabot monitors both GitHub Actions and the root pnpm workspace, grouping minor and patch updates while keeping pull-request volume bounded.

Every external action and reusable workflow is pinned to an exact commit. Dependabot may propose updates to those pins, but no dependency or action update is merged automatically.

## Pull-request boundary

A dependency-changing pull request must pass:

1. dependency-delta review against the base revision;
2. OSV comparison of the old and new dependency graphs;
3. CodeQL analysis;
4. the repository's Actionlint, Zizmor, formatting, typecheck, build, E2E and unit gates that apply to the changed boundary.

Dependency Review and OSV intentionally overlap. Dependency Review uses GitHub's dependency graph to reject newly introduced vulnerable packages; OSV supplies an independent advisory database and scheduled whole-lockfile detection for vulnerabilities disclosed after a dependency entered `main`.

## Existing-vulnerability boundary

The scheduled and `main` OSV job is allowed to fail when the current dependency graph contains a known vulnerability. Such a failure is a finding, not infrastructure noise. Before the candidate can be represented as Beta-ready, maintainers must either:

- upgrade or override the affected package to a fixed version;
- remove the dependency or unreachable vulnerable component; or
- preserve a bounded, reviewed exception that identifies the advisory, affected path, exploitability analysis, temporary mitigation, owner and expiry date.

No permanent allowlist or blanket `continue-on-error` is part of this boundary.

## CodeQL boundary

CodeQL runs without building the application because JavaScript and TypeScript use the supported no-build database mode. It uploads results to GitHub code scanning with only `actions: read`, `contents: read`, `packages: read` and `security-events: write` permissions.

A CodeQL alert is not automatically evidence of exploitability, but high-confidence findings affecting tenant isolation, credentials, webhook authenticity, repository authority, workflow execution or release evidence are stop-ship until repaired or explicitly reviewed.

## Honest limit

These controls reduce dependency and source risk; they do not prove that every dependency is vulnerability-free, that an upstream advisory database is complete, or that static analysis can replace connected acceptance, runtime monitoring, incident response or human security review.
