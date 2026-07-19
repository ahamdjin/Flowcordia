# Repository readiness security boundary

## Server-owned identity

The request contains no organization ID, project ID, installation ID, repository ID, owner,
repository name, branch, or commit. Dashboard routing, authorization, and the existing connected
repository record resolve those values server-side.

The binding is checked before installation-client creation, before repository file reads, and once
again before the final projection is returned.

## GitHub authority

All GitHub requests use the repository installation token obtained from the existing GitHub App
service. User tokens and browser-provided repository coordinates are not accepted.

The probe verifies the exact installation identity plus the minimum permissions required by the
current Flowcordia lifecycle:

- repository contents: write;
- pull requests: write;
- checks: read.

A suspended, missing, mismatched, or unverifiable installation fails closed.

## Input and output bounds

The only accepted command is an exact JSON object containing `operation: "check"`. The request body
is limited to 1 KiB and unknown properties are rejected.

`trigger.config.ts` is limited to 256 KiB, decoded as fatal UTF-8, checked against its GitHub byte
size, and rejected when malformed or binary.

The browser projection contains only:

- repository owner and name;
- production branch;
- immutable commit SHA;
- bounded check labels, states, and repair messages;
- check time.

It excludes tokens, installation and database IDs, request IDs, provider headers, raw errors,
repository file contents, workflow content, credentials, payloads, outputs, and runtime metadata.

## Failure behavior

Permission and configuration failures are `BLOCKED`. Network, rate-limit, and malformed provider
responses are `UNAVAILABLE`. Neither state is downgraded to a warning or cached as successful proof.

The probe is read-only and has no ambiguous-mutation state.
