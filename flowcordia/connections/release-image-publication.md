# Self-host image publication connection

This contract connects an exact reviewed Flowcordia `main` commit to one immutable GHCR image, signed provenance, canonical release manifest, and bounded publication evidence.

| Source | Target | Why the connection exists | Failure behavior |
| --- | --- | --- | --- |
| Protected manual workflow on `main` | Exact repository commit | Prevent pull requests, tags, mutable branches, or scheduled automation from publishing releases | Non-`main` dispatches are skipped and exact checkout uses `github.sha` without persistent credentials |
| Exact Flowcordia and upstream revisions | Docker build labels and release manifest | Keep product and inherited execution ownership independently visible | Invalid, placeholder, or inconsistent revisions block publication |
| Semantic release version | GHCR version tag and concurrency group | Make one version one no-overwrite publication decision | Existing version tags or concurrent attempts for the same version fail closed |
| BuildKit build result | Immutable registry digest | Use the registry digest rather than a tag as deployment identity | Missing or malformed `sha256` metadata blocks attestation and manifest creation |
| Immutable image digest | GitHub SLSA attestation | Bind the pushed OCI image to the protected workflow and exact source commit | Attestation creation or exact repository/workflow/source verification failure blocks evidence |
| Release manifest | Runtime enforcement | Give web and operations-worker processes the exact image/application/runtime/migration identity to enforce | Components using tags or another digest fail startup and readiness |
| Manifest, attestation bundle, and publication evidence | Protected workflow artifact | Preserve reviewable bounded release provenance without credentials or raw build logs | Missing artifacts block downstream installation and dossier evidence |

## Security boundary

The workflow receives no registry, cloud, Sentry, application, or customer credentials as inputs. GHCR authentication uses the scoped job token. Build metadata and attestation verification remain temporary; preserved evidence contains only bounded release, commit, image, workflow, attestation, platform, timestamp, and digest fields.

## Ownership

- The protected publication workflow owns exact checkout, version serialization, GHCR mutation, digest resolution, attestation, verification, evidence generation, and cleanup.
- `docker/Dockerfile` remains inherited build infrastructure with a reviewed Flowcordia adapter limited to OCI/release labels and upstream revision identity.
- The canonical release-manifest contract owns runtime and migration identity.
- Runtime enforcement owns web and operations-worker consumption of the digest-bound manifest.
- Migration execution, production topology, ingress, secrets, dependency readiness, connected execution, rollback, and launch-dossier review remain separate gates.

## Deliberate exclusions

This connection does not execute migrations, create a production Compose or Helm topology, configure secrets, publish mutable `latest`, prove dependencies, run workflows, or claim multi-platform support. The first supported publication target is explicitly `linux/amd64`.
