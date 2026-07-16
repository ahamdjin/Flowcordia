# Studio publication and runtime bridge

## Purpose

This slice closes the first authoring gap between durable visual drafts and reviewed executable code.

```text
indexed Git workflow
  -> durable Studio draft
  -> allow-listed visual configuration
  -> side-effect-free preview trace
  -> exact-version publication preflight
  -> deterministic compiler
  -> proposal branch
  -> canonical workflow JSON
  -> generated Trigger.dev task source
  -> draft pull request
  -> existing submit / policy / promote lifecycle
```

## Ownership boundary

- Visual-owned nodes may be moved, renamed, configured, connected, and removed in Studio.
- Nodes with a repository `codeReference` are developer owned. Studio may move or rename them but cannot change their configuration or remove them.
- Generated task source statically imports developer code references, so reviewers see the executable boundary in Git.
- Configuration keys that look like inline credentials, passwords, tokens, API keys, or secrets are rejected. Runtime secrets must use credential references.

## Testing boundary

Studio testing is deliberately a dry run:

- HTTP requests return a simulated request result and never connect;
- waits validate but do not delay;
- developer code returns a simulated code-reference result and never imports or executes customer code;
- node order, branch selection, output propagation, compilation, and failure presentation still use the real workflow contract.

Condition edges are explicit `true` or `false` branches. A condition passes its input payload through to the selected branch, while the branch decision remains runtime control state rather than replacing business data.

## Live runtime boundary

The generated task uses `@flowcordia/runtime` and Trigger.dev. HTTP execution requires an explicit hostname allowlist through `FLOWCORDIA_HTTP_HOST_ALLOWLIST`; waits use Trigger.dev durable waits; developer handlers are statically imported from reviewed repository paths.

HTTP credential references resolve only at live runtime. A reference such as `orders-api` maps to `FLOWCORDIA_CREDENTIAL_ORDERS_API`, whose value is a JSON object containing request headers. The compiler stores the reference and deterministic environment name, never the secret value; preview mode never resolves the environment binding or returns credential headers.

Generated source is stored at `trigger/flowcordia/<workflow-id>.ts` on the same proposal branch as `.flowcordia/workflows/<workflow-id>.json`. The `trigger` root makes the artifact discoverable by the default Trigger.dev build while promotion still governs visual intent and executable source together. Repositories that override `dirs` in `trigger.config.ts` must include this directory.

Repository code references are emitted as traversal-free imports relative to the generated directory. Export names must be valid JavaScript identifiers, and a proposal rejects a code reference that declares another repository.

The connected GitHub integration now owns automatic preview deployment of the proposal pull request. Flowcordia prepares the native branch environment, matches only the exact proposal head, triggers manual preview runs on that deployment version, and projects bounded node status back to Studio. See [`preview-deployment-live-runs.md`](./preview-deployment-live-runs.md).
