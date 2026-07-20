# Governed rollback proposal test matrix

Repository validation must prove:

- rollback history is exact-workflow, tenant, project, installation, and repository scoped;
- only merged proposals with exact proposal head and merge commits are projected;
- the live branch workflow digest, not proposal maintenance timestamps, identifies the current governed proposal;
- historical candidates exclude only the actual current proposal and are deterministically ordered by pull request number and ID;
- an earlier proposal with the same workflow digest remains eligible when its governed repository-function source differs;
- the browser submits only displayed workflow, target, current, and base identities;
- the operator supplies a bounded reason and the exact destructive confirmation;
- the server rechecks the target proposal head/merge, content-proven current proposal head/merge, and current base commit/blob before mutation;
- historical workflow reads resolve to the exact target merge commit, workflow ID, and governed workflow digest;
- referenced repository-function identities match the historical catalog;
- current and historical function definitions must be identical;
- referenced source files use exact target content and current optimistic blob identities;
- missing current source files use create semantics;
- unchanged source files are omitted;
- identical workflow and source state returns `no_changes`;
- source patches use the canonical digest and existing source-aware proposal service;
- every expected source patch is re-read and content-verified at the exact final proposal head before rollback intent completion;
- the workflow JSON and deterministic generated Trigger.dev artifact are re-read and content-verified at the exact final proposal head;
- the final head must descend from the immutable base commit with that base as its exact merge base;
- the immutable comparison contains at most the 32 bounded source patches plus workflow JSON and generated artifact;
- every comparison entry is an added or modified allow-listed path; unrelated, renamed, removed, copied, diverged, or incomplete comparisons fail closed;
- rollback proposals cannot submit or promote until that exact-head verification is durably complete;
- a proposal head changed after durable verification is retired with explicit close-and-retry recovery;
- a durable rollback intent is reserved before preview preparation or GitHub mutation;
- the mutation lease is renewed and fenced after preview preparation immediately before GitHub mutation begins;
- the deterministic rollback key includes the complete tenant, project, installation, repository, branch, workflow, current, target, and base identity;
- repository plus deterministic rollback key and numbered attempt is the idempotency boundary;
- an identical retry resumes, immutable provenance changes fail closed, and the original reason remains durable for a reused attempt;
- a reused attempt retains the reviewer identity captured when it was first reserved;
- retryable failures remain `PENDING` and definitive failures become `FAILED`;
- a governed proposal that becomes `FAILED` or `CLOSED` retires its durable rollback intent;
- a new attempt requires an explicit retry and proof that the failed branch is absent or its pull request is closed without merge;
- retry responses expose bounded attempt, branch, pull-request, state, and next-action recovery metadata;
- completed proposal head, pull request number, and source-patch count are immutable;
- concurrent identical completions converge on the same durable result;
- proposal creation prepares only the existing preview environment;
- no merge, deployment write, production trigger, Git reset, or audit deletion path exists;
- formatting, lint, root TypeScript, exports, Prisma validation, production build, all webapp shards, and browser E2E pass on the exact final head.

Connected acceptance remains separate. It must use a dedicated reference repository containing at least two merged versions of one workflow, including one referenced typed function. The protected run must create the rollback proposal, validate its exact diff, promote it through current policy, observe the newest production deployment, execute protected production proof, and record bounded evidence without payloads, outputs, credentials, or internal IDs.

The v1 connected fixture must keep the referenced function self-contained. Transitive import restoration remains outside this boundary until a governed dependency manifest or verified dependency closure exists.
