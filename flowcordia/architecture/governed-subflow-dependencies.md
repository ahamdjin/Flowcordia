# Governed subflow dependencies

## Purpose

A subflow is safe only when the child exists, is valid, belongs to the exact repository revision, and cannot create a dependency cycle. Flowcordia stores that proof in the durable workflow index and revalidates it before preview or proposal creation.

## Exact-commit metadata

Workflow indexing derives a sorted unique list of `subflow.invoke` targets from each validated workflow document. The index stores:

- dependency metadata version;
- exact source commit and blob identity;
- bounded child workflow IDs.

Migration defaults existing rows to metadata version `0`. The current draft document remains authoritative for its own direct dependencies, but any referenced child with version `0` cannot authorize subflow publication. Operators must synchronize the repository after deployment so child dependency metadata is indexed at version `1`.

## Validation

The server combines the current draft's dependencies with exact-commit metadata for every other indexed workflow and walks the reachable graph. Preview and publication stop when any reachable workflow is:

- missing or invalid;
- indexed at another commit;
- carrying stale dependency metadata;
- part of a direct or indirect cycle;
- outside the supported workflow or dependency bounds.

The browser receives only workflow IDs, names, descriptions, eligibility, fixed messages, and the source commit. It cannot choose a repository, commit, unindexed task ID, or provider identity.

## Studio behavior

The child workflow field is a repository-backed selector. Candidates that are invalid, stale, mixed-revision, or would close a cycle remain visible but disabled with a bounded explanation. Studio can edit an unsafe existing draft toward an eligible child, but preview and proposal creation remain blocked until the entire reachable graph is READY.

## Limits

- at most 500 indexed workflows per repository projection;
- at most 100 unique child workflow IDs per workflow;
- at most 20 bounded issues returned by one analysis;
- one exact repository commit across the reachable graph.

This slice does not install missing child tasks, validate compatibility between parent and child JSON Schemas across separate files, or support recursive workflows. Schema compatibility and multi-workflow proposal publication remain separate governed capabilities.
