# Proposal governance test matrix

## Profile and persistence contract

| Case | Expected result |
| --- | --- |
| Equivalent list inputs in different order | One locale-independent normalized profile and digest. |
| Unknown properties, duplicates, invalid IDs, or oversized lists | Rejected before persistence. |
| Stored profile does not match its digest | Read fails closed as corrupt. |
| Two writers use the same expected version | One succeeds; the stale writer receives conflict. |
| Approval count increases | Accepted as strengthening. |
| Required check or reviewer is added | Accepted as strengthening. |
| Approval count decreases or requirement is removed | Rejected as weakening. |
| Allowed-reviewer set narrows | Accepted when profile remains internally valid. |
| Allowed-reviewer set expands or becomes unrestricted | Rejected as weakening. |
| Repository owner/name/default branch changes | Existing policy remains addressable by stable repository scope; snapshots refresh on the next write. |

## Evidence presentation

| Case | Expected result |
| --- | --- |
| Selected proposal differs from first page item | Evidence evaluates the selected proposal only. |
| Later comment follows an approval | Decisive approval remains the displayed/current policy state. |
| Approval is dismissed | Approval no longer counts or appears current. |
| Required check is queued or mergeability unknown | `PENDING`. |
| Pull request is draft/conflicted/closed or approval is missing | `BLOCKED`. |
| Function validation is queued/running/ready | `PENDING` unless a known GitHub blocker exists. |
| Function validation failed/blocked/closed | `BLOCKED`. |
| GitHub or validation read fails | Independent evidence is retained; overall state fails closed. |
| GitHub evidence spans multiple pages within its bound | Every review, check run, and legacy status is evaluated. |
| GitHub evidence exceeds its bound | Snapshot read fails closed; no truncated policy decision is produced. |
| All exact-head evidence passes | `SATISFIED`. |

## Commands and audit

| Case | Expected result |
| --- | --- |
| Actor lacks GitHub write permission or Studio access | Resource is denied before command execution. |
| Body is oversized or invalid UTF-8 JSON | `413` or `400`; no mutation. |
| Policy expected version is stale | `409`; no audit or partial write. |
| Ordinary writer submits a weakening | `403`; no policy version change. |
| Promotion correlation reaches maximum accepted length | Derived materialization correlation remains within 255 characters. |
| Same promotion request retries with identical policy/head/correlation | Existing policy-selection audit proof is returned idempotently. |
| Dedupe key collides with different identity or payload | Promotion fails closed. |
| Policy changes between selection and audit | Promotion fails closed and requires reload. |
| Function validation is not trusted | Promotion stops before GitHub merge mutation. |
| GitHub evidence changes after loader render | Fresh service evaluation blocks or uses the new authoritative state. |

## Repository gates

The unchanged PR head must pass formatting, lint, root typecheck, export validation, all package/webapp/internal unit shards, production webapp build, and webapp E2E. A real connected-repository smoke test is recorded separately and must not be inferred from repository-only CI.
