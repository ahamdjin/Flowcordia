# Enterprise product blueprint

## Product statement

Flowcordia lets business users build workflows visually while developers work on the same workflows as typed code. GitHub governs change, and a Trigger.dev-grade runtime executes the result on Flowcordia Cloud or customer-owned infrastructure.

## Primary users

- **Business builder** — composes approved capabilities without needing Git or TypeScript.
- **Developer** — adds code, tests, custom nodes, and runtime settings.
- **Reviewer** — sees visual and code diffs before approving a change.
- **Platform operator** — manages environments, workers, registries, storage, and upgrades.
- **Security administrator** — controls identity, policy, secrets, audit, and data boundaries.

## Non-negotiable product promises

1. One workflow has one identity across the canvas, code, Git history, deployment, and run history.
2. Visual editing never removes advanced runtime capabilities; unsupported complexity remains available through code.
3. A normal user does not need to understand Git, but every production change is still represented in Git.
4. Secrets are referenced by identifier and resolved at runtime.
5. Self-hosted deployments receive the same workflow model and control-plane contracts as managed deployments.
6. Every production release is traceable to an immutable commit and workflow version.

## First vertical slice

The first product milestone is complete when a user can:

1. connect a GitHub repository;
2. define a workflow using the Flowcordia workflow schema;
3. save a visual change to an isolated branch;
4. review a visual diff and code diff;
5. compile the workflow into Trigger.dev task code;
6. deploy it into a preview environment;
7. execute it and inspect the live path on the canvas;
8. merge the pull request and promote the exact version;
9. roll back to the preceding commit and deployment.

## Explicit non-goals for the first milestone

- Rewriting the run engine, queues, supervisor, or deployment lifecycle.
- Copying n8n source code or cloning its interface.
- Converting unrestricted TypeScript into a lossless graph.
- Building hundreds of integrations before the compiler contract works.
- Adding production navigation before hidden routes and permission checks are verified.

## Enterprise foundation required by later milestones

- SSO, SCIM, granular RBAC, and separation of duties.
- Immutable audit events and configurable retention.
- Policy checks, protected environments, and approval gates.
- External secret stores and private networking.
- High availability, disaster recovery, regional workers, and controlled upgrades.
- Signed node packages and an organization-owned capability catalog.

