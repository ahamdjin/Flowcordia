# Studio execution policy acceptance

## Purpose

Prove that Studio edits only the execution policy already supported by generated Trigger.dev tasks: one trigger-owned policy that applies to the whole workflow run.

## Supported fields

- queue name;
- Trigger.dev machine preset;
- maximum run duration;
- bounded whole-run retry attempts;
- bounded retry minimum and maximum delay;
- bounded retry factor.

## Explicit exclusions

- invocation-time concurrency keys;
- node-scoped runtime policy;
- independent node retry;
- arbitrary machine names;
- secrets, credentials, headers, or environment values;
- deployment, worker, project, or organization identity.

## Static ownership assertions

- `WorkflowStudioExecutionPolicyEditor.tsx` is rendered only for a visual trigger.
- `execution-policy.ts` is pure and contains the same bounds enforced by the compiler.
- `WorkflowEditCommand` exposes one `set_node_runtime` command.
- the draft resource schema accepts only the supported strict runtime object and rejects `concurrencyKey` as an unknown property;
- `applyWorkflowEdit` rejects non-trigger and developer-owned targets and revalidates all supported bounds server-side;
- audit summaries contain field names only, never values.

## Contract tests

Tests must cover:

1. exact hydration without invented defaults;
2. empty form removes runtime policy;
3. exact queue, machine, duration, and retry serialization;
4. queue character and length limits;
5. machine allowlist;
6. duration range;
7. attempt, timeout, and factor ranges;
8. minimum/maximum retry-delay ordering;
9. concurrency-key refusal;
10. non-trigger and developer-owned refusal;
11. command parser strictness and `api_trigger` template parity;
12. audit summary redaction;
13. compiler output for the exact resulting policy.

## Connected acceptance

Using the configured reference repository:

1. start a draft from an exact production head;
2. select the trigger and save queue, machine, duration, and retry policy;
3. reload Studio and confirm exact values;
4. inspect durable audit evidence and confirm only changed field names are recorded;
5. publish and confirm generated task source contains the matching task options and randomized retry;
6. deploy the exact proposal head;
7. run the workflow and confirm the deployed task uses the selected queue and machine;
8. force a bounded failure and confirm whole-run retry behavior;
9. confirm side-effecting reference handlers remain idempotent across retries;
10. bypass the browser with a non-trigger, concurrency-key, unsupported-machine, or out-of-range command and confirm server rejection;
11. clear every field and confirm canonical JSON removes `runtime` rather than storing an empty object.

## Rollback

Revert the commit. No database migration, proposal-state transition, deployment-record mutation, or runtime API change is involved. Existing repository-authored runtime policy remains readable after rollback.
