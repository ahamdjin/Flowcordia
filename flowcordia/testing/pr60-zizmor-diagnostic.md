# PR60 Zizmor diagnostic

Target job: `88808609679`

```text
Run zizmorcore/zizmor-action@5f14fd08f7cf1cb1609c1e344975f152c7ee938d
with:
min-severity: low
advanced-security: false
inputs: .
online-audits: true
persona: regular
version: latest
token: ***
color: true
annotations: false
fail-on-no-inputs: true

Run "${GITHUB_ACTION_PATH}/action.sh"
env:
GHA_ZIZMOR_INPUTS: .
GHA_ZIZMOR_ONLINE_AUDITS: true
GHA_ZIZMOR_PERSONA: regular
GHA_ZIZMOR_MIN_SEVERITY: low
GHA_ZIZMOR_MIN_CONFIDENCE: 
GHA_ZIZMOR_VERSION: latest
GHA_ZIZMOR_TOKEN: ***
GHA_ZIZMOR_ADVANCED_SECURITY: false
GHA_ZIZMOR_COLOR: true
GHA_ZIZMOR_ANNOTATIONS: false
GHA_ZIZMOR_CONFIG: 
GHA_ZIZMOR_FAIL_ON_NO_INPUTS: true
Status: Downloaded newer image for ghcr.io/zizmorcore/zizmor@sha256:14ea7f5cc7c67933394a35b5a38a277397818d232602635edb2010b313afb110
INFO zizmor: 🌈 zizmor v1.25.2
INFO audit: zizmor: 🌈 completed ./.github/actions/get-image-tag/action.yml
INFO audit: zizmor: 🌈 completed ./.github/dependabot.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/changesets-pr.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/check-review-md.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/claude-md-audit.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/claude.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/code-quality.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/dependabot-critical-alerts.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/dependabot-weekly-summary.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/docs.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/e2e-webapp-auth-full.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/e2e-webapp.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/e2e.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-alert-readiness.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-assemble-release-evidence.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-connected-acceptance.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-pr60-operational-release-evidence-finalizer.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-private-beta-journey.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-production-acceptance.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-promotion-acceptance.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-provider-readiness.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/flowcordia-rollback-acceptance.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/helm-prerelease.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/pr-testbox-windows.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/pr-testbox.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/pr_checks.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/preview-dispatch.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/preview-packages.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/publish-docs.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/publish-webapp.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/publish-worker-v4.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/publish-worker.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/publish.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/release-helm.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/release.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/sdk-compat.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/trivy-image-webapp.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/typecheck.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/unit-tests-internal.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/unit-tests-packages.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/unit-tests-webapp.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/unit-tests.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/vouch-check-pr.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/vouch-manage-by-issue.yml
INFO audit: zizmor: 🌈 completed ./.github/workflows/workflow-checks.yml
help[artipacked]: credential persistence through GitHub Actions artifacts
--> ./.github/workflows/flowcordia-pr60-operational-release-evidence-finalizer.yml:36:9
|
36 |         - name: Checkout exact branch
|  _________^
37 | |         uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
38 | |         with:
39 | |           ref: ${{ github.head_ref }}
40 | |           fetch-depth: 0
| |________________________^ does not set persist-credentials: false
= note: audit confidence → Low
= note: this finding has an auto-fix
= help: audit documentation → https://docs.zizmor.sh/audits/#artipacked
123 findings (4 ignored, 118 suppressed, 1 unsafe fixes): 0 informational, 1 low, 0 medium, 0 high
##[error]Process completed with exit code 12.
Run sleep 15
sleep 15
shell: /usr/bin/bash -e {0}
Post job cleanup.
[command]/usr/bin/git version
git version 2.54.0
```
