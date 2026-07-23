# Self-host image publication

Flowcordia release images are published only by the protected `Flowcordia publish self-host image` workflow from the exact `main` commit represented by the release.

## Required repository configuration

Before the first real publication:

1. create the `flowcordia-self-host-release` GitHub environment;
2. require at least one human reviewer and prevent administrator bypass where the repository plan supports it;
3. keep package creation and write permissions limited to the workflow's `GITHUB_TOKEN`;
4. keep the repository public or otherwise confirm GitHub artifact-attestation availability for the repository plan;
5. do not add registry, cloud, or Sentry credentials to workflow inputs.

The workflow accepts only:

- a bounded release ID;
- a semantic version without a leading `v`;
- the exact lowercase Trigger.dev upstream commit represented by the release.

The Flowcordia application revision is always `github.sha` from the dispatched `main` ref.

## Publication behavior

The workflow:

1. checks out the exact dispatch SHA without persistent credentials;
2. rejects invalid or placeholder release/upstream identity;
3. derives the lowercase GHCR repository from `github.repository`;
4. rejects publication when the semantic version tag already exists;
5. builds `linux/amd64` using the pinned repository Dockerfile;
6. records exact Flowcordia, source, upstream, version, and creation labels;
7. attaches BuildKit maximum provenance and an SPDX SBOM;
8. pushes the semantic-version and exact-commit tags;
9. resolves and verifies the registry-reported immutable digest;
10. creates a GitHub-signed SLSA v1 attestation using the protected workflow identity;
11. verifies the attestation against the exact repository, signer workflow, source commit, `main` ref, and GitHub-hosted runner policy;
12. creates the canonical schema `0.1` release manifest from the immutable digest;
13. creates bounded schema `0.1` publication evidence;
14. preserves the manifest, evidence, and signed attestation bundle for 90 days;
15. removes registry credentials, temporary evidence, and the isolated Buildx builder.

The supported initial release platform is `linux/amd64`. Adding `linux/arm64` requires a separate compatibility boundary with emulated/native build proof and a multi-platform manifest test; it must not be implied by the single-platform release evidence.

## Dispatch

From GitHub Actions, select **Flowcordia publish self-host image**, choose `main`, and provide values such as:

```text
release_id: flowcordia-0.1.0-rc.1
version: 0.1.0-rc.1
upstream_commit_sha: <40-lowercase-hex>
```

Do not rerun a successful release under the same semantic version. The no-overwrite version-tag check is part of release identity, and every deployed component must consume the digest reference from the generated release manifest rather than either tag.

## Verification

An operator may independently verify the image after authenticating to GHCR:

```bash
gh attestation verify \
  oci://ghcr.io/<owner>/<repository>@sha256:<digest> \
  --repo <owner>/<repository> \
  --signer-workflow <owner>/<repository>/.github/workflows/flowcordia-publish-self-host-image.yml \
  --source-digest <application-commit> \
  --source-ref refs/heads/main \
  --deny-self-hosted-runners
```

The publication artifact contains:

- `flowcordia-release-manifest.json` — canonical runtime/distribution identity;
- `flowcordia-release-image-evidence.json` — bounded release, workflow, image, attestation, and evidence digests;
- the signed Sigstore attestation bundle produced by GitHub.

## Stop-ship

Block publication or downstream installation when:

- the workflow did not run from `main` in the protected environment;
- the version tag already existed or was overwritten outside the workflow;
- the image digest is unavailable or differs from the release manifest;
- OCI labels do not identify Flowcordia, the exact application commit, source repository, semantic version, creation time, release schema, and upstream revision;
- the SLSA attestation cannot be verified against the exact signer workflow, source commit, source ref, repository, and GitHub-hosted runner policy;
- the manifest/evidence artifact is missing, malformed, overwritten, or contains credentials, payloads, customer data, internal database identities, or raw provider errors;
- deployment uses a tag rather than the canonical digest reference;
- a platform other than the evidenced `linux/amd64` image is advertised as supported.

## Deliberate boundary

Image publication proves one exact image was built from one exact repository revision, pushed by digest, accompanied by BuildKit SBOM/provenance, signed by the protected GitHub workflow, independently verified, and bound into the canonical release manifest. It does not run migrations, configure secrets, create a production topology, prove dependencies, perform connected workflow acceptance, or establish recovery objectives.
