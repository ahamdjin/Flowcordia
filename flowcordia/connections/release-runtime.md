# Self-host release runtime connection

This contract connects one immutable FlowCordia release manifest to the web and dedicated operations-worker processes that consume the release image.

| Source | Target | Why the connection exists | Failure behavior |
| --- | --- | --- | --- |
| Mounted release manifest | Web and operations-worker startup | Make both component roles consume the same reviewed release identity rather than independent tags or environment claims | Missing, relative, symbolic-linked, malformed, oversized, or changed files fail boot when enforcement is required |
| Deployment manifest digest | Mounted manifest | Anchor the mounted bytes to independently supplied deployment metadata | A canonical digest mismatch fails boot and health readiness |
| Application and image identity | Selected manifest component | Prevent a web or worker process from running another revision or image under a valid release name | Revision, image, Node runtime, or component mismatch fails boot |
| Component role | Web HTTP and operations lifecycle | Keep request-serving replicas separate from proposal/index operations while reusing the exact immutable image | Web with proposal operations or HTTP disabled fails; worker with HTTP/Studio enabled or operations disabled fails |
| Cached verified identity | `/healthcheck` | Keep readiness tied to the startup decision without rereading mutable configuration on every request | Required identity absence or startup failure returns non-ready status |

## Security boundary

The runtime projection contains only bounded release ID, version, component, application and upstream commits, image digest, migration count/digest, and manifest digest. It excludes the manifest path, OCI repository, environment values, credentials, payloads, database identities, and raw filesystem errors.

## Ownership

- Release creation owns the canonical manifest and its digest.
- Deployment configuration owns the mounted regular file, expected digest, component role, application SHA, and image digest.
- Webapp bootstrap owns fail-closed startup verification.
- The healthcheck route owns readiness reassertion.
- Installation, dependency, migration, provider, alert, connected execution, webhook, rollback, and dossier evidence remain separate gates.

## Deliberate exclusions

This connection does not publish or sign an image, prove registry provenance, execute migrations, validate external dependencies, configure ingress, or provide a production Compose or Helm topology.
