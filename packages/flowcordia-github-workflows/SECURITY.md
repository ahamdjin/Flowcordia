# Security boundary

## Trust model

The workflow store trusts neither browser input nor repository content. It accepts an internal access scope, asks an injected resolver for a GitHub client, and validates every document returned by GitHub.

The resolver is security-critical. Before returning a client it must verify all of the following in one authorization decision:

1. the authenticated actor may access the Flowcordia tenant and project;
2. the project owns or is explicitly linked to the GitHub App installation;
3. the installation can access the requested repository;
4. the project is allowed to use the requested branch;
5. the returned Octokit client is authenticated as that installation, not as a user or global token.

Never cache clients by repository name alone. A safe cache key includes the installation ID and credential expiry; authorization is rechecked separately for every tenant/project request.

## Least privilege

The GitHub App should request repository metadata and contents permissions only for this storage layer. Pull-request, checks, administration, and workflow permissions belong to later adapters and should not be added until their features require them.

Secrets, installation tokens, raw GitHub errors, and workflow credential values must never enter:

- workflow JSON;
- commit messages;
- audit receipts;
- application logs or traces;
- user-visible error messages.

Workflow documents contain credential references only. Runtime components resolve those references under tenant and environment authorization.

## Write protection

- Creates use `expectedBlobSha: null` and fail if the path already exists.
- Updates and deletes require the exact current blob SHA.
- Reused node/edge identities are rejected before GitHub is called.
- Branch names, repository names, workflow IDs, custom roots, actor IDs, and correlation IDs are validated before interpolation.
- Mutation reasons cannot inject newlines or commit trailers.
- A 1 MiB ceiling bounds parsing, memory, diff, and review cost.
- Protected-branch failures are returned; the store does not bypass repository rules.

Direct writes are a storage primitive, not the final enterprise change policy. The proposal/PR layer will create reviewed branches and call this store against those branches. Production release must still resolve to a reviewed commit SHA.

## Error disclosure

Public store errors contain safe codes, repository coordinates already supplied by the caller, object IDs, correlation-safe request IDs, retry timing, and structured workflow issues. They never return raw GitHub response bodies or credentials.
