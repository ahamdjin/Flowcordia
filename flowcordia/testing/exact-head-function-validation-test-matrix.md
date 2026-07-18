# Exact-head function validation test matrix

## Portable runtime contract

| Case | Expected result |
| --- | --- |
| Valid fixture and matching real output | Passed, status-only result |
| Object keys returned in different order | Passed through canonical JSON comparison |
| Invalid fixture input | Handler is not invoked; `invalid_input` |
| Invalid expected output | Handler is not invoked; `invalid_expected_output` |
| Repository handler throws | `execution_failed`; exception text absent |
| Handler returns non-JSON or schema-invalid output | `invalid_output` |
| Valid output differs from expectation | `output_mismatch` |
| Function is not in deployed registry | `function_not_deployed` |
| Suite content changes without digest change | `invalid_suite`; no handler invocation |
| Unknown fields, duplicate cases, empty cases, or oversized suite | Rejected |
| Metadata observer throws | Validation result remains authoritative |

## Compiler and reference repository

| Case | Expected result |
| --- | --- |
| Workflow has no typed functions | No validation task ID |
| Workflow has typed functions | Validation task is generated beside workflow task |
| Same function ID has conflicting path/export/schema | Compilation fails |
| Generated validation registry | Uses the same typed static handler imports |
| Generated source | Contains no fixture inputs, expected outputs, or fixture IDs |
| Reference repository fixture | Real function executes and exact fixture passes |
| Workflow reference removal | Repository function source remains untouched |

## Server suite construction

| Case | Expected result |
| --- | --- |
| Exact proposal, workflow, and catalog head agree | Deterministic suite and digest |
| Workflow has no typed functions | `NOT_REQUIRED` |
| Proposal head changes | `proposal_conflict` |
| Workflow or catalog source commit differs | Blocked |
| Function missing from catalog | Blocked |
| Node path/export/schema differs from catalog | Blocked |
| Used function has no fixtures | `fixtures_required` |
| Duplicate function use with same identity | One function registry, fixtures executed once |
| Duplicate function ID with conflicting identity | Blocked |

## Trigger and read model

| Case | Expected result |
| --- | --- |
| Exact preview deployment not ready | Waiting and retryable |
| Validation task absent from exact worker | Blocked |
| Same request is retried | Idempotency key reuses the run |
| Run belongs to another worker version | Ignored |
| Run metadata has another proposal/head/digest | Ignored |
| Matching run is queued or active | `QUEUED` or `RUNNING` |
| TaskRun succeeds and complete metadata passes every case | `PASSED` |
| TaskRun is terminal without trustworthy metadata | `FAILED` |
| Metadata contains unknown fields, values, duplicates, or inconsistent counts | Rejected |

## Studio and promotion

| Case | Expected result |
| --- | --- |
| Operator lacks task-trigger permission | Run action denied |
| Validation is ready | Run button available to authorized operator |
| Validation failed | Bounded fixture IDs/codes and retry available |
| Validation is active | Studio polls bounded state |
| Exact result passed | Promotion gate allows normal GitHub policy evaluation |
| Workflow has no typed functions | Promotion allowed as `NOT_REQUIRED` |
| Validation missing, blocked, queued, running, failed, stale, or unavailable | Promotion rejected before GitHub merge mutation |

## Full repository gates

The final unchanged head must pass formatting, lint, root typecheck, export validation, all unit-test shards, production webapp build, and webapp E2E. A connected external preview smoke test is recorded separately in the rollout runbook and must not be claimed from repository-only CI.
