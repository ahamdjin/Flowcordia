# Workflow index implementation file map

## GitHub package

- `src/discovery/types.ts`
- `src/discovery/catalog.ts`
- `src/transport/octokit-discovery-adapter.ts`
- `test/discovery.test.ts`

## Webapp index

- `features/flowcordia/workflows/index/types.ts`
- `scope.server.ts`
- `repository.server.ts`
- `github.server.ts`
- `service.server.ts`
- `manual-claim.server.ts`
- `worker.server.ts`
- `webhook.server.ts`

## Studio

- `features/flowcordia/workflows/studio/presentation.ts`
- `query.server.ts`
- `commands.server.ts`
- `WorkflowStudio.tsx`
- workflow page route
- workflow-index resource route

## Durable schema

- `20260715160000_flowcordia_workflow_index/migration.sql`

## Existing connections changed

- shared Flowcordia GitHub binding
- proposal GitHub adapter reuse
- proposal operations lifecycle
- signed GitHub webhook route
- proposal workspace navigation
