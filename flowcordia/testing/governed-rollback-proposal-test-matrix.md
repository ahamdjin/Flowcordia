# Governed rollback proposal test matrix

Repository validation must prove:

- rollback history is exact-workflow, tenant, project, installation, and repository scoped;
- only merged proposals with exact proposal head and merge commits are projected;
- the live branch workflow digest, not proposal maintenance timestamps, identifies the current governed proposal;
- historical candidates exclude the current workflow digest and are deterministically ordered by pull request number and ID;
- the browser submits only displayed workflow, target, current, and base identities;
- the operator supplies a bounded reason and the exact destructive confirmation;
- the server rechecks the target proposal head/merge, content-proven current proposal head/merge, and current base commit/blob before mutation;
- historical workflow reads resolve to the exact target merge commit;
- referenced repository-function identities match the historical catalog;
- current and historical function definitions must be identical;
- referenced source files use exact target content and current optimistic blob identities;
- missing current source files use create semantics;
- unchanged source files are omitted;
- identical workflow and source state returns `no_changes`;
- source patches use the canonical digest and existing source-aware proposal service;
- a durable rollback intent is reserved before preview preparation or GitHub mutation;
- repository plus deterministic target proposal ID is the idempotency boundary;
- an identical retry resumes, while changed provenance or reason fails closed;
- retryable failures remain `PENDING` and definitive failures become `FAILED`;
- completed proposal head, pull request number, and source-patch count are immutable;
- proposal creation prepares only the existing preview environment;
- no merge, deployment write, production trigger, Git reset, or audit deletion path exists;
- formatting, lint, root TypeScript, exports, Prisma validation, production build, all webapp shards, and browser E2E pass on the exact final head.

Connected acceptance remains separate. It must use a dedicated reference repository containing at least two merged versions of one workflow, including one referenced typed function. The protected run must create the rollback proposal, validate its exact diff, promote it through current policy, observe the newest production deployment, execute protected production proof, and record bounded evidence without payloads, outputs, credentials, or internal IDs.
