# Repository readiness

This feature runs one explicit, read-only rollout readiness probe for the repository connected to a
Flowcordia project.

## Boundary

- The browser submits only the exact `{ "operation": "check" }` command.
- The server resolves organization, project, GitHub installation, repository, and production branch
  from the authenticated dashboard context.
- All repository reads use the installation-scoped GitHub App and recheck the durable binding.
- The probe reads no workflow payload, function fixture value, credential, secret, or runtime output.
- The response contains public repository coordinates, the immutable branch head, bounded status
  messages, and no installation ID, database ID, token, request ID, raw provider response, or raw
  error.

## Checks

The probe verifies:

1. durable project/repository binding;
2. active GitHub App installation identity;
3. contents write, pull-request write, and checks read permissions;
4. production branch resolution to one immutable commit;
5. canonical workflow paths;
6. an exact, clean durable workflow index;
7. bounded UTF-8 `trigger.config.ts`;
8. default or explicit discovery of `trigger/flowcordia`;
9. enabled preview deployments.

Readiness is point-in-time evidence tied to the displayed immutable commit. Operators must rerun the
probe after repository, installation-permission, branch-policy, index, or preview-setting changes.

The probe never creates branches, pull requests, environments, deployments, runs, or database rows.
It is a prerequisite check, not a substitute for the authenticated rollout acceptance run.
